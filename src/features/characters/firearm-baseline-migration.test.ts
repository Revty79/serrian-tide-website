import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

type FirearmCanon = {
  schemaVersion: number;
  sourceSystem: string;
  recordCount: number;
  records: Array<{
    name: string;
    definition: string;
    parentName: string;
  }>;
};

const root = process.cwd();
const migrationName = "0000_serrian_tide_baseline.sql";
const migration = readFileSync(
  path.resolve(root, "drizzle", migrationName),
  "utf8",
);
const canon = JSON.parse(
  readFileSync(
    path.resolve(
      root,
      "data",
      "canon",
      "serrian-tide-firearm-skills-canon.json",
    ),
    "utf8",
  ),
) as FirearmCanon;

function sourceExternalId(name: string) {
  return `skill-${createHash("sha256")
    .update(name.toLocaleLowerCase("en-US"), "utf8")
    .digest("hex")}`;
}

test("Drizzle preserves the consolidated baseline and ordered forward migrations", () => {
  const sqlFiles = readdirSync(path.resolve(root, "drizzle"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.equal(sqlFiles[0], migrationName);
  assert.deepEqual(sqlFiles, [
    migrationName,
    "0001_runtime_foundation.sql",
    "0002_campaign_overview.sql",
    "0003_creature_effective_statistics.sql",
    "0004_persisted_creature_hp.sql",
    "0005_tabletop_operations_session_foundation.sql",
    "0006_tabletop_operations_session_roster.sql",
    "0007_tabletop_operations_scenes.sql",
    "0008_tabletop_operations_encounters.sql",
    "0009_tabletop_operations_initiative_runtime.sql",
    "0010_tabletop_operations_runtime_integration.sql",
    "0011_tabletop_operations_duration_closeout.sql",
    "0012_tabletop_operations_roll_runtime.sql",
  ]);

  const journal = JSON.parse(
    readFileSync(path.resolve(root, "drizzle", "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string }> };
  assert.equal(journal.entries.length, 13);
  assert.equal(journal.entries[0]?.idx, 0);
  assert.equal(journal.entries[0]?.tag, "0000_serrian_tide_baseline");
  assert.equal(journal.entries[1]?.idx, 1);
  assert.equal(journal.entries[1]?.tag, "0001_runtime_foundation");
  assert.equal(journal.entries[2]?.idx, 2);
  assert.equal(journal.entries[2]?.tag, "0002_campaign_overview");
  assert.equal(journal.entries[3]?.idx, 3);
  assert.equal(journal.entries[3]?.tag, "0003_creature_effective_statistics");
  assert.equal(journal.entries[4]?.idx, 4);
  assert.equal(journal.entries[4]?.tag, "0004_persisted_creature_hp");
  assert.equal(journal.entries[5]?.idx, 5);
  assert.equal(journal.entries[5]?.tag, "0005_tabletop_operations_session_foundation");
  assert.equal(journal.entries[6]?.idx, 6);
  assert.equal(journal.entries[6]?.tag, "0006_tabletop_operations_session_roster");
  assert.equal(journal.entries[7]?.idx, 7);
  assert.equal(journal.entries[7]?.tag, "0007_tabletop_operations_scenes");
  assert.equal(journal.entries[8]?.idx, 8);
  assert.equal(journal.entries[8]?.tag, "0008_tabletop_operations_encounters");
  assert.equal(journal.entries[9]?.idx, 9);
  assert.equal(journal.entries[9]?.tag, "0009_tabletop_operations_initiative_runtime");
  assert.equal(journal.entries[10]?.idx, 10);
  assert.equal(journal.entries[10]?.tag, "0010_tabletop_operations_runtime_integration");
  assert.equal(journal.entries[11]?.idx, 11);
  assert.equal(journal.entries[11]?.tag, "0011_tabletop_operations_duration_closeout");
  assert.equal(journal.entries[12]?.idx, 12);
  assert.equal(journal.entries[12]?.tag, "0012_tabletop_operations_roll_runtime");
});

test("the baseline migration owns the exact Firearm Skill branch", () => {
  assert.equal(canon.schemaVersion, 1);
  assert.equal(canon.sourceSystem, "serrian-tide-core");
  assert.equal(canon.recordCount, 5);
  assert.equal(canon.records.length, 5);
  assert.match(migration, /'Precision Ranged', 'standard', 1, 'DEX'/);

  for (const record of canon.records) {
    assert.ok(migration.includes(`'${record.name}'`));
    assert.ok(migration.includes(record.definition));
    assert.ok(migration.includes(sourceExternalId(record.name)));
  }

  assert.equal(
    (
      migration.match(
        /AS canonical\("child_external_id", "parent_external_id"\)/g,
      ) ?? []
    ).length,
    1,
  );
  assert.equal(
    canon.records.filter(({ parentName }) => parentName === "Firearm Mastery")
      .length,
    4,
  );
});
