/** Guarded, owner-authorized LOCAL DEV migration. No Production fallback. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, cp, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
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
const out = path.join(path.dirname(path.resolve(process.env.SERRIAN_DEV_ENV_FILE??".env.local")),"artifacts/worlds-atlas-pass3/dev-backups", new Date().toISOString().replace(/[:.]/g,"-"));
const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
const pgtool = (name: string) => path.join(bin, `${name}.exe`);
async function freePort() { const s = createServer(); await new Promise<void>(r => s.listen(0, "127.0.0.1", r)); const a = s.address(); assert.ok(a && typeof a === "object"); await new Promise<void>(r => s.close(() => r())); return a.port; }
async function fileManifest(root:string){const entries:Record<string,string>={};async function walk(relative:string){for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){assert.equal(entry.isSymbolicLink(),false,"Do not follow unexpected private-storage symlinks");const child=path.join(relative,entry.name);if(entry.isDirectory())await walk(child);else if(entry.isFile())entries[child.replace(/\\/g,"/")]=createHash("sha256").update(await readFile(path.join(root,child))).digest("hex");}}await walk("");return Object.fromEntries(Object.entries(entries).sort(([a],[b])=>a.localeCompare(b)));}
async function preserved0135Rows(pool:pg.Pool,names:string[]){
 const result=await rowSnapshot(pool,names);
 const added:Record<string,string[]>={world_terrain_version:["source"],world_terrain_tile:["manual_protection"]};
 for(const [table,columns] of Object.entries(added)){if(!names.includes(table))continue;const rows=(await pool.query(`select coalesce(jsonb_agg(value order by value::text COLLATE "C"),'[]'::jsonb) rows from (select to_jsonb(t) - $1::text[] value from "${table}" t) old_columns`,[columns])).rows[0].rows;result[table]=createHash("sha256").update(JSON.stringify(rows)).digest("hex");}
 return result;
}
async function main() {
  assert.ok(process.argv.includes("--apply-dev"), "Use --apply-dev only after disposable acceptance passes.");
  const acceptance=JSON.parse(await readFile("docs/screenshots/worlds-atlas-pass3/results.json","utf8"));assert.equal(acceptance.passed,true,"Disposable browser/regression acceptance must pass first");assert.equal(acceptance.migration0136Sha256,createHash("sha256").update(await readFile("drizzle/0136_world_terrain_sources.sql")).digest("hex"),"Rehearsal must cover the exact pending migration");
  const env = dotenv.parse(await readFile(process.env.SERRIAN_DEV_ENV_FILE??".env.local")), url = new URL(env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.port || "5432", "5432"); assert.equal(url.pathname, "/serrian_tide_dev");
  const dev = new pg.Pool({ connectionString: env.DATABASE_URL }), local = await dev.connect(); let started = false; let isolated: pg.Pool | undefined;
  const root = await mkdtemp(path.join(tmpdir(), "serrian-terrain-dev-rehearsal-")), data = path.join(root, "data"), port = await freePort(); await mkdir(out, { recursive: true });
  try {
    const target = (await local.query("select current_database() database,current_user actor,inet_server_addr()::text host,inet_server_port() port")).rows[0]; assert.equal(target.database, "serrian_tide_dev"); assert.equal(target.port, 5432);
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" }), ledger = (await local.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at,id")).rows;
    assert.equal(migrations.length, 137); assert.equal(ledger.length, 136);
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")), lineEndingOnlyMatches: number[] = [];
    for (let i=0;i<ledger.length;i++) {
      if(ledger[i].hash===migrations[i].hash)continue;
      const original = await readFile(`drizzle/${journal.entries[i].tag}.sql`,"utf8"), lf = createHash("sha256").update(original.replace(/\r\n/g,"\n")).digest("hex");
      assert.equal(ledger[i].hash,lf,`Migration ${i} differs beyond Windows line endings; stop before DEV writes`);lineEndingOnlyMatches.push(i);
    }
    await local.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); const snapshot = (await local.query("select pg_export_snapshot() id")).rows[0].id;
    const inventory:Record<string,number>={};for(const table of ["town","shop","town_shop_membership","town_place","town_npc_association","shop_offering","shop_staff_assignment","shop_transaction","shop_money_event","world_settlement_profile","world_shop","world_town_place","world_town_resident","world_place_person"]){inventory[table]=(await local.query(`select count(*)::int n from "${table}"`)).rows[0].n;}
    await writeFile(path.join(out,"read-only-inventory.json"),JSON.stringify(inventory,null,2));
    const before = await rowSnapshot(local), dump = path.resolve(out, "before-0136.dump"), backupEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: url.pathname.slice(1), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
    try { execFileSync(pgtool("pg_dump"), ["--snapshot", snapshot, "-Fc", "-f", dump], { env: backupEnv, windowsHide: true, stdio: "pipe" }); } finally { await local.query("ROLLBACK"); }
    const terrainRoot = path.resolve(path.dirname(path.resolve(process.env.SERRIAN_DEV_ENV_FILE??".env.local")),env.SERRIAN_TERRAIN_ROOT || "storage/world-terrain");
    const terrainPresent = await stat(terrainRoot).then(s => s.isDirectory()).catch(e => { if (e.code === "ENOENT") return false; throw e; });
    let terrainManifestSha256:string|null=null,verifiedTerrainFiles=0;
    if (terrainPresent) { const sourceFiles=await fileManifest(terrainRoot);await cp(terrainRoot,path.join(out,"terrain"),{recursive:true,errorOnExist:true,force:false});assert.deepEqual(await fileManifest(path.join(out,"terrain")),sourceFiles,"Private terrain backup must match every source file");assert.deepEqual(await fileManifest(terrainRoot),sourceFiles,"Terrain changed during backup; repeat from a fresh snapshot");terrainManifestSha256=createHash("sha256").update(JSON.stringify(sourceFiles)).digest("hex");verifiedTerrainFiles=Object.keys(sourceFiles).length; }
    execFileSync(pgtool("initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--locale=C"], { windowsHide: true, stdio: "pipe" }); execFileSync(pgtool("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { windowsHide: true, stdio: "ignore" }); started = true;
    const admin = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` }); await admin.query("create database terrain_dev_rehearsal"); await admin.end();
    await restoreTerrainBackup({ pgRestore: pgtool("pg_restore"), psql: pgtool("psql"), dump, sql: path.join(root, "restore.sql"), host: "127.0.0.1", port, user: "postgres", database: "terrain_dev_rehearsal", env: { ...process.env, PGPASSWORD: "" } });
    isolated = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/terrain_dev_rehearsal` }); assert.deepEqual(await rowSnapshot(isolated), before); await migrate(drizzle(isolated), { migrationsFolder: "drizzle" }); assert.deepEqual(await preserved0135Rows(isolated, Object.keys(before)), before);
    // Recheck live rows immediately before applying the one validated migration.
    assert.deepEqual(await rowSnapshot(dev), before, "DEV changed during rehearsal; preserve the backup and repeat review before applying");
    const backupSha256 = createHash("sha256").update(await readFile(dump)).digest("hex");
    await writeFile(path.join(out, "verified-before-apply.json"), JSON.stringify({ target, backupSha256, terrainPresent, exactRestore: true,terrainManifestSha256,verifiedTerrainFiles, upgradePreservesAllExistingRows: true, checkedTables: Object.keys(before).length }, null, 2) + "\n");
    await migrate(drizzle(dev), { migrationsFolder: "drizzle" }); assert.deepEqual(await preserved0135Rows(dev, Object.keys(before)), before);
    const finalLedger=(await local.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at,id")).rows;assert.equal(finalLedger.length,137);assert.deepEqual(finalLedger.slice(0,ledger.length),ledger);assert.equal(finalLedger.at(-1).hash,migrations.at(-1)!.hash);
    const result = { applied: "0136_world_terrain_sources", database: target.database, migrationCount: 137, backupSha256, backup: path.join(out,"before-0136.dump"), exactRestoreVerified: true, existingRowsUnchanged: true, existingTables: Object.keys(before).length, existingTerrainFiles: terrainPresent, priorLedgerLineEndingOnlyMatches:lineEndingOnlyMatches,priorLedgerUnchanged:true,inventory,newFieldsOnly:true,noLegacyImport:true,terrainManifestSha256,verifiedTerrainFiles,productionAccess: false };
    await writeFile("docs/screenshots/worlds-atlas-pass3/dev-0136-migration-results.json", JSON.stringify(result, null, 2) + "\n"); console.log("PASS", JSON.stringify(result));
  } finally { local.release(); await dev.end(); await isolated?.end(); if (started) execFileSync(pgtool("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { windowsHide: true, stdio: "ignore" }); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "DEV migration failed"); process.exitCode = 1; });
