/** Real LOCAL DEV HTTP persistence, with a temporary owner test session.
 * Starts/restarts ONLY its own full-website dev process, never the owner's server.
 * Retains the verification World archived and removes the temporary session.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import dotenv from "dotenv";
import pg from "pg";
import { serializeSignedCookie } from "better-call";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
const out = "docs/screenshots/worlds-atlas-pass3/dev", privateOut = "artifacts/worlds-atlas-pass3";
async function freePort() { const s = createServer(); await new Promise<void>(r => s.listen(0, "127.0.0.1", r)); const a = s.address(); assert.ok(a && typeof a === "object"); await new Promise<void>(r => s.close(() => r())); return a.port; }
async function main(){
 assert.ok(process.argv.includes("--verify-dev"));await mkdir(out,{recursive:true});
 const env=dotenv.parse(await readFile(process.env.SERRIAN_DEV_ENV_FILE??".env.local")),url=new URL(env.DATABASE_URL);assert.ok(["localhost","127.0.0.1"].includes(url.hostname));assert.equal(url.pathname,"/serrian_tide_dev");assert.equal(url.port||"5432","5432");
 const pool=new pg.Pool({connectionString:env.DATABASE_URL}),base=`http://127.0.0.1:${await freePort()}`,checkout=path.resolve(privateOut,"checkout"),root=path.resolve(path.dirname(path.resolve(process.env.SERRIAN_DEV_ENV_FILE??".env.local")),env.SERRIAN_TERRAIN_ROOT||"storage/world-terrain");
 const sessionId=`pass3-dev-${randomUUID()}`,token=randomUUID()+randomUUID(),log=createWriteStream(`${privateOut}/dev-browser.log`),environment:NodeJS.ProcessEnv={...process.env,...env,NODE_ENV:"production",BETTER_AUTH_URL:base,SERRIAN_TERRAIN_ROOT:root,SERRIAN_TEST_NEXT_DIST_DIR:".next-terrain-pass1",NEXT_TELEMETRY_DISABLED:"1"};
 let server:ChildProcess|undefined,browser:Browser|undefined,page:Page|undefined,verification:{world:string;context:BrowserContext}|undefined,fixtureArchived=false;
 const stop=()=>{if(server?.pid&&server.exitCode===null)execFileSync("taskkill",["/pid",String(server.pid),"/t","/f"],{windowsHide:true,stdio:"ignore"});};
 async function start(){server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",new URL(base).port],{cwd:checkout,env:environment,stdio:["ignore","pipe","pipe"],windowsHide:true});server.stdout!.pipe(log,{end:false});server.stderr!.pipe(log,{end:false});const end=Date.now()+180000;while(true){assert.equal(server.exitCode,null);try{if((await fetch(`${base}/login`)).ok)break;}catch{}assert.ok(Date.now()<end);await new Promise(r=>setTimeout(r,300));}}
 try{
  assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n,137);
  const [owner]=(await pool.query("select w.owner_id id from world w where w.archived_at is null and exists(select 1 from user_role r where r.user_id=w.owner_id and r.role in ('god','admin')) order by w.created_at limit 1")).rows;assert.ok(owner);
  const originalWorlds=(await pool.query("select id,to_jsonb(w) row from world w order by id")).rows;
  const {rowSnapshot}=await import("./worlds-terrain-upgrade.test");const legacyTables=(await pool.query("select tablename from pg_tables where schemaname='public' and tablename ~ '^(town|shop|campaign)(_|$)' order by tablename")).rows.map(r=>r.tablename as string),legacyBefore=await rowSnapshot(pool,legacyTables);
  await pool.query("insert into session(id,expires_at,token,updated_at,user_id,user_agent) values($1,$2,$3,$4,$5,'Pass 3 local DEV verification')",[sessionId,new Date(Date.now()+30*60*1000).toISOString(),token,new Date().toISOString(),owner.id]);
  await start();browser=await chromium.launch({executablePath:process.env.SERRIAN_TEST_CHROME??"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true,args:["--disable-gpu"]});const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const signed=await serializeSignedCookie("better-auth.session_token",token,env.BETTER_AUTH_SECRET,{path:"/"}),cookieValue=signed.split(";")[0].slice("better-auth.session_token=".length);await context.addCookies([{name:"better-auth.session_token",value:cookieValue,url:base,httpOnly:true,sameSite:"Lax"}]);
  async function post<T>(endpoint:string,data:unknown):Promise<T>{const r=await context.request.post(`${base}${endpoint}`,{headers:{Origin:base},data});assert.equal(r.status(),200,await r.text());return r.json();}
  async function get(endpoint:string){const r=await context.request.get(`${base}${endpoint}`);assert.equal(r.status(),200,await r.text());return r.json();}
  const {id:world}=await post<{id:string}>("/api/worlds",{name:"Atlas Pass 3 correction verification - archived engineering fixture"});
  verification={world,context};await writeFile(`${privateOut}/dev-fixture-state.json`,JSON.stringify({world,fixtureArchived:false}));
  const errors:string[]=[];await (await import("./worlds-terrain-generation-browser-checks")).checkGenerationBrowser({browser,god:context,base,world,foreign:world,out,errors,restart:async()=>{stop();await start();}});
  const saved=await get(`/api/worlds/${world}`);await archiveFixture();
  async function archiveFixture(){const r=await context.request.patch(`${base}/api/worlds/${world}`,{headers:{Origin:base},data:{action:"archive",revision:saved.world.revision}});assert.equal(r.status(),200,await r.text());}fixtureArchived=true;await writeFile(`${privateOut}/dev-fixture-state.json`,JSON.stringify({world,fixtureArchived:true}));
  for(const old of originalWorlds)assert.deepEqual((await pool.query("select to_jsonb(w) row from world w where id=$1",[old.id])).rows[0].row,old.row);assert.deepEqual(await rowSnapshot(pool,legacyTables),legacyBefore);assert.deepEqual(errors,[]);
  await writeFile(`${out}/dev-browser-results.json`,JSON.stringify({passed:true,database:"serrian_tide_dev",actualDevHttpWorkflow:true,temporaryOwnerSession:true,ownerDevelopmentServerUntouched:true,ownProductionAppRestarted:true,world,fullGenerationAndImportJourney:true,verificationWorldArchived:true,preexistingWorldsUnchanged:true,legacyCampaignTablesUnchanged:legacyTables.length,productionAccess:false},null,2));console.log("PASS actual DEV generation/import/sculpt/restart and selected-area protection; existing records unchanged; fixture archived");
 }catch(e){await page?.screenshot({path:`${privateOut}/dev-failure.png`,fullPage:true}).catch(()=>{});throw e;}
 finally{if(verification&&!fixtureArchived){try{const {world,context}=verification;const r=await context.request.get(`${base}/api/worlds/${world}`);if(r.ok()){const revision=(await r.json()).world.revision;const a=await context.request.patch(`${base}/api/worlds/${world}`,{headers:{Origin:base},data:{action:"archive",revision}});fixtureArchived=a.ok();await writeFile(`${privateOut}/dev-fixture-state.json`,JSON.stringify({world,fixtureArchived}));}}catch{console.error("Verification fixture cleanup needs review; see private dev-fixture-state.json");}}await browser?.close();stop();log.end();await pool.query("delete from session where id=$1 and token=$2",[sessionId,token]);await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:"DEV verification failed");process.exitCode=1;});
