/** Populated 0132 -> 0133 upgrade and paired database/private-file restoration. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createGrid, readTile } from "../src/features/worlds/terrain";
import { restoreTerrainBackup } from "./terrain-backup-restore";
const output = "artifacts/worlds-terrain-pass1", evidence = "docs/screenshots/worlds-terrain-pass1";
const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
const pgtool = (name: string) => path.join(bin, `${name}.exe`);
async function port() { const s = createServer(); await new Promise<void>(r => s.listen(0, "127.0.0.1", r)); const a = s.address(); assert.ok(a && typeof a === "object"); await new Promise<void>(r => s.close(() => r())); return a.port; }
export async function rowSnapshot(pool: Pick<pg.Pool, "query">, names?: string[]) {
  names ??= (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r => r.tablename as string);
  const result: Record<string, string> = {};
  for (const table of names) { assert.match(table, /^[a-zA-Z0-9_]+$/); const rows = (await pool.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text COLLATE "C"),'[]'::jsonb) rows from "${table}" t`)).rows[0].rows; result[table] = createHash("sha256").update(JSON.stringify(rows)).digest("hex"); }
  return result;
}
async function main() {
  await mkdir(output, { recursive: true }); await mkdir(evidence, { recursive: true });
  const root = await mkdtemp(path.join(tmpdir(), "serrian-terrain-upgrade-")), data = path.join(root, "data"), dbPort = await port(), url = `postgresql://postgres@127.0.0.1:${dbPort}/terrain_upgrade`, old = path.join(root, "old-migrations");
  await mkdir(path.join(old, "meta"), { recursive: true }); const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")); journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 132); await writeFile(path.join(old, "meta/_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries) await cp(`drizzle/${entry.tag}.sql`, path.join(old, `${entry.tag}.sql`));
  let started = false; let appPool: pg.Pool | undefined, pool: pg.Pool | undefined;
  try {
    execFileSync(pgtool("initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--locale=C"], { windowsHide: true, stdio: "pipe" });
    execFileSync(pgtool("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-h 127.0.0.1 -p ${dbPort}`, "-w", "start"], { windowsHide: true, stdio: "ignore" }); started = true;
    const admin = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${dbPort}/postgres` }); await admin.query("create database terrain_upgrade"); await admin.query("create database terrain_restored"); await admin.end();
    pool = new pg.Pool({ connectionString: url }); await migrate(drizzle(pool), { migrationsFolder: old });
    await pool.query('insert into "user"(id,name,email,email_verified) values(\'upgrade-owner\',\'Disposable owner\',\'upgrade@example.invalid\',true)'); await pool.query("insert into user_role(user_id,role) values('upgrade-owner','god')");
    process.env.DATABASE_URL = url; process.env.SERRIAN_TERRAIN_ROOT = path.join(root, "terrain"); appPool = (await import("../src/db")).pool;
    const worlds = await import("../src/features/worlds/world-service"), atlas = await import("../src/features/worlds/atlas-service"), states = await import("../src/features/worlds/map-state-service");
    const world = await worlds.createWorld("upgrade-owner", { name: "Populated compatibility fixture" }), timeline = (await worlds.getWorld("upgrade-owner", world)).selectedTimeline.id;
    const legacy = await atlas.changeAtlas("upgrade-owner", world, { action: "create", name: "Retained vector map", description: "Exact legacy identity and appearance", scope: "world" }) as string;
    await states.changeMapState("upgrade-owner", world, { action: "create", mapId: legacy, timelineId: timeline, sourceVersionId: null, baselineRevision: 1, details: { name: "Before new terrain", startYear: 0, endYear: 10, account: "Retained map state", protected: false } });
    const before = await rowSnapshot(pool); await migrate(drizzle(pool), { migrationsFolder: "drizzle" }); assert.deepEqual(await rowSnapshot(pool, Object.keys(before)), before);
    const terrain = await import("../src/features/worlds/terrain-service"), storage = await import("../src/features/worlds/terrain-storage");
    const mapId = randomUUID(); await terrain.changeTerrain("upgrade-owner", world, { action: "create", requestId: mapId, name: "Custom wrapped terrain", initial: "ocean", settings: { gridWidth: 96, gridHeight: 64, widthKm: 900, heightKm: 300, wrap: true, minElevation: -800, maxElevation: 1000 } });
    const tile = readTile(createGrid(-500), 0); tile.samples[20] = 900;
    const requestId = randomUUID(); await terrain.changeTerrain("upgrade-owner", world, { action: "save", requestId, mapId, revision: 1, seaLevel: 5, tiles: [tile] });
    const accepted = (await terrain.getTerrain("upgrade-owner", world, { mapId })).document!; assert.equal(accepted.settings.wrap, true); assert.equal(accepted.tiles[0].samples[20], 900);
    const failedId = randomUUID(); await pool.query(`create function terrain_test_fail() returns trigger language plpgsql as $$begin if NEW.request_id='${failedId}' then raise exception 'simulated post-staging failure'; end if;return NEW;end;$$;create trigger terrain_test_fail before insert on world_terrain_version for each row execute function terrain_test_fail()`);
    const failed = { ...tile, samples: [...tile.samples] }; failed.samples[20] = 800;
    await assert.rejects(terrain.changeTerrain("upgrade-owner", world, { action: "save", requestId: failedId, mapId, revision: 2, seaLevel: 6, tiles: [failed] })); assert.equal((await terrain.getTerrain("upgrade-owner", world, { mapId })).document?.revision, 2);
    await pool.query("drop trigger terrain_test_fail on world_terrain_version;drop function terrain_test_fail()");
    const audit = await (await import("./terrain-storage-audit")).auditTerrainStorage(); assert.ok(audit.stages.some(s => s.requestId === failedId && s.state === "abandoned-or-in-flight")); assert.ok(audit.unreferencedObjects.length);
    const snapshot = await rowSnapshot(pool), dump = path.join(output, "disposable-terrain-backup.dump"), backupRoot = path.join(root, "terrain-backup"), restoredRoot = path.join(root, "terrain-restored");
    execFileSync(pgtool("pg_dump"), ["-h", "127.0.0.1", "-p", String(dbPort), "-U", "postgres", "-d", "terrain_upgrade", "-Fc", "-f", dump], { windowsHide: true, stdio: "pipe" }); await cp(storage.terrainRoot(), backupRoot, { recursive: true });
    await restoreTerrainBackup({ pgRestore: pgtool("pg_restore"), psql: pgtool("psql"), dump, sql: path.join(root,"restore.sql"), host:"127.0.0.1",port:dbPort,user:"postgres",database:"terrain_restored" }); await cp(backupRoot, restoredRoot, { recursive: true });
    const restored = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${dbPort}/terrain_restored` }); try { assert.deepEqual(await rowSnapshot(restored), snapshot); process.env.SERRIAN_TERRAIN_ROOT = restoredRoot; for (const ref of (await restored.query("select sha256,bytes,encoding from world_terrain_tile")).rows) await storage.readTerrainTile(ref); } finally { await restored.end(); }
    const ref = (await pool.query("select sha256,bytes,encoding from world_terrain_tile limit 1")).rows[0], file = storage.terrainObjectPath(restoredRoot, ref.sha256), bytes = await readFile(file), corrupt = Buffer.from(bytes); corrupt[0] ^= 1; await writeFile(file, corrupt); await assert.rejects(storage.readTerrainTile(ref), /checksum/); await writeFile(file, bytes); await storage.readTerrainTile(ref);
    const result = { passed: true, previousMigrations: 133, newMigrations: 1, existingTablesPreserved: Object.keys(before).length, retainedMapIdentityAndHistory: true, customDimensionsAndWrapping: true, postStagingFailureAtomic: true, abandonedStageIdentified: true, pairedRestoreExact: true, checksumCorruptionRejected: true, backupSha256: createHash("sha256").update(await readFile(dump)).digest("hex"), productionAccess: false };
    await writeFile(`${evidence}/upgrade-results.json`, JSON.stringify(result, null, 2) + "\n"); console.log("PASS", JSON.stringify(result));
  } finally { await appPool?.end(); await pool?.end(); if (started) execFileSync(pgtool("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { windowsHide: true, stdio: "ignore" }); }
}
if (process.argv[1]?.endsWith("worlds-terrain-upgrade.test.ts")) main().catch(error => { console.error(error); process.exitCode = 1; });
