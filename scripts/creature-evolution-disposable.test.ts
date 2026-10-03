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
import { creatureDraftFixture, creatureFormFixture } from "./creature-form-fixture";
import { verifyReturnHistoryUpgrade } from "./evolution-return-upgrade";

async function main() {
  const parent = path.resolve(tmpdir()), root = path.resolve(await mkdtemp(path.join(parent,"serrian-evolution-")));
  const data = path.join(root,"data"), bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
  const exe = (name: string) => path.join(bin,`${name}${process.platform === "win32" ? ".exe" : ""}`);
  const listener = createServer(); await new Promise<void>(resolve=>listener.listen(0,"127.0.0.1",resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object"); const port = address.port;
  await new Promise<void>(resolve=>listener.close(()=>resolve()));
  const url = (database: string) => `postgresql://postgres@127.0.0.1:${port}/${database}`;
  const databaseUrl = url("serrian_creature_evolution_dev");
  let started = false, pool: pg.Pool | null = null;
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV:"test", SERRIAN_EVOLUTION_DISPOSABLE:"true", SERRIAN_TIDE_ENABLE_PERMANENT_DELETION:"true" };
  delete env.NODE_TEST_CONTEXT;
  try {
    execFileSync(exe("initdb"),["--auth=trust","--encoding=UTF8","--no-locale","--username=postgres","-D",data],{stdio:"pipe",windowsHide:true});
    // Explicit test transactions own lock scheduling in this disposable cluster.
    execFileSync(exe("pg_ctl"),["-D",data,"-l",path.join(root,"postgres.log"),"-o",`-p ${port} -h 127.0.0.1 -c autovacuum=off`,"-w","start"],{stdio:"ignore",windowsHide:true}); started=true;
    pool = new pg.Pool({connectionString:url("postgres")});
    for (const name of ["serrian_creature_evolution_dev","serrian_evolution_fresh_dev","serrian_evolution_return_upgrade_dev","serrian_creature_ownership_dev","serrian_creature_authoring_dev","serrian_race_authoring_dev"]) await pool.query(`create database ${name}`);
    await verifyReturnHistoryUpgrade(url("serrian_evolution_return_upgrade_dev"), root);
    await pool.end(); pool = new pg.Pool({connectionString:url("serrian_evolution_fresh_dev")});
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));
    await migrate(drizzle(pool),{migrationsFolder:"drizzle"});
    assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n,journal.entries.length);
    await pool.end(); pool = new pg.Pool({connectionString:databaseUrl});
    const legacy = path.join(root,"legacy"); await mkdir(path.join(legacy,"meta"),{recursive:true});
    const entries = journal.entries.filter((entry:{idx:number})=>entry.idx<83);
    await writeFile(path.join(legacy,"meta/_journal.json"),JSON.stringify({...journal,entries}));
    for (const entry of entries) await copyFile(path.resolve("drizzle",`${entry.tag}.sql`),path.join(legacy,`${entry.tag}.sql`));
    await migrate(drizzle(pool),{migrationsFolder:legacy});
    await pool.query(`insert into "user"(id,name,email) values('evolution-upgrade','Upgrade','evolution-upgrade@example.invalid')`);
    const source=(await pool.query("insert into creatures(canonical_id,canonical_name,size,created_by_user_id) values('EVOLUTION-UPGRADE','Young Drake','Medium','evolution-upgrade') returning id")).rows[0].id;
    await pool.query("insert into creatures(canonical_id,canonical_name,size,parent_creature_id) values('EVOLUTION-UPGRADE-VARIANT','Adult Drake','Large',$1)",[source]);
    const form=creatureFormFixture();
    await pool.query("insert into creature_forms(creature_id,form_key,name,mechanics_json,transformation_json) values($1,$2,$3,$4,$5)",[source,form.key,form.name,form.mechanics,form.transformation]);
    const campaign=(await pool.query("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Upgrade',100,100,50,10,100,0,'Credits','Assigned','evolution-upgrade') returning id")).rows[0].id;
    await pool.query("insert into campaign_player(campaign_id,user_id) values($1,'evolution-upgrade')",[campaign]);
    const owner=(await pool.query("insert into campaign_character(campaign_id,player_user_id,name) values($1,'evolution-upgrade','Upgrade owner') returning id",[campaign])).rows[0].id;
    const npc=(await pool.query("insert into campaign_character(campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode,owner_character_id) values($1,'evolution-upgrade','Ember',true,'creature','detailed',$2) returning id",[campaign,owner])).rows[0].id;
    const snapshot={...creatureDraftFixture(),id:source,forms:[form]};
    await pool.query("insert into campaign_creature_npc_profile(character_id,creature_id,baseline_snapshot_json,current_snapshot_json,instance_notes) values($1,$2,$3,$3,'Keep history')",[npc,source,snapshot]);
    await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,13)",[npc]);
    const item=(await pool.query("insert into items(canonical_id,name,catalog_scope,record_type,family,category,credits,price_basis) values('EVOLUTION-UPGRADE-ITEM','Collar','equipment','misc','Gear','Gear',3,'Each') returning id")).rows[0].id;
    await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,equipment_state,unit_cost_credits) values($1,$2,0,'worn',3)",[npc,item]);
    await pool.query("insert into item_creature_grant(item_id,creature_id) values($1,$2)",[item,source]);
    const upgradeDestination=(await pool.query("select id from creatures where canonical_id='EVOLUTION-UPGRADE-VARIANT'")).rows[0].id;
    await pool.query("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name,notes,version) values($1,$2,'Existing path','No inferred requirements',7)",[source,upgradeDestination]);
    const pathsBefore=(await pool.query("select to_jsonb(t) body from creature_evolution_paths t")).rows;
    const tables=(await pool.query("select tablename from pg_tables where schemaname='public' and tablename <> 'creature_evolution_paths' order by tablename")).rows as {tablename:string}[];
    const readAll=()=>Promise.all(tables.map(({tablename})=>pool!.query(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)));
    const before=await readAll();
    // Stage the accepted Pass 2 upgrade before applying Pass 3 to populated paths/requirements.
    const passTwo = path.join(root,"pass-two"); await mkdir(path.join(passTwo,"meta"),{recursive:true});
    const passTwoEntries = journal.entries.filter((entry:{idx:number})=>entry.idx<85);
    await writeFile(path.join(passTwo,"meta/_journal.json"),JSON.stringify({...journal,entries:passTwoEntries}));
    for(const entry of passTwoEntries) await copyFile(path.resolve("drizzle",`${entry.tag}.sql`),path.join(passTwo,`${entry.tag}.sql`));
    await migrate(drizzle(pool),{migrationsFolder:passTwo});
    const r1=(await pool.query("insert into races(name) values('Upgrade Evolution source') returning id")).rows[0].id;
    const r2=(await pool.query("insert into races(name) values('Upgrade Evolution destination') returning id")).rows[0].id;
    const rp=(await pool.query("insert into race_evolution_paths(source_race_id,destination_race_id,name,version,requirement_mode) values($1,$2,'Retain authored Pass 2',4,'requirements') returning id",[r1,r2])).rows[0].id;
    await pool.query("insert into race_evolution_requirements(path_id,requirement_key,group_number,sort_order,requirement_type,manual_category,notes) values($1,'milestone',0,0,'manual','milestone','Retain exact authored requirement')",[rp]);
    const racePathsBefore=(await pool.query("select to_jsonb(t) body from race_evolution_paths t")).rows;
    const requirementsBefore=(await pool.query("select to_jsonb(t) body from race_evolution_requirements t")).rows;
    await migrate(drizzle(pool),{migrationsFolder:"drizzle"});
    assert.deepEqual((await pool.query("select to_jsonb(t) - 'transition_json' body from race_evolution_paths t")).rows,racePathsBefore);
    assert.deepEqual((await pool.query("select to_jsonb(t) body from race_evolution_requirements t")).rows,requirementsBefore);
    assert.equal((await pool.query("select transition_json from race_evolution_paths where id=$1",[rp])).rows[0].transition_json,null);
    // Remove only these temporary upgrade-only fixtures before comparing the original 0082 rows.
    await pool.query("delete from race_evolution_paths where id=$1",[rp]);
    await pool.query("delete from races where id in ($1,$2)",[r1,r2]);
    const after=await readAll();
    tables.forEach(({tablename},index)=>assert.deepEqual(after[index].rows,before[index].rows,`${tablename} unchanged by Pass 3`));
    assert.deepEqual((await pool.query("select to_jsonb(t) - 'requirement_mode' body from creature_evolution_paths t")).rows,pathsBefore);
    assert.equal((await pool.query("select requirement_mode from creature_evolution_paths")).rows[0].requirement_mode,"unrestricted");
    assert.equal((await pool.query("select count(*)::int n from creature_evolution_requirements")).rows[0].n,0);
    assert.equal((await pool.query("select count(*)::int n from race_evolution_paths")).rows[0].n,0);
    for (const table of ["race_evolution_events", "creature_evolution_events", "campaign_character_active_form", "form_transition_event", "form_transition_request"]) assert.equal((await pool.query(`select count(*)::int n from ${table}`)).rows[0].n, 0);
    console.log(`PASS: fresh ${journal.entries.length}-migration chain; populated 0082-to-Pass-3 upgrade preserves all ${tables.length} prior public tables and existing path identity/version, with no inferred requirements or Race paths.`);
    await pool.end(); pool=null;
    let executedScripts=0;
    const run=(script:string, extra:Partial<NodeJS.ProcessEnv>={})=>{
      if(process.env.EVOLUTION_CASE_FILTER && !process.env.EVOLUTION_CASE_FILTER.split(",").some(part=>script.includes(part.trim()))) return;
      executedScripts++;
      execFileSync(process.execPath,["--experimental-test-module-mocks","--conditions=react-server","--import","tsx","--test",script],{cwd:process.cwd(),env:{...env,...extra},stdio:"inherit",windowsHide:true,timeout:600_000});
    };
    run("scripts/creature-evolution-db.test.mjs");
    run("scripts/evolution-pass-two-db.test.mjs");
    run("scripts/evolution-pass-three-db.test.mjs");
    run("scripts/evolution-runtime-db.test.mjs");
    run("scripts/evolution-runtime-return-db.test.mjs");
    run("scripts/forms-runtime-db.test.mjs");
    run("scripts/evolution-pass-four-db.test.mjs");
    run("scripts/evolution-pass-five-db.test.mjs");
    if (!process.argv.includes("--focused")) {
      pool=new pg.Pool({connectionString:url("serrian_race_authoring_dev")}); await migrate(drizzle(pool),{migrationsFolder:"drizzle"}); await pool.end(); pool=null;
      for (const script of ["scripts/race-forms-db.test.mjs","scripts/race-form-mechanics-db.test.mjs","scripts/race-form-preview-db.test.mjs"]) run(script,{DATABASE_URL:url("serrian_race_authoring_dev"),SERRIAN_DISPOSABLE_RACE_AUTHORING:"true"});
      pool=new pg.Pool({connectionString:url("serrian_creature_authoring_dev")}); await migrate(drizzle(pool),{migrationsFolder:"drizzle"}); await pool.end(); pool=null;
      run("scripts/creature-forms-db.test.mjs",{DATABASE_URL:url("serrian_creature_authoring_dev"),SERRIAN_DISPOSABLE_CREATURE_AUTHORING:"true"});
      pool=new pg.Pool({connectionString:url("serrian_creature_ownership_dev")}); await migrate(drizzle(pool),{migrationsFolder:"drizzle"}); await pool.end(); pool=null;
      for (const script of ["scripts/creature-ownership-db.test.mjs","scripts/creature-commerce-db.test.mjs","scripts/lifecycle-service-db.test.ts","scripts/lifecycle-migration-db.test.ts"]) {
        run(script,{DATABASE_URL:url("serrian_creature_ownership_dev"),SERRIAN_OWNERSHIP_DISPOSABLE:"true"});
      }
    }
    assert.ok(executedScripts>0,"The Evolution case filter must select an executed test suite.");
    if (process.argv.includes("--browser")) execFileSync(process.execPath,["--conditions=react-server","--import","tsx","scripts/creature-evolution-browser.test.ts"],{cwd:process.cwd(),env,stdio:"inherit",windowsHide:true,timeout:600_000});
    if (process.argv.includes("--build")) {
      const tsconfig=await readFile("tsconfig.json"),nextEnv=await readFile("next-env.d.ts");
      try { execFileSync(process.execPath,["node_modules/next/dist/bin/next","build"],{cwd:process.cwd(),env:{...env,NODE_ENV:"production",SERRIAN_TEST_NEXT_DIST_DIR:".next-evolution-build",NEXT_TELEMETRY_DISABLED:"1"},stdio:"inherit",windowsHide:true,timeout:600_000}); }
      finally { await writeFile("tsconfig.json",tsconfig); await writeFile("next-env.d.ts",nextEnv); }
    }
  } finally {
    if(pool) await pool.end();
    if(started && existsSync(path.join(data,"postmaster.pid"))) execFileSync(exe("pg_ctl"),["-D",data,"-m","fast","-w","stop"],{stdio:"ignore",windowsHide:true});
    assert.equal(path.dirname(root),parent); assert.ok(path.basename(root).startsWith("serrian-evolution-"));
    await rm(root,{recursive:true,force:true});
  }
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
