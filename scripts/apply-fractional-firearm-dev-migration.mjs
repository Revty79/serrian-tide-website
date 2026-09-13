import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";

// Deliberately scoped: never runs any other pending migration or changes rows.
dotenv.config({ path: ".env.local", quiet: true });
assert.ok(process.argv.includes("--apply"), "Supply --apply for the verified local DEV migration.");
const url = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/serrian_tide_dev", "Only loopback serrian_tide_dev is supported.");
const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
assert.equal(journal.entries.at(-1).tag, "0049_fractional_firearm_preparation");
const entries = await Promise.all(journal.entries.map(async (entry) => {
  const sql = await readFile(path.join("drizzle", entry.tag + ".sql"), "utf8");
  return { ...entry, sql, hash: createHash("sha256").update(sql).digest("hex") };
}));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let open = false;
const tables = ["campaign_character_firearm_preparation", "magazine_profiles", "weapon_firing_modes", "weapon_profiles"];
async function ledger() {
  return (await client.query("select hash, created_at from drizzle.__drizzle_migrations order by created_at")).rows;
}
function checkLedger(rows, count) {
  assert.equal(rows.length, count, "Unexpected local migration count; stop for review.");
  rows.forEach((row, index) => {
    assert.equal(row.hash, entries[index].hash, "Historical migration hash differs.");
    assert.equal(Number(row.created_at), entries[index].when, "Historical migration timestamp differs.");
  });
}
async function digests() {
  const result = {};
  for (const table of tables) result[table] = (await client.query('select count(*)::int count, md5(coalesce(string_agg(h,\',\' order by h),\'\')) hash from (select md5(to_jsonb(t)::text) h from "' + table + '" t) rows')).rows[0];
  return result;
}
try {
  const beforeLedger = await ledger();
  if (beforeLedger.length === entries.length) {
    checkLedger(beforeLedger, entries.length);
    console.log("0049 is already applied and all migration hashes match; no changes made.");
  } else {
    checkLedger(beforeLedger, entries.length - 1);
    const directory = await mkdtemp(path.join(os.tmpdir(), "serrian-before-fractional-firearms-"));
    const backupPath = path.join(directory, "serrian_tide_dev.dump");
    const environment = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: "serrian_tide_dev", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
    function run(binary, args) {
      const result = spawnSync(path.join(process.env.POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin", binary), args,
        { env: environment, encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, binary + " failed: " + result.stderr);
      return result.stdout;
    }
    run("pg_dump.exe", ["--format=custom", "--no-password", "--file", backupPath]);
    assert.ok(run("pg_restore.exe", ["--list", backupPath]).includes("TABLE DATA public weapon_firing_modes"));
    run("pg_restore.exe", ["--file", process.platform === "win32" ? "NUL" : "/dev/null", backupPath]);
    const backup = await readFile(backupPath);
    await client.query("begin"); open = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await client.query('lock table drizzle.__drizzle_migrations, ' + tables.map((table) => '"' + table + '"').join(", ") + " in access exclusive mode");
    checkLedger(await ledger(), entries.length - 1);
    const before = await digests();
    const migration = entries.at(-1);
    const statements = migration.sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
    assert.equal(statements.length, 11);
    for (const statement of statements) {
      assert.match(statement, /^ALTER TABLE "[a-z_]+" ALTER COLUMN "[a-z_]+" SET DATA TYPE double precision;$/);
      await client.query(statement);
    }
    const after = await digests();
    assert.deepEqual(after, before, "A row value changed during the type conversion; rollback required.");
    await client.query("insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)", [migration.hash, migration.when]);
    checkLedger(await ledger(), entries.length);
    await client.query("commit"); open = false;
    const report = { verifiedAt: new Date().toISOString(), database: "localhost/serrian_tide_dev", migration: migration.tag, migrationCount: entries.length,
      allMigrationHashesMatch: true, backup: { path: backupPath, bytes: backup.length, sha256: createHash("sha256").update(backup).digest("hex"), fullArchiveDecodeVerified: true, restoreRehearsalRun: false },
      preservedTables: after, rowValuesUnchanged: true, catalogValuesAuthored: false, encounterRecordsEdited: false, productionAccessed: false };
    await writeFile("artifacts/combat-screens/fractional-firearm-dev-migration.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  }
} finally {
  if (open) await client.query("rollback");
  await client.end();
}
