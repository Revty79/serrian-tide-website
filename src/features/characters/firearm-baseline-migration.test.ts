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

test("Drizzle preserves the consolidated baseline and records one consolidated forward migration", () => {
  const sqlFiles = readdirSync(path.resolve(root, "drizzle"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.equal(sqlFiles[0], migrationName);
  assert.deepEqual(sqlFiles, [migrationName, "0001_runtime_foundation.sql"]);

  const journal = JSON.parse(
    readFileSync(path.resolve(root, "drizzle", "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string }> };
  assert.equal(journal.entries.length, 2);
  assert.equal(journal.entries[0]?.idx, 0);
  assert.equal(journal.entries[0]?.tag, "0000_serrian_tide_baseline");
  assert.equal(journal.entries[1]?.idx, 1);
  assert.equal(journal.entries[1]?.tag, "0001_runtime_foundation");
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
