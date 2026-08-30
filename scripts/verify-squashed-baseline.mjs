import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured.");
}

const root = process.cwd();
const schemaName = `st_baseline_verify_${randomBytes(6).toString("hex")}`;
const migration = await readFile(
  path.join(root, "drizzle", "0000_serrian_tide_baseline.sql"),
  "utf8",
);
const isolatedSql = migration.replaceAll('"public".', `"${schemaName}".`);
const statements = isolatedSql
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

function assertEqual(actual, expected, label) {
  if (Number(actual) !== expected) {
    throw new Error(`${label}: expected ${expected}, found ${actual}.`);
  }
}

await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query(`SET LOCAL search_path TO "${schemaName}"`);
  for (const statement of statements) {
    await client.query(statement);
  }

  const applicationTables = await client.query(
    `SELECT count(*)::int AS count
       FROM information_schema.tables
      WHERE table_schema=$1 AND table_type='BASE TABLE'`,
    [schemaName],
  );
  const attributeRows = await client.query(
    `SELECT count(*)::int AS count FROM attribute_score_reference`,
  );
  const challengeRows = await client.query(
    `SELECT count(*)::int AS count FROM challenge_rating_reference`,
  );
  const derivedRows = await client.query(
    `SELECT count(*)::int AS count
       FROM derived_ability
      WHERE source_system='serrian-tide-derived-ability-canon'`,
  );
  const triggerRows = await client.query(
    `SELECT count(*)::int AS count FROM derived_ability_trigger`,
  );
  const skillRows = await client.query(
    `SELECT count(*)::int AS count
       FROM skill
      WHERE source_system='serrian-tide-core'`,
  );
  const firearmRelationships = await client.query(
    `SELECT count(*)::int AS count
       FROM skill_relationship relationship
       JOIN skill child ON child.id=relationship.skill_id
       JOIN skill parent ON parent.id=relationship.related_skill_id
      WHERE child.source_system='serrian-tide-core'
        AND parent.source_system='serrian-tide-core'
        AND child.name IN (
          'Firearm Mastery',
          'Handgun Mastery',
          'Rifle Mastery',
          'Shotgun Mastery',
          'Automatic Fire Control'
        )`,
  );

  assertEqual(applicationTables.rows[0].count, 53, "Application tables");
  assertEqual(attributeRows.rows[0].count, 400, "Attribute Reference rows");
  assertEqual(challengeRows.rows[0].count, 50, "Challenge Rating rows");
  assertEqual(derivedRows.rows[0].count, 6, "Derived Ability rows");
  assertEqual(triggerRows.rows[0].count, 6, "Derived Ability trigger rows");
  assertEqual(skillRows.rows[0].count, 6, "Baseline Skill rows");
  assertEqual(firearmRelationships.rows[0].count, 5, "Firearm parent relationships");

  console.log(
    `Transaction-isolated baseline verification passed: ${statements.length} SQL statements, 53 tables, 400 Attribute rows, 50 CR rows, 6 Derived Abilities, and 5 Firearm relationships.`,
  );
} finally {
  await client.query("ROLLBACK");
  await client.end();
}
