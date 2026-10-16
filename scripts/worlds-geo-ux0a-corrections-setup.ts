/** Restore an explicitly receipted, disposable local zero-World baseline. Runs no migrations. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdir,mkdtemp,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import path from "node:path";
import pg from "pg";
import {accounts,ownedPool,UX0A_DIRECTORY,type Environment} from "./worlds-geo-ux0a-harness";

async function port(){const server=createServer();await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address==="object");await new Promise<void>(resolve=>server.close(()=>resolve()));assert.notEqual(address.port,5432);return address.port;}
async function main(){
 const receipt=process.env.SERRIAN_UX0A_SOURCE_RECEIPT;assert.ok(receipt,"An explicit task-owned source receipt is required; .env files are never read");
 const source=JSON.parse(await readFile(receipt,"utf8")) as {disposable:boolean;url:string;data:string};assert.equal(source.disposable,true);
 const url=new URL(source.url);assert.equal(url.hostname,"127.0.0.1");assert.ok(url.port&&url.port!=="5432");assert.ok(path.isAbsolute(source.data));
 await mkdir(UX0A_DIRECTORY,{recursive:true});assert.ok(!existsSync(path.join(UX0A_DIRECTORY,"environment.json")),"Never replace an existing environment receipt");
 const pool=new pg.Pool({connectionString:source.url});let ledger;
 try{
  const identity=(await pool.query("select current_database() name,inet_server_addr()::text host,inet_server_port() port,current_setting('data_directory') data")).rows[0];assert.equal(identity.name,url.pathname.slice(1));assert.equal(identity.host,"127.0.0.1/32");assert.equal(identity.port,Number(url.port));assert.equal(path.resolve(identity.data),path.resolve(source.data));
  assert.deepEqual((await pool.query("select (select count(*) from world)::int worlds,(select count(*) from world_atlas_map)::int maps")).rows[0],{worlds:0,maps:0});
  ledger=(await pool.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at")).rows;
  const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));assert.equal(journal.entries.length,133);assert.equal(ledger.length,133);
  for(let i=0;i<ledger.length;i++){assert.equal(ledger[i].hash,createHash("sha256").update(await readFile(`drizzle/${journal.entries[i].tag}.sql`)).digest("hex"));assert.equal(Number(ledger[i].created_at),journal.entries[i].when);}
 }finally{await pool.end();}
 const stamp=String(Date.now()),cluster=await mkdtemp(path.join(UX0A_DIRECTORY,"cluster-")),dbPort=await port(),appPort=await port();assert.notEqual(dbPort,appPort);
 const e:Environment={root:UX0A_DIRECTORY,cluster,data:path.join(cluster,"data"),port:dbPort,appPort,stamp,empty:`postgresql://postgres@127.0.0.1:${dbPort}/serrian_ux0a_empty_${stamp}`,compat:`postgresql://postgres@127.0.0.1:${dbPort}/serrian_ux0a_compat_${stamp}`,legacy:path.join(UX0A_DIRECTORY,"legacy-checkout"),assetRoot:path.join(UX0A_DIRECTORY,"private-assets"),users:{owner:`ux0a-owner-${stamp}`,foreign:`ux0a-other-${stamp}`,admin:`ux0a-admin-${stamp}`,player:`ux0a-player-${stamp}`}};
 const bin=process.env.SERRIAN_TEST_PG_BIN;assert.ok(bin);const tool=(name:string)=>path.join(bin,name+(process.platform==="win32"?".exe":"")),dump=path.join(cluster,"zero-world-baseline.dump");
 execFileSync(tool("pg_dump"),["--dbname",source.url,"--format=custom","--no-owner","--no-acl","--file",dump],{stdio:"pipe"});
 execFileSync(tool("initdb"),["-D",e.data,"-U","postgres","-A","trust","--encoding=UTF8","--locale=C"],{stdio:"pipe"});
 execFileSync(tool("pg_ctl"),["-D",e.data,"-l",path.join(cluster,"postgres.log"),"-o",`-h 127.0.0.1 -p ${dbPort} -k ${cluster}`,"-w","start"],{stdio:"ignore"});
 const admin=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${dbPort}/postgres`});try{await admin.query(`create database "serrian_ux0a_empty_${stamp}"`);}finally{await admin.end();}
 execFileSync(tool("pg_restore"),["--dbname",e.empty,"--no-owner","--no-acl","--exit-on-error",dump],{stdio:"pipe"});
 const restored=await ownedPool(e,"empty");try{assert.deepEqual((await restored.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at")).rows,ledger);await accounts(restored,e);}finally{await restored.end();}
 await mkdir(e.assetRoot,{recursive:true});await writeFile(path.join(UX0A_DIRECTORY,"environment.json"),JSON.stringify(e,null,2));
 await writeFile(path.join(UX0A_DIRECTORY,"corrections-setup-results.json"),JSON.stringify({passed:true,initial:{worlds:0,maps:0},migrationLedgerEntries:133,allCommittedMigrationHashesExact:true,migrationsExecuted:0,source:"Explicitly receipted disposable Cloud zero-World baseline; no owner/shared service or production backup",legacyUpgradeRerun:false},null,2));
 console.log("PASS owned zero-World correction cluster restored; 133 exact ledger entries; zero migrations executed");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
