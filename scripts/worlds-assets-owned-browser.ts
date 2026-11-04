/** Resume only a cluster created by this Stage 6A task; never accepts arbitrary database URLs. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdir,readFile,writeFile,copyFile,realpath} from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {ownedFreePort,type RegionalFixture} from "./worlds-regional-editing-fixture";
import {assetsBrowser} from "./worlds-assets-browser";
async function main(){
 const source=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);assert.ok(source.startsWith(path.resolve("artifacts")+path.sep)&&path.basename(source).startsWith("atlas-s6a-"));assert.ok(out.startsWith(path.resolve("artifacts")+path.sep)&&path.basename(out).startsWith("atlas-s6a-"));assert.notEqual(source,out);
 const saved=JSON.parse(await readFile(path.join(source,"environment.json"),"utf8")),receipt=JSON.parse(await readFile(path.join(source,"assets-database.json"),"utf8"));assert.equal(receipt.passed,true);assert.ok((await realpath(saved.data)).startsWith(await realpath(source)+path.sep));assert.equal(new URL(saved.databaseUrl).hostname,"127.0.0.1");assert.equal(new URL(saved.databaseUrl).pathname,"/serrian_regional_editing");assert.ok((await realpath(receipt.ownedAssetRoot)).startsWith(await realpath(source)+path.sep));
 await mkdir(out,{recursive:true});for(const file of ["assets-database.json","reference.png","symbol.webp"])await copyFile(path.join(source,file),path.join(out,file));const port=await ownedFreePort(),bin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin",runPostgres=(name:string,args:string[])=>{execFileSync(path.join(bin,name+".exe"),args,{windowsHide:true,stdio:name==="pg_ctl"?"ignore":"pipe",maxBuffer:32*1024*1024});};
 let started=false,pool:pg.Pool|undefined;try{runPostgres("pg_ctl",["-D",saved.data,"-l",path.join(out,"owned-postgres.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","start"]);started=true;const databaseUrl=`postgresql://postgres@127.0.0.1:${port}/serrian_regional_editing`;process.env.DATABASE_URL=databaseUrl;process.env.SERRIAN_TERRAIN_ROOT=saved.terrainRoot;process.env.SERRIAN_ASSET_ROOT=receipt.ownedAssetRoot;pool=new pg.Pool({connectionString:databaseUrl});const f:RegionalFixture={...saved,out,databaseUrl,restoredUrl:`postgresql://postgres@127.0.0.1:${port}/serrian_regional_editing_restored`,pool,runPostgres};await writeFile(path.join(out,"environment.json"),JSON.stringify({...f,pool:undefined,runPostgres:undefined,resumedOwnedFixture:source},null,2));await assetsBrowser(f);}finally{await pool?.end();if(process.env.DATABASE_URL)await(await import("../src/db")).pool.end();if(started)runPostgres("pg_ctl",["-D",saved.data,"-m","fast","-w","stop"]);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
