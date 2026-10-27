import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {tmpdir} from "node:os";
import {writeFile} from "node:fs/promises";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {restoreTerrainBackup} from "./terrain-backup-restore";

export async function checkWaterBackup(source:pg.Pool,mapId:string,world:string){
  const url=new URL(process.env.DATABASE_URL!),root=path.dirname(process.env.SERRIAN_TERRAIN_ROOT!);assert.equal(url.hostname,"127.0.0.1");assert.notEqual(url.port,"5432");assert.equal(url.pathname,"/serrian_atlas_s32");assert.ok(root.startsWith(path.join(tmpdir(),"serrian-atlas-s32-")));assert.equal((await source.query("select current_database() name")).rows[0].name,"serrian_atlas_s32");
  const adminUrl=new URL(url);adminUrl.pathname="/postgres";const admin=new pg.Pool({connectionString:adminUrl.toString()}),target=new URL(url);target.pathname="/serrian_atlas_s33b_restored";let restored:pg.Pool|undefined;
  const exe=(name:string)=>path.join(process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin",name+".exe"),snapshot=async(pool:pg.Pool)=>({head:(await pool.query("select * from world_hydrology where map_id=$1",[mapId])).rows,history:(await pool.query("select * from world_hydrology_version where map_id=$1 order by revision",[mapId])).rows});
  try{
    const before=await snapshot(source),dump=path.join(root,"connected-water-complete.dump");assert.equal(before.head[0].layer.systemVersion,2);assert.equal(before.history[0].layer.systemVersion,undefined);
    execFileSync(exe("pg_dump"),["--format=custom","--no-owner","--file",dump,url.toString()],{windowsHide:true,stdio:"pipe"});await admin.query("create database serrian_atlas_s33b_restored");await restoreTerrainBackup({pgRestore:exe("pg_restore"),psql:exe("psql"),dump,sql:path.join(root,"connected-water-complete.sql"),host:"127.0.0.1",port:Number(url.port),user:"postgres",database:"serrian_atlas_s33b_restored"});restored=new pg.Pool({connectionString:target.toString()});assert.deepEqual(await snapshot(restored),before);await assert.rejects(restored.query("delete from world_hydrology_version where map_id=$1",[mapId]),/immutable/);await migrate(drizzle(restored),{migrationsFolder:"drizzle"});assert.deepEqual(await snapshot(restored),before);
    const probe=`const assert=require('node:assert/strict');(async()=>{const service=require('./src/features/worlds/terrain-hydrology-service.ts');const value=await service.getTerrainHydrology('world-god',${JSON.stringify(world)},${JSON.stringify(mapId)});assert.equal(value.layer.systemVersion,2);assert.ok(value.layer.lakes.length>=2);const old=await service.getTerrainHydrology('world-god',${JSON.stringify(world)},${JSON.stringify(mapId)},{revision:1});assert.equal(old.layer.systemVersion,undefined);await require('./src/db/index.ts').pool.end();})().catch(e=>{console.error(e);process.exitCode=1;});`;
    execFileSync(process.execPath,["--conditions=react-server","--import","tsx","-e",probe],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:target.toString()},windowsHide:true,stdio:"pipe",timeout:30000});await writeFile(`${process.env.SERRIAN_PASS8_EVIDENCE_DIR}/water-system-backup.json`,JSON.stringify({passed:true,fullOwnedDatabaseBackupRestore:true,old3AAndConnectedWaterVersionsExact:true,currentHeadsExact:true,immutableHistoryAfterRestore:true,realServiceReadsBothFormats:true,repeatedCurrentMigration:true,newSqlMigration:false,sharedDatabaseWrites:false,productionContacted:false},null,2)+"\n");console.log("PASS complete connected-water backup/restore, exact 3A/extended history, real restored-service reads and repeat migration");
  }finally{await restored?.end();await admin.end();}
}
