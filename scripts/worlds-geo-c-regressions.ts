/** Clone the stopped Geo A evidence database; preserve its receipts and rows. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync} from "node:fs";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import pg from "pg";
import {chromium} from "playwright-core";
import {databaseSnapshot,preservedRows,taskServer,stopServer,freePort} from "./worlds-geo-c.test";
import {geoFixture,geoServices,geoBrowser,geoBrowserSupplement,type GeoFixture} from "./worlds-geo-a-checks";
import type {LivingFixture} from "./worlds-living-history-checks";
const directory="artifacts/guidance/geo-c/regressions",bin="C:/Program Files/PostgreSQL/18/bin";
type Regression={database:string;databaseUrl:string;geo:GeoFixture;journey:LivingFixture};
async function main(){
  await mkdir(directory,{recursive:true});const old=JSON.parse(await readFile("artifacts/guidance/geo-a/environment.json","utf8")),geoB=JSON.parse(await readFile("artifacts/guidance/geo-c/environment.json","utf8"));
  assert.equal(path.dirname(path.resolve(old.temporaryRoot)),path.resolve(tmpdir()));assert.ok(path.basename(old.temporaryRoot).startsWith("serrian-worlds-linking-"));assert.equal(path.resolve(old.data),path.join(path.resolve(old.temporaryRoot),"data"));assert.match(old.databaseUrl,new RegExp(`^postgresql://postgres@127\\.0\\.0\\.1:${old.dbPort}/serrian_geo_a_[0-9]+$`));assert.ok(!existsSync(path.join(old.data,"postmaster.pid")));
  const originalReceipt=await readFile("artifacts/guidance/geo-a/environment.json");let template:pg.Pool|undefined=new pg.Pool({connectionString:old.databaseUrl});let pool:pg.Pool|undefined,app:typeof import("../src/db")|undefined,started=false;
  try{
    execFileSync(path.join(bin,"pg_ctl.exe"),["-D",old.data,"-l",path.join(old.temporaryRoot,"postgres.log"),"-o",`-p ${old.dbPort} -h 127.0.0.1`,"-w","start"],{windowsHide:true,stdio:"ignore"});started=true;
    const before=await databaseSnapshot(template),admin=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${old.dbPort}/postgres`});let e:Regression;
    try{if(process.argv.includes("--resume"))e=JSON.parse(await readFile(`${directory}/environment.json`,"utf8"));else{const database=`serrian_geo_c_regressions_${Date.now()}`,templateName=new URL(old.databaseUrl).pathname.slice(1);assert.match(templateName,/^serrian_geo_a_[0-9]+$/);await template.end();template=undefined;await admin.query(`create database "${database}" template "${templateName}"`);e={database,databaseUrl:`postgresql://postgres@127.0.0.1:${old.dbPort}/${database}`,geo:null as unknown as GeoFixture,journey:old.journey};await writeFile(`${directory}/environment.json`,JSON.stringify(e,null,2));}}finally{await admin.end();}
    assert.match(e!.database,/^serrian_geo_c_regressions_\d+$/);assert.equal(e!.databaseUrl,`postgresql://postgres@127.0.0.1:${old.dbPort}/${e!.database}`);pool=new pg.Pool({connectionString:e!.databaseUrl});process.env.DATABASE_URL=e!.databaseUrl;app=await import("../src/db");
    if(!e!.geo){e!.geo=await geoFixture(pool,directory);await writeFile(`${directory}/environment.json`,JSON.stringify(e!,null,2));}
    if(!process.argv.includes("--browser-only"))await geoServices(pool,e!.geo,e!.journey,directory);
    geoB.appPort=await freePort();geoB.baseUrl=`http://127.0.0.1:${geoB.appPort}`;
    if(!process.argv.includes("--services-only")){
      const running=await taskServer(geoB,e!.databaseUrl);try{const browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});try{await geoBrowser(browser,geoB.baseUrl,e!.geo,directory);await geoBrowserSupplement(browser,geoB.baseUrl,e!.geo,directory);}finally{await browser.close();}}finally{stopServer(running.server);running.log.end();}
    }
    preservedRows(before,await databaseSnapshot(pool));const original=new pg.Pool({connectionString:old.databaseUrl});try{assert.deepEqual(await databaseSnapshot(original),before);}finally{await original.end();}assert.deepEqual(await readFile("artifacts/guidance/geo-a/environment.json"),originalReceipt);await writeFile(`${directory}/preservation-results.json`,JSON.stringify({originalGeoAEvidenceDatabaseUnchanged:true,originalReceiptUnchanged:true,completedHistoricalFixturesPreserved:true},null,2));
    console.log("PASS original Geo A/Phase 6 evidence and all retained historical fixture rows preserved");
  }finally{if(app)await app.pool.end();if(pool)await pool.end();if(template)await template.end();if(started)execFileSync(path.join(bin,"pg_ctl.exe"),["-D",old.data,"-m","fast","-w","stop"],{windowsHide:true,stdio:"ignore"});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
