import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const url = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/serrian_tide_dev", "Only loopback serrian_tide_dev is supported.");
const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
assert.equal(journal.entries.at(-1).tag, "0050_tabletop_source_use_requests");
const entries = [];
for (const entry of journal.entries) {
  const sql = await readFile(path.join("drizzle", `${entry.tag}.sql`), "utf8");
  entries.push({ ...entry, sql, hash: createHash("sha256").update(sql).digest("hex") });
}
const migration = entries.at(-1);
const statements = migration.sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
assert.equal(statements.length, 15);
for (const statement of statements) assert.match(statement, /^(?:CREATE TYPE "public"\."tabletop_source_use_status"|CREATE TABLE "tabletop_source_use_(?:event|request)"|ALTER TABLE "tabletop_source_use_(?:event|request)" ADD CONSTRAINT|CREATE (?:UNIQUE )?INDEX "tabletop_source_use_)/);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let open = false;
async function checkLedger(expected) {
  const rows = (await client.query("select hash, created_at from drizzle.__drizzle_migrations order by created_at")).rows;
  assert.equal(rows.length, expected, "Unexpected migration count; stop for review.");
  rows.forEach((row, index) => { assert.equal(row.hash, entries[index].hash); assert.equal(Number(row.created_at), entries[index].when); });
}
try {
  const count = Number((await client.query("select count(*) count from drizzle.__drizzle_migrations")).rows[0].count);
  await checkLedger(count);
  assert.ok(count === entries.length || count === entries.length - 1, "Only migration 0050 may be pending.");
  if (count === entries.length) console.log("0050 already applied; all migration hashes match. No changes made.");
  else if (!apply) console.log("Plan verified: all 50 historical migrations match; 0050 adds two empty request/history tables and one status type. Supply --apply to back up and apply to local DEV.");
  else {
    const folder = await mkdtemp(path.join(os.tmpdir(), "serrian-before-tabletop-source-use-"));
    const backupPath = path.join(folder, "serrian_tide_dev.dump");
    const environment = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: "serrian_tide_dev", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
    function run(binary, args) {
      const result = spawnSync(path.join(process.env.POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin", binary), args, { env: environment, encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, `${binary} failed: ${result.stderr}`);
      return result.stdout;
    }
    run("pg_dump.exe", ["--format=custom", "--no-password", "--file", backupPath]);
    assert.ok(run("pg_restore.exe", ["--list", backupPath]).includes("TABLE DATA public campaign_character"));
    run("pg_restore.exe", ["--file", process.platform === "win32" ? "NUL" : "/dev/null", backupPath]);
    await client.query("begin"); open = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await client.query("lock table drizzle.__drizzle_migrations in access exclusive mode");
    await checkLedger(entries.length - 1);
    for (const statement of statements) await client.query(statement);
    await client.query("insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)", [migration.hash, migration.when]);
    await checkLedger(entries.length);
    assert.equal(Number((await client.query("select count(*) count from tabletop_source_use_request")).rows[0].count), 0);
    assert.equal(Number((await client.query("select count(*) count from tabletop_source_use_event")).rows[0].count), 0);
    await client.query("commit"); open = false;
    const backup = await readFile(backupPath);
    const report = { verifiedAt: new Date().toISOString(), database: "localhost/serrian_tide_dev", migration: migration.tag, migrationCount: entries.length,
      allMigrationHashesMatch: true, backup: { path: backupPath, bytes: backup.length, sha256: createHash("sha256").update(backup).digest("hex"), fullArchiveDecodeVerified: true, restoreRehearsalRun: false },
      additionsOnly: true, existingCharacterAndCatalogRowsEdited: false, productionAccessed: false };
    await mkdir("artifacts/player-tabletop-tabs", { recursive: true });
    await writeFile("artifacts/player-tabletop-tabs/source-use-dev-migration.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  }
} finally {
  if (open) await client.query("rollback");
  await client.end();
}
