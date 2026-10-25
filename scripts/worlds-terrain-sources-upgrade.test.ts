/** Populated 0135 -> 0136 proof, including a real pre-existing painted tile. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID,createHash} from "node:crypto";
import {mkdir,mkdtemp,readFile,writeFile,copyFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createServer} from "node:net";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {rowSnapshot} from "./worlds-terrain-upgrade.test";
async function main(){
 const root=await mkdtemp(path.join(tmpdir(),"serrian-sources-upgrade-")),data=path.join(root,"data"),old=path.join(root,"migrations");await mkdir(path.join(old,"meta"),{recursive:true});
 const server=createServer();await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const a=server.address();assert.ok(a&&typeof a==="object");const port=a.port;await new Promise<void>(r=>server.close(()=>r()));assert.notEqual(port,5432);
 const bin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin",run=(tool:string,args:string[])=>execFileSync(path.join(bin,`${tool}.exe`),args,{windowsHide:true,stdio:tool==="pg_ctl"?"ignore":"pipe"});
 const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));journal.entries=journal.entries.filter((e:{idx:number})=>e.idx<=135);await writeFile(path.join(old,"meta/_journal.json"),JSON.stringify(journal));for(const e of journal.entries)await copyFile(`drizzle/${e.tag}.sql`,path.join(old,`${e.tag}.sql`));
 let started=false,pool:pg.Pool|undefined,appPool:pg.Pool|undefined;
 try{
  run("initdb",["-D",data,"-U","postgres","-A","trust","--encoding=UTF8","--locale=C"]);run("pg_ctl",["-D",data,"-l",path.join(root,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","start"]);started=true;
  const admin=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${port}/postgres`});await admin.query("create database sources_upgrade");await admin.end();const url=`postgresql://postgres@127.0.0.1:${port}/sources_upgrade`;pool=new pg.Pool({connectionString:url});await migrate(drizzle(pool),{migrationsFolder:old});
  await pool.query(`insert into "user"(id,name,email,email_verified) values('upgrade-owner','Disposable owner','upgrade@example.invalid',true)`);await pool.query("insert into user_role(user_id,role) values('upgrade-owner','god')");process.env.DATABASE_URL=url;process.env.SERRIAN_TERRAIN_ROOT=path.join(root,"terrain");appPool=(await import("../src/db")).pool;
  const {createWorld}=await import("../src/features/worlds/world-service"),{stageTerrainTiles}=await import("../src/features/worlds/terrain-storage");const world=await createWorld("upgrade-owner",{name:"Pre-existing numerical World"}),map=randomUUID(),terrain=randomUUID(),request=randomUUID(),values=Array<number>(1024).fill(1234),[object]=await stageTerrainTiles(request,world,terrain,[{x:0,y:0,samples:values}]);
  await pool.query("BEGIN");try{await pool.query("insert into world_atlas_map(id,world_id,name,scope,map_kind) values($1,$2,'Original painted identity','world','generic')",[map,world]);await pool.query("insert into world_terrain(id,world_id,grid_width,grid_height,width_metres,height_metres,min_elevation,max_elevation,base_elevation,creation_hash) values($1,$2,64,64,100000,100000,-12000,12000,-500,$3)",[terrain,world,"a".repeat(64)]);await pool.query("insert into world_terrain_version(terrain_id,world_id,revision,request_id,content_hash,sea_level,author_id) values($1,$2,1,$3,$4,0,'upgrade-owner')",[terrain,world,request,"a".repeat(64)]);await pool.query("insert into world_terrain_tile(terrain_id,world_id,revision,tile_x,tile_y,sha256,bytes,encoding) values($1,$2,1,0,0,$3,$4,$5)",[terrain,world,object.sha256,object.bytes,object.encoding]);await pool.query("insert into world_map_canvas(map_id,world_id,terrain_id) values($1,$2,$3)",[map,world,terrain]);await pool.query("COMMIT");}catch(e){await pool.query("ROLLBACK");throw e;}
  const before=await rowSnapshot(pool);await migrate(drizzle(pool),{migrationsFolder:"drizzle"});const after=await rowSnapshot(pool);
  for(const [table,column] of [["world_terrain_tile","manual_protection"],["world_terrain_version","source"]]){const rows=(await pool.query(`select coalesce(jsonb_agg(value order by value::text COLLATE "C"),'[]'::jsonb) rows from (select to_jsonb(t)-$1 value from "${table}" t) q`,[column])).rows[0].rows;after[table]=createHash("sha256").update(JSON.stringify(rows)).digest("hex");}assert.deepEqual(after,before);
  const {getTerrain,changeTerrain}=await import("../src/features/worlds/terrain-service"),doc=(await getTerrain("upgrade-owner",world,{mapId:map})).document!;assert.deepEqual(doc.origin,{kind:"legacy"});assert.equal(doc.protection?.[0].mask,"legacy");assert.deepEqual(doc.tiles[0].samples,values);
  const {presetRecipe}=await import("../src/features/worlds/terrain-source");await assert.rejects(changeTerrain("upgrade-owner",world,{action:"save",requestId:randomUUID(),mapId:map,revision:1,seaLevel:0,source:{kind:"regenerated",recipe:presetRecipe("island"),area:{x:0,y:0,width:32,height:32},preserveManual:true,feather:0},tiles:[{x:0,y:0,samples:Array<number>(1024).fill(42)}]}),/protected/);
  const result={passed:true,oldMigrations:136,newMigrations:1,oldTablesUnchanged:Object.keys(before).length,oldPaintedTileUnchanged:true,oldMapIdentityUnchanged:true,legacyRecipeExplicit:true,oldManualTilesProtected:true,sharedDatabaseAccess:false};await mkdir("docs/screenshots/worlds-atlas-pass3",{recursive:true});await writeFile("docs/screenshots/worlds-atlas-pass3/upgrade-results.json",JSON.stringify(result,null,2));console.log("PASS",JSON.stringify(result));
 }finally{await appPool?.end();await pool?.end();if(started)run("pg_ctl",["-D",data,"-m","fast","-w","stop"]);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
