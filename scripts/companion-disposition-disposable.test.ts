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

async function main() {
  const parent = path.resolve(tmpdir());
  const root = path.resolve(await mkdtemp(path.join(parent, "serrian-companion-disposition-")));
  const data = path.join(root, "data");
  const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
  const exe = (name: string) => path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/serrian_creature_ownership_dev`;
  let started = false, pool: pg.Pool | null = null;
  try {
    execFileSync(exe("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(exe("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true }); started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
    await pool.query("create database serrian_creature_ownership_dev");
    await pool.query("create database serrian_creature_ownership_fresh_dev"); await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl.replace("ownership_dev", "ownership_fresh_dev") });
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n, journal.entries.length);
    await pool.end(); pool = new pg.Pool({ connectionString: databaseUrl });
    const legacy = path.join(root, "legacy"); await mkdir(path.join(legacy, "meta"), { recursive: true });
    const entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 88);
    await writeFile(path.join(legacy, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
    for (const entry of entries) await copyFile(path.resolve("drizzle", `${entry.tag}.sql`), path.join(legacy, `${entry.tag}.sql`));
    await migrate(drizzle(pool), { migrationsFolder: legacy });
    await pool.query(`insert into "user"(id,name,email) values('ownership-upgrade','Upgrade','ownership-upgrade@example.invalid')`);
    const campaign = (await pool.query("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Upgrade',100,100,50,10,100,0,'Credits','Assigned','ownership-upgrade') returning id")).rows[0].id;
    await pool.query("insert into campaign_player(campaign_id,user_id,is_npc_controller) values($1,'ownership-upgrade',true)", [campaign]);
    const creature = (await pool.query("insert into creatures(canonical_id,canonical_name,size) values('OWNERSHIP-UPGRADE','Old horse','Large') returning id")).rows[0].id;
    const npc = (await pool.query("insert into campaign_character(campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode) values($1,'ownership-upgrade','Old individual',true,'creature','detailed') returning id", [campaign])).rows[0].id;
    await pool.query("insert into campaign_creature_npc_profile(character_id,creature_id,baseline_snapshot_json,current_snapshot_json,instance_notes) values($1,$2,'{}','{}','Old notes')", [npc, creature]);
    await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,13)", [npc]);
    const tables = (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows as { tablename: string }[];
    const snapshot = async () => Promise.all(tables.map(({ tablename }) => pool!.query(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)));
    const legacyItem = (await pool.query("insert into items(canonical_id,name,catalog_scope,record_type,family,category,credits,price_basis) values('LEGACY-HORSE','Legacy horse','inventory','misc','Animals','Animals',10,'Each') returning id")).rows[0].id;
    await pool.query("insert into item_properties(item_id,property_name,value,related_creature_canonical_id) values($1,'Related Creature','Horse','OWNERSHIP-UPGRADE')", [legacyItem]);
    await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,2,10)", [npc, legacyItem]);
    const owner = (await pool.query("insert into campaign_character(campaign_id,player_user_id,name) values($1,'ownership-upgrade','Legacy owner') returning id", [campaign])).rows[0].id;
    await pool.query("update campaign_character set owner_character_id=$1 where id=$2", [owner, npc]);
    const legacyExact = (await pool.query("insert into items(canonical_id,name,catalog_scope,record_type,family,category,credits,price_basis) values('LEGACY-EXACT','Old charged Item','inventory','misc','Travel','Travel',1,'Each') returning id")).rows[0].id;
    await pool.query("insert into item_runtime_profiles(item_id,use_mode,maximum_charges,charges_per_use) values($1,'charges',5,1)",[legacyExact]);
    await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits) values($1,$2,3,1)",[owner,legacyExact]);
    const before = await snapshot();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const after = await snapshot();
    tables.forEach(({ tablename }, index) => assert.deepEqual(after[index].rows, before[index].rows, `${tablename} preserved`));
    assert.equal((await pool.query("select owner_character_id from campaign_character where id=$1", [npc])).rows[0].owner_character_id, owner);
    assert.equal((await pool.query("select count(*)::int n from item_creature_grant")).rows[0].n, 0);
    assert.equal((await pool.query("select count(*)::int n from shop_resale_creature")).rows[0].n, 0);
    assert.equal((await pool.query("select count(*)::int n from owned_creature_disposition")).rows[0].n, 0);
    assert.equal((await pool.query("select count(*)::int n from creature_vessel_profile")).rows[0].n, 0);
    console.log(`PASS: fresh ${journal.entries.length}-migration chain; 0088 preserves all ${tables.length} existing public tables, snapshots and damage.`);
    await pool.end(); pool = null;
    if (process.argv.includes("--schema-only")) return;
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test", SERRIAN_OWNERSHIP_DISPOSABLE: "true", SERRIAN_COMPANION_DISPOSABLE: "true", SERRIAN_COMPANION_BROWSER: String(process.argv.includes("--browser")), SERRIAN_TIDE_ENABLE_PERMANENT_DELETION: "true" };
    delete env.NODE_TEST_CONTEXT;
    const scripts = process.argv.includes("--regressions")
      ? ["scripts/creature-ownership-db.test.mjs", "scripts/creature-commerce-db.test.mjs", "scripts/lifecycle-service-db.test.ts", "scripts/lifecycle-migration-db.test.ts"]
      : ["scripts/companion-disposition-db.test.mjs"];
    for (const script of scripts) execFileSync(process.execPath, ["--experimental-test-module-mocks", "--conditions=react-server", "--import", "tsx", "--test", script], { cwd: process.cwd(), env, stdio: "inherit", windowsHide: true, timeout: 600_000 });
    if (process.argv.includes("--browser")) execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/companion-disposition-browser.test.ts"], { cwd: process.cwd(), env, stdio: "inherit", windowsHide: true, timeout: 600_000 });
    if (process.argv.includes("--build")) {
      const tsconfig = await readFile("tsconfig.json"), nextEnv = await readFile("next-env.d.ts");
      try {
        execFileSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
          cwd: process.cwd(), stdio: "inherit", windowsHide: true, timeout: 600_000,
          env: { ...env, NODE_ENV: "production", SERRIAN_TEST_NEXT_DIST_DIR: ".next-companion-build", NEXT_TELEMETRY_DISABLED: "1" },
        });
      } finally {
        await writeFile("tsconfig.json", tsconfig); await writeFile("next-env.d.ts", nextEnv);
      }
    }
  } finally {
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(path.dirname(root), parent); assert.ok(path.basename(root).startsWith("serrian-companion-disposition-"));
    await rm(root, { recursive: true, force: true });
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
