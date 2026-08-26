import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not configured. Run this from the website project root after .env.local is present.");
}

const SOURCE_REPO = "https://raw.githubusercontent.com/Revty79/STSTandAlone/main/data";
const LOCAL_SOURCE_DIR = process.env.STSTANDALONE_DATA_DIR?.trim() || null;
const SOURCE_FILES = {
  races: "serrian-tide-race-seed.json",
  creatures: "serrian-tide-creature-seed.json",
  items: "serrian-tide-item-seed.json",
};

const pool = new Pool({ connectionString });

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
    "creature_ip_provenance",
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

  assert(itemSeed?.schemaVersion === 1, "Unsupported Item seed schema.");
  assert(itemSeed?.counts?.items === 1007, `Item seed expected 1007 Items; found ${itemSeed?.counts?.items ?? "unknown"}.`);
  assert(Array.isArray(itemSeed.items) && itemSeed.items.length === 1007, "Item seed record count does not match its manifest.");
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

async function importCreatures(client, seed, skillMap) {
  for (const row of seed.challengeReference) {
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
  for (const record of seed.creatures) {
    const core = record.core;
    const row = await queryOne(
      client,
      `INSERT INTO creatures (
         canonical_id, canonical_name, family, creature_type, size, challenge_rating,
         kill_xp, description, typical_behavior, habitat_ecology, notes, source_system,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
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
      ],
    );
    creatureIds.set(core.canonicalId, Number(row.id));
  }

  for (const record of seed.creatures) {
    const creatureId = creatureIds.get(record.core.canonicalId);

    await client.query("DELETE FROM creature_ip_provenance WHERE creature_id=$1", [creatureId]);
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

    const variantIds = new Map();
    for (const variant of record.variants ?? []) {
      const inserted = await queryOne(
        client,
        `INSERT INTO creature_variants (
           canonical_id, creature_id, variant_name, variant_type, size_override,
           challenge_rating_override, kill_xp_override, description, notes, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          variant.canonicalId,
          creatureId,
          variant.variantName,
          variant.variantType ?? "",
          variant.sizeOverride ?? null,
          variant.challengeRatingOverride ?? null,
          variant.killXpOverride ?? null,
          variant.description ?? "",
          variant.notes ?? "",
          variant.sortOrder ?? 0,
        ],
      );
      variantIds.set(variant.canonicalId, Number(inserted.id));
    }

    const variantId = (canonicalId) => canonicalId ? variantIds.get(canonicalId) ?? null : null;

    for (const row of record.attributes ?? []) {
      await client.query(
        `INSERT INTO creature_attributes (creature_id, variant_id, attribute_key, value, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [creatureId, variantId(row.variantCanonicalId), row.attributeKey, row.value ?? null, row.notes ?? "", row.sortOrder ?? 0],
      );
    }
    for (const row of record.movement ?? []) {
      await client.query(
        `INSERT INTO creature_movement (creature_id, variant_id, movement_mode, movement_value, initiative, requirements, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [creatureId, variantId(row.variantCanonicalId), row.movementMode, row.movementValue ?? null, row.initiative ?? null, row.requirements ?? "", row.notes ?? "", row.sortOrder ?? 0],
      );
    }

    const hpPoolIds = new Map();
    for (const row of record.hpPools ?? []) {
      const inserted = await queryOne(
        client,
        `INSERT INTO creature_hp_pools (canonical_id, creature_id, variant_id, pool_name, hp_percentage, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [row.canonicalId, creatureId, variantId(row.variantCanonicalId), row.poolName, row.hpPercentage ?? null, row.notes ?? "", row.sortOrder ?? 0],
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
          variantId(row.variantCanonicalId),
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
          variantId(row.variantCanonicalId),
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
        [creatureId, variantId(row.variantCanonicalId), skillMap.get(row.skillExternalId), row.rank ?? null, row.notes ?? "", row.sortOrder ?? 0],
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
          variantId(row.variantCanonicalId),
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
        [row.seedIdentity ?? null, creatureId, variantId(row.variantCanonicalId), row.defenseType, row.against ?? "", row.value ?? null, row.notes ?? "", row.sortOrder ?? 0],
      );
    }
    for (const row of record.uses ?? []) {
      await client.query(
        `INSERT INTO creature_uses (seed_identity, creature_id, variant_id, use_name, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [row.seedIdentity ?? null, creatureId, variantId(row.variantCanonicalId), row.useName, row.notes ?? "", row.sortOrder ?? 0],
      );
    }

    if (record.provenance) {
      await client.query(
        `INSERT INTO creature_ip_provenance (
           creature_id, canonical_name, basis_category, source_tradition,
           copyright_ip_note, review_status
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          creatureId,
          record.provenance.canonicalName ?? record.core.canonicalName,
          record.provenance.basisCategory ?? "",
          record.provenance.sourceTradition ?? "",
          record.provenance.copyrightIpNote ?? "",
          record.provenance.reviewStatus ?? "",
        ],
      );
    }
  }

  return {
    creatures: seed.creatures.length,
    challengeRatings: seed.challengeReference.length,
    attacks: seed.creatures.reduce((sum, record) => sum + (record.attacks?.length ?? 0), 0),
    hitLocations: seed.creatures.reduce((sum, record) => sum + (record.hitLocations?.length ?? 0), 0),
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

async function main() {
  const [raceSeed, creatureSeed, itemSeed] = await Promise.all([
    loadJson(SOURCE_FILES.races),
    loadJson(SOURCE_FILES.creatures),
    loadJson(SOURCE_FILES.items),
  ]);
  validateSeeds(raceSeed, creatureSeed, itemSeed);

  const client = await pool.connect();
  try {
    await requireTables(client);
    const skillMap = await readSkillMap(client);
    validateSkillReferences(raceSeed, creatureSeed, skillMap);

    await client.query("BEGIN");
    const raceCounts = await importRaces(client, raceSeed, skillMap);
    const creatureCounts = await importCreatures(client, creatureSeed, skillMap);
    const itemCounts = await importItems(client, itemSeed);
    await client.query("COMMIT");

    console.log("STSTandAlone canon import complete.");
    console.log(`Races: ${raceCounts.races} | Attribute Caps: ${raceCounts.attributeCaps} | Movement Modes: ${raceCounts.movementModes} | Race→Skill Links: ${raceCounts.skillLinks}`);
    console.log(`Creatures: ${creatureCounts.creatures} | CR References: ${creatureCounts.challengeRatings} | Hit Locations: ${creatureCounts.hitLocations} | Attacks: ${creatureCounts.attacks}`);
    console.log(`Items: ${itemCounts.items} | Equipment: ${itemCounts.equipment} | Inventory: ${itemCounts.inventory} | Weapons: ${itemCounts.weaponProfiles} | Armor: ${itemCounts.armorProfiles} | Tags: ${itemCounts.tags}`);
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
