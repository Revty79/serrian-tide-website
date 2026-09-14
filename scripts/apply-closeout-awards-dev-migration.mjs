import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const url = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/serrian_tide_dev", "Only loopback serrian_tide_dev is supported.");
const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
assert.equal(journal.entries.at(-1).tag, "0051_manual_closeout_awards");
const entries = [];
for (const entry of journal.entries) {
  const sql = await readFile(path.join("drizzle", `${entry.tag}.sql`), "utf8");
  entries.push({ ...entry, sql, hash: createHash("sha256").update(sql).digest("hex") });
}
const migration = entries.at(-1);
const statements = migration.sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
assert.equal(statements.length, 11);
for (const statement of statements) assert.match(statement, /^(?:CREATE TABLE "tabletop_closeout_award(?:_decision)?"|ALTER TABLE "tabletop_closeout_award(?:_decision)?" ADD CONSTRAINT|CREATE (?:UNIQUE )?INDEX "closeout_award_)/);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let transactionOpen = false;
async function checkLedger(count) {
  const rows = (await client.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at")).rows;
  assert.equal(rows.length, count);
  rows.forEach((row, index) => { assert.equal(row.hash, entries[index].hash); assert.equal(Number(row.created_at), entries[index].when); });
}
try {
  const count = Number((await client.query("select count(*) count from drizzle.__drizzle_migrations")).rows[0].count);
  assert.ok(count === entries.length || count === entries.length - 1, "Only migration 0051 may be pending.");
  await checkLedger(count);
  if (count === entries.length) console.log("0051 already applied; all 52 migration hashes and timestamps match. No changes made.");
  else if (!apply) console.log("Verified plan: all 51 historical migrations match; 0051 adds two empty closeout award tables with restrictive FKs and once-only indexes. No existing data edits.");
  else {
    const folder = await mkdtemp(path.join(os.tmpdir(), "serrian-before-closeout-awards-"));
    const backupPath = path.join(folder, "serrian_tide_dev.dump");
    const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: "serrian_tide_dev", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
    function run(binary, args) {
      const result = spawnSync(path.join(process.env.POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin", binary), args, { env, windowsHide: true, encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, `${binary} failed: ${result.stderr}`);
      return result.stdout;
    }
    run("pg_dump.exe", ["--format=custom", "--no-password", "--file", backupPath]);
    assert.ok(run("pg_restore.exe", ["--list", backupPath]).includes("TABLE DATA public campaign_character"));
    run("pg_restore.exe", ["--file", process.platform === "win32" ? "NUL" : "/dev/null", backupPath]);
    await client.query("begin"); transactionOpen = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await client.query("lock table drizzle.__drizzle_migrations in access exclusive mode");
    await checkLedger(entries.length - 1);
    for (const statement of statements) await client.query(statement);
    await client.query("insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)", [migration.hash, migration.when]);
    await checkLedger(entries.length);
    assert.equal(Number((await client.query("select count(*) count from tabletop_closeout_award")).rows[0].count), 0);
    assert.equal(Number((await client.query("select count(*) count from tabletop_closeout_award_decision")).rows[0].count), 0);
    await client.query("commit"); transactionOpen = false;
    const backup = await readFile(backupPath);
    const receipt = { appliedAt: new Date().toISOString(), database: "loopback/serrian_tide_dev", migration: migration.tag, migrationCount: entries.length,
      allMigrationHashesMatch: true, backup: { path: backupPath, bytes: backup.length, sha256: createHash("sha256").update(backup).digest("hex"), fullArchiveDecodeVerified: true, restoreRehearsalRun: false },
      newAwardTablesEmpty: true, existingCharacterAndCatalogRowsEdited: false, productionAccessed: false };
    await mkdir("artifacts/player-tabletop-tabs", { recursive: true });
    await writeFile("artifacts/player-tabletop-tabs/closeout-awards-dev-migration.json", JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt, null, 2));
  }
} finally {
  if (transactionOpen) await client.query("rollback");
  await client.end();
}
