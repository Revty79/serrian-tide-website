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
    const before = await Promise.all(tables.map((table) => pool!.query(`select to_jsonb(t) - 'authoring_json' - 'interaction_rules_json' - 'parent_race_id' - 'anatomy_json' body from ${table} t order by id`)));
    // Apply all earlier migrations first, then prove Pass 4B changes no existing public rows.
    const beforeFormsFolder = path.join(root, "before-forms"); await mkdir(path.join(beforeFormsFolder, "meta"), { recursive: true });
    const beforeFormsEntries = journal.entries.filter((entry: { idx: number }) => entry.idx < 75);
    await writeFile(path.join(beforeFormsFolder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: beforeFormsEntries }));
    for (const entry of beforeFormsEntries) await copyFile(path.resolve("drizzle", `${entry.tag}.sql`), path.join(beforeFormsFolder, `${entry.tag}.sql`));
    await migrate(drizzle(pool), { migrationsFolder: beforeFormsFolder });
    await pool.query("insert into creature_variants(canonical_id,creature_id,variant_name) values('VAR-MIGRATION',$1,'Preserved legacy variant')", [creatureId]);
    await pool.query("insert into creature_attributes(creature_id,attribute_key,value) values($1,'Constitution',30)", [creatureId]);
    await pool.query("insert into creature_movement(creature_id,movement_mode,movement_value,initiative,requirements) values($1,'Land',12,3,'Preserved requirement')", [creatureId]);
    const poolId = (await pool.query("insert into creature_hp_pools(creature_id,canonical_id,pool_name,hp_percentage) values($1,'HP-MIGRATION','Preserved body',100) returning id", [creatureId])).rows[0].id;
    await pool.query("insert into creature_hit_locations(creature_id,hit_location_number,location_name,hp_pool_id,natural_armor,soak,location_effect) values($1,0,'Preserved torso',$2,4,2,'Preserved effect')", [creatureId, poolId]);
    const skillId = (await pool.query("insert into skill(name,classification,tier,primary_attribute) values('Preserved Creature Skill','standard',1,'WIS') returning id")).rows[0].id;
    await pool.query("insert into creature_skill_links(creature_id,skill_id,rank) values($1,$2,'2')", [creatureId, skillId]);
    await pool.query("insert into race_forms(race_id,key,name,sort_order) select id,'preserved','Preserved Race Form',0 from races where name='Migration Legacy Race'");
    await pool.query(`insert into "user"(id,name,email) values('creature-form-migration','Preserved user','creature-form-migration@example.invalid')`);
    const campaignId = (await pool.query("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Preserved Campaign',100,100,50,10,100,250,'Credits','Assigned','creature-form-migration') returning id")).rows[0].id;
    await pool.query("insert into campaign_player(campaign_id,user_id,is_npc_controller) values($1,'creature-form-migration',true)", [campaignId]);
    const characterId = (await pool.query("insert into campaign_character(campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode) values($1,'creature-form-migration','Preserved NPC',true,'creature','detailed') returning id", [campaignId])).rows[0].id;
    const { creatureDraftFixture } = await import("./creature-form-fixture");
    const oldSnapshot = JSON.stringify({ ...creatureDraftFixture(), id: creatureId });
    await pool.query("insert into campaign_creature_npc_profile(character_id,creature_id,baseline_snapshot_json,current_snapshot_json) values($1,$2,$3,$3)", [characterId, creatureId, oldSnapshot]);
    await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) values($1,'CON',30)", [characterId]);
    await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,7)", [characterId]);
    const allTables = (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows as Array<{ tablename: string }>;
    const allBefore = await Promise.all(allTables.map(({ tablename }) => pool!.query(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)));
    const throughFormsFolder = path.join(root, "through-forms"); await mkdir(path.join(throughFormsFolder, "meta"), { recursive: true });
    const throughFormsEntries = journal.entries.filter((entry: { idx: number }) => entry.idx < 76);
    await writeFile(path.join(throughFormsFolder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: throughFormsEntries }));
    for (const entry of throughFormsEntries) await copyFile(path.resolve("drizzle", `${entry.tag}.sql`), path.join(throughFormsFolder, `${entry.tag}.sql`));
    await migrate(drizzle(pool), { migrationsFolder: throughFormsFolder });
    for (const [index, { tablename }] of allTables.entries()) assert.deepEqual((await pool.query(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)).rows, allBefore[index].rows, `${tablename} unchanged by Creature Forms migration`);
    assert.equal((await pool.query("select count(*)::int count from creature_forms")).rows[0].count, 0);
    console.log(`PASS: 0075 preserves all ${allTables.length} existing public tables and infers no Forms`);
    const { creatureFormFixture } = await import("./creature-form-fixture");
    const oldForm = creatureFormFixture();
    const [savedForm] = (await pool.query("insert into creature_forms(creature_id,form_key,name,mechanics_json,transformation_json) values($1,$2,$3,$4,$5) returning id", [creatureId, oldForm.key, oldForm.name, JSON.stringify(oldForm.mechanics), JSON.stringify(oldForm.transformation)])).rows;
    const legacyFormsSnapshot = JSON.stringify({ ...JSON.parse(oldSnapshot), forms: [{ ...oldForm, id: savedForm.id, creatureId }] });
    await pool.query("update campaign_creature_npc_profile set current_snapshot_json=$1 where character_id=$2", [legacyFormsSnapshot, characterId]);
    const accessTables = (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows as Array<{ tablename: string }>;
    const accessBefore = await Promise.all(accessTables.map(({ tablename }) => pool!.query(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)));
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    for (const [index, { tablename }] of accessTables.entries()) {
      const expected = ["race_forms", "creature_forms"].includes(tablename) ? accessBefore[index].rows.map(row => ({ body: { ...row.body, access_mode: "unrestricted" } })) : accessBefore[index].rows;
      assert.deepEqual((await pool.query(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)).rows, expected, `${tablename} preserved by Form Access migration`);
    }
    for (const table of ["race_form_access_requirements", "creature_form_access_requirements"]) assert.equal((await pool.query(`select count(*)::int count from ${table}`)).rows[0].count, 0);
    console.log(`PASS: 0076 preserves all ${accessTables.length} tables, defaults both existing Form owners to Unrestricted, and leaves old NPC snapshots byte-for-byte unchanged`);
    for (const table of ["race_natural_protections", "race_natural_protection_locations"]) assert.equal((await pool.query(`select count(*)::int count from ${table}`)).rows[0].count, 0, "Natural Protection migration never backfills Race data");
    for (const [index, table] of tables.entries()) assert.deepEqual((await pool.query(`select to_jsonb(t) - 'authoring_json' - 'interaction_rules_json' - 'parent_race_id' - 'anatomy_json' body from ${table} t order by id`)).rows, before[index].rows, `${table} legacy data must survive unchanged`);
    assert.equal((await pool.query("select count(*)::int count from races where anatomy_json is not null")).rows[0].count, 0, "Existing Race anatomy keeps its humanoid default");
    assert.equal((await pool.query("select count(*)::int count from race_natural_attacks")).rows[0].count, 0, "Natural Attacks are never inferred during migration");
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
    execFileSync(process.execPath, ["--experimental-test-module-mocks", "--conditions=react-server", "--import", "tsx", "--test", "scripts/creature-forms-db.test.mjs"], { cwd: process.cwd(), windowsHide: true, stdio: "inherit", timeout: 300_000,
      env: { ...environment, DATABASE_URL: databaseUrl, NODE_ENV: "test", SERRIAN_DISPOSABLE_CREATURE_AUTHORING: "true" } });
    if (process.env.CREATURE_FORMS_DB_ONLY === "true") return;
    execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/creature-authoring-browser.test.ts"], { cwd: process.cwd(), windowsHide: true, stdio: "inherit", timeout: 1_400_000,
      env: { ...environment, DATABASE_URL: databaseUrl, NODE_ENV: "test", SERRIAN_DISPOSABLE_CREATURE_AUTHORING: "true" } });
  } finally {
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(existsSync(path.join(data, "postmaster.pid")), false); await rm(root, { recursive: true, force: true });
  }
});
