import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const canonFile = new URL(
  "../data/canon/serrian-tide-firearm-skills-canon.json",
  import.meta.url,
);
const canon = JSON.parse(await readFile(canonFile, "utf8"));
const expected = canon.records;
const pool = new pg.Pool({ connectionString });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceExternalId(name) {
  return `skill-${createHash("sha256")
    .update(name.toLocaleLowerCase("en-US"), "utf8")
    .digest("hex")}`;
}

try {
  assert(canon.schemaVersion === 1, "Unsupported Firearm Skill canon schema.");
  assert(
    canon.sourceSystem === "serrian-tide-core",
    "Firearm Skill canon has the wrong source system.",
  );
  assert(
    canon.recordCount === expected.length,
    "Firearm Skill canon record count is inconsistent.",
  );

  const result = await pool.query(
    `SELECT child.name,
            child.classification,
            child.tier,
            child.primary_attribute,
            child.secondary_attribute,
            child.definition,
            child.source_external_id,
            parent.name AS parent_name
       FROM skill child
       LEFT JOIN skill_relationship relationship
         ON relationship.skill_id=child.id
        AND lower(relationship.relationship_type)='parent'
       LEFT JOIN skill parent ON parent.id=relationship.related_skill_id
      WHERE child.source_system=$1
        AND child.name = ANY($2::text[])
      ORDER BY child.name, parent.name`,
    [canon.sourceSystem, expected.map(({ name }) => name)],
  );

  assert(
    result.rows.length === expected.length,
    `Expected ${expected.length} persisted Firearm Skills; found ${result.rows.length}.`,
  );
  for (const required of expected) {
    const actual = result.rows.find(({ name }) => name === required.name);
    assert(actual, `Missing persisted Firearm Skill ${required.name}.`);
    assert(
      actual.classification === required.classification &&
        Number(actual.tier) === required.tier &&
        actual.primary_attribute === required.primaryAttribute &&
        actual.secondary_attribute === required.secondaryAttribute &&
        actual.definition === required.definition &&
        actual.parent_name === required.parentName &&
        actual.source_external_id === sourceExternalId(required.name),
      `${required.name} does not match the checked-in Firearm Skill canon.`,
    );
  }

  console.log(
    `Firearm Skill audit passed: ${expected.length}/${expected.length} canonical rows and parent relationships match.`,
  );
} finally {
  await pool.end();
}
