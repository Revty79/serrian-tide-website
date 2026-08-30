import { createHash } from "node:crypto";
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
  throw new Error(
    "DATABASE_URL is not configured. Run this from the website project root after .env.local is present.",
  );
}

const SOURCE_REPO =
  "https://raw.githubusercontent.com/Revty79/STSTandAlone/main/data";
const LOCAL_SOURCE_DIR = process.env.STSTANDALONE_DATA_DIR?.trim() || null;
const SKILL_FILE = "serrian-tide-skill-catalog.tsv";
const SPELL_FILE = "serrian-tide-spell-seed.json";
const FIREARM_SKILL_FILE = new URL(
  "../data/canon/serrian-tide-firearm-skills-canon.json",
  import.meta.url,
);
const SOURCE_SYSTEM = "serrian-tide-core";
const EXPECTED_SKILLS = 1142;
const EXPECTED_RELATIONSHIPS = 1027;
const EXPECTED_FIREARM_SKILLS = 5;
const EXPECTED_SPELLS = 371;
const CORRECTED_TIER_EXTERNAL_ID =
  "skill-386c592f2009be1807e6645fb730ea2f21c4b607fa0b9e21473bec9603863ca7";

const expectedHeaders = [
  "Primary Attribute",
  "Secondary Attribute",
  "Skill Type",
  "Skill Tier",
  "Skill Name",
  "Parent Skill",
  "Definition",
];
const emptyValues = new Set(["", "N/A", "—", "-", "None"]);

const pool = new Pool({ connectionString });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceExternalId(name) {
  return `skill-${createHash("sha256")
    .update(name.toLocaleLowerCase("en-US"), "utf8")
    .digest("hex")}`;
}

async function loadText(fileName) {
  if (LOCAL_SOURCE_DIR) {
    return readFile(path.resolve(LOCAL_SOURCE_DIR, fileName), "utf8");
  }
  const response = await fetch(`${SOURCE_REPO}/${fileName}`);
  if (!response.ok) {
    throw new Error(
      `Could not download ${fileName} from STSTandAlone: HTTP ${response.status}. Set STSTANDALONE_DATA_DIR to a local data directory to import offline.`,
    );
  }
  return response.text();
}

async function loadJson(fileName) {
  return JSON.parse(await loadText(fileName));
}

async function loadFirearmSkillOverlay() {
  const document = JSON.parse(await readFile(FIREARM_SKILL_FILE, "utf8"));
  assert(document?.schemaVersion === 1, "Unsupported Firearm Skill canon schema.");
  assert(
    document?.sourceSystem === SOURCE_SYSTEM,
    "Firearm Skill canon has the wrong source system.",
  );
  assert(
    document?.recordCount === EXPECTED_FIREARM_SKILLS &&
      Array.isArray(document.records) &&
      document.records.length === EXPECTED_FIREARM_SKILLS,
    `Expected ${EXPECTED_FIREARM_SKILLS} required Firearm Skills.`,
  );
  return document.records;
}

function applyRequiredSkillOverlay(rows, requiredRows) {
  const rowIndexByName = new Map(
    rows.map((row, index) => [row.name.toLocaleLowerCase("en-US"), index]),
  );
  for (const required of requiredRows) {
    assert(required?.name?.trim(), "Required Skill canon contains a nameless row.");
    assert(
      required?.definition?.trim(),
      `Required Skill ${required?.name ?? "unknown"} has no Definition.`,
    );
    assert(
      Number.isInteger(required.tier) && required.tier >= 1,
      `Required Skill ${required.name} has an invalid Tier.`,
    );
    const key = required.name.toLocaleLowerCase("en-US");
    const existingIndex = rowIndexByName.get(key);
    const canonicalRow = {
      ordinal:
        existingIndex === undefined
          ? rows.length + 1
          : rows[existingIndex].ordinal,
      externalId: sourceExternalId(required.name),
      primaryAttribute: required.primaryAttribute ?? null,
      secondaryAttribute: required.secondaryAttribute ?? null,
      classification: required.classification,
      tier: required.tier,
      name: required.name,
      parentName: required.parentName ?? null,
      definition: required.definition,
    };
    if (existingIndex === undefined) {
      rowIndexByName.set(key, rows.length);
      rows.push(canonicalRow);
    } else {
      rows[existingIndex] = canonicalRow;
    }
  }
  return rows;
}

function parseCatalog(source, requiredRows) {
  const lines = source
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .split("\n");
  if (!lines.at(-1)) lines.pop();

  const headers = lines.shift()?.split("\t").slice(0, expectedHeaders.length) ?? [];
  if (headers.join("\t") !== expectedHeaders.join("\t")) {
    throw new Error(
      `Unexpected Skill catalog headers. Expected: ${expectedHeaders.join(", ")}`,
    );
  }

  const rows = applyRequiredSkillOverlay(
    lines.map((line, index) => {
      const columns = line.split("\t").slice(0, expectedHeaders.length);
      if (columns.length < expectedHeaders.length) {
        throw new Error(
          `Skill catalog row ${index + 2} has only ${columns.length} columns.`,
        );
      }
      const [
        primary,
        secondary,
        classification,
        tierText,
        name,
        parent,
        definition,
      ] = columns.map((value) => value.trim());

      if (!name)
        throw new Error(`Skill catalog row ${index + 2} has no Skill Name.`);
      if (!classification) {
        throw new Error(`Skill catalog row ${index + 2} has no Skill Type.`);
      }
      if (!definition) {
        throw new Error(`Skill catalog row ${index + 2} has no Definition.`);
      }

      const tier = emptyValues.has(tierText) ? null : Number(tierText);
      if (tier !== null && (!Number.isInteger(tier) || tier < 1)) {
        throw new Error(
          `Skill catalog row ${index + 2} has invalid tier ${JSON.stringify(tierText)}.`,
        );
      }

      return {
        ordinal: index + 1,
        externalId: sourceExternalId(name),
        primaryAttribute: emptyValues.has(primary) ? null : primary,
        secondaryAttribute: emptyValues.has(secondary) ? null : secondary,
        classification,
        tier,
        name,
        parentName: emptyValues.has(parent) ? null : parent,
        definition,
      };
    }),
    requiredRows,
  );

  const byName = new Map();
  for (const row of rows) {
    const key = row.name.toLocaleLowerCase("en-US");
    if (byName.has(key)) throw new Error(`Duplicate Skill Name ${JSON.stringify(row.name)}.`);
    byName.set(key, row);
  }
  for (const row of rows) {
    if (
      row.parentName &&
      !byName.has(row.parentName.toLocaleLowerCase("en-US"))
    ) {
      throw new Error(
        `Skill ${JSON.stringify(row.name)} references missing parent ${JSON.stringify(row.parentName)}.`,
      );
    }
  }

  assert(
    rows.length === EXPECTED_SKILLS,
    `Expected ${EXPECTED_SKILLS} canonical Skills; found ${rows.length}.`,
  );
  return { rows, byName };
}

async function requireTables(client) {
  const required = ["skill", "skill_relationship", "skill_extension"];
  const result = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name = ANY($1::text[])`,
    [required],
  );
  const present = new Set(result.rows.map((row) => row.table_name));
  const missing = required.filter((table) => !present.has(table));
  if (missing.length) {
    throw new Error(
      `Database schema is not ready. Missing tables: ${missing.join(", ")}. Generate and run the Drizzle migration first.`,
    );
  }
}

async function upsertSkills(client, rows) {
  const idsByExternalId = new Map();
  const idsByName = new Map();

  for (const row of rows) {
    const result = await client.query(
      `INSERT INTO skill (
         name, classification, tier, primary_attribute, secondary_attribute,
         definition, created_by_user_id, source_system, source_external_id,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8,now())
       ON CONFLICT (source_system, source_external_id)
       WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL
       DO UPDATE SET
         name=EXCLUDED.name,
         classification=EXCLUDED.classification,
         tier=EXCLUDED.tier,
         primary_attribute=EXCLUDED.primary_attribute,
         secondary_attribute=EXCLUDED.secondary_attribute,
         definition=EXCLUDED.definition,
         updated_at=now()
       RETURNING id`,
      [
        row.name,
        row.classification,
        row.tier,
        row.primaryAttribute,
        row.secondaryAttribute,
        row.definition,
        SOURCE_SYSTEM,
        row.externalId,
      ],
    );
    const id = Number(result.rows[0].id);
    idsByExternalId.set(row.externalId, id);
    idsByName.set(row.name.toLocaleLowerCase("en-US"), id);
  }

  // Final STSTandAlone migration 0021 repairs one canonical Spell that was
  // originally emitted without its Tier. Keep the repair identity-based so a
  // user-created Skill with the same display name is never touched.
  await client.query(
    `UPDATE skill
        SET tier=3, updated_at=now()
      WHERE source_system=$1
        AND source_external_id=$2
        AND lower(classification)='spell'
        AND tier IS NULL`,
    [SOURCE_SYSTEM, CORRECTED_TIER_EXTERNAL_ID],
  );

  return { idsByExternalId, idsByName };
}

async function refreshCanonicalRelationships(
  client,
  rows,
  idsByName,
) {
  // Refresh only relationships whose child and parent are both Serrian Tide
  // canonical Skills. Relationships involving G.O.D.-created Skills survive.
  await client.query(
    `DELETE FROM skill_relationship relationship
      USING skill child, skill parent
      WHERE relationship.skill_id=child.id
        AND relationship.related_skill_id=parent.id
        AND lower(relationship.relationship_type)='parent'
        AND child.source_system=$1
        AND parent.source_system=$1`,
    [SOURCE_SYSTEM],
  );

  for (const row of rows) {
    if (!row.parentName) continue;
    const childId = idsByName.get(row.name.toLocaleLowerCase("en-US"));
    const parentId = idsByName.get(row.parentName.toLocaleLowerCase("en-US"));
    if (!childId || !parentId) {
      throw new Error(
        `Could not resolve canonical Skill relationship ${row.name} -> ${row.parentName}.`,
      );
    }
    await client.query(
      `INSERT INTO skill_relationship (
         skill_id, related_skill_id, relationship_type, sort_order
       ) VALUES ($1,$2,'parent',0)
       ON CONFLICT (skill_id, related_skill_id, relationship_type) DO NOTHING`,
      [childId, parentId],
    );
  }

  // Final STSTandAlone migration 0022 shares every Tier-2 Sphere beneath
  // Spellcraft with Talismanism and Faith as additional legal parent branches.
  await client.query(
    `INSERT INTO skill_relationship (
       skill_id, related_skill_id, relationship_type, sort_order
     )
     SELECT sphere.id, access_skill.id, 'parent', existing.sort_order
       FROM skill sphere
       JOIN skill_relationship existing
         ON existing.skill_id=sphere.id
        AND lower(existing.relationship_type)='parent'
       JOIN skill spellcraft
         ON spellcraft.id=existing.related_skill_id
        AND spellcraft.source_system=$1
        AND lower(spellcraft.name)='spellcraft'
       JOIN skill access_skill
         ON access_skill.source_system=$1
        AND lower(access_skill.name) IN ('talismanism','faith')
      WHERE sphere.source_system=$1
        AND lower(sphere.classification)='sphere'
        AND sphere.tier=2
     ON CONFLICT (skill_id, related_skill_id, relationship_type) DO NOTHING`,
    [SOURCE_SYSTEM],
  );

  const result = await client.query(
    `SELECT count(*)::int AS count
       FROM skill_relationship relationship
       JOIN skill child ON child.id=relationship.skill_id
       JOIN skill parent ON parent.id=relationship.related_skill_id
      WHERE child.source_system=$1
        AND parent.source_system=$1
        AND lower(relationship.relationship_type)='parent'`,
    [SOURCE_SYSTEM],
  );
  const count = Number(result.rows[0].count);
  assert(
    count === EXPECTED_RELATIONSHIPS,
    `Expected ${EXPECTED_RELATIONSHIPS} canonical Skill parent relationships after final STSTandAlone corrections; found ${count}.`,
  );
  return count;
}

async function importSpellExtensions(
  client,
  spellSeed,
  idsByExternalId,
) {
  assert(spellSeed?.schemaVersion === 1, "Unsupported Spell seed schema.");
  assert(
    spellSeed?.recordCount === EXPECTED_SPELLS,
    `Expected ${EXPECTED_SPELLS} canonical Spell Construction records; seed reports ${spellSeed?.recordCount ?? "unknown"}.`,
  );
  assert(
    Array.isArray(spellSeed.records) && spellSeed.records.length === EXPECTED_SPELLS,
    `Expected ${EXPECTED_SPELLS} Spell records in the canonical seed.`,
  );

  for (const record of spellSeed.records) {
    const skillId = idsByExternalId.get(record.sourceExternalId);
    const frameworkId = idsByExternalId.get(record.parentExternalId);
    if (!skillId) {
      throw new Error(
        `Spell seed references missing canonical Skill identity ${record.sourceExternalId}.`,
      );
    }
    if (!frameworkId) {
      throw new Error(
        `Spell ${record.targetName} references missing framework identity ${record.parentExternalId}.`,
      );
    }

    const construction = {
      ...record.spell,
      frameworkSkillId: frameworkId,
    };

    // Preserve the original migration's rule: once a construction/source
    // extension exists for a canonical Skill, an import never overwrites the
    // authored extension document. Fresh databases still receive the full
    // canonical set.
    await client.query(
      `INSERT INTO skill_extension (
         skill_id, extension_type, schema_version, data_json
       ) VALUES ($1,'spell-construction',6,$2)
       ON CONFLICT (skill_id, extension_type) DO NOTHING`,
      [skillId, JSON.stringify(construction)],
    );
    await client.query(
      `INSERT INTO skill_extension (
         skill_id, extension_type, schema_version, data_json
       ) VALUES ($1,'spell-import-source',1,$2)
       ON CONFLICT (skill_id, extension_type) DO NOTHING`,
      [skillId, JSON.stringify(record.source)],
    );
  }

  const result = await client.query(
    `SELECT extension_type, count(*)::int AS count
       FROM skill_extension extension
       JOIN skill ON skill.id=extension.skill_id
      WHERE skill.source_system=$1
        AND extension.extension_type IN ('spell-construction','spell-import-source')
      GROUP BY extension_type`,
    [SOURCE_SYSTEM],
  );
  const counts = new Map(
    result.rows.map((row) => [row.extension_type, Number(row.count)]),
  );
  assert(
    counts.get("spell-construction") === EXPECTED_SPELLS,
    `Expected ${EXPECTED_SPELLS} canonical spell-construction extensions; found ${counts.get("spell-construction") ?? 0}.`,
  );
  assert(
    counts.get("spell-import-source") === EXPECTED_SPELLS,
    `Expected ${EXPECTED_SPELLS} canonical spell-import-source extensions; found ${counts.get("spell-import-source") ?? 0}.`,
  );
  return counts;
}

async function main() {
  const [skillSource, spellSeed, firearmSkillOverlay] = await Promise.all([
    loadText(SKILL_FILE),
    loadJson(SPELL_FILE),
    loadFirearmSkillOverlay(),
  ]);
  const { rows } = parseCatalog(skillSource, firearmSkillOverlay);

  const client = await pool.connect();
  try {
    await requireTables(client);
    await client.query("BEGIN");

    const { idsByExternalId, idsByName } = await upsertSkills(client, rows);
    const relationshipCount = await refreshCanonicalRelationships(
      client,
      rows,
      idsByName,
    );
    const extensionCounts = await importSpellExtensions(
      client,
      spellSeed,
      idsByExternalId,
    );

    const skillCountResult = await client.query(
      `SELECT count(*)::int AS count FROM skill WHERE source_system=$1`,
      [SOURCE_SYSTEM],
    );
    const skillCount = Number(skillCountResult.rows[0].count);
    assert(
      skillCount === EXPECTED_SKILLS,
      `Expected ${EXPECTED_SKILLS} canonical Skills in PostgreSQL; found ${skillCount}.`,
    );

    await client.query("COMMIT");

    console.log("STSTandAlone Skill canon import complete.");
    console.log(
      `Skills: ${skillCount} | Parent Relationships: ${relationshipCount} | Spell Construction: ${extensionCounts.get("spell-construction")} | Spell Sources: ${extensionCounts.get("spell-import-source")}`,
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original import error.
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
