/** Clone a stopped Stage 6D owned fixture; never resume or modify its source cluster. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {access,cp,mkdir,mkdtemp,readFile,readdir,copyFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import pg from "pg";
import {ownedFreePort,type RegionalFixture} from "./worlds-regional-editing-fixture";
async function main(){
  const source=path.resolve(process.env.SERRIAN_ADVANCED_SOURCE_EVIDENCE??"artifacts/terrain-s6d-database-7"),
    out=path.resolve(process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE??"artifacts/terrain-s6d-browser-8"),prefix=path.resolve("artifacts/terrain-s6d-");
  assert.ok(source.startsWith(path.resolve("artifacts")+path.sep)&&/^(terrain-s6d-|templates-s6c-|crafts-s6b-|atlas-s6a-)/.test(path.basename(source))&&out.startsWith(prefix)&&source!==out);
  const old=JSON.parse(await readFile(path.join(source,"environment.json"),"utf8")),url=new URL(old.databaseUrl),
    sourceRoot=path.resolve(old.root),sourceData=path.resolve(old.data);
  assert.equal(url.hostname,"127.0.0.1");assert.notEqual(url.port,"5432");
  assert.ok(sourceRoot.startsWith(path.join(source,"owned-temp")+path.sep));
  assert.equal(sourceData,path.join(sourceRoot,"data"));
  assert.equal(await access(path.join(sourceData,"postmaster.pid")).then(()=>true,()=>false),false,"Never clone a running cluster");
  await mkdir(path.join(out,"owned-temp"),{recursive:true});process.env.TEMP=path.join(out,"owned-temp");process.env.TMP=process.env.TEMP;
  const root=await mkdtemp(path.join(tmpdir(),"serrian-regional-editing-advanced-")),data=path.join(root,"data"),terrainRoot=path.join(root,"terrain"),artwork=path.join(root,"private-artwork");
  await cp(sourceData,data,{recursive:true});await cp(old.terrainRoot,terrainRoot,{recursive:true});const missingArtwork=await access(path.join(sourceRoot,"private-artwork")).then(()=>false,()=>true);if(missingArtwork)await mkdir(artwork,{recursive:true});else await cp(path.join(sourceRoot,"private-artwork"),artwork,{recursive:true});
  for(const name of await readdir(source))if(/\.(json|png|webp)$/.test(name))await copyFile(path.join(source,name),path.join(out,name));
  const port=await ownedFreePort();url.port=String(port);const restored=new URL(old.restoredUrl);restored.port=String(port);
  const bin="C:/Program Files/PostgreSQL/18/bin",runPostgres=(name:string,args:string[])=>execFileSync(path.join(bin,name+".exe"),args,{windowsHide:true,stdio:"ignore"});
  let started=false;const pool=new pg.Pool({connectionString:url.toString()});
  try{
    runPostgres("pg_ctl",["-D",data,"-l",path.join(root,"postgres.log"),"-o","-h 127.0.0.1 -p "+port,"-w","start"]);started=true;
    const {drizzle}=await import("drizzle-orm/node-postgres"),{migrate}=await import("drizzle-orm/node-postgres/migrator");await migrate(drizzle(pool),{migrationsFolder:"drizzle"});if(missingArtwork)assert.equal((await pool.query("select count(*)::int n from atlas_asset")).rows[0].n,0,"A populated private library must have its paired source files");
    process.env.DATABASE_URL=url.toString();process.env.SERRIAN_TERRAIN_ROOT=terrainRoot;process.env.SERRIAN_ASSET_ROOT=artwork;
    if(!process.env.SERRIAN_ADVANCED_INHERITED)process.env.SERRIAN_ADVANCED_TERRAIN_BROWSER="production";process.env.SERRIAN_UNDERGROUND_BROWSER="production";
    process.env.SERRIAN_ADVANCED_TERRAIN_CHECKOUT??="artifacts/terrain-s6d-validation-final-v5";
    const f:RegionalFixture={...old,root,data,databaseUrl:url.toString(),restoredUrl:restored.toString(),terrainRoot,restoredTerrainRoot:path.join(root,"restored-terrain"),out,pool,runPostgres};
    await writeFile(path.join(out,"environment.json"),JSON.stringify({...f,pool:undefined,runPostgres:undefined,clonedFrom:source},null,2));
    await(await import("./worlds-underground-browser")).undergroundBrowser(f);
  }finally{if(process.env.DATABASE_URL===url.toString()){const appPool=(await import("../src/db")).pool;if(!appPool.ended)await appPool.end();}await pool.end();if(started)runPostgres("pg_ctl",["-D",data,"-m","fast","-w","stop"]);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
