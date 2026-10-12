/** Resume unfinished H harness checkpoints against the retained build. Rebuild after application changes. */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { chromium } from "playwright-core";
import { repairHBrowserChecks } from "./worlds-repair-h-checks";

async function main(){
  assert.ok(process.env.SERRIAN_REPAIR_H_PHASES,"Choose only unfinished H checkpoints with SERRIAN_REPAIR_H_PHASES.");
  const receiptPath=path.resolve("artifacts/guidance/h-retained-environment.json");
  const receipt=JSON.parse(await readFile(receiptPath,"utf8")) as {temporaryRoot:string;data:string;dbPort:number;appPort:number;databaseUrl:string;baseUrl:string;distName:string;distPath:string};
  assert.equal(path.dirname(path.resolve(receipt.temporaryRoot)),path.resolve(tmpdir()));assert.ok(path.basename(receipt.temporaryRoot).startsWith("serrian-worlds-pass-one-"));assert.equal(path.resolve(receipt.data),path.join(path.resolve(receipt.temporaryRoot),"data"));
  assert.equal(receipt.databaseUrl,`postgresql://postgres@127.0.0.1:${receipt.dbPort}/serrian_worlds_test`);assert.equal(receipt.baseUrl,`http://127.0.0.1:${receipt.appPort}`);assert.equal(receipt.distName,`artifacts/guidance/worlds-next-${receipt.appPort}`);assert.equal(path.resolve(receipt.distPath),path.resolve(receipt.distName));
  const directory=process.env.SERRIAN_WORLDS_EVIDENCE_DIR??"artifacts/guidance/worlds-repair-h-resumed";await mkdir(directory,{recursive:true});
  const pool=new pg.Pool({connectionString:receipt.databaseUrl});process.env.DATABASE_URL=receipt.databaseUrl;
  const applicationPool=(await import("../src/db")).pool;
  async function snapshot(){
    const tables=(await pool.query("select tablename from pg_tables where schemaname='public' and (tablename like 'campaign%' or tablename like 'form_%' or tablename in ('race_evolution_events','creature_evolution_events','owned_creature_disposition','item_inventory_operation','races','creatures','skill','derived_ability','items','item_tags_catalog','item_tag_links','user_role','user_catalog_preferences','catalog_visibility_scope_activation')) order by tablename")).rows;
    const rows:Record<string,unknown>={};for(const {tablename}of tables){assert.match(tablename,/^[a-z_]+$/);rows[tablename]=(await pool.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as rows from "${tablename}" t`)).rows[0].rows;}return rows;
  }
  const before=await snapshot(),log=createWriteStream(path.join(directory,"next.log"));let server:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,passed=false;
  try{
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--port",String(receipt.appPort)],{env:{...process.env,NODE_ENV:"production",BETTER_AUTH_URL:receipt.baseUrl,BETTER_AUTH_SECRET:"worlds-pass-one-disposable-secret-only",SERRIAN_TEST_NEXT_DIST_DIR:receipt.distName,NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","pipe","pipe"],windowsHide:true});server.stdout!.pipe(log,{end:false});server.stderr!.pipe(log,{end:false});
    const deadline=Date.now()+60000;let ready=false;while(Date.now()<deadline){assert.equal(server.exitCode,null);try{if((await fetch(`${receipt.baseUrl}/login`,{signal:AbortSignal.timeout(3000)})).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,200));}assert.ok(ready);
    browser=await chromium.launch({executablePath:process.env.SERRIAN_TEST_CHROME??"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});await repairHBrowserChecks(browser,receipt.baseUrl,pool,directory);assert.deepEqual(await snapshot(),before);await writeFile(path.join(directory,"h-runtime-preservation.json"),JSON.stringify({unchanged:true,tables:Object.keys(before),resumedBuild:receipt.distName},null,2)+"\n");passed=true;console.log("PASS: unfinished H checkpoints resumed without rebuilding; disposable runtime/catalog snapshot unchanged.");
  }finally{
    await browser?.close();if(server?.pid&&server.exitCode===null)execFileSync("taskkill",["/pid",String(server.pid),"/t","/f"],{stdio:"ignore",windowsHide:true});log.end();await applicationPool.end();await pool.end();
    if(passed||process.env.SERRIAN_TEST_KEEP_FAILED!=="1"){
      execFileSync(path.join(process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin","pg_ctl.exe"),["-D",receipt.data,"-m","fast","-w","stop"],{stdio:"ignore",windowsHide:true});await rm(receipt.temporaryRoot,{recursive:true,force:true});await rm(receipt.distPath,{recursive:true,force:true});await rm(receiptPath);
    }
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
