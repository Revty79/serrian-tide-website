/** Focused Repair I production journeys. Never uses a configured shared database. */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
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
import { repairIBrowserChecks, repairIFixtures, placeHistoryLayoutChecks, historyTabChecks, type RepairIFixtures } from "./worlds-repair-i-checks";

type Environment = {temporaryRoot:string;data:string;dbPort:number;appPort:number;databaseUrl:string;baseUrl:string;distName:string;fixtures:RepairIFixtures|null};
const artifactRoot=path.resolve("artifacts/guidance"),receiptPath=path.join(artifactRoot,"i-retained-environment.json");
const postgresBin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin";
const executable=(name:string)=>path.join(postgresBin,process.platform==="win32"?`${name}.exe`:name);
async function freePort(){const listener=createServer();await new Promise<void>((resolve,reject)=>{listener.once("error",reject);listener.listen(0,"127.0.0.1",resolve);});const address=listener.address();assert.ok(address&&typeof address==="object");await new Promise<void>((resolve,reject)=>listener.close(e=>e?reject(e):resolve()));return address.port;}
function validateEnvironment(e:Environment){
  assert.equal(path.dirname(path.resolve(e.temporaryRoot)),path.resolve(tmpdir()));assert.ok(path.basename(e.temporaryRoot).startsWith("serrian-worlds-repair-i-"));
  assert.equal(path.resolve(e.data),path.join(path.resolve(e.temporaryRoot),"data"));
  assert.equal(e.databaseUrl,`postgresql://postgres@127.0.0.1:${e.dbPort}/serrian_worlds_test`);assert.equal(e.baseUrl,`http://127.0.0.1:${e.appPort}`);
  assert.equal(e.distName,`artifacts/guidance/worlds-i-next-${e.appPort}`);assert.equal(path.dirname(path.resolve(e.distName)),artifactRoot);
}
async function runtimeSnapshot(pool:pg.Pool){const tables=(await pool.query("select tablename from pg_tables where schemaname='public' and (tablename like 'campaign%' or tablename like 'form_%' or tablename in ('race_evolution_events','creature_evolution_events','owned_creature_disposition','item_inventory_operation','races','creatures','skill','derived_ability','items','item_tags_catalog','item_tag_links','user_role','user_catalog_preferences','catalog_visibility_scope_activation')) order by tablename")).rows;const result:Record<string,unknown>={};for(const {tablename}of tables)result[tablename]=(await pool.query(`select to_jsonb(t) as row from "${tablename}" t order by to_jsonb(t)::text`)).rows;return result;}
async function main(){
  const resume=process.argv.includes("--resume"),baseline=process.argv.includes("--baseline"),rebuild=!resume||process.argv.includes("--rebuild"),tabsOnly=process.argv.includes("--history-tabs-only"),historyOnly=process.argv.includes("--history-only")||tabsOnly;
  const directory=process.env.SERRIAN_WORLDS_EVIDENCE_DIR??`artifacts/guidance/worlds-repair-i-${baseline?"baseline":"acceptance"}`;
  await mkdir(directory,{recursive:true});await mkdir(artifactRoot,{recursive:true});
  const originalConfig=await readFile("tsconfig.json","utf8"),originalNextEnv=await readFile("next-env.d.ts","utf8");
  let environment:Environment|undefined,pool:pg.Pool|undefined,applicationPool:pg.Pool|undefined,browser:Browser|undefined,server:ChildProcess|undefined,keep=true;
  const log=createWriteStream(path.join(directory,"production.log"));
  try{
    if(resume){environment=JSON.parse(await readFile(receiptPath,"utf8")) as Environment;validateEnvironment(environment);assert.ok(existsSync(path.join(environment.data,"postmaster.pid")),"Only resume this pass's retained disposable database.");}
    else{
      assert.ok(!existsSync(receiptPath),"Resume or finish the retained I environment before creating another.");
      const temporaryRoot=await mkdtemp(path.join(tmpdir(),"serrian-worlds-repair-i-")),dbPort=await freePort(),appPort=await freePort();
      environment={temporaryRoot,data:path.join(temporaryRoot,"data"),dbPort,appPort,databaseUrl:`postgresql://postgres@127.0.0.1:${dbPort}/serrian_worlds_test`,baseUrl:`http://127.0.0.1:${appPort}`,distName:`artifacts/guidance/worlds-i-next-${appPort}`,fixtures:null};validateEnvironment(environment);
      execFileSync(executable("initdb"),["--auth=trust","--encoding=UTF8","--no-locale","--username=postgres","-D",environment.data],{stdio:"pipe",windowsHide:true});
      execFileSync(executable("pg_ctl"),["-D",environment.data,"-l",path.join(temporaryRoot,"postgres.log"),"-o",`-p ${dbPort} -h 127.0.0.1`,"-w","start"],{stdio:"ignore",windowsHide:true});
      const adminPool=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${dbPort}/postgres`});try{await adminPool.query("create database serrian_worlds_test");}finally{await adminPool.end();}
      pool=new pg.Pool({connectionString:environment.databaseUrl});await migrate(drizzle(pool),{migrationsFolder:path.resolve("drizzle")});
      const password=await hashPassword("Worlds-Test-Only-Password!");for(const [id,role]of [["world-god","god"],["other-god","god"],["world-admin","admin"],["world-player","player"]]){
        await pool.query('insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$1,$2,true,$1,$1)',[id,`${id}@example.invalid`]);
        await pool.query("insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())",[`${id}-credential`,id,password]);await pool.query("insert into user_role (user_id,role) values ($1,$2)",[id,role]);
      }
    }
    pool??=new pg.Pool({connectionString:environment.databaseUrl});process.env.DATABASE_URL=environment.databaseUrl;applicationPool=(await import("../src/db")).pool;
    if(!resume){if(!historyOnly)environment.fixtures=await repairIFixtures(pool);await writeFile(receiptPath,JSON.stringify(environment,null,2)+"\n");}
    const before=await runtimeSnapshot(pool);const env:NodeJS.ProcessEnv={...process.env,NODE_ENV:"production",DATABASE_URL:environment.databaseUrl,BETTER_AUTH_URL:environment.baseUrl,BETTER_AUTH_SECRET:"worlds-repair-i-disposable-secret-only",SERRIAN_TEST_NEXT_DIST_DIR:environment.distName,NEXT_TELEMETRY_DISABLED:"1"};
    if(rebuild){await new Promise<void>((resolve,reject)=>{const build=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});build.stdout!.pipe(log,{end:false});build.stderr!.pipe(log,{end:false});build.once("error",reject);build.once("exit",code=>code===0?resolve():reject(new Error(`Production build failed (${code}); see ${directory}/production.log`)));});console.log("PASS isolated Repair I production build.");}
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--port",String(environment.appPort)],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});server.stdout!.pipe(log,{end:false});server.stderr!.pipe(log,{end:false});
    const deadline=Date.now()+120000;let ready=false;while(Date.now()<deadline){assert.equal(server.exitCode,null);try{if((await fetch(`${environment.baseUrl}/login`,{signal:AbortSignal.timeout(5000)})).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,300));}assert.ok(ready);
    browser=await chromium.launch({executablePath:process.env.SERRIAN_TEST_CHROME??"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
    if(tabsOnly)await historyTabChecks(browser,environment.baseUrl,pool,directory);
    else if(historyOnly)await placeHistoryLayoutChecks(browser,environment.baseUrl,pool,directory);
    else{assert.ok(environment.fixtures,"Only a full fixture environment supports the other checkpoints.");await repairIBrowserChecks(browser,environment.baseUrl,pool,environment.fixtures,directory,baseline);}
    assert.deepEqual(await runtimeSnapshot(pool),before);console.log("PASS unrelated runtime/Campaign/catalog snapshots unchanged.");keep=baseline||process.env.SERRIAN_TEST_KEEP_SUCCESS==="1";
  }finally{
    if(browser)await browser.close();if(server?.pid&&server.exitCode===null){if(process.platform==="win32")execFileSync("taskkill",["/pid",String(server.pid),"/t","/f"],{stdio:"ignore",windowsHide:true});else server.kill();}log.end();if(applicationPool)await applicationPool.end();if(pool)await pool.end();
    await writeFile("tsconfig.json",originalConfig);await writeFile("next-env.d.ts",originalNextEnv);
    if(environment){validateEnvironment(environment);if(!keep){if(existsSync(path.join(environment.data,"postmaster.pid")))execFileSync(executable("pg_ctl"),["-D",environment.data,"-m","fast","-w","stop"],{stdio:"ignore",windowsHide:true});await rm(environment.temporaryRoot,{recursive:true,force:true});await rm(path.resolve(environment.distName),{recursive:true,force:true});await rm(receiptPath,{force:true});}else console.log("Retained only Repair I's disposable database/build for targeted continuation.");}
  }
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
