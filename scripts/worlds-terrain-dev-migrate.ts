/** Guarded, owner-authorized LOCAL DEV migration. No Production fallback. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import dotenv from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { rowSnapshot } from "./worlds-terrain-upgrade.test";
import { restoreTerrainBackup } from "./terrain-backup-restore";
const out = "artifacts/worlds-terrain-pass1/dev-backup";
const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
const pgtool = (name: string) => path.join(bin, `${name}.exe`);
async function freePort() { const s = createServer(); await new Promise<void>(r => s.listen(0, "127.0.0.1", r)); const a = s.address(); assert.ok(a && typeof a === "object"); await new Promise<void>(r => s.close(() => r())); return a.port; }
async function main() {
  assert.ok(process.argv.includes("--apply-dev"), "Use --apply-dev only after disposable acceptance passes.");
  const env = dotenv.parse(await readFile(".env.local")), url = new URL(env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.port || "5432", "5432"); assert.equal(url.pathname, "/serrian_tide_dev");
  const dev = new pg.Pool({ connectionString: env.DATABASE_URL }), local = await dev.connect(); let started = false; let isolated: pg.Pool | undefined;
  const root = await mkdtemp(path.join(tmpdir(), "serrian-terrain-dev-rehearsal-")), data = path.join(root, "data"), port = await freePort(); await mkdir(out, { recursive: true });
  try {
    const target = (await local.query("select current_database() database,current_user actor,inet_server_addr()::text host,inet_server_port() port")).rows[0]; assert.equal(target.database, "serrian_tide_dev"); assert.equal(target.port, 5432);
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" }), ledger = (await local.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at,id")).rows;
    assert.equal(migrations.length, 134); assert.equal(ledger.length, 133);
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")), lineEndingOnlyMatches: number[] = [];
    for (let i=0;i<ledger.length;i++) {
      if(ledger[i].hash===migrations[i].hash)continue;
      const original = await readFile(`drizzle/${journal.entries[i].tag}.sql`,"utf8"), lf = createHash("sha256").update(original.replace(/\r\n/g,"\n")).digest("hex");
      assert.equal(ledger[i].hash,lf,`Migration ${i} differs beyond Windows line endings; stop before DEV writes`);lineEndingOnlyMatches.push(i);
    }
    await local.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); const snapshot = (await local.query("select pg_export_snapshot() id")).rows[0].id;
    const before = await rowSnapshot(local), dump = path.resolve(out, "before-0133.dump"), backupEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: url.pathname.slice(1), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
    try { execFileSync(pgtool("pg_dump"), ["--snapshot", snapshot, "-Fc", "-f", dump], { env: backupEnv, windowsHide: true, stdio: "pipe" }); } finally { await local.query("ROLLBACK"); }
    const terrainRoot = path.resolve(env.SERRIAN_TERRAIN_ROOT || "storage/world-terrain");
    const terrainPresent = await stat(terrainRoot).then(s => s.isDirectory()).catch(e => { if (e.code === "ENOENT") return false; throw e; });
    if (terrainPresent) await cp(terrainRoot, path.join(out, "terrain"), { recursive: true, errorOnExist: true, force: false });
    execFileSync(pgtool("initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--locale=C"], { windowsHide: true, stdio: "pipe" }); execFileSync(pgtool("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { windowsHide: true, stdio: "ignore" }); started = true;
    const admin = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` }); await admin.query("create database terrain_dev_rehearsal"); await admin.end();
    await restoreTerrainBackup({ pgRestore: pgtool("pg_restore"), psql: pgtool("psql"), dump, sql: path.join(root, "restore.sql"), host: "127.0.0.1", port, user: "postgres", database: "terrain_dev_rehearsal", env: { ...process.env, PGPASSWORD: "" } });
    isolated = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/terrain_dev_rehearsal` }); assert.deepEqual(await rowSnapshot(isolated), before); await migrate(drizzle(isolated), { migrationsFolder: "drizzle" }); assert.deepEqual(await rowSnapshot(isolated, Object.keys(before)), before);
    // Recheck live rows immediately before applying the one validated migration.
    assert.deepEqual(await rowSnapshot(dev), before, "DEV changed during rehearsal; preserve the backup and repeat review before applying");
    const backupSha256 = createHash("sha256").update(await readFile(dump)).digest("hex");
    await writeFile(path.join(out, "verified-before-apply.json"), JSON.stringify({ target, backupSha256, terrainPresent, exactRestore: true, upgradePreservesAllExistingRows: true, checkedTables: Object.keys(before).length }, null, 2) + "\n");
    await migrate(drizzle(dev), { migrationsFolder: "drizzle" }); assert.deepEqual(await rowSnapshot(dev, Object.keys(before)), before);
    const result = { applied: "0133_worlds_editable_terrain", database: target.database, migrationCount: 134, backupSha256, backup: "artifacts/worlds-terrain-pass1/dev-backup/before-0133.dump", exactRestoreVerified: true, existingRowsUnchanged: true, existingTables: Object.keys(before).length, existingTerrainFiles: terrainPresent, priorLedgerLineEndingOnlyMatches:lineEndingOnlyMatches,priorLedgerUnchanged:true, productionAccess: false };
    await writeFile("docs/screenshots/worlds-terrain-pass1/dev-migration-results.json", JSON.stringify(result, null, 2) + "\n"); console.log("PASS", JSON.stringify(result));
  } finally { local.release(); await dev.end(); await isolated?.end(); if (started) execFileSync(pgtool("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { windowsHide: true, stdio: "ignore" }); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "DEV migration failed"); process.exitCode = 1; });
