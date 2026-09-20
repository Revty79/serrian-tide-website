import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, mkdir, copyFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
test("Creature authoring preserves pre-migration records and round-trips through browser and NPC snapshots", { timeout: 1_500_000 }, async () => {
  const parent = path.resolve(tmpdir()), root = path.resolve(await mkdtemp(path.join(parent, "serrian-creature-authoring-")));
  assert.equal(path.dirname(root), parent); assert.ok(path.basename(root).startsWith("serrian-creature-authoring-"));
  const data = path.join(root, "data"), bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
  const exe = (name: string) => path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const listener = createServer(); await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object"); const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/serrian_creature_authoring_dev`;
  let started = false, pool: pg.Pool | null = null;
  try {
    execFileSync(exe("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(exe("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true }); started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` }); await pool.query("create database serrian_creature_authoring_dev"); await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl });
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    const legacyFolder = path.join(root, "legacy-migrations"); await mkdir(path.join(legacyFolder, "meta"), { recursive: true });
    const previousEntries = journal.entries.filter((entry: { idx: number }) => entry.idx < 61);
    await writeFile(path.join(legacyFolder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: previousEntries }));
    for (const entry of previousEntries) await copyFile(path.resolve("drizzle", `${entry.tag}.sql`), path.join(legacyFolder, `${entry.tag}.sql`));
    await migrate(drizzle(pool), { migrationsFolder: legacyFolder });
    const creatureId = (await pool.query("insert into creatures (canonical_id,canonical_name,size) values ('CREATURE-MIGRATION','Migration Legacy Creature','Medium') returning id")).rows[0].id;
    await pool.query("insert into creature_attacks (creature_id,canonical_id,attack_name,attack_percentage,damage,range_reach,special_effect) values ($1,'ATK-MIGRATION','Legacy Bite',63,'1d6','Within reach','Legacy venom')", [creatureId]);
    await pool.query("insert into creature_abilities (creature_id,canonical_id,ability_name,ability_type,activation,mechanical_effect) values ($1,'ABL-MIGRATION','Legacy Trait','Unknown old type','When relevant','Manual old text')", [creatureId]);
    await pool.query("insert into creature_defenses (creature_id,defense_type,against,notes) values ($1,'Legacy defense','fire','Keep unchanged')", [creatureId]);
    await pool.query("insert into creature_uses (creature_id,use_name,notes) values ($1,'Hide','Harvest text')", [creatureId]);
    await pool.query("insert into races (name,legacy_description) values ('Migration Legacy Race','Keep Race lore')");
    const tables = ["races", "creatures", "creature_attacks", "creature_abilities", "creature_defenses", "creature_uses"];
    const before = await Promise.all(tables.map((table) => pool!.query(`select to_jsonb(t) - 'authoring_json' - 'interaction_rules_json' body from ${table} t order by id`)));
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    for (const [index, table] of tables.entries()) assert.deepEqual((await pool.query(`select to_jsonb(t) - 'authoring_json' - 'interaction_rules_json' body from ${table} t order by id`)).rows, before[index].rows, `${table} legacy data must survive unchanged`);
    assert.equal((await pool.query("select authoring_json from creature_attacks where creature_id=$1", [creatureId])).rows[0].authoring_json, null);
    for (const value of ['[]', '{}', '{"schemaVersion":2}']) await assert.rejects(pool.query("update creature_attacks set authoring_json=$1 where creature_id=$2", [value, creatureId]), /authoring_shape/);
    for (const table of ["creatures", "races"]) {
      assert.equal((await pool.query(`select count(*)::int count from ${table} where interaction_rules_json is not null`)).rows[0].count, 0);
      for (const value of ['[]', '{}', '{"schemaVersion":2,"rules":[]}', '{"schemaVersion":1}', '{"schemaVersion":1,"rules":{}}']) await assert.rejects(pool.query(`update ${table} set interaction_rules_json=$1`, [value]), /interaction_rules_shape/);
    }
    console.log("PASS: additive migration retains all legacy columns and rejects malformed authoring envelopes");
    assert.equal((await pool.query("select count(*)::int count from drizzle.__drizzle_migrations")).rows[0].count, JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries.length);
    await pool.end(); pool = null;
    const environment = { ...process.env }; delete environment.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/creature-authoring-browser.test.ts"], { cwd: process.cwd(), windowsHide: true, stdio: "inherit", timeout: 1_400_000,
      env: { ...environment, DATABASE_URL: databaseUrl, NODE_ENV: "test", SERRIAN_DISPOSABLE_CREATURE_AUTHORING: "true" } });
  } finally {
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(existsSync(path.join(data, "postmaster.pid")), false); await rm(root, { recursive: true, force: true });
  }
});
