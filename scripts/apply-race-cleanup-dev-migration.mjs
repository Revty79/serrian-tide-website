import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parse } from "dotenv";
import pg from "pg";

assert.deepEqual(process.argv.slice(2), ["--apply"], "Use --apply for the reviewed local DEV migration.");
const { DATABASE_URL } = parse(await readFile(".env.local"));
const url = new URL(DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/serrian_tide_dev", "Only loopback serrian_tide_dev is supported.");
const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
assert.equal(journal.entries.at(-1).tag, "0064_race_soak_and_variants");
const entries = await Promise.all(journal.entries.map(async (entry) => {
  const sql = await readFile(`drizzle/${entry.tag}.sql`, "utf8");
  return { ...entry, sql, hash: createHash("sha256").update(sql).digest("hex") };
}));
const tables = ["races", "race_attribute_caps", "race_movement_modes", "race_skill_links", "race_natural_protections", "race_natural_protection_locations"];
const client = new pg.Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 5000 });
let open = false;
async function ledger() { return (await client.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at")).rows; }
function checkLedger(rows, count) {
  assert.equal(rows.length, count, "Unexpected migration state.");
  rows.forEach((row, index) => { assert.equal(row.hash, entries[index].hash); assert.equal(Number(row.created_at), entries[index].when); });
}
async function snapshot() {
  const result = {};
  for (const table of tables) result[table] = (await client.query(`select to_jsonb(t) body from public.${table} t order by to_jsonb(t)::text`)).rows.map(({ body }) => body);
  return result;
}
try {
  await client.connect();
  const applied = await ledger();
  if (applied.length === entries.length) {
    checkLedger(applied, entries.length);
    console.log("0064 already applied; migration hashes match. No changes made.");
  } else {
    checkLedger(applied, entries.length - 1);
    await client.query("begin"); open = true;
    await client.query("set local lock_timeout='5s'");
    await client.query("set local statement_timeout='30s'");
    await client.query("lock table drizzle.__drizzle_migrations," + tables.map((table) => "public." + table).join(",") + " in share row exclusive mode");
    checkLedger(await ledger(), entries.length - 1);
    const before = await snapshot();
    const folder = "artifacts/race-authoring"; await mkdir(folder, { recursive: true });
    const stamp = Date.now();
    const backupPath = `${folder}/before-0064-${stamp}.json`;
    await writeFile(backupPath, JSON.stringify({ capturedAt: new Date().toISOString(), database: "serrian_tide_dev", tables: before }, null, 2) + "\n", { flag: "wx" });
    const migration = entries.at(-1), statements = migration.sql.split("--> statement-breakpoint").map((entry) => entry.trim()).filter(Boolean);
    assert.equal(statements.length, 7);
    for (const statement of statements) {
      assert.match(statement, /^(ALTER TABLE "(?:races|race_natural_protections)" |CREATE INDEX "races_parent_race_idx")/);
      await client.query(statement);
    }
    const after = await snapshot();
    for (const table of tables) {
      const normalized = after[table].map((row) => { const result = { ...row }; if (table === "races") { assert.equal(result.parent_race_id, null); delete result.parent_race_id; } return result; });
      const expected = before[table].map((row) => { const result = { ...row }; if (table === "race_natural_protections") delete result.natural_armor; return result; });
      const sorted = (rows) => rows.map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))))).sort();
      assert.deepEqual(sorted(normalized), sorted(expected), `${table} changed beyond the approved migration`);
    }
    await client.query("insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)", [migration.hash, migration.when]);
    checkLedger(await ledger(), entries.length);
    const discardedArmor = before.race_natural_protections.filter((row) => row.natural_armor !== 0).map((row) => ({ protectionId: row.id, raceId: row.race_id, raceName: before.races.find((race) => race.id === row.race_id)?.name, discardedNaturalArmor: row.natural_armor, retainedSoak: row.natural_soak }));
    await client.query("commit"); open = false;
    const report = { verifiedAt: new Date().toISOString(), migration: migration.tag, database: "serrian_tide_dev", raceCount: after.races.length, protectionCount: after.race_natural_protections.length, inventedParents: 0, discardedArmor, exactOtherRaceValuesPreserved: true, backupPath, migrationCount: entries.length };
    await writeFile(`${folder}/dev-migration.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  }
} finally {
  if (open) await client.query("rollback");
  await client.end();
}
