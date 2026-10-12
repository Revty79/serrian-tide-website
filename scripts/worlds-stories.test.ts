/** Phase 6A only: exact Git migrations, isolated clone, production server and native touch. */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { chromium } from "playwright-core";
import { linkingFixtures, linkingServiceChecks, sourceSnapshot, type LinkingFixtures } from "./worlds-linking-checks";
import { storyBridgeRegressions } from "./worlds-stories-bridge-regressions";
import { storyServiceChecks, storyBrowserChecks, type StoryFixtures } from "./worlds-stories-checks";
const directory="artifacts/guidance/worlds-stories",receipt=`${directory}/environment.json`;
type Environment={data:string;temporaryRoot:string;dbPort:number;appPort:number;databaseUrl:string;baseUrl:string;distName:string;fixtures?:StoryFixtures;bridge?:LinkingFixtures};
async function freePort(){const s=createServer();await new Promise<void>((resolve,reject)=>{s.once("error",reject);s.listen(0,"127.0.0.1",resolve);});const address=s.address();assert.ok(address&&typeof address==="object");await new Promise<void>(resolve=>s.close(()=>resolve()));return address.port;}
async function main(){
  await mkdir(directory,{recursive:true});const resume=process.argv.includes("--resume");
  const completed=JSON.parse(await readFile("artifacts/guidance/linking-completed-environment.json","utf8"));
  assert.equal(path.dirname(path.resolve(completed.temporaryRoot)),path.resolve(tmpdir()));assert.ok(path.basename(completed.temporaryRoot).startsWith("serrian-worlds-linking-"));assert.equal(path.resolve(completed.data),path.join(path.resolve(completed.temporaryRoot),"data"));assert.equal(completed.databaseUrl,`postgresql://postgres@127.0.0.1:${completed.dbPort}/serrian_worlds_test`);assert.ok(!existsSync(path.join(completed.data,"postmaster.pid")),"Use only this stopped task-owned test cluster.");
  const pgCtl=path.join(process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin","pg_ctl.exe"),originalConfig=await readFile("tsconfig.json","utf8"),originalNext=await readFile("next-env.d.ts","utf8");
  let pool:pg.Pool|undefined,application:typeof import("../src/db")|undefined,server:ChildProcess|undefined,started=false;
  const log=createWriteStream(`${directory}/production.log`,{flags:"a"});
  try{
    execFileSync(pgCtl,["-D",completed.data,"-l",path.join(completed.temporaryRoot,"postgres.log"),"-o",`-p ${completed.dbPort} -h 127.0.0.1`,"-w","start"],{stdio:"ignore",windowsHide:true});started=true;
    const admin=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${completed.dbPort}/postgres`});let e:Environment;
    try{
      if(resume)e=JSON.parse(await readFile(receipt,"utf8"));else{const database=`serrian_stories_${Date.now()}`,appPort=await freePort();await admin.query(`create database "${database}" template serrian_worlds_test`);e={data:completed.data,temporaryRoot:completed.temporaryRoot,dbPort:completed.dbPort,appPort,databaseUrl:`postgresql://postgres@127.0.0.1:${completed.dbPort}/${database}`,baseUrl:`http://127.0.0.1:${appPort}`,distName:`artifacts/guidance/worlds-stories-next-${appPort}`};await writeFile(receipt,JSON.stringify(e,null,2)+"\n");}
    }finally{await admin.end();}
    assert.equal(e.data,completed.data);assert.match(e.databaseUrl,new RegExp(`^postgresql://postgres@127\\.0\\.0\\.1:${completed.dbPort}/serrian_stories_[0-9]+$`));assert.equal(e.baseUrl,`http://127.0.0.1:${e.appPort}`);assert.equal(e.distName,`artifacts/guidance/worlds-stories-next-${e.appPort}`);
    pool=new pg.Pool({connectionString:e.databaseUrl});process.env.DATABASE_URL=e.databaseUrl;
    if(!resume){
      const full=path.join(e.temporaryRoot,`stories-migrations-${Date.now()}`);await mkdir(path.join(full,"meta"),{recursive:true});const journal=JSON.parse(execFileSync("git",["show",":drizzle/meta/_journal.json"],{encoding:"utf8",windowsHide:true}));
      for(const entry of journal.entries){const filename=`${entry.tag}.sql`;await writeFile(path.join(full,filename),execFileSync("git",["show",`${entry.idx===123?":":"HEAD:"}drizzle/${filename}`],{maxBuffer:32*1024*1024,windowsHide:true}));}await writeFile(path.join(full,"meta","_journal.json"),JSON.stringify(journal));
      const original=await sourceSnapshot(pool,true),migrator=drizzle(pool);await migrate(migrator,{migrationsFolder:full});const after=await sourceSnapshot(pool,true);for(const [table,rows]of Object.entries(original))assert.deepEqual(after[table],rows,table);await migrate(migrator,{migrationsFolder:full});assert.deepEqual(await sourceSnapshot(pool,true),after);
      const admin=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${e.dbPort}/postgres`}),freshName=`serrian_stories_fresh_${Date.now()}`;await admin.query(`create database "${freshName}"`);await admin.end();const fresh=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${e.dbPort}/${freshName}`});try{await migrate(drizzle(fresh),{migrationsFolder:full});assert.equal((await fresh.query("select count(*)::int n from pg_tables where schemaname='public' and tablename like 'world_story_%'")).rows[0].n,3);await migrate(drizzle(fresh),{migrationsFolder:full});}finally{await fresh.end();}
      await writeFile(`${directory}/migration-results.json`,JSON.stringify({fresh:true,populated3550Upgrade:true,reapplication:true,unchangedExistingWorldRows:true,migrationSha256:createHash("sha256").update(await readFile(path.join(full,"0123_worlds_stories.sql"))).digest("hex"),gitBlob:execFileSync("git",["rev-parse",":drizzle/0123_worlds_stories.sql"],{encoding:"utf8",windowsHide:true}).trim()},null,2)+"\n");console.log("PASS fresh/populated approved schema upgrade and reapplication with exact Git migration bytes");
      application=await import("../src/db");e.bridge=await linkingFixtures(pool);await linkingServiceChecks(pool,e.bridge,directory);await writeFile(receipt,JSON.stringify(e,null,2)+"\n");e.fixtures=await storyServiceChecks(pool,e.bridge,directory);await writeFile(receipt,JSON.stringify(e,null,2)+"\n");
    }
    if(resume&&!e.fixtures){application=await import("../src/db");e.bridge??=JSON.parse(await readFile(`${directory}/service-results.json`,"utf8")).fixtures;assert.ok(e.bridge);e.fixtures=await storyServiceChecks(pool,e.bridge,directory);await writeFile(receipt,JSON.stringify(e,null,2)+"\n");}
    if(process.argv.includes("--bridge-corrections-only")){application??=await import("../src/db");await storyBridgeRegressions(pool,directory);return;}
    if(process.argv.includes("--services-only"))return;
    assert.ok(e.fixtures,"Finish service checks before production continuation.");
    const env:NodeJS.ProcessEnv={...process.env,NODE_ENV:"production",DATABASE_URL:e.databaseUrl,BETTER_AUTH_URL:e.baseUrl,BETTER_AUTH_SECRET:"worlds-stories-task-disposable-secret-only",SERRIAN_TEST_NEXT_DIST_DIR:e.distName,NEXT_TELEMETRY_DISABLED:"1"};
    if(!process.argv.includes("--no-build")){await new Promise<void>((resolve,reject)=>{const build=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});build.stdout!.pipe(log,{end:false});build.stderr!.pipe(log,{end:false});build.once("error",reject);build.once("exit",code=>code===0?resolve():reject(new Error(`Production build failed ${code}; see ${directory}/production.log`)));});console.log("PASS isolated production build");}
    if(process.argv.includes("--build-only"))return;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--port",String(e.appPort)],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});server.stdout!.pipe(log,{end:false});server.stderr!.pipe(log,{end:false});const deadline=Date.now()+90000;let ready=false;while(Date.now()<deadline){assert.equal(server.exitCode,null);try{if((await fetch(`${e.baseUrl}/login`,{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,300));}assert.ok(ready);
    const browser=await chromium.launch({executablePath:process.env.SERRIAN_TEST_CHROME??"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});try{await storyBrowserChecks(browser,e.baseUrl,pool,e.fixtures,directory);}finally{await browser.close();}
  }finally{
    if(server?.pid&&server.exitCode===null)execFileSync("taskkill",["/pid",String(server.pid),"/t","/f"],{stdio:"ignore",windowsHide:true});log.end();if(application)await application.pool.end();if(pool)await pool.end();await writeFile("tsconfig.json",originalConfig);await writeFile("next-env.d.ts",originalNext);if(started)execFileSync(pgCtl,["-D",completed.data,"-m","fast","-w","stop"],{stdio:"ignore",windowsHide:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
