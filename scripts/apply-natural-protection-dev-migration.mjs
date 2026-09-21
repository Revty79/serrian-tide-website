import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
assert.ok(process.argv.includes("--apply"), "Supply --apply for the verified local DEV migration.");
const url = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/serrian_tide_dev", "Only loopback serrian_tide_dev is supported.");
const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
assert.equal(journal.entries.at(-1).tag, "0063_race_natural_protection");
const entries = await Promise.all(journal.entries.map(async (entry) => {
  const sql = await readFile(path.join("drizzle", entry.tag + ".sql"), "utf8");
  return { ...entry, sql, hash: createHash("sha256").update(sql).digest("hex") };
}));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let open = false;
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
async function ledger() { return (await client.query("select hash, created_at from drizzle.__drizzle_migrations order by created_at")).rows; }
function checkLedger(rows, count) {
  assert.equal(rows.length, count, "Unexpected migration count; stop for review.");
  rows.forEach((row, index) => { assert.equal(row.hash, entries[index].hash); assert.equal(Number(row.created_at), entries[index].when); });
}
async function digests(tables) {
  const result = {};
  for (const table of tables) result[table] = (await client.query(`select count(*)::int count, md5(coalesce(string_agg(h,',' order by h),'')) hash from (select md5(to_jsonb(t)::text) h from public.${quote(table)} t) rows`)).rows[0];
  return result;
}
try {
  const beforeLedger = await ledger();
  if (beforeLedger.length === entries.length) {
    checkLedger(beforeLedger, entries.length);
    console.log("0063 already applied; all migration hashes match. No changes made.");
  } else {
    checkLedger(beforeLedger, entries.length - 1);
    const tables = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(({ tablename }) => tablename);
    assert.ok(!tables.includes("race_natural_protections") && !tables.includes("race_natural_protection_locations"));
    const directory = await mkdtemp(path.join(os.tmpdir(), "serrian-before-natural-protection-"));
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
    assert.ok(run("pg_restore.exe", ["--list", backupPath]).includes("TABLE DATA public races"));
    run("pg_restore.exe", ["--file", process.platform === "win32" ? "NUL" : "/dev/null", backupPath]);
    const backup = await readFile(backupPath);
    await client.query("begin"); open = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await client.query('lock table drizzle.__drizzle_migrations, ' + tables.map((table) => "public." + quote(table)).join(", ") + " in share row exclusive mode");
    checkLedger(await ledger(), entries.length - 1);
    const before = await digests(tables);
    const migration = entries.at(-1);
    const statements = migration.sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
    assert.equal(statements.length, 5);
    for (const statement of statements) {
      assert.match(statement, /^(CREATE TABLE "race_natural_protection(?:s|_locations)"|ALTER TABLE "race_natural_protection(?:s|_locations)" ADD CONSTRAINT|CREATE UNIQUE INDEX "race_natural_protection_key_uq")/);
      await client.query(statement);
    }
    const after = await digests(tables);
    assert.deepEqual(after, before, "Existing data changed; rollback required.");
    for (const table of ["race_natural_protections", "race_natural_protection_locations"]) assert.equal((await client.query(`select count(*)::int count from ${quote(table)}`)).rows[0].count, 0);
    await client.query("insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)", [migration.hash, migration.when]);
    checkLedger(await ledger(), entries.length);
    await client.query("commit"); open = false;
    const report = { verifiedAt: new Date().toISOString(), database: "localhost/serrian_tide_dev", migration: migration.tag, migrationCount: entries.length,
      allMigrationHashesMatch: true, backup: { path: backupPath, bytes: backup.length, sha256: createHash("sha256").update(backup).digest("hex"), fullArchiveDecodeVerified: true, restoreRehearsalRun: false },
      preservedTables: after, rowValuesUnchanged: true, newTablesEmpty: true, productionAccessed: false };
    await writeFile("artifacts/creature-authoring/pass3-dev-migration.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ ...report, preservedTables: `${tables.length} tables: all row counts and digests unchanged` }, null, 2));
  }
} finally {
  if (open) await client.query("rollback");
  await client.end();
}
