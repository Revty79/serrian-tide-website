import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {restoreTerrainBackup} from "./terrain-backup-restore";

export async function checkRefinementMigration(pool:pg.Pool){
 const url=new URL(process.env.DATABASE_URL!),root=path.dirname(process.env.SERRIAN_TERRAIN_ROOT!);assert.equal(url.hostname,"127.0.0.1");assert.notEqual(url.port,"5432");assert.match(url.pathname,/^\/serrian_atlas_pass[78]$/);const pass=url.pathname.endsWith("8")?"8":"7";assert.ok(root.startsWith(path.join(tmpdir(),`serrian-atlas-pass${pass}-`)));
 const names=(await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r=>String(r.tablename));assert.ok(!names.includes("world_terrain_refinement"));assert.ok(Number((await pool.query("select count(*) n from world_terrain_version")).rows[0].n)>0);
 const snapshot=async(connection:pg.Pool)=>{const rows:Record<string,unknown>={};for(const table of names){assert.match(table,/^[a-z0-9_]+$/);rows[table]=(await connection.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) rows from "${table}" t`)).rows[0].rows;}return rows;},before=await snapshot(pool);
 const bin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin",executable=(name:string)=>path.join(bin,name+".exe"),backup=path.join(root,"populated-through-0136.dump");
 execFileSync(executable("pg_dump"),["--format=custom","--no-owner","--file",backup,url.toString()],{windowsHide:true,stdio:"pipe"});
 const adminUrl=new URL(url);adminUrl.pathname="/postgres";const admin=new pg.Pool({connectionString:adminUrl.toString()});let fresh:pg.Pool|undefined,restored:pg.Pool|undefined;
 try{
  await admin.query("create database serrian_atlas_pass7_fresh");const freshUrl=new URL(url);freshUrl.pathname="/serrian_atlas_pass7_fresh";fresh=new pg.Pool({connectionString:freshUrl.toString()});await migrate(drizzle(fresh),{migrationsFolder:"drizzle"});assert.equal(Number((await fresh.query("select count(*) n from drizzle.__drizzle_migrations")).rows[0].n),139);
  await migrate(drizzle(pool),{migrationsFolder:"drizzle"});assert.deepEqual(await snapshot(pool),before);
  await admin.query("create database serrian_atlas_pass7_restored");const restoredUrl=new URL(url);restoredUrl.pathname="/serrian_atlas_pass7_restored";await restoreTerrainBackup({pgRestore:executable("pg_restore"),psql:executable("psql"),dump:backup,sql:path.join(root,"restore.sql"),host:"127.0.0.1",port:Number(url.port),user:"postgres",database:"serrian_atlas_pass7_restored",env:{...process.env,PGPASSWORD:""}});restored=new pg.Pool({connectionString:restoredUrl.toString()});assert.deepEqual(await snapshot(restored),before);await migrate(drizzle(restored),{migrationsFolder:"drizzle"});assert.deepEqual(await snapshot(restored),before);
  const refs=(await restored.query("select distinct sha256,bytes,encoding from world_terrain_tile")).rows,{readTerrainTile}=await import("../src/features/worlds/terrain-storage");for(const ref of refs)assert.equal((await readTerrainTile(ref)).length,1024);
  await writeFile(`${process.env.SERRIAN_PASS7_EVIDENCE_DIR??"docs/screenshots/worlds-atlas-pass7"}/migration-rehearsal.json`,JSON.stringify({migrations:["0137_world_terrain_refinements","0138_world_terrain_wrapped_refinement"],freshReplay:true,populatedUpgrade:true,backupRestore:true,pairedPrivateObjectsVerified:refs.length,unchangedExistingTables:names.length,existingRowsSha256:createHash("sha256").update(JSON.stringify(before)).digest("hex"),ledger:139,sharedDevSchemaApplied:false,productionAccess:false},null,2)+"\n");console.log("PASS 0137/0138 fresh replay, populated upgrade, owned backup/restore and unchanged existing tables/private tiles");
 }finally{await fresh?.end();await restored?.end();await admin.end();}
}
