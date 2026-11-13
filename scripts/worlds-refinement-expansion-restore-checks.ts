/** Exact restoration only into the regional fixture's new empty database. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {cp,mkdir,readdir,readFile,stat,writeFile} from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {publicTableDigests} from "./worlds-collaboration-fixture";
import {restoreTerrainBackup} from "./terrain-backup-restore";

export async function checkExpandedRestore(f:RegionalFixture){
 const source=new URL(f.databaseUrl),target=new URL(f.restoredUrl);assert.equal(source.hostname,"127.0.0.1");assert.equal(target.hostname,source.hostname);assert.equal(target.port,source.port);assert(!["5432","5433"].includes(target.port));assert.equal(target.pathname,"/serrian_regional_editing_restored");
 const expected=await publicTableDigests(f.pool),dump=path.join(f.out,"expanded-independent.dump");f.runPostgres("pg_dump",["-Fc","-f",dump,"--dbname",f.databaseUrl]);
 const restored=new pg.Pool({connectionString:f.restoredUrl});try{
  assert.equal((await restored.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n,0);
  const bin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin",exe=(name:string)=>path.join(bin,name+(process.platform==="win32"?".exe":""));
  await restoreTerrainBackup({pgRestore:exe("pg_restore"),psql:exe("psql"),dump,sql:path.join(f.out,"expanded-restored.sql"),host:target.hostname,port:Number(target.port),user:target.username,database:target.pathname.slice(1),singleTransaction:true,streaming:true});
  assert.deepEqual(await publicTableDigests(restored),expected);assert.equal((await restored.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n,164);assert((await restored.query("select count(*)::int n from world_terrain_refinement_geometry")).rows[0].n>=4);
 }finally{await restored.end();}
 const roots=[f.terrainRoot,process.env.SERRIAN_ASSET_ROOT!,process.env.SERRIAN_RASTER_ROOT!],storage:Record<string,number>={};
 async function files(root:string){const result:Record<string,string>={};await mkdir(root,{recursive:true});for(const name of (await readdir(root,{recursive:true})).sort()){const file=path.join(root,name);if((await stat(file)).isFile())result[name]=createHash("sha256").update(await readFile(file)).digest("hex");}return result;}
 for(const [n,root]of roots.entries()){assert(path.resolve(root).startsWith(path.resolve(f.root)+path.sep));const before=await files(root),copy=path.join(f.out,"restored-roots",String(n));await cp(root,copy,{recursive:true,errorOnExist:true,force:false});assert.deepEqual(await files(copy),before);assert.deepEqual(await files(root),before);storage[String(n)]=Object.keys(before).length;}
 await writeFile(path.join(f.out,"expansion-restore-results.json"),JSON.stringify({passed:true,exactPublicTables:Object.keys(expected).length,migrations:164,threeRootsExact:storage,oldAndNewGeometryRetained:true,sharedEnvironmentAccess:false},null,2));
}
