import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const defaultBin = "C:\\Program Files\\PostgreSQL\\18\\bin";
const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? (existsSync(defaultBin) ? defaultBin : "");
const executable = (name: string) => bin ? path.join(bin, process.platform === "win32" ? `${name}.exe` : name) : name;
const migrationRoot = path.resolve("drizzle");

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function verifyUpgrade(pool: pg.Pool, temporaryRoot: string) {
  const journal = JSON.parse(await readFile(path.join(migrationRoot, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
  const previous = { ...journal, entries: journal.entries.filter((entry) => entry.idx < 77) };
  const previousFolder = path.join(temporaryRoot, "previous-migrations");
  await mkdir(path.join(previousFolder, "meta"), { recursive: true });
  await writeFile(path.join(previousFolder, "meta/_journal.json"), JSON.stringify(previous));
  for (const entry of previous.entries) await copyFile(path.join(migrationRoot, `${entry.tag}.sql`), path.join(previousFolder, `${entry.tag}.sql`));
  await migrate(drizzle(pool), { migrationsFolder: previousFolder });
  await pool.query(`insert into "user" (id, name, email) values ('upgrade-owner', 'Upgrade Owner', 'upgrade@example.invalid')`);
  await pool.query(`insert into races (name, created_by_user_id, source_system) values ('Existing Race', 'upgrade-owner', 'serrian-tide')`);
  await pool.query(`insert into creatures (canonical_id, canonical_name, size, created_by_user_id, source_system) values ('UPGRADE_CREATURE', 'Existing Creature', 'Medium', 'upgrade-owner', 'serrian-tide')`);
  await pool.query(`insert into items (canonical_id, name, catalog_scope, record_type, family, category, price_basis, created_by_user_id, source_system) values ('UPGRADE_ITEM', 'Existing Item', 'inventory', 'item', 'general', 'general', 'each', 'upgrade-owner', 'serrian-tide')`);
  await pool.query(`insert into skill (name, created_by_user_id, source_system) values ('Existing Skill', 'upgrade-owner', 'serrian-tide')`);
  await pool.query(`insert into derived_ability (name, created_by_user_id, source_system, archived_at, archived_by_user_id, archive_reason) values ('Existing Ability', 'upgrade-owner', 'serrian-tide', now(), 'upgrade-owner', 'Retain this archive')`);
  const tables = ["races", "creatures", "items", "skill", "derived_ability"];
  const existing = new Map<string, Record<string, unknown>>();
  for (const table of tables) existing.set(table, (await pool.query(`select * from ${table} where created_by_user_id = 'upgrade-owner'`)).rows[0]);
  await migrate(drizzle(pool), { migrationsFolder: migrationRoot });
  for (const table of tables) {
    const row = (await pool.query(`select * from ${table} where created_by_user_id = 'upgrade-owner'`)).rows[0];
    assert.deepEqual(row, { ...existing.get(table), is_system_canon: false, canon_marked_by_user_id: null, canon_marked_at: null });
    await pool.query(`delete from ${table} where created_by_user_id = 'upgrade-owner'`);
  }
  assert.equal((await pool.query("select count(*)::int as count from user_catalog_preferences")).rows[0].count, 0);
  assert.equal((await pool.query("select count(*)::int as count from catalog_visibility_scope_activation")).rows[0].count, 0);
  await pool.query(`delete from "user" where id = 'upgrade-owner'`);
  console.log("Migration upgrade passed: existing rows, provenance, archive state, and timestamps preserved; no preferences backfilled.");
}

async function main() {
  const tempParent = path.resolve(tmpdir());
  const temporaryRoot = path.resolve(await mkdtemp(path.join(tempParent, "serrian-catalog-postgres-")));
  const data = path.join(temporaryRoot, "data");
  const port = await freePort();
  const connectionString = `postgresql://postgres@127.0.0.1:${port}/serrian_catalog_visibility_dev`;
  let pool: pg.Pool | undefined;
  let started = false;
  try {
    execFileSync(executable("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(executable("pg_ctl"), ["-D", data, "-l", path.join(temporaryRoot, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
    await pool.query("create database serrian_catalog_visibility_dev");
    await pool.query("create database serrian_catalog_fresh_dev");
    await pool.end();
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/serrian_catalog_fresh_dev` });
    await migrate(drizzle(pool), { migrationsFolder: migrationRoot });
    assert.equal((await pool.query("select count(*)::int n from catalog_visibility_scope_activation")).rows[0].n, 0);
    console.log("Fresh database migration chain passed.");
    // Replay only 0079 against an existing approved receipt to exercise upgrades.
    const hash = "26e5281a043b824a13295acf76b6f819bd3abf28e00602a6eac097279b47472c";
    await pool.query("insert into catalog_visibility_activation(manifest_hash) values($1)", [hash]);
    const receipt = (await pool.query("select * from catalog_visibility_activation")).rows;
    await pool.query("drop table catalog_visibility_scope_activation");
    await pool.query(await readFile(path.join(migrationRoot, "0079_catalog_scope_activation.sql"), "utf8"));
    const activations = (await pool.query("select catalog_key,activation_method,activated_by_user_id,manifest_hash from catalog_visibility_scope_activation order by catalog_key")).rows;
    assert.deepEqual(activations, ["creature", "derivedAbility", "race", "skill"].map((catalog_key) => ({ catalog_key, activation_method: "classified-manifest", activated_by_user_id: null, manifest_hash: hash })));
    assert.deepEqual((await pool.query("select * from catalog_visibility_activation")).rows, receipt);
    console.log("Pass 3 receipt upgrade passed: four scopes activated; Items inactive; original evidence preserved.");
    await pool.end();
    pool = new pg.Pool({ connectionString });
    await verifyUpgrade(pool, temporaryRoot);
    await pool.end();
    pool = undefined;
    for (const script of ["scripts/catalog-visibility-db.test.ts", "scripts/admin-account-lifecycle-db.test.ts", "scripts/catalog-pass-three-db.test.ts", "scripts/catalog-pass-four-db.test.mjs", "scripts/admin-catalog-db.test.mjs", "scripts/catalog-privacy-db.test.mjs", "scripts/derived-ability-runtime-db.test.ts"]) {
      execFileSync(process.execPath, ["--experimental-test-module-mocks", "--conditions=react-server", "--import", "tsx", "--test", script], {
        cwd: process.cwd(), windowsHide: true, stdio: "inherit",
        env: { ...process.env, DATABASE_URL: connectionString, NODE_ENV: "test", SERRIAN_CATALOG_DISPOSABLE: "true", SERRIAN_TIDE_ENABLE_PERMANENT_DELETION: "true" },
      });
    }
  } finally {
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(executable("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    // Only remove the uniquely created child of the resolved temp directory.
    assert.equal(path.dirname(temporaryRoot), tempParent);
    assert.ok(path.basename(temporaryRoot).startsWith("serrian-catalog-postgres-"));
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
