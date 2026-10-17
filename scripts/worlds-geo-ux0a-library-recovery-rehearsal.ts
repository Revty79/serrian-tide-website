/** Backup/restore only the newly owned full-library fixture and its matching artwork release. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {cp,mkdir,readdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {Pool} from "pg";
import {ownedPool,UX0A_DIRECTORY,ux0aSnapshot} from "./worlds-geo-ux0a-harness";

async function manifest(root:string,relative=""):Promise<{file:string;sha256:string;bytes:number}[]>{
 const result:{file:string;sha256:string;bytes:number}[]=[];for(const item of await readdir(path.join(root,relative),{withFileTypes:true})){assert.ok(!item.isSymbolicLink());const file=path.join(relative,item.name);if(item.isDirectory())result.push(...await manifest(root,file));else{const bytes=await readFile(path.join(root,file));result.push({file:file.replaceAll("\\","/"),bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});}}return result.sort((a,b)=>a.file.localeCompare(b.file));
}
const checkSql="select r.relname table_name,c.conname name,pg_get_constraintdef(c.oid) definition,c.convalidated,c.connoinherit,c.condeferrable,c.condeferred from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and c.contype='c' order by r.relname,c.conname";
const quote=(name:string)=>`"${name.replaceAll('"','""')}"`;
async function readChecks(pool:Pool){const client=await pool.connect();try{await client.query("begin read only");await client.query("set local search_path=''");return (await client.query(checkSql)).rows;}finally{await client.query("rollback");client.release();}}
async function main(){
 const f=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,"library-performance-current.json"),"utf8")),e=f.environment,pool=await ownedPool(e,"empty"),stamp=String(Date.now()),root=path.join(UX0A_DIRECTORY,`library-recovery-${stamp}`),database=`serrian_ux0a_performance_${stamp}`,destination=new URL(e.empty);destination.pathname=`/${database}`;assert.match(database,/^serrian_ux0a_performance_\d+$/);await mkdir(root);
 const bin=process.env.SERRIAN_TEST_PG_BIN??"C:/Program Files/PostgreSQL/18/bin",tool=(name:string)=>path.join(bin,`${name}.exe`),catalog=path.resolve("public/cartography/serrian-atlas-island/1");
 try{
  const sequenceSql="select schemaname,sequencename,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value from pg_sequences where schemaname in ('public','drizzle') order by schemaname,sequencename";
  const schema=(url:string)=>execFileSync(tool("pg_dump"),["--schema-only","--no-owner","--no-acl","--dbname",url],{windowsHide:true,encoding:"utf8",maxBuffer:16*1024*1024}).replace(/^\\(?:un)?restrict\s+.*$/gm,"").replaceAll("\r\n","\n");
  const before=await ux0aSnapshot(pool),ledger=(await pool.query("select * from drizzle.__drizzle_migrations order by id")).rows,functions=(await pool.query("select proname,md5(pg_get_functiondef(oid)) digest from pg_proc where proname like 'world_atlas_%valid' order by proname")).rows,sequences=(await pool.query(sequenceSql)).rows,schemaBefore=schema(e.empty),checksBefore=await readChecks(pool);let schemaCanonical=schemaBefore,normalizedChecks=0;
  const assets=await manifest(e.assetRoot),artwork=await manifest(catalog);await cp(e.assetRoot,path.join(root,"private-assets"),{recursive:true,errorOnExist:true,force:false});await cp(catalog,path.join(root,"artwork-release"),{recursive:true,errorOnExist:true,force:false});
  execFileSync(tool("pg_dump"),["--format=custom","--no-owner","--no-acl","--dbname",e.empty,"--file",path.join(root,"fixture.dump")],{windowsHide:true,stdio:"pipe"});
  await pool.query(`create database "${database}"`);const restored={...e,empty:destination.href};await writeFile(path.join(root,"restore-environment.json"),JSON.stringify(restored,null,2));const sqlFile=path.join(root,"restore.sql");execFileSync(tool("pg_restore"),["--no-owner","--no-acl","--file",sqlFile,path.join(root,"fixture.dump")],{windowsHide:true,stdio:"pipe"});const sql=await readFile(sqlFile,"utf8"),marker="SELECT pg_catalog.set_config('search_path', '', false);";assert.equal(sql.split(marker).length,2);await writeFile(sqlFile,sql.replace(marker,"SELECT pg_catalog.set_config('search_path', 'public, pg_catalog', false);"));execFileSync(tool("psql"),["--no-psqlrc","--single-transaction","--set","ON_ERROR_STOP=1","--dbname",restored.empty,"--file",sqlFile],{windowsHide:true,stdio:"pipe"});
  const check=await ownedPool(restored,"empty");try{
   assert.deepEqual(await ux0aSnapshot(check),before);assert.deepEqual((await check.query("select * from drizzle.__drizzle_migrations order by id")).rows,ledger);assert.deepEqual((await check.query("select proname,md5(pg_get_functiondef(oid)) digest from pg_proc where proname like 'world_atlas_%valid' order by proname")).rows,functions);assert.deepEqual((await check.query(sequenceSql)).rows,sequences);
   const checksAfter=await readChecks(check);assert.equal(checksAfter.length,checksBefore.length);const client=await check.connect();
   try{await client.query("begin");await client.query("set local search_path=''");for(let i=0;i<checksBefore.length;i++){
    const original=checksBefore[i],actual=checksAfter[i];assert.deepEqual({...actual,definition:null},{...original,definition:null});if(original.definition===actual.definition)continue;
    // PostgreSQL reparses CHECKs during restore, flattening associative ANDs and array casts.
    // Round-trip the source expression in an empty temporary copy; never ignore an expression diff.
    await client.query(`create temp table ux0a_constraint_roundtrip (like public.${quote(original.table_name)})`);
    try{await client.query(`alter table pg_temp.ux0a_constraint_roundtrip add constraint ${quote(original.name)} ${original.definition}`);const parsed=(await client.query("select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='pg_temp.ux0a_constraint_roundtrip'::regclass and conname=$1",[original.name])).rows[0].definition;assert.equal(parsed,actual.definition);
     const named=original.name.match(/^[a-z_][a-z0-9_]*$/)?original.name:quote(original.name),line=`    CONSTRAINT ${named} ${original.definition}`;assert.ok(schemaCanonical.includes(line),`Missing dumped CHECK line: ${original.table_name}.${original.name}`);schemaCanonical=schemaCanonical.replace(line,`    CONSTRAINT ${named} ${parsed}`);normalizedChecks++;
    }finally{await client.query("drop table pg_temp.ux0a_constraint_roundtrip");}
   }}finally{await client.query("rollback");client.release();}
   assert.ok(schema(restored.empty)===schemaCanonical,"Restored schema differs beyond PostgreSQL-reparsed CHECK expressions");
  }finally{await check.end();}
  assert.deepEqual(await manifest(path.join(root,"private-assets")),assets);assert.deepEqual(await manifest(path.join(root,"artwork-release")),artwork);assert.deepEqual(await ux0aSnapshot(pool),before);assert.ok(schema(e.empty)===schemaBefore,"Source schema changed");assert.deepEqual((await pool.query(sequenceSql)).rows,sequences);assert.deepEqual(await manifest(e.assetRoot),assets);assert.deepEqual(await manifest(catalog),artwork);
  await writeFile("docs/screenshots/worlds-geo-ux0a/full-library/backup-restore-results.json",JSON.stringify({passed:true,scope:"Only the new service-authored full-library benchmark database, matching public artwork release and task-owned private root. No shared database, surviving backup or deleted Earth used.",source:new URL(e.empty).pathname.slice(1),restored:database,migrations:ledger.length,publicTables:Object.keys(before).length,allPublicRowsExact:true,normalizedSchemaExact:true,checksReparsedByPostgres:normalizedChecks,sequencesExact:sequences.length,schemaSha256:createHash("sha256").update(schemaCanonical).digest("hex"),validatorDefinitionsAndLedgerExact:true,artworkFiles:artwork.length,artworkBytes:artwork.reduce((n,a)=>n+a.bytes,0),privateFiles:assets.length,originalDatabaseAndFilesUnchanged:true,limitation:"This fixture has no attached scientific rasters. Its empty private root is verified as such; this does not establish restoration of an operator's retained scientific archive. Old code is not assumed compatible with saved v2 data; use compatible forward fixes or separately authorized matched recovery."},null,2));console.log("PASS isolated full-library dump/restore, exact table rows/ledger/validators and matching artwork bytes; originals unchanged");
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
