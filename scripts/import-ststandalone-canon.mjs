import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const { Pool } = pg;

const VALIDATE_ONLY = process.argv.includes("--validate-only");
const connectionString = process.env.DATABASE_URL;
if (!connectionString && !VALIDATE_ONLY) {
  throw new Error("DATABASE_URL is not configured. Run this from the website project root after .env.local is present.");
}

const SOURCE_REPO = "https://raw.githubusercontent.com/Revty79/STSTandAlone/main/data";
const LOCAL_SOURCE_DIR = process.env.STSTANDALONE_DATA_DIR?.trim() || null;
const SOURCE_FILES = {
  races: "serrian-tide-race-seed.json",
  creatures: "serrian-tide-creature-seed.json",
  items: "serrian-tide-item-seed.json",
};
const CHECKED_IN_CANON_DIR = path.resolve(process.cwd(), "data", "canon");
const ATTRIBUTE_REFERENCE_SOURCE_FILE = "serrian-tide-attribute-reference-canon.json";
const CR_XP_SOURCE_FILE = "serrian-tide-cr-xp-canon.json";
const EXPECTED_CR_KILL_XP = [
  2, 3, 4, 5, 7, 9, 11, 13, 15, 18,
  21, 24, 27, 30, 34, 38, 42, 46, 50, 55,
  60, 65, 70, 75, 81, 87, 93, 100, 107, 115,
  123, 131, 139, 147, 156, 165, 174, 183, 192, 201,
  211, 221, 231, 241, 252, 263, 274, 286, 298, 310,
];

const pool = connectionString ? new Pool({ connectionString }) : null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadJson(fileName) {
  if (LOCAL_SOURCE_DIR) {
    const sourcePath = path.resolve(LOCAL_SOURCE_DIR, fileName);
    return JSON.parse(await readFile(sourcePath, "utf8"));
  }

  const response = await fetch(`${SOURCE_REPO}/${fileName}`);
  if (!response.ok) {
    throw new Error(`Could not download ${fileName} from STSTandAlone: HTTP ${response.status}. Set STSTANDALONE_DATA_DIR to a local data directory to import offline.`);
  }
  return response.json();
}

async function loadCheckedInCanonJson(fileName) {
  const sourcePath = path.join(CHECKED_IN_CANON_DIR, fileName);
  return JSON.parse(await readFile(sourcePath, "utf8"));
}

async function queryOne(client, text, values = []) {
  const result = await client.query(text, values);
  return result.rows[0] ?? null;
}

async function requireTables(client) {
  const tables = [
    "skill",
    "races",
    "race_attribute_caps",
    "race_movement_modes",
    "race_skill_links",
    "challenge_rating_reference",
    "creatures",
    "creature_variants",
    "creature_attributes",
    "creature_movement",
    "creature_hp_pools",
    "creature_hit_locations",
    "creature_attacks",
    "creature_skill_links",
    "creature_abilities",
    "creature_defenses",
    "creature_uses",
    "items",
    "weapon_profiles",
    "armor_profiles",
    "item_armor_damage_modifiers",
    "armor_location_reference",
    "armor_locations",
    "item_properties",
    "item_tags_catalog",
    "item_tag_links",
    "item_rules",
    "attribute_score_reference",
  ];

  const result = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [tables],
  );
  const present = new Set(result.rows.map((row) => row.table_name));
  const missing = tables.filter((name) => !present.has(name));
  if (missing.length) {
    throw new Error(`Database schema is not ready. Missing tables: ${missing.join(", ")}. Generate and run the Drizzle migration first.`);
  }
}

async function readSkillMap(client) {
  const rows = await client.query(
    `SELECT id, source_external_id
     FROM skill
     WHERE source_external_id IS NOT NULL`,
  );
  return new Map(rows.rows.map((row) => [row.source_external_id, Number(row.id)]));
}

function validateSeeds(raceSeed, creatureSeed, itemSeed) {
  assert(raceSeed?.schemaVersion === 2, "Unsupported Race seed schema.");
  assert(raceSeed?.counts?.races === 56, `Race seed expected 56 Races; found ${raceSeed?.counts?.races ?? "unknown"}.`);
  assert(Array.isArray(raceSeed.records) && raceSeed.records.length === 56, "Race seed record count does not match its manifest.");

  assert(creatureSeed?.schemaVersion === 1, "Unsupported Creature seed schema.");
  assert(creatureSeed?.counts?.creatures === 87, `Creature seed expected 87 Creatures; found ${creatureSeed?.counts?.creatures ?? "unknown"}.`);
  assert(creatureSeed?.counts?.challengeRatings === 50, "Creature seed must contain all 50 CR references.");
  assert(Array.isArray(creatureSeed.creatures) && creatureSeed.creatures.length === 87, "Creature seed record count does not match its manifest.");
  const legacyVariants = creatureSeed.creatures.flatMap((record) =>
    (record.variants ?? []).map((variant) => ({
      parentCanonicalId: record.core.canonicalId,
      canonicalId: variant.canonicalId,
      name: variant.variantName,
    })),
  );
  const expectedLegacyVariants = new Map([
    ["VAR-HORSE-DRAFT", "Draft Horse"],
    ["VAR-HORSE-LIGHT", "Light Horse"],
    ["VAR-HORSE-PONY", "Pony"],
  ]);
  assert(legacyVariants.length === expectedLegacyVariants.size, `Creature seed expected ${expectedLegacyVariants.size} legacy Horse Variants; found ${legacyVariants.length}.`);
  for (const variant of legacyVariants) {
    assert(variant.parentCanonicalId === "CR-HORSE", `${variant.canonicalId} must be a legacy Horse Variant.`);
    assert(expectedLegacyVariants.get(variant.canonicalId) === variant.name, `Unexpected legacy Creature Variant ${variant.canonicalId}.`);
  }

  assert(itemSeed?.schemaVersion === 1, "Unsupported Item seed schema.");
  assert(itemSeed?.counts?.items === 1007, `Item seed expected 1007 Items; found ${itemSeed?.counts?.items ?? "unknown"}.`);
  assert(Array.isArray(itemSeed.items) && itemSeed.items.length === 1007, "Item seed record count does not match its manifest.");
}

function materializeAttributeReferenceRows(seed) {
  assert(seed?.title === "Serrian Tide Attribute Reference Canon", "Unsupported Attribute Reference title.");
  assert(seed?.version === 1, "Unsupported Attribute Reference schema version.");

  const definitions = [
    { sourceKey: "strength", attributeKey: "STR", fields: ["maxCarry", "maxLift"] },
    { sourceKey: "intelligence", attributeKey: "INT", fields: ["maxSpheres", "spellWeaving"] },
    { sourceKey: "wisdom", attributeKey: "WIS", fields: ["teachingBase"] },
    { sourceKey: "charisma", attributeKey: "CHR", fields: ["loyaltyBase"] },
  ];
  const rows = [];

  for (const definition of definitions) {
    const sourceRows = seed[definition.sourceKey];
    assert(Array.isArray(sourceRows), `Attribute Reference ${definition.sourceKey} must be an array.`);
    assert(sourceRows.length === 100, `Attribute Reference ${definition.attributeKey} expected 100 rows; found ${sourceRows.length}.`);

    const scores = new Set();
    for (const sourceRow of sourceRows) {
      assert(Number.isInteger(sourceRow.score), `Attribute Reference ${definition.attributeKey} contains a non-integer score.`);
      assert(sourceRow.score >= 1 && sourceRow.score <= 100, `Attribute Reference ${definition.attributeKey} score ${sourceRow.score} is outside 1-100.`);
      assert(!scores.has(sourceRow.score), `Attribute Reference ${definition.attributeKey} repeats score ${sourceRow.score}.`);
      scores.add(sourceRow.score);

      for (const field of definition.fields) {
        assert(Number.isInteger(sourceRow[field]) && sourceRow[field] >= 0, `Attribute Reference ${definition.attributeKey} ${sourceRow.score} has an invalid ${field}.`);
      }

      rows.push({
        attributeKey: definition.attributeKey,
        score: sourceRow.score,
        maxCarry: null,
        maxLift: null,
        maxSpheres: null,
        spellWeaving: null,
        teachingBase: null,
        loyaltyBase: null,
        ...Object.fromEntries(definition.fields.map((field) => [field, sourceRow[field]])),
      });
    }

    for (let score = 1; score <= 100; score += 1) {
      assert(scores.has(score), `Attribute Reference ${definition.attributeKey} is missing score ${score}.`);
    }
  }

  assert(rows.length === 400, `Attribute Reference expected 400 rows; found ${rows.length}.`);
  return rows;
}

function materializeCrXpCanonRows(seed) {
  assert(seed?.title === "Serrian Tide CR XP Canon", "Unsupported CR XP canon title.");
  assert(seed?.version === 1, "Unsupported CR XP canon schema version.");
  assert(Array.isArray(seed.rewards), "CR XP canon rewards must be an array.");
  assert(seed.rewards.length === 50, `CR XP canon expected exactly 50 rows; found ${seed.rewards.length}.`);

  const challengeRatings = new Set();
  const rows = seed.rewards.map((row, index) => {
    assert(Number.isInteger(row?.challengeRating), `CR XP canon row ${index + 1} has a non-integer Challenge Rating.`);
    assert(row.challengeRating >= 1 && row.challengeRating <= 50, `CR XP canon Challenge Rating ${row.challengeRating} is outside 1-50.`);
    assert(!challengeRatings.has(row.challengeRating), `CR XP canon repeats Challenge Rating ${row.challengeRating}.`);
    challengeRatings.add(row.challengeRating);
    assert(row.challengeRating === index + 1, `CR XP canon rows must be ordered CR 1 through 50; row ${index + 1} contains CR ${row.challengeRating}.`);
    assert(Number.isInteger(row.killXp) && row.killXp >= 0, `CR XP canon CR ${row.challengeRating} has an invalid Kill XP value.`);
    assert(row.killXp === EXPECTED_CR_KILL_XP[index], `CR XP canon CR ${row.challengeRating} must award ${EXPECTED_CR_KILL_XP[index]} XP; found ${row.killXp}.`);
    return { challengeRating: row.challengeRating, killXp: row.killXp };
  });

  for (let challengeRating = 1; challengeRating <= 50; challengeRating += 1) {
    assert(challengeRatings.has(challengeRating), `CR XP canon is missing Challenge Rating ${challengeRating}.`);
  }
  return rows;
}

function canonicalKillXpFor(killXpByCr, challengeRating, label) {
  assert(Number.isInteger(challengeRating) && challengeRating >= 1 && challengeRating <= 50, `${label} has an invalid final Challenge Rating.`);
  const killXp = killXpByCr.get(challengeRating);
  assert(Number.isInteger(killXp) && killXp >= 0, `${label} is missing canonical Kill XP for CR ${challengeRating}.`);
  return killXp;
}

function materializeChallengeRatingReferences(creatureSeed, crXpRows) {
  assert(Array.isArray(creatureSeed.challengeReference), "Creature seed Challenge Rating references must be an array.");
  assert(creatureSeed.challengeReference.length === 50, `Creature seed expected 50 Challenge Rating guidance rows; found ${creatureSeed.challengeReference.length}.`);

  const sourceByCr = new Map();
  for (const row of creatureSeed.challengeReference) {
    assert(Number.isInteger(row.challengeRating) && row.challengeRating >= 1 && row.challengeRating <= 50, `Creature seed has an invalid Challenge Rating guidance row: ${row.challengeRating}.`);
    assert(!sourceByCr.has(row.challengeRating), `Creature seed repeats Challenge Rating guidance for CR ${row.challengeRating}.`);
    sourceByCr.set(row.challengeRating, row);
  }

  return crXpRows.map((reward) => {
    const source = sourceByCr.get(reward.challengeRating);
    assert(source, `Creature seed is missing non-XP guidance for CR ${reward.challengeRating}.`);
    return { ...source, killXp: reward.killXp };
  });
}

function withoutVariantIdentity(row) {
  const copy = { ...row };
  delete copy.variantCanonicalId;
  return copy;
}

function selectVariantOverrides(rows, variantCanonicalId, key) {
  const base = rows.filter((row) => !row.variantCanonicalId);
  const overrides = rows.filter((row) => row.variantCanonicalId === variantCanonicalId);
  const overridden = new Set(overrides.map((row) => String(row[key]).toLocaleLowerCase("en-US")));
  return [
    ...base.filter((row) => !overridden.has(String(row[key]).toLocaleLowerCase("en-US"))),
    ...overrides,
  ].map(withoutVariantIdentity);
}

function selectVariantChart(rows, variantCanonicalId) {
  const overrides = rows.filter((row) => row.variantCanonicalId === variantCanonicalId);
  return (overrides.length ? overrides : rows.filter((row) => !row.variantCanonicalId))
    .map(withoutVariantIdentity);
}

function selectVariantAdditive(rows, variantCanonicalId) {
  return rows
    .filter((row) => !row.variantCanonicalId || row.variantCanonicalId === variantCanonicalId)
    .map(withoutVariantIdentity);
}

function materializeFinalCreatureRecords(seed, crXpRows) {
  const killXpByCr = new Map(
    crXpRows.map((row) => [row.challengeRating, row.killXp]),
  );
  const records = [];

  for (const source of seed.creatures) {
    const baseRecord = {
      ...source,
      core: {
        ...source.core,
        killXp: canonicalKillXpFor(killXpByCr, source.core.challengeRating, `Creature ${source.core.canonicalId}`),
      },
      variants: [],
      attributes: (source.attributes ?? []).filter((row) => !row.variantCanonicalId).map(withoutVariantIdentity),
      movement: (source.movement ?? []).filter((row) => !row.variantCanonicalId).map(withoutVariantIdentity),
      hpPools: (source.hpPools ?? []).filter((row) => !row.variantCanonicalId).map(withoutVariantIdentity),
      hitLocations: (source.hitLocations ?? []).filter((row) => !row.variantCanonicalId).map(withoutVariantIdentity),
      attacks: (source.attacks ?? []).filter((row) => !row.variantCanonicalId).map(withoutVariantIdentity),
      skillLinks: (source.skillLinks ?? []).filter((row) => !row.variantCanonicalId).map(withoutVariantIdentity),
      abilities: (source.abilities ?? []).filter((row) => !row.variantCanonicalId).map(withoutVariantIdentity),
      defenses: (source.defenses ?? []).filter((row) => !row.variantCanonicalId).map(withoutVariantIdentity),
      uses: (source.uses ?? []).filter((row) => !row.variantCanonicalId).map(withoutVariantIdentity),
    };
    records.push(baseRecord);

    for (const variant of source.variants ?? []) {
      const childToken = variant.canonicalId
        .replace(/^(CR|VAR)-/i, "")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLocaleUpperCase("en-US");
      const challengeRating = variant.challengeRatingOverride ?? source.core.challengeRating ?? 1;
      const selectedHpPools = selectVariantChart(source.hpPools ?? [], variant.canonicalId);
      const hpPoolIdMap = new Map();
      const hpPools = selectedHpPools.map((row, index) => {
        const canonicalId = `HP-${childToken}-${String(index + 1).padStart(4, "0")}`;
        hpPoolIdMap.set(row.canonicalId, canonicalId);
        return { ...row, canonicalId };
      });
      const hitLocations = selectVariantChart(source.hitLocations ?? [], variant.canonicalId)
        .map((row) => ({
          ...row,
          hpPoolCanonicalId: row.hpPoolCanonicalId
            ? hpPoolIdMap.get(row.hpPoolCanonicalId) ?? null
            : null,
        }));
      const attacks = selectVariantAdditive(source.attacks ?? [], variant.canonicalId)
        .map((row, index) => ({
          ...row,
          canonicalId: `ATK-${childToken}-${String(index + 1).padStart(4, "0")}`,
        }));
      const abilities = selectVariantAdditive(source.abilities ?? [], variant.canonicalId)
        .map((row, index) => ({
          ...row,
          canonicalId: `ABL-${childToken}-${String(index + 1).padStart(4, "0")}`,
        }));

      records.push({
        core: {
          ...source.core,
          canonicalId: variant.canonicalId.toLocaleUpperCase("en-US"),
          canonicalName: variant.variantName,
          size: variant.sizeOverride ?? source.core.size,
          challengeRating,
          killXp: canonicalKillXpFor(killXpByCr, challengeRating, `Creature Variant ${variant.canonicalId}`),
          description: variant.description?.trim() ? variant.description : source.core.description,
          notes: variant.notes ?? "",
          parentCanonicalId: source.core.canonicalId,
        },
        variants: [],
        attributes: selectVariantOverrides(source.attributes ?? [], variant.canonicalId, "attributeKey"),
        movement: selectVariantOverrides(source.movement ?? [], variant.canonicalId, "movementMode"),
        hpPools,
        hitLocations,
        attacks,
        skillLinks: selectVariantOverrides(source.skillLinks ?? [], variant.canonicalId, "skillExternalId"),
        abilities,
        defenses: selectVariantAdditive(source.defenses ?? [], variant.canonicalId)
          .map((row) => ({ ...row, seedIdentity: null })),
        uses: selectVariantAdditive(source.uses ?? [], variant.canonicalId)
          .map((row) => ({ ...row, seedIdentity: null })),
        provenance: null,
      });
    }
  }

  assert(records.length === 90, `Final Creature library expected 90 complete Creatures; found ${records.length}.`);
  return records;
}

function validateFinalCanon(raceSeed, creatureSeed, itemSeed, crXpRows) {
  const challengeReferences = materializeChallengeRatingReferences(creatureSeed, crXpRows);
  const finalCreatureRecords = materializeFinalCreatureRecords(creatureSeed, crXpRows);
  const killXpByCr = new Map(crXpRows.map((row) => [row.challengeRating, row.killXp]));
  const assertUppercaseUnique = (values, label) => {
    const normalized = values.map((value) => String(value).toLocaleUpperCase("en-US"));
    assert(values.every((value, index) => value === normalized[index]), `${label} identities must be uppercase.`);
    assert(new Set(normalized).size === normalized.length, `${label} identities must be case-insensitively unique.`);
  };

  assertUppercaseUnique(finalCreatureRecords.map((record) => record.core.canonicalId), "Creature");
  assertUppercaseUnique(finalCreatureRecords.flatMap((record) => (record.hpPools ?? []).map((row) => row.canonicalId)), "Creature HP Pool");
  assertUppercaseUnique(finalCreatureRecords.flatMap((record) => (record.attacks ?? []).map((row) => row.canonicalId)), "Creature Attack");
  assertUppercaseUnique(finalCreatureRecords.flatMap((record) => (record.abilities ?? []).map((row) => row.canonicalId)), "Creature Ability");
  assertUppercaseUnique(itemSeed.items.map((record) => record.core.canonicalId), "Item");
  assertUppercaseUnique((itemSeed.tags ?? []).map((row) => row.canonicalId), "Item Tag");
  assertUppercaseUnique((itemSeed.rules ?? []).map((row) => row.ruleId), "Item Rule");

  const creatureIds = new Set(finalCreatureRecords.map((record) => record.core.canonicalId));
  const itemIds = new Set(itemSeed.items.map((record) => record.core.canonicalId));
  for (const reference of challengeReferences) {
    assert(reference.killXp === killXpByCr.get(reference.challengeRating), `Imported CR ${reference.challengeRating} guidance did not receive canonical Kill XP.`);
  }
  for (const record of finalCreatureRecords) {
    assert(record.core.killXp === killXpByCr.get(record.core.challengeRating), `${record.core.canonicalId} Kill XP does not match final CR ${record.core.challengeRating}.`);
    assert(record.variants.length === 0, `${record.core.canonicalId} retained a residual Creature Variant row.`);
    assert(!record.core.parentCanonicalId || creatureIds.has(record.core.parentCanonicalId), `${record.core.canonicalId} has a missing parent Creature.`);
    const hpPoolIds = new Set((record.hpPools ?? []).map((row) => row.canonicalId));
    for (const location of record.hitLocations ?? []) {
      assert(!location.hpPoolCanonicalId || hpPoolIds.has(location.hpPoolCanonicalId), `${record.core.canonicalId} has a hit location linked to another Creature's HP pool.`);
    }
  }
  for (const canonicalId of ["VAR-HORSE-DRAFT", "VAR-HORSE-LIGHT", "VAR-HORSE-PONY"]) {
    const record = finalCreatureRecords.find((candidate) => candidate.core.canonicalId === canonicalId);
    assert(record?.core.parentCanonicalId === "CR-HORSE", `${canonicalId} must retain Horse lineage.`);
    assert(record.attributes.length === 6, `${canonicalId} must have all six Attributes.`);
    assert(record.movement.length > 0, `${canonicalId} must have Movement data.`);
    assert(record.hpPools.length === 7, `${canonicalId} must have seven HP pools.`);
    assert(record.hitLocations.length === 10, `${canonicalId} must have all ten hit locations.`);
    assert(record.attacks.length === 3, `${canonicalId} must have all three Horse attacks.`);
    assert(record.abilities.length === 1, `${canonicalId} must have its Horse ability.`);
    assert(record.uses.length === 3, `${canonicalId} must have all three Horse uses.`);
  }
  const variantParentIndex = creatureSeed.creatures.findIndex((record) => (record.variants ?? []).length > 0);
  assert(variantParentIndex >= 0, "Creature seed must contain a legacy Variant for the Kill XP override check.");
  const overrideProbeSeed = {
    ...creatureSeed,
    creatures: creatureSeed.creatures.map((record, recordIndex) => recordIndex === variantParentIndex
      ? {
          ...record,
          variants: record.variants.map((variant, variantIndex) => variantIndex === 0
            ? { ...variant, killXpOverride: 999_999 }
            : variant),
        }
      : record),
  };
  const probedVariant = overrideProbeSeed.creatures[variantParentIndex].variants[0];
  const probedRecord = materializeFinalCreatureRecords(overrideProbeSeed, crXpRows)
    .find((record) => record.core.canonicalId === probedVariant.canonicalId);
  assert(probedRecord, `${probedVariant.canonicalId} was not materialized for the legacy Kill XP override check.`);
  assert(probedRecord.core.killXp === killXpByCr.get(probedRecord.core.challengeRating), `${probedVariant.canonicalId} legacy Kill XP override displaced canonical CR XP.`);
  for (const record of itemSeed.items) {
    const core = record.core;
    assert(!core.parentCanonicalId || itemIds.has(core.parentCanonicalId), `Item ${core.canonicalId} has a missing parent Item.`);
    assert(!record.weapon?.ammunitionCanonicalId || itemIds.has(record.weapon.ammunitionCanonicalId), `Item ${core.canonicalId} has missing ammunition.`);
    for (const property of record.properties ?? []) {
      assert(!property.relatedItemCanonicalId || itemIds.has(property.relatedItemCanonicalId), `Item ${core.canonicalId} has a missing related Item.`);
      assert(!property.relatedCreatureCanonicalId || creatureIds.has(property.relatedCreatureCanonicalId), `Item ${core.canonicalId} has a missing related Creature.`);
    }
  }

  return {
    races: raceSeed.records.length,
    creatures: finalCreatureRecords.length,
    items: itemSeed.items.length,
    challengeRatings: challengeReferences.length,
  };
}

function validateSkillReferences(raceSeed, creatureSeed, skillMap) {
  const required = new Set();
  for (const record of raceSeed.records) {
    for (const link of record.skillLinks ?? []) {
      if (link.skillExternalId) required.add(link.skillExternalId);
    }
  }
  for (const record of creatureSeed.creatures) {
    for (const link of record.skillLinks ?? []) {
      if (link.skillExternalId) required.add(link.skillExternalId);
    }
  }
  const missing = [...required].filter((externalId) => !skillMap.has(externalId));
  if (missing.length) {
    throw new Error(`The Skill canon must be imported before Races/Creatures. ${missing.length} referenced Skill identities are missing. First missing identity: ${missing[0]}.`);
  }
}

async function importRaces(client, seed, skillMap) {
  const sourceSystem = seed.sourceSystem || "serrian-tide-race-sheet";

  for (const record of seed.records) {
    const core = record.core;
    const raceRow = await queryOne(
      client,
      `INSERT INTO races (
         name, legacy_description, physical_characteristics, physical_description,
         age_range_text, age_min, age_max, size, base_magic, racial_quirk_name,
         quirk_success_effect, quirk_failure_effect, common_languages_known,
         common_archetypes, genre_examples, cultural_mindset, outlook_on_magic,
         source_system, source_external_id, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now()
       )
       ON CONFLICT (source_system, source_external_id)
       WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL
       DO UPDATE SET
         name=EXCLUDED.name,
         legacy_description=EXCLUDED.legacy_description,
         physical_characteristics=EXCLUDED.physical_characteristics,
         physical_description=EXCLUDED.physical_description,
         age_range_text=EXCLUDED.age_range_text,
         age_min=EXCLUDED.age_min,
         age_max=EXCLUDED.age_max,
         size=EXCLUDED.size,
         base_magic=EXCLUDED.base_magic,
         racial_quirk_name=EXCLUDED.racial_quirk_name,
         quirk_success_effect=EXCLUDED.quirk_success_effect,
         quirk_failure_effect=EXCLUDED.quirk_failure_effect,
         common_languages_known=EXCLUDED.common_languages_known,
         common_archetypes=EXCLUDED.common_archetypes,
         genre_examples=EXCLUDED.genre_examples,
         cultural_mindset=EXCLUDED.cultural_mindset,
         outlook_on_magic=EXCLUDED.outlook_on_magic,
         updated_at=now()
       RETURNING id`,
      [
        core.name,
        core.legacyDescription ?? "",
        core.physicalCharacteristics ?? "",
        core.physicalDescription ?? "",
        core.ageRangeText ?? "",
        core.ageMin ?? null,
        core.ageMax ?? null,
        core.size ?? "",
        core.baseMagic ?? null,
        core.racialQuirkName ?? "",
        core.quirkSuccessEffect ?? "",
        core.quirkFailureEffect ?? "",
        core.commonLanguagesKnown ?? "",
        core.commonArchetypes ?? "",
        core.genreExamples ?? "",
        core.culturalMindset ?? "",
        core.outlookOnMagic ?? "",
        sourceSystem,
        core.sourceExternalId,
      ],
    );
    const raceId = Number(raceRow.id);

    await client.query("DELETE FROM race_skill_links WHERE race_id=$1", [raceId]);
    await client.query("DELETE FROM race_movement_modes WHERE race_id=$1", [raceId]);
    await client.query("DELETE FROM race_attribute_caps WHERE race_id=$1", [raceId]);

    for (const cap of record.attributeCaps ?? []) {
      await client.query(
        `INSERT INTO race_attribute_caps (race_id, attribute_key, max_value, sort_order)
         VALUES ($1,$2,$3,$4)`,
        [raceId, cap.attributeKey, cap.maxValue, cap.sortOrder ?? 0],
      );
    }
    for (const movement of record.movementModes ?? []) {
      await client.query(
        `INSERT INTO race_movement_modes (race_id, movement_mode, base_value, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [raceId, movement.movementMode, movement.baseValue, movement.notes ?? "", movement.sortOrder ?? 0],
      );
    }
    for (const link of record.skillLinks ?? []) {
      await client.query(
        `INSERT INTO race_skill_links (race_id, skill_id, link_type, value, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [raceId, skillMap.get(link.skillExternalId), link.linkType, link.value ?? null, link.sortOrder ?? 0],
      );
    }
  }

  return {
    races: seed.records.length,
    attributeCaps: seed.records.reduce((sum, record) => sum + (record.attributeCaps?.length ?? 0), 0),
    movementModes: seed.records.reduce((sum, record) => sum + (record.movementModes?.length ?? 0), 0),
    skillLinks: seed.records.reduce((sum, record) => sum + (record.skillLinks?.length ?? 0), 0),
  };
}

async function importCreatures(client, seed, skillMap, crXpRows) {
  const challengeReferences = materializeChallengeRatingReferences(seed, crXpRows);
  const finalRecords = materializeFinalCreatureRecords(seed, crXpRows);
  for (const row of challengeReferences) {
    await client.query(
      `INSERT INTO challenge_rating_reference (
         challenge_rating, threat_band, attack_target_guidance, damage_guidance,
         initiative_guidance, soak_guidance, hp_toughness_guidance, kill_xp,
         current_creature_example, example_notes, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (challenge_rating) DO UPDATE SET
         threat_band=EXCLUDED.threat_band,
         attack_target_guidance=EXCLUDED.attack_target_guidance,
         damage_guidance=EXCLUDED.damage_guidance,
         initiative_guidance=EXCLUDED.initiative_guidance,
         soak_guidance=EXCLUDED.soak_guidance,
         hp_toughness_guidance=EXCLUDED.hp_toughness_guidance,
         kill_xp=EXCLUDED.kill_xp,
         current_creature_example=EXCLUDED.current_creature_example,
         example_notes=EXCLUDED.example_notes,
         updated_at=now()`,
      [
        row.challengeRating,
        row.threatBand ?? "",
        row.attackTargetGuidance ?? "",
        row.damageGuidance ?? "",
        row.initiativeGuidance ?? "",
        row.soakGuidance ?? "",
        row.hpToughnessGuidance ?? "",
        row.killXp ?? null,
        row.currentCreatureExample ?? "",
        row.exampleNotes ?? "",
      ],
    );
  }

  const creatureIds = new Map();
  for (const record of finalRecords) {
    const core = record.core;
    const row = await queryOne(
      client,
       `INSERT INTO creatures (
         canonical_id, canonical_name, family, creature_type, size, challenge_rating,
         kill_xp, description, typical_behavior, habitat_ecology, notes, source_system,
         calculated_challenge_rating, challenge_rating_adjustment,
         challenge_rating_adjustment_reason, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
       ON CONFLICT (canonical_id) DO UPDATE SET
         canonical_name=EXCLUDED.canonical_name,
         family=EXCLUDED.family,
         creature_type=EXCLUDED.creature_type,
         size=EXCLUDED.size,
         challenge_rating=EXCLUDED.challenge_rating,
         kill_xp=EXCLUDED.kill_xp,
         description=EXCLUDED.description,
         typical_behavior=EXCLUDED.typical_behavior,
         habitat_ecology=EXCLUDED.habitat_ecology,
         notes=EXCLUDED.notes,
         source_system=EXCLUDED.source_system,
         calculated_challenge_rating=EXCLUDED.calculated_challenge_rating,
         challenge_rating_adjustment=EXCLUDED.challenge_rating_adjustment,
         challenge_rating_adjustment_reason=EXCLUDED.challenge_rating_adjustment_reason,
         updated_at=now()
       RETURNING id`,
      [
        core.canonicalId,
        core.canonicalName,
        core.family ?? "",
        core.creatureType ?? "",
        core.size,
        core.challengeRating ?? null,
        core.killXp ?? null,
        core.description ?? "",
        core.typicalBehavior ?? "",
        core.habitatEcology ?? "",
        core.notes ?? "",
        seed.sourceSystem || "serrian-tide-creature-canon",
        core.calculatedChallengeRating ?? core.challengeRating ?? 1,
        core.challengeRatingAdjustment ?? 0,
        core.challengeRatingAdjustmentReason ?? "",
      ],
    );
    creatureIds.set(core.canonicalId, Number(row.id));
  }

  for (const record of finalRecords) {
    await client.query(
      "UPDATE creatures SET parent_creature_id=$2 WHERE id=$1",
      [
        creatureIds.get(record.core.canonicalId),
        record.core.parentCanonicalId
          ? creatureIds.get(record.core.parentCanonicalId) ?? null
          : null,
      ],
    );
  }

  for (const record of finalRecords) {
    const creatureId = creatureIds.get(record.core.canonicalId);

    await client.query("DELETE FROM creature_hit_locations WHERE creature_id=$1", [creatureId]);
    await client.query("DELETE FROM creature_skill_links WHERE creature_id=$1", [creatureId]);
    await client.query("DELETE FROM creature_abilities WHERE creature_id=$1", [creatureId]);
    await client.query("DELETE FROM creature_defenses WHERE creature_id=$1", [creatureId]);
    await client.query("DELETE FROM creature_uses WHERE creature_id=$1", [creatureId]);
    await client.query("DELETE FROM creature_attacks WHERE creature_id=$1", [creatureId]);
    await client.query("DELETE FROM creature_hp_pools WHERE creature_id=$1", [creatureId]);
    await client.query("DELETE FROM creature_movement WHERE creature_id=$1", [creatureId]);
    await client.query("DELETE FROM creature_attributes WHERE creature_id=$1", [creatureId]);
    await client.query("DELETE FROM creature_variants WHERE creature_id=$1", [creatureId]);

    for (const row of record.attributes ?? []) {
      await client.query(
        `INSERT INTO creature_attributes (creature_id, variant_id, attribute_key, value, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [creatureId, null, row.attributeKey, row.value ?? null, row.notes ?? "", row.sortOrder ?? 0],
      );
    }
    for (const row of record.movement ?? []) {
      await client.query(
        `INSERT INTO creature_movement (creature_id, variant_id, movement_mode, movement_value, initiative, requirements, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [creatureId, null, row.movementMode, row.movementValue ?? null, row.initiative ?? null, row.requirements ?? "", row.notes ?? "", row.sortOrder ?? 0],
      );
    }

    const hpPoolIds = new Map();
    for (const row of record.hpPools ?? []) {
      const inserted = await queryOne(
        client,
        `INSERT INTO creature_hp_pools (canonical_id, creature_id, variant_id, pool_name, hp_percentage, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [row.canonicalId, creatureId, null, row.poolName, row.hpPercentage ?? null, row.notes ?? "", row.sortOrder ?? 0],
      );
      hpPoolIds.set(row.canonicalId, Number(inserted.id));
    }

    for (const row of record.hitLocations ?? []) {
      await client.query(
        `INSERT INTO creature_hit_locations (
           creature_id, variant_id, hit_location_number, location_name, body_parts_included,
           hp_pool_id, natural_armor, soak, location_effect, notes, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          creatureId,
          null,
          row.hitLocationNumber,
          row.locationName ?? "",
          row.bodyPartsIncluded ?? "",
          row.hpPoolCanonicalId ? hpPoolIds.get(row.hpPoolCanonicalId) ?? null : null,
          row.naturalArmor ?? null,
          row.soak ?? null,
          row.locationEffect ?? "",
          row.notes ?? "",
          row.sortOrder ?? 0,
        ],
      );
    }
    for (const row of record.attacks ?? []) {
      await client.query(
        `INSERT INTO creature_attacks (
           canonical_id, creature_id, variant_id, attack_name, attack_percentage, damage,
           damage_type, range_reach, required_anatomy, requirements, uses_recharge,
           special_effect, notes, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          row.canonicalId,
          creatureId,
          null,
          row.attackName,
          row.attackPercentage ?? null,
          row.damage ?? null,
          row.damageType ?? "",
          row.rangeReach ?? "",
          row.requiredAnatomy ?? "",
          row.requirements ?? "",
          row.usesRecharge ?? "",
          row.specialEffect ?? "",
          row.notes ?? "",
          row.sortOrder ?? 0,
        ],
      );
    }
    for (const row of record.skillLinks ?? []) {
      await client.query(
        `INSERT INTO creature_skill_links (creature_id, variant_id, skill_id, rank, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [creatureId, null, skillMap.get(row.skillExternalId), row.rank ?? null, row.notes ?? "", row.sortOrder ?? 0],
      );
    }
    for (const row of record.abilities ?? []) {
      await client.query(
        `INSERT INTO creature_abilities (
           canonical_id, creature_id, variant_id, ability_name, ability_type, activation,
           requirements, uses_recharge, description, mechanical_effect, notes, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          row.canonicalId,
          creatureId,
          null,
          row.abilityName,
          row.abilityType ?? "",
          row.activation ?? "",
          row.requirements ?? "",
          row.usesRecharge ?? "",
          row.description ?? "",
          row.mechanicalEffect ?? "",
          row.notes ?? "",
          row.sortOrder ?? 0,
        ],
      );
    }
    for (const row of record.defenses ?? []) {
      await client.query(
        `INSERT INTO creature_defenses (
           seed_identity, creature_id, variant_id, defense_type, against, value, notes, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [row.seedIdentity ?? null, creatureId, null, row.defenseType, row.against ?? "", row.value ?? null, row.notes ?? "", row.sortOrder ?? 0],
      );
    }
    for (const row of record.uses ?? []) {
      await client.query(
        `INSERT INTO creature_uses (seed_identity, creature_id, variant_id, use_name, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [row.seedIdentity ?? null, creatureId, null, row.useName, row.notes ?? "", row.sortOrder ?? 0],
      );
    }
  }

  const synchronized = await client.query(
    `UPDATE creatures AS creature
     SET kill_xp = reference.kill_xp
     FROM challenge_rating_reference AS reference
     WHERE creature.challenge_rating = reference.challenge_rating
       AND creature.challenge_rating BETWEEN 1 AND 50
       AND creature.kill_xp IS DISTINCT FROM reference.kill_xp`,
  );

  return {
    creatures: finalRecords.length,
    challengeRatings: challengeReferences.length,
    synchronizedCreatures: synchronized.rowCount ?? 0,
    attacks: finalRecords.reduce((sum, record) => sum + (record.attacks?.length ?? 0), 0),
    hitLocations: finalRecords.reduce((sum, record) => sum + (record.hitLocations?.length ?? 0), 0),
  };
}

async function importItems(client, seed) {
  for (const row of seed.bodyLocations ?? []) {
    await client.query(
      `INSERT INTO armor_location_reference (location_code, location_name, sort_order, notes)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (location_code) DO UPDATE SET
         location_name=EXCLUDED.location_name,
         sort_order=EXCLUDED.sort_order,
         notes=EXCLUDED.notes`,
      [row.key, row.label, row.sortOrder, row.notes ?? ""],
    );
  }

  const tagIds = new Map();
  for (const row of seed.tags ?? []) {
    const inserted = await queryOne(
      client,
      `INSERT INTO item_tags_catalog (canonical_id, name, tag_group, description)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (canonical_id) DO UPDATE SET
         name=EXCLUDED.name,
         tag_group=EXCLUDED.tag_group,
         description=EXCLUDED.description
       RETURNING id`,
      [row.canonicalId, row.name, row.tagGroup, row.description],
    );
    tagIds.set(row.name, Number(inserted.id));
  }

  for (const row of seed.rules ?? []) {
    await client.query(
      `INSERT INTO item_rules (rule_id, rule_name, rule_text, implementation_guidance, status)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (rule_id) DO UPDATE SET
         rule_name=EXCLUDED.rule_name,
         rule_text=EXCLUDED.rule_text,
         implementation_guidance=EXCLUDED.implementation_guidance,
         status=EXCLUDED.status`,
      [row.ruleId, row.ruleName, row.ruleText, row.implementationGuidance, row.status],
    );
  }

  const itemIds = new Map();
  for (const record of seed.items) {
    const core = record.core;
    const inserted = await queryOne(
      client,
      `INSERT INTO items (
         canonical_id, name, catalog_scope, equipment_group, record_type, family,
         category, subtype, description, weight, weight_unit, size, durability,
         credits, price_basis, source_system, source_external_id, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
       ON CONFLICT (canonical_id) DO UPDATE SET
         name=EXCLUDED.name,
         catalog_scope=EXCLUDED.catalog_scope,
         equipment_group=EXCLUDED.equipment_group,
         record_type=EXCLUDED.record_type,
         family=EXCLUDED.family,
         category=EXCLUDED.category,
         subtype=EXCLUDED.subtype,
         description=EXCLUDED.description,
         weight=EXCLUDED.weight,
         weight_unit=EXCLUDED.weight_unit,
         size=EXCLUDED.size,
         durability=EXCLUDED.durability,
         credits=EXCLUDED.credits,
         price_basis=EXCLUDED.price_basis,
         source_system=EXCLUDED.source_system,
         source_external_id=EXCLUDED.source_external_id,
         updated_at=now()
       RETURNING id`,
      [
        core.canonicalId,
        core.name,
        core.catalogScope,
        core.equipmentGroup ?? null,
        core.recordType,
        core.family,
        core.category,
        core.subtype ?? "",
        core.description ?? "",
        core.weight ?? null,
        core.weightUnit ?? "",
        core.size ?? "",
        core.durability ?? null,
        core.credits ?? null,
        core.priceBasis,
        core.sourceSystem ?? null,
        core.sourceExternalId ?? null,
      ],
    );
    itemIds.set(core.canonicalId, Number(inserted.id));
  }

  for (const record of seed.items) {
    const core = record.core;
    await client.query(
      "UPDATE items SET parent_item_id=$2 WHERE id=$1",
      [itemIds.get(core.canonicalId), core.parentCanonicalId ? itemIds.get(core.parentCanonicalId) ?? null : null],
    );
  }

  const creatureCanonicalIds = new Set((await client.query("SELECT canonical_id FROM creatures")).rows.map((row) => row.canonical_id));

  for (const record of seed.items) {
    const itemId = itemIds.get(record.core.canonicalId);

    await client.query("DELETE FROM armor_locations WHERE item_id=$1", [itemId]);
    await client.query("DELETE FROM item_armor_damage_modifiers WHERE item_id=$1", [itemId]);
    await client.query("DELETE FROM item_properties WHERE item_id=$1", [itemId]);
    await client.query("DELETE FROM item_tag_links WHERE item_id=$1", [itemId]);
    await client.query("DELETE FROM weapon_profiles WHERE item_id=$1", [itemId]);
    await client.query("DELETE FROM armor_profiles WHERE item_id=$1", [itemId]);

    const weapon = record.weaponProfile;
    if (weapon) {
      await client.query(
        `INSERT INTO weapon_profiles (
           item_id, profile_record_type, weapon_type, handedness, damage_source,
           damage, damage_type, range_text, reach_text, ammunition_item_id,
           compatibility, capacity, fire_modes, rate_of_fire, reload_initiative, rules_text
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          itemId,
          weapon.profileRecordType ?? "",
          weapon.weaponType ?? "",
          weapon.handedness ?? "",
          weapon.damageSource ?? "",
          weapon.damage ?? "",
          weapon.damageType ?? "",
          weapon.range ?? "",
          weapon.reach ?? "",
          weapon.ammunitionCanonicalId ? itemIds.get(weapon.ammunitionCanonicalId) ?? null : null,
          weapon.compatibility ?? "",
          weapon.capacity ?? "",
          JSON.stringify(weapon.fireModes ?? []),
          weapon.rateOfFire ?? "",
          weapon.reloadInitiative ?? "",
          weapon.rulesText ?? "",
        ],
      );
    }

    const armor = record.armorProfile;
    if (armor) {
      await client.query(
        `INSERT INTO armor_profiles (
           item_id, armor_type, coverage, base_soak, damage_modifiers_source_text, rules_text
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [itemId, armor.armorType ?? "", armor.coverage ?? "", armor.baseSoak ?? null, armor.damageModifiersSourceText ?? "", armor.rulesText ?? ""],
      );
      for (const modifier of armor.damageModifiers ?? []) {
        await client.query(
          `INSERT INTO item_armor_damage_modifiers (
             item_id, modifier_text, damage_type, modifier, notes, sort_order
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [itemId, modifier.modifierText ?? "", modifier.damageType, modifier.modifier, modifier.notes ?? "", modifier.sortOrder ?? 0],
        );
      }
      for (const [sortOrder, locationCode] of (armor.coveredBodyLocationKeys ?? []).entries()) {
        await client.query(
          "INSERT INTO armor_locations (item_id, location_code, sort_order) VALUES ($1,$2,$3)",
          [itemId, locationCode, sortOrder],
        );
      }
    }

    for (const property of record.properties ?? []) {
      if (property.relatedCreatureCanonicalId && !creatureCanonicalIds.has(property.relatedCreatureCanonicalId)) {
        throw new Error(`${record.core.canonicalId} references missing Creature ${property.relatedCreatureCanonicalId}.`);
      }
      await client.query(
        `INSERT INTO item_properties (
           item_id, property_name, value, unit, related_item_id,
           related_creature_canonical_id, quantity, notes, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          itemId,
          property.propertyName,
          property.value ?? "",
          property.unit ?? "",
          property.relatedItemCanonicalId ? itemIds.get(property.relatedItemCanonicalId) ?? null : null,
          property.relatedCreatureCanonicalId ?? null,
          property.quantity ?? null,
          property.notes ?? "",
          property.sortOrder ?? 0,
        ],
      );
    }

    for (const tagName of record.tags ?? []) {
      const tagId = tagIds.get(tagName);
      if (!tagId) throw new Error(`${record.core.canonicalId} references missing Item tag ${tagName}.`);
      await client.query(
        "INSERT INTO item_tag_links (item_id, tag_id) VALUES ($1,$2)",
        [itemId, tagId],
      );
    }
  }

  return {
    items: seed.items.length,
    equipment: seed.counts.equipment,
    inventory: seed.counts.inventory,
    weaponProfiles: seed.counts.weaponProfiles,
    armorProfiles: seed.counts.armorProfiles,
    tags: seed.tags?.length ?? 0,
  };
}

async function importAttributeReferences(client, rows) {
  for (const row of rows) {
    await client.query(
      `INSERT INTO attribute_score_reference (
         attribute_key, score, max_carry, max_lift, max_spheres,
         spell_weaving, teaching_base, loyalty_base
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (attribute_key, score) DO UPDATE SET
         max_carry=EXCLUDED.max_carry,
         max_lift=EXCLUDED.max_lift,
         max_spheres=EXCLUDED.max_spheres,
         spell_weaving=EXCLUDED.spell_weaving,
         teaching_base=EXCLUDED.teaching_base,
         loyalty_base=EXCLUDED.loyalty_base`,
      [
        row.attributeKey,
        row.score,
        row.maxCarry,
        row.maxLift,
        row.maxSpheres,
        row.spellWeaving,
        row.teachingBase,
        row.loyaltyBase,
      ],
    );
  }

  return rows.length;
}

async function main() {
  const [raceSeed, creatureSeed, itemSeed, attributeReferenceSeed, crXpSeed] = await Promise.all([
    loadJson(SOURCE_FILES.races),
    loadJson(SOURCE_FILES.creatures),
    loadJson(SOURCE_FILES.items),
    loadCheckedInCanonJson(ATTRIBUTE_REFERENCE_SOURCE_FILE),
    loadCheckedInCanonJson(CR_XP_SOURCE_FILE),
  ]);
  validateSeeds(raceSeed, creatureSeed, itemSeed);
  const attributeReferenceRows = materializeAttributeReferenceRows(attributeReferenceSeed);
  const crXpRows = materializeCrXpCanonRows(crXpSeed);
  const validatedCounts = validateFinalCanon(raceSeed, creatureSeed, itemSeed, crXpRows);
  if (VALIDATE_ONLY) {
    console.log("STSTandAlone final canon validation complete.");
    console.log(`Races: ${validatedCounts.races} | Creatures: ${validatedCounts.creatures} | Items: ${validatedCounts.items} | CR XP Rewards: ${validatedCounts.challengeRatings} | Attribute References: ${attributeReferenceRows.length}`);
    if (pool) await pool.end();
    return;
  }

  if (!pool) throw new Error("DATABASE_URL is required for import.");
  const client = await pool.connect();
  try {
    await requireTables(client);
    const skillMap = await readSkillMap(client);
    validateSkillReferences(raceSeed, creatureSeed, skillMap);

    await client.query("BEGIN");
    const raceCounts = await importRaces(client, raceSeed, skillMap);
    const creatureCounts = await importCreatures(client, creatureSeed, skillMap, crXpRows);
    const itemCounts = await importItems(client, itemSeed);
    const attributeReferenceCount = await importAttributeReferences(client, attributeReferenceRows);
    await client.query("COMMIT");

    console.log("STSTandAlone canon import complete.");
    console.log(`Races: ${raceCounts.races} | Attribute Caps: ${raceCounts.attributeCaps} | Movement Modes: ${raceCounts.movementModes} | Race→Skill Links: ${raceCounts.skillLinks}`);
    console.log(`Creatures: ${creatureCounts.creatures} | CR References: ${creatureCounts.challengeRatings} | XP-synchronized Creatures: ${creatureCounts.synchronizedCreatures} | Hit Locations: ${creatureCounts.hitLocations} | Attacks: ${creatureCounts.attacks}`);
    console.log(`Items: ${itemCounts.items} | Equipment: ${itemCounts.equipment} | Inventory: ${itemCounts.inventory} | Weapons: ${itemCounts.weaponProfiles} | Armor: ${itemCounts.armorProfiles} | Tags: ${itemCounts.tags}`);
    console.log(`Attribute References: ${attributeReferenceCount}`);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors so the original failure is preserved.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
