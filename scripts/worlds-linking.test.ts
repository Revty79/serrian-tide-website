/** Focused linking-bridge migration, service and production journeys. Never uses a configured shared database. */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { chromium, type Browser } from "playwright-core";
import { linkingDraftChecks, linkingBrowserChecks, linkingFixtures, linkingServiceChecks, sourceSnapshot, type LinkingFixtures } from "./worlds-linking-checks";

type Environment = {temporaryRoot:string;data:string;dbPort:number;appPort:number;databaseUrl:string;baseUrl:string;distName:string;fixtures:LinkingFixtures|null};
async function migrationFolders(root:string){
  const full=path.join(root,"git-migrations"),prior=path.join(root,"approved-i-migrations");for(const folder of [full,prior])await mkdir(path.join(folder,"meta"),{recursive:true});
  const journal=JSON.parse(execFileSync("git",["show",":drizzle/meta/_journal.json"],{encoding:"utf8",windowsHide:true}));
  for(const entry of journal.entries){const filename=`${entry.tag}.sql`,ref=entry.idx===122?":":"HEAD:";const bytes=execFileSync("git",["show",`${ref}drizzle/${filename}`],{windowsHide:true,maxBuffer:32*1024*1024});await writeFile(path.join(full,filename),bytes);if(entry.idx<122)await writeFile(path.join(prior,filename),bytes);}
  await writeFile(path.join(full,"meta","_journal.json"),JSON.stringify(journal));await writeFile(path.join(prior,"meta","_journal.json"),JSON.stringify({...journal,entries:journal.entries.filter((e:{idx:number})=>e.idx<122)}));return {full,prior};
}
const artifactRoot=path.resolve("artifacts/guidance"),receiptPath=path.join(artifactRoot,"linking-retained-environment.json");
const postgresBin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin";
const executable=(name:string)=>path.join(postgresBin,process.platform==="win32"?`${name}.exe`:name);
async function freePort(){const listener=createServer();await new Promise<void>((resolve,reject)=>{listener.once("error",reject);listener.listen(0,"127.0.0.1",resolve);});const address=listener.address();assert.ok(address&&typeof address==="object");await new Promise<void>((resolve,reject)=>listener.close(e=>e?reject(e):resolve()));return address.port;}
function validateEnvironment(e:Environment){
  assert.equal(path.dirname(path.resolve(e.temporaryRoot)),path.resolve(tmpdir()));assert.ok(path.basename(e.temporaryRoot).startsWith("serrian-worlds-linking-"));
  assert.equal(path.resolve(e.data),path.join(path.resolve(e.temporaryRoot),"data"));
  assert.equal(e.databaseUrl,`postgresql://postgres@127.0.0.1:${e.dbPort}/serrian_worlds_test`);assert.equal(e.baseUrl,`http://127.0.0.1:${e.appPort}`);
  assert.equal(e.distName,`artifacts/guidance/worlds-linking-next-${e.appPort}`);assert.equal(path.dirname(path.resolve(e.distName)),artifactRoot);
}
async function runtimeSnapshot(pool:pg.Pool){const tables=(await pool.query("select tablename from pg_tables where schemaname='public' and (tablename like 'campaign%' or tablename like 'form_%' or tablename in ('race_evolution_events','creature_evolution_events','owned_creature_disposition','item_inventory_operation','races','creatures','skill','derived_ability','items','item_tags_catalog','item_tag_links','user_role','user_catalog_preferences','catalog_visibility_scope_activation')) order by tablename")).rows;const result:Record<string,unknown>={};for(const {tablename}of tables)result[tablename]=(await pool.query(`select to_jsonb(t) as row from "${tablename}" t order by to_jsonb(t)::text`)).rows;return result;}
async function main(){
  const completed=process.argv.includes("--completed"),resume=process.argv.includes("--resume")||completed,rebuild=!resume||process.argv.includes("--rebuild");
  const directory=process.env.SERRIAN_WORLDS_EVIDENCE_DIR??"artifacts/guidance/worlds-linking-acceptance";
  await mkdir(directory,{recursive:true});await mkdir(artifactRoot,{recursive:true});
  const originalConfig=await readFile("tsconfig.json","utf8"),originalNextEnv=await readFile("next-env.d.ts","utf8");
  let environment:Environment|undefined,pool:pg.Pool|undefined,applicationPool:pg.Pool|undefined,browser:Browser|undefined,server:ChildProcess|undefined,keep=true;
  const log=createWriteStream(path.join(directory,"production.log"));
  try{
    if(resume){environment=JSON.parse(await readFile(completed?path.join(artifactRoot,"linking-completed-environment.json"):receiptPath,"utf8")) as Environment;validateEnvironment(environment);if(completed&&!existsSync(path.join(environment.data,"postmaster.pid")))execFileSync(executable("pg_ctl"),["-D",environment.data,"-l",path.join(environment.temporaryRoot,"postgres.log"),"-o",`-p ${environment.dbPort} -h 127.0.0.1`,"-w","start"],{stdio:"ignore",windowsHide:true});assert.ok(existsSync(path.join(environment.data,"postmaster.pid")),"Only resume this pass's retained disposable database.");}
    else{
      assert.ok(!existsSync(receiptPath),"Resume or finish the retained I environment before creating another.");
      const temporaryRoot=await mkdtemp(path.join(tmpdir(),"serrian-worlds-linking-")),dbPort=await freePort(),appPort=await freePort();
      environment={temporaryRoot,data:path.join(temporaryRoot,"data"),dbPort,appPort,databaseUrl:`postgresql://postgres@127.0.0.1:${dbPort}/serrian_worlds_test`,baseUrl:`http://127.0.0.1:${appPort}`,distName:`artifacts/guidance/worlds-linking-next-${appPort}`,fixtures:null};validateEnvironment(environment);
      execFileSync(executable("initdb"),["--auth=trust","--encoding=UTF8","--no-locale","--username=postgres","-D",environment.data],{stdio:"pipe",windowsHide:true});
      execFileSync(executable("pg_ctl"),["-D",environment.data,"-l",path.join(temporaryRoot,"postgres.log"),"-o",`-p ${dbPort} -h 127.0.0.1`,"-w","start"],{stdio:"ignore",windowsHide:true});
      const adminPool=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${dbPort}/postgres`});try{await adminPool.query("create database serrian_worlds_test");}finally{await adminPool.end();}
      pool=new pg.Pool({connectionString:environment.databaseUrl});const {prior}=await migrationFolders(environment.temporaryRoot);await migrate(drizzle(pool),{migrationsFolder:prior});
      const password=await hashPassword("Worlds-Test-Only-Password!");for(const [id,role]of [["world-god","god"],["other-god","god"],["world-admin","admin"],["world-player","player"]]){
        await pool.query('insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$1,$2,true,$1,$1)',[id,`${id}@example.invalid`]);
        await pool.query("insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())",[`${id}-credential`,id,password]);await pool.query("insert into user_role (user_id,role) values ($1,$2)",[id,role]);
      }
    }
    pool??=new pg.Pool({connectionString:environment.databaseUrl});process.env.DATABASE_URL=environment.databaseUrl;applicationPool=(await import("../src/db")).pool;
    if(!environment.fixtures){
      await writeFile(receiptPath,JSON.stringify(environment,null,2)+"\n");
      environment.fixtures=await linkingFixtures(pool);
      await writeFile(receiptPath,JSON.stringify(environment,null,2)+"\n");
      const beforeUpgrade=await sourceSnapshot(pool),{full}=await migrationFolders(environment.temporaryRoot);
      await migrate(drizzle(pool),{migrationsFolder:full});assert.deepEqual(await sourceSnapshot(pool),beforeUpgrade);
      const afterUpgrade=await sourceSnapshot(pool,true);await migrate(drizzle(pool),{migrationsFolder:full});assert.deepEqual(await sourceSnapshot(pool,true),afterUpgrade);
      const admin=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${environment.dbPort}/postgres`});await admin.query("create database serrian_worlds_fresh");await admin.end();
      const fresh=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${environment.dbPort}/serrian_worlds_fresh`});try{await migrate(drizzle(fresh),{migrationsFolder:full});assert.equal((await fresh.query("select count(*)::int n from pg_tables where schemaname='public' and tablename like 'world_link_%'")).rows[0].n,3);await migrate(drizzle(fresh),{migrationsFolder:full});}finally{await fresh.end();}
      await writeFile(path.join(directory,"migration-results.json"),JSON.stringify({fresh:true,populatedIUpgrade:true,reapplication:true,unchangedExistingWorldRows:true,migrationSha256:createHash("sha256").update(await readFile(path.join(full,"0122_worlds_linking_bridge.sql"))).digest("hex"),gitBlob:execFileSync("git",["rev-parse",":drizzle/0122_worlds_linking_bridge.sql"],{encoding:"utf8",windowsHide:true}).trim()},null,2)+"\n");
      console.log("PASS fresh installation, populated I-schema upgrade, unchanged saved rows and migrator reapplication using staged Git bytes.");
      await linkingServiceChecks(pool,environment.fixtures,directory);await writeFile(receiptPath,JSON.stringify(environment,null,2)+"\n");
    }
    if(process.argv.includes("--services-only")){keep=true;return;}
    assert.ok(existsSync(path.join(directory,"migration-results.json"))&&existsSync(path.join(directory,"service-results.json")),"Finish retained migration/service checkpoints before production continuation.");
    const before=await runtimeSnapshot(pool);const env:NodeJS.ProcessEnv={...process.env,NODE_ENV:"production",DATABASE_URL:environment.databaseUrl,BETTER_AUTH_URL:environment.baseUrl,BETTER_AUTH_SECRET:"worlds-linking-disposable-secret-only",SERRIAN_TEST_NEXT_DIST_DIR:environment.distName,NEXT_TELEMETRY_DISABLED:"1"};
    if(rebuild){await new Promise<void>((resolve,reject)=>{const build=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});build.stdout!.pipe(log,{end:false});build.stderr!.pipe(log,{end:false});build.once("error",reject);build.once("exit",code=>code===0?resolve():reject(new Error(`Production build failed (${code}); see ${directory}/production.log`)));});console.log("PASS isolated linking bridge production build.");}
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--port",String(environment.appPort)],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});server.stdout!.pipe(log,{end:false});server.stderr!.pipe(log,{end:false});
    const deadline=Date.now()+120000;let ready=false;while(Date.now()<deadline){assert.equal(server.exitCode,null);try{if((await fetch(`${environment.baseUrl}/login`,{signal:AbortSignal.timeout(5000)})).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,300));}assert.ok(ready);
    browser=await chromium.launch({executablePath:process.env.SERRIAN_TEST_CHROME??"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
    assert.ok(environment.fixtures);if(process.argv.includes("--drafts-only"))await linkingDraftChecks(browser,environment.baseUrl,pool,environment.fixtures,directory);else await linkingBrowserChecks(browser,environment.baseUrl,pool,environment.fixtures,directory);
    assert.deepEqual(await runtimeSnapshot(pool),before);console.log("PASS unrelated runtime/Campaign/catalog snapshots unchanged.");keep=process.env.SERRIAN_TEST_KEEP_SUCCESS==="1";
  }finally{
    if(browser)await browser.close();if(server?.pid&&server.exitCode===null){if(process.platform==="win32")execFileSync("taskkill",["/pid",String(server.pid),"/t","/f"],{stdio:"ignore",windowsHide:true});else server.kill();}log.end();if(applicationPool)await applicationPool.end();if(pool)await pool.end();
    await writeFile("tsconfig.json",originalConfig);await writeFile("next-env.d.ts",originalNextEnv);
    if(environment){validateEnvironment(environment);if(!keep){await writeFile(path.join(artifactRoot,"linking-completed-environment.json"),JSON.stringify(environment,null,2)+"\n");if(existsSync(path.join(environment.data,"postmaster.pid")))execFileSync(executable("pg_ctl"),["-D",environment.data,"-m","fast","-w","stop"],{stdio:"ignore",windowsHide:true});await rm(receiptPath,{force:true});}else console.log("Retained only linking bridge's disposable database/build for targeted continuation.");}
  }
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
