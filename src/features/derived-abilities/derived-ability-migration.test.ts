import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const baseline = readFileSync(
  path.resolve(root, "drizzle/0000_serrian_tide_baseline.sql"),
  "utf8",
);
const expandedDomain = readFileSync(
  path.resolve(root, "drizzle/0017_expanded_derived_ability_domain.sql"),
  "utf8",
);
const migration = readFileSync(
  path.resolve(root, "drizzle/0018_migrate_derived_ability_requirements.sql"),
  "utf8",
);

const canonicalAbilities = [
  ["Durable Muscles", "DA-STR-40-DURABLE-MUSCLES", "STR"],
  ["Ambidexterity", "DA-DEX-40-AMBIDEXTERITY", "DEX"],
  ["Poison Resistance", "DA-CON-40-POISON-RESISTANCE", "CON"],
  ["Eidetic Memory", "DA-INT-40-EIDETIC-MEMORY", "INT"],
  ["Indomitable Will", "DA-WIS-40-INDOMITABLE-WILL", "WIS"],
  ["Likeable", "DA-CHR-40-LIKEABLE", "CHR"],
] as const;

test("0018 generically maps each exactly-one valid V1 Attribute trigger to one Live requirement", () => {
  assert.match(
    migration,
    /count\(\*\) OVER \([\s\S]*?PARTITION BY trigger_row\."derived_ability_id"/,
  );
  assert.match(migration, /legacy\."trigger_count" = 1/);
  assert.match(migration, /legacy\."trigger_type" = 'attribute'/);
  assert.match(migration, /legacy\."attribute_key" IN \('STR', 'DEX', 'CON', 'INT', 'WIS', 'CHR'\)/);
  assert.match(migration, /legacy\."minimum_score" IS NOT NULL/);
  assert.match(migration, /legacy\."minimum_score" >= 0/);
  assert.match(migration, /legacy\."sort_order" >= 0/);
  assert.match(
    migration,
    /SELECT\s+legacy\."derived_ability_id",\s+'live',\s+'attribute',\s+0,\s+legacy\."attribute_key",\s+NULL,\s+NULL,\s+'gte',\s+legacy\."minimum_score",\s+'',\s+legacy\."sort_order"/,
  );
});

test("0018 covers custom V1 content without hard-coded ability identities", () => {
  assert.doesNotMatch(migration, /DA-(?:STR|DEX|CON|INT|WIS|CHR)-40/);
  for (const [name] of canonicalAbilities) assert.doesNotMatch(migration, new RegExp(name));
  assert.match(migration, /FROM "derived_ability_trigger" AS trigger_row/);
});

test("0018 skips pre-generalized and malformed or multiple-trigger definitions without mutating legacy data", () => {
  assert.match(
    migration,
    /NOT EXISTS \(\s*SELECT 1\s*FROM "derived_ability_requirement" AS existing_requirement\s*WHERE existing_requirement\."derived_ability_id" = legacy\."derived_ability_id"\s*\)/,
  );
  assert.equal((migration.match(/INSERT INTO "derived_ability_requirement"/g) ?? []).length, 1);
  assert.doesNotMatch(
    migration,
    /(?:UPDATE|DELETE FROM|DROP|TRUNCATE|ALTER TABLE)\s+"?(?:derived_ability|derived_ability_trigger)"?/i,
  );
  assert.doesNotMatch(migration, /INSERT INTO "derived_ability_trigger"/);
});

test("the canonical six remain automatic/passive definitions with one preserved Attribute 40 trigger", () => {
  assert.match(
    expandedDomain,
    /"acquisition_type" "derived_ability_acquisition_type" DEFAULT 'automatic' NOT NULL/,
  );
  assert.match(
    expandedDomain,
    /"activation_type" "derived_ability_activation_type" DEFAULT 'passive' NOT NULL/,
  );
  for (const [name, sourceExternalId, attributeKey] of canonicalAbilities) {
    assert.match(baseline, new RegExp(`'${name}'.*'${sourceExternalId}'`));
    assert.match(baseline, new RegExp(`\\('${sourceExternalId}', '${attributeKey}'\\)`));
  }
  assert.match(
    baseline,
    /SELECT\s+ability\."id",\s+'attribute',\s+canonical\."attribute_key",\s+40,\s+0/,
  );
  assert.match(migration, /legacy\."minimum_score"/);
});
