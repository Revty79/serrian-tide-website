/** Newly owned UX-0A targets only. Never loads .env.local, backups or shared services. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";

export const UX0A_DIRECTORY = path.resolve(fileURLToPath(new URL("../artifacts/guidance/geo-ux0a", import.meta.url)));
const bin = process.env.SERRIAN_TEST_PG_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
const tool = (name: string) => path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
type Environment = { root: string; cluster: string; data: string; port: number; appPort: number; stamp: string; empty: string; compat: string; legacy: string; assetRoot: string; users: { owner: string; foreign: string; admin: string; player: string } };
async function freePort() { const server = createServer(); await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); const address = server.address(); assert.ok(address && typeof address === "object"); await new Promise<void>(resolve => server.close(() => resolve())); return address.port; }
export async function ux0aEnvironment(): Promise<Environment> {
  const e: Environment = JSON.parse(await readFile(path.join(UX0A_DIRECTORY, "environment.json"), "utf8"));
  assert.equal(e.root, UX0A_DIRECTORY); assert.ok(e.cluster.startsWith(UX0A_DIRECTORY + path.sep + "cluster-")); assert.equal(e.data, path.join(e.cluster, "data")); assert.notEqual(e.port, 5432);
  for (const [kind, value] of [["empty", e.empty], ["compat", e.compat]] as const) { const u = new URL(value); assert.equal(u.hostname, "127.0.0.1"); assert.equal(u.port, String(e.port)); assert.equal(u.pathname, `/serrian_ux0a_${kind}_${e.stamp}`); }
  assert.equal(e.legacy, path.join(UX0A_DIRECTORY, "legacy-checkout")); assert.equal(e.assetRoot, path.join(UX0A_DIRECTORY, "private-assets")); return e;
}
export async function ownedPool(e: Environment, target: "empty" | "compat") {
  const pool = new pg.Pool({ connectionString: e[target] });
  try { const result = (await pool.query("select current_database() name,inet_server_addr()::text host,inet_server_port() port,current_setting('data_directory') data")).rows[0]; assert.equal(result.name, new URL(e[target]).pathname.slice(1)); assert.equal(result.host, "127.0.0.1/32"); assert.equal(result.port, e.port); assert.equal(path.resolve(result.data), path.resolve(e.data)); return pool; }
  catch (error) { await pool.end(); throw error; }
}
export async function ux0aSnapshot(pool: pg.Pool) {
  const tables = (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(row => String(row.tablename));
  const snapshot: Record<string, string[]> = {};
  for (const table of tables) { assert.match(table, /^[a-z_]+$/); snapshot[table] = (await pool.query(`select md5(to_jsonb(row)::text) hash from "${table}" row order by 1`)).rows.map(row => String(row.hash)); }
  return snapshot;
}
async function accounts(pool: pg.Pool, e: Environment) {
  const password = await hashPassword("UX0A-Disposable-Only-Password!");
  for (const [kind, role] of [["owner", "god"], ["foreign", "god"], ["admin", "admin"], ["player", "player"]] as const) {
    const id = e.users[kind];
    await pool.query('insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$1,$2,true,$1,$1)', [id, `${id}@example.invalid`]);
    await pool.query("insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())", [randomUUID(), id, password]);
    await pool.query("insert into user_role (user_id,role) values ($1,$2)", [id, role]);
  }
}
async function seedLegacy() {
  const e = await ux0aEnvironment(), pool = await ownedPool(e, "compat"); await pool.end();
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: e.legacy, encoding: "utf8", windowsHide: true }).trim(), "b40bccc2cced333832b55239c77bcb21d165bb95");
  process.env.DATABASE_URL = e.compat;
  const load = (file: string) => import(pathToFileURL(path.join(e.legacy, "src/features/worlds", file)).href);
  const worlds = await load("world-service.ts"), atlas = await load("atlas-service.ts"), geometry = await load("atlas.ts"), states = await load("map-state-service.ts");
  const world = await worlds.createWorld(e.users.owner, { name: "UX-0A disposable legacy compatibility" });
  const timeline = (await worlds.getWorld(e.users.owner, world)).selectedTimeline.id;
  const mapId = await atlas.changeAtlas(e.users.owner, world, { action: "create", name: "Retained legacy source", description: "Fresh test identities authored by the prior approved application", scope: "regional" });
  let bundle = await atlas.getAtlas(e.users.owner, world), map = bundle.maps.find((m: { id: string }) => m.id === mapId);
  const draft = geometry.draftOf(map, bundle.geographies);
  const land = randomUUID(), city = randomUUID();
  draft.geographies = [{ id: land, revision: null, name: "Disposable land", description: "", kind: "island", context: "place", parentId: null }, { id: city, revision: null, name: "Disposable city", description: "", kind: "location", context: "settlement", parentId: land }];
  draft.features = [{ id: randomUUID(), geographyId: land, archived: false, geometry: { version: 1, type: "polygon", points: [[200, 200], [1600, 200], [1600, 1000], [200, 1000]].map(([x, y]) => ({ id: randomUUID(), x, y })) } }];
  draft.drawings = [
    { version: 1, id: randomUUID(), name: "Retained mountains", type: "terrain", kind: "mountains", archived: false, geographyId: null, points: [{ id: randomUUID(), x: 500, y: 450 }], radius: 60, spacing: 70, density: 1, seed: 47 },
    { version: 1, id: randomUUID(), name: "Retained city", type: "symbol", kind: "city", archived: false, geographyId: city, point: { x: 1200, y: 750 }, scale: 1, rotation: 0, style: "colored" },
    { version: 1, id: randomUUID(), name: "Retained label", type: "label", text: "Disposable city", archived: false, geographyId: city, point: { x: 1200, y: 820 }, size: 25, rotation: 0, style: "place" },
  ];
  await atlas.changeAtlas(e.users.owner, world, { action: "save", id: mapId, revision: map.revision, draft });
  bundle = await atlas.getAtlas(e.users.owner, world); map = bundle.maps.find((m: { id: string }) => m.id === mapId);
  const state = await states.changeMapState(e.users.owner, world, { action: "create", mapId, timelineId: timeline, sourceVersionId: null, baselineRevision: map.revision, details: { name: "Retained appearance", startYear: 0, endYear: 20, account: "Fresh prior-application fixture", protected: false } });
  await writeFile(path.join(UX0A_DIRECTORY, "legacy-fixture.json"), JSON.stringify({ priorApplication: "b40bccc", world, timeline, map: mapId, city, land, state, bundle }, null, 2));
  const db = await import(pathToFileURL(path.join(e.legacy, "src/db/index.ts")).href); await db.pool.end();
  console.log("PASS prior approved application authored fresh v1 map, drawings, places and immutable historical appearance");
}
async function setup() {
  assert.equal(process.versions.node.split(".")[0], "22"); await mkdir(UX0A_DIRECTORY, { recursive: true });
  assert.ok(!existsSync(path.join(UX0A_DIRECTORY, "environment.json")), "Never replace an owned test environment receipt");
  const stamp = String(Date.now()), cluster = await mkdtemp(path.join(UX0A_DIRECTORY, "cluster-")), port = await freePort(), appPort = await freePort(); assert.notEqual(port, 5432); assert.notEqual(port, appPort);
  const e: Environment = { root: UX0A_DIRECTORY, cluster, data: path.join(cluster, "data"), port, appPort, stamp, empty: `postgresql://postgres@127.0.0.1:${port}/serrian_ux0a_empty_${stamp}`, compat: `postgresql://postgres@127.0.0.1:${port}/serrian_ux0a_compat_${stamp}`, legacy: path.join(UX0A_DIRECTORY, "legacy-checkout"), assetRoot: path.join(UX0A_DIRECTORY, "private-assets"), users: { owner: `ux0a-owner-${stamp}`, foreign: `ux0a-other-${stamp}`, admin: `ux0a-admin-${stamp}`, player: `ux0a-player-${stamp}` } };
  await writeFile(path.join(UX0A_DIRECTORY, `setup-attempt-${stamp}.json`), JSON.stringify(e, null, 2));
  execFileSync(tool("initdb"), ["-D", e.data, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--locale=C"], { windowsHide: true, stdio: "pipe" });
  execFileSync(tool("pg_ctl"), ["-D", e.data, "-l", path.join(cluster, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { windowsHide: true, stdio: "ignore" });
  await writeFile(path.join(UX0A_DIRECTORY, "environment.json"), JSON.stringify(e, null, 2)); await mkdir(e.assetRoot, { recursive: true });
  const admin = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
  try { for (const url of [e.empty, e.compat]) { const database = new URL(url).pathname.slice(1); assert.match(database, /^serrian_ux0a_(empty|compat)_\d+$/); await admin.query(`create database "${database}"`); } } finally { await admin.end(); }
  const oldFolder = path.join(UX0A_DIRECTORY, "legacy-migrations"); await mkdir(path.join(oldFolder, "meta"), { recursive: true });
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")); assert.equal(journal.entries.at(-1).tag, "0132_worlds_atlas_starter_library");
  for (const item of journal.entries.slice(0, -1)) await copyFile(`drizzle/${item.tag}.sql`, path.join(oldFolder, `${item.tag}.sql`));
  await writeFile(path.join(oldFolder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, -1) }));
  for (const target of ["empty", "compat"] as const) { const pool = await ownedPool(e, target); try { await migrate(drizzle(pool), { migrationsFolder: target === "empty" ? "drizzle" : oldFolder }); await accounts(pool, e); assert.equal(Number((await pool.query("select count(*) n from world")).rows[0].n), 0); } finally { await pool.end(); } }
  if (!existsSync(path.join(e.legacy, "node_modules"))) await symlink(path.resolve("node_modules"), path.join(e.legacy, "node_modules"), "junction");
  execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", path.resolve("scripts/worlds-geo-ux0a-harness.ts"), "seed-legacy"], { cwd: e.legacy, windowsHide: true, env: { ...process.env, SERRIAN_UX0A_ROOT: UX0A_DIRECTORY, DATABASE_URL: e.compat }, stdio: "pipe", maxBuffer: 8 * 1024 * 1024 });
  const compat = await ownedPool(e, "compat");
  try {
    const before = await ux0aSnapshot(compat), payload = (await compat.query("select payload from world_map_state_version order by id")).rows;
    await migrate(drizzle(compat), { migrationsFolder: "drizzle" }); assert.deepEqual(await ux0aSnapshot(compat), before); assert.deepEqual((await compat.query("select payload from world_map_state_version order by id")).rows, payload);
    assert.equal(Number((await compat.query("select count(*) n from drizzle.__drizzle_migrations")).rows[0].n), 133);
    const functions = (await compat.query("select proname,pg_get_functiondef(oid) definition from pg_proc where proname in ('world_atlas_presentation_v1_0132_valid','world_atlas_drawing_v1_0132_valid') order by proname")).rows;
    await writeFile(path.join(UX0A_DIRECTORY, "migration-results.json"), JSON.stringify({ freshMigrations: 133, upgradeMigrations: 133, priorApplication: "b40bccc", source: "Fresh disposable identities, no restored backups or deleted Earth", allPriorRowsExact: true, immutablePayloadsExact: true, newTables: 0, migrationSha256: createHash("sha256").update(await readFile("drizzle/0132_worlds_atlas_starter_library.sql")).digest("hex"), functions }, null, 2));
    console.log("PASS fresh 133-migration install and populated upgrade preserve every prior row and historical payload");
  } finally { await compat.end(); }
}
async function build() {
  const e = await ux0aEnvironment(), pool = await ownedPool(e, "empty"); await pool.end();
  const checkout = path.join(UX0A_DIRECTORY, "runtime-checkout"); await mkdir(checkout, { recursive: true });
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8", windowsHide: true }).split("\0").filter(file => file && !file.startsWith("artifacts/"));
  const runtimeFiles = files.filter(file => file.startsWith("src/") && !/\.test\.tsx?$/.test(file) || /^(package(-lock)?\.json|tsconfig\.json|next\.config\.ts)$/.test(file)).sort();
  const fingerprint = async () => { const hash = createHash("sha256"); for (const file of runtimeFiles) { hash.update(file); hash.update(await readFile(file)); } return hash.digest("hex"); };
  const before = await fingerprint();
  for (const file of files) { const target = path.resolve(checkout, file); assert.ok(target.startsWith(checkout + path.sep)); await mkdir(path.dirname(target), { recursive: true }); await copyFile(file, target); }
  const log = openSync(path.join(UX0A_DIRECTORY, "production-build.log"), "w");
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH, NODE_ENV: "production", DATABASE_URL: e.empty, SERRIAN_RASTER_ROOT: e.assetRoot, BETTER_AUTH_URL: `http://127.0.0.1:${e.appPort}`, BETTER_AUTH_SECRET: "UX0A-owned-disposable-auth-secret-only", SERRIAN_TEST_NEXT_DIST_DIR: ".next-geo-ux0a", NEXT_TELEMETRY_DISABLED: "1" };
    if (!existsSync(path.join(checkout, "node_modules/next/dist/bin/next"))) execFileSync(process.execPath, [path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), "ci", "--offline", "--include=dev"], { cwd: checkout, windowsHide: true, env, stdio: ["ignore", log, log] });
    execFileSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { cwd: checkout, windowsHide: true, env, stdio: ["ignore", log, log] });
  } finally { closeSync(log); }
  assert.equal(await fingerprint(), before);
  await writeFile(path.join(UX0A_DIRECTORY, "build-results.json"), JSON.stringify({ passed: true, node: process.version, fingerprint: before, checkout, target: "new owned empty-World acceptance database", migrated: 133 }, null, 2));
  console.log("PASS isolated production build with Node 22 and verified owned empty-World database");
}
const command = process.argv[2];
if (process.argv[1]?.endsWith("worlds-geo-ux0a-harness.ts")) (command === "setup" ? setup() : command === "seed-legacy" ? seedLegacy() : command === "build" ? build() : command === "stop" ? ux0aEnvironment().then(e => { execFileSync(tool("pg_ctl"), ["-D", e.data, "-m", "fast", "-w", "stop"], { windowsHide: true, stdio: "pipe" }); }) : Promise.reject(Error("Expected setup, seed-legacy, build or stop"))).catch(error => { console.error(error); process.exitCode = 1; });
