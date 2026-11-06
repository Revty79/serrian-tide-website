/** Clone a stopped Stage 7A owned fixture; never resume or modify its source cluster. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {access,cp,mkdir,mkdtemp,readFile,readdir,copyFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import pg from "pg";
import {ownedFreePort,type RegionalFixture} from "./worlds-regional-editing-fixture";
async function main(){
  const source=path.resolve(process.env.SERRIAN_HISTORY_SOURCE_EVIDENCE??"artifacts/history-s7a-database-region-pins-1"),
    out=path.resolve(process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE??"artifacts/history-s7a-browser-smoke-1"),prefix=path.resolve("artifacts/history-s7a-");
  assert.ok(source.startsWith(path.resolve("artifacts")+path.sep)&&/^history-s7a-/.test(path.basename(source))&&out.startsWith(prefix)&&source!==out);
  const old=JSON.parse(await readFile(path.join(source,"environment.json"),"utf8")),url=new URL(old.databaseUrl),
    sourceRoot=path.resolve(old.root),sourceData=path.resolve(old.data);
  assert.equal(url.hostname,"127.0.0.1");assert.notEqual(url.port,"5432");
  assert.ok(sourceRoot.startsWith(path.join(source,"owned-temp")+path.sep));
  assert.equal(sourceData,path.join(sourceRoot,"data"));
  assert.equal(await access(path.join(sourceData,"postmaster.pid")).then(()=>true,()=>false),false,"Never clone a running cluster");
  await mkdir(path.join(out,"owned-temp"),{recursive:true});process.env.TEMP=path.join(out,"owned-temp");process.env.TMP=process.env.TEMP;
  const root=await mkdtemp(path.join(tmpdir(),"serrian-history-browser-")),data=path.join(root,"data"),terrainRoot=path.join(root,"terrain"),artwork=path.join(root,"private-artwork");
  await cp(sourceData,data,{recursive:true});await cp(old.terrainRoot,terrainRoot,{recursive:true});const missingArtwork=await access(path.join(sourceRoot,"private-artwork")).then(()=>false,()=>true);if(missingArtwork)await mkdir(artwork,{recursive:true});else await cp(path.join(sourceRoot,"private-artwork"),artwork,{recursive:true});
  for(const name of await readdir(source))if(/\.(json|png|webp)$/.test(name))await copyFile(path.join(source,name),path.join(out,name));
  const port=await ownedFreePort();url.port=String(port);const restored=new URL(old.restoredUrl);restored.port=String(port);
  const bin="C:/Program Files/PostgreSQL/18/bin",runPostgres=(name:string,args:string[])=>execFileSync(path.join(bin,name+".exe"),args,{windowsHide:true,stdio:"ignore"});
  let started=false;const pool=new pg.Pool({connectionString:url.toString()});
  try{
    runPostgres("pg_ctl",["-D",data,"-l",path.join(root,"postgres.log"),"-o","-h 127.0.0.1 -p "+port,"-w","start"]);started=true;
    const {drizzle}=await import("drizzle-orm/node-postgres"),{migrate}=await import("drizzle-orm/node-postgres/migrator");await migrate(drizzle(pool),{migrationsFolder:"drizzle"});if(missingArtwork)assert.equal((await pool.query("select count(*)::int n from atlas_asset")).rows[0].n,0,"A populated private library must have its paired source files");
    process.env.DATABASE_URL=url.toString();process.env.SERRIAN_TERRAIN_ROOT=terrainRoot;process.env.SERRIAN_ASSET_ROOT=artwork;
    if(process.env.SERRIAN_HISTORY_INHERITED==="1")delete process.env.SERRIAN_HISTORY_BROWSER;else process.env.SERRIAN_HISTORY_BROWSER="1";process.env.SERRIAN_UNDERGROUND_BROWSER="production";
    process.env.SERRIAN_HISTORY_CHECKOUT??="artifacts/history-s7a-validation-smoke-1";
    const f:RegionalFixture={...old,root,data,databaseUrl:url.toString(),restoredUrl:restored.toString(),terrainRoot,restoredTerrainRoot:path.join(root,"restored-terrain"),out,pool,runPostgres};
    await writeFile(path.join(out,"environment.json"),JSON.stringify({...f,pool:undefined,runPostgres:undefined,clonedFrom:source},null,2));
    if(process.env.SERRIAN_HISTORY_OWNED_CHECK){
      const mode=process.env.SERRIAN_HISTORY_OWNED_CHECK,timelineId=(await pool.query("select id from world_timeline where world_id=$1 and is_primary",[f.world])).rows[0].id;
      if(mode==="floor-create")await(await import("./worlds-history-floor-creation-checks")).validateNativeFloorCreation(f,timelineId);
      else if(mode==="underground-create")await(await import("./worlds-history-underground-creation-checks")).validateNativeUndergroundCreation(f,timelineId);
      else if(mode==="craft-create")await(await import("./worlds-history-craft-creation-checks")).validateNativeCraftCreation(f,timelineId);
      else if(mode==="floor-routes")await(await import("./worlds-history-floor-route-checks")).validateNativeFloorRoutes(f,timelineId);
      else if(mode==="craft-routes")await(await import("./worlds-history-craft-route-checks")).validateNativeCraftRoutes(f,timelineId);
      else if(mode==="territories")await(await import("./worlds-history-territory-checks")).validateNativeTerritories(f,timelineId);
      else if(mode==="craft-copy")await(await import("./worlds-history-craft-copy-checks")).validateNativeCraftCopy(f,timelineId);
      else if(mode==="contexts")await(await import("./worlds-native-history-context-checks")).validateNativeWorldContexts(f,timelineId);
      else if(mode==="inherited-fixtures")await(await import("./worlds-native-history-inherited")).seedNativeHistoryInherited(f);
      else if(mode==="ledger"){
        const {createHash}=await import("node:crypto"),sha256=createHash("sha256").update(await readFile("drizzle/0158_native_map_history.sql")).digest("hex"),ledger=(await pool.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at")).rows;assert.equal(ledger.length,159);assert.equal(ledger.at(-1)!.hash,sha256,"The owned target applied the exact final LF-pinned migration bytes");
        const definition=(await pool.query("select pg_get_functiondef('world_building_interior_source_guard()'::regprocedure) definition")).rows[0].definition as string;assert.ok(definition.includes("world_map_state_component_ref")&&definition.includes("Interior sources must reference a saved building in the same Town and World"));
        await writeFile(path.join(out,"native-final-ledger.json"),JSON.stringify({passed:true,entries:ledger.length,finalMigration:"0158_native_map_history",exactMigrationSha256:sha256,nativeAndLegacyInteriorGuardsPresent:true,source,sharedDatabaseAccess:false},null,2));
      }
      else if(mode==="restore")await(await import("./worlds-native-history-restore")).validateNativePairedRestore(f);
      else if(mode==="added-building")await(await import("./worlds-native-history-added-building-checks")).validateNativeAddedBuilding(f);
      else if(mode==="linked-families")await(await import("./worlds-native-history-linked-families-checks")).validateNativeLinkedFamilies(f,timelineId);
      else if(mode==="native-families"){
        await(await import("./worlds-history-underground-creation-checks")).validateNativeUndergroundCreation(f,timelineId);
        await(await import("./worlds-history-craft-creation-checks")).validateNativeCraftCreation(f,timelineId);
        await(await import("./worlds-history-floor-route-checks")).validateNativeFloorRoutes(f,timelineId);
        await(await import("./worlds-history-craft-route-checks")).validateNativeCraftRoutes(f,timelineId);
        await(await import("./worlds-history-craft-copy-checks")).validateNativeCraftCopy(f,timelineId);
      }
      else if(mode==="lifecycle"){await(await import("./worlds-history-lifecycle-checks")).validateNativeLifecycle(f,timelineId);await(await import("./worlds-history-floor-route-checks")).validateNativeFloorRoutes(f,timelineId);}
      else assert.fail("Choose an explicitly supported owned extension check");
      await writeFile(path.join(out,"owned-extension.json"),JSON.stringify({passed:true,mode,source,copiedPriorReceiptsFrom:source,priorReceiptsAreSeparateEvidence:true,sharedDatabaseAccess:false},null,2));
    }else {if(process.env.SERRIAN_HISTORY_NARRATIVE_BROWSER==="1")await(await import("./worlds-native-history-narrative-browser")).seedNativeNarrative(f);if(process.env.SERRIAN_HISTORY_INHERITED==="1")await(await import("./worlds-native-history-inherited")).seedNativeHistoryInherited(f);await(await import("./worlds-underground-browser")).undergroundBrowser(f);}
  }finally{if(process.env.DATABASE_URL===url.toString()){const appPool=(await import("../src/db")).pool;if(!appPool.ended)await appPool.end();}await pool.end();if(started)runPostgres("pg_ctl",["-D",data,"-m","fast","-w","stop"]);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
