import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdir,cp,readFile,readdir,stat,writeFile} from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {restoreTerrainBackup} from "./terrain-backup-restore";
import {publicTableDigests} from "./worlds-collaboration-fixture";
async function files(root:string){const result=[];for(const name of(await readdir(root,{recursive:true})).sort()){const file=path.join(root,name);if((await stat(file)).isFile()){const bytes=await readFile(file);result.push({name,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});}}return result;}
export async function resolutionPairedRestore(f:RegionalFixture){
 const out=path.join(f.out,"a4-paired"),source=new URL(f.databaseUrl),target=new URL(f.restoredUrl);assert.equal(source.hostname,"127.0.0.1");assert(!["5432","5433"].includes(source.port));assert.equal(target.pathname,"/serrian_regional_editing_restored");assert.equal(source.port,target.port);assert.equal(source.pathname,"/serrian_regional_editing");await mkdir(out,{recursive:true});
 const roots={terrain:f.terrainRoot,artwork:path.join(f.root,"artwork"),raster:path.join(f.root,"raster")},before:Record<string,Awaited<ReturnType<typeof files>>>={};for(const [kind,root]of Object.entries(roots)){await mkdir(root,{recursive:true});before[kind]=await files(root);await cp(root,path.join(out,kind),{recursive:true});assert.deepEqual(await files(path.join(out,kind)),before[kind]);}
 const rowsBefore=await publicTableDigests(f.pool),dump=path.join(out,"database.dump");f.runPostgres("pg_dump",["--format=custom","--no-owner","--file",dump,f.databaseUrl]);
 const empty=new pg.Pool({connectionString:f.restoredUrl});try{assert.equal((await empty.query("select count(*)::int n from pg_tables where schemaname in('public','drizzle')")).rows[0].n,0,"Restore only a newly owned empty database");}finally{await empty.end();}
 const bin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin",exe=(name:string)=>path.join(bin,name+(process.platform==="win32"?".exe":""));await restoreTerrainBackup({pgRestore:exe("pg_restore"),psql:exe("psql"),dump,sql:path.join(out,"complete-restore.sql"),host:"127.0.0.1",port:Number(target.port),user:"postgres",database:"serrian_regional_editing_restored",streaming:true,singleTransaction:true});
 const restoredRoots:Record<string,string>={};for(const kind of Object.keys(roots)){const root=path.join(f.root,"a4-restored-"+kind);await cp(path.join(out,kind),root,{recursive:true});assert.deepEqual(await files(root),before[kind]);restoredRoots[kind]=root;}
 const restored=new pg.Pool({connectionString:f.restoredUrl});try{assert.deepEqual(await publicTableDigests(restored),rowsBefore);}finally{await restored.end();}
 const expected=path.join(f.out,"a4-browser/expected-native-sources.json"),receipt=path.join(out,"fresh-readers.json");execFileSync(process.execPath,["--conditions=react-server","--import","tsx","scripts/worlds-resolution-a4-restored.ts",expected,receipt],{windowsHide:true,stdio:"pipe",timeout:600000,env:{...process.env,DATABASE_URL:f.restoredUrl,SERRIAN_TERRAIN_ROOT:restoredRoots.terrain,SERRIAN_ASSET_ROOT:restoredRoots.artwork,SERRIAN_RASTER_ROOT:restoredRoots.raster}});
 assert.deepEqual(await publicTableDigests(f.pool),rowsBefore);for(const [kind,root]of Object.entries(roots))assert.deepEqual(await files(root),before[kind]);
 await writeFile(path.join(out,"results.json"),JSON.stringify({passed:true,allPublicTablesExact:Object.keys(rowsBefore).length,files:Object.fromEntries(Object.entries(before).map(([kind,list])=>[kind,{count:list.length,bytes:list.reduce((n,f)=>n+f.bytes,0)}])),pairedThreeRoots:true,freshNativeReaderReceipt:JSON.parse(await readFile(receipt,"utf8")),sourceRowsAndFilesUnchanged:true,restoreTriggersEnabled:true,singleTransaction:true,sharedAccess:false},null,2));
}
