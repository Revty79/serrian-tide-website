/** Real read-only bootstrap probe against a separate empty owned PG18 database. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
export async function checkExpansionBootstrap(f:RegionalFixture){
 const target=new URL(f.databaseUrl);assert.equal(target.hostname,"127.0.0.1");assert(!["5432","5433"].includes(target.port));target.pathname="/serrian_expansion_bootstrap_empty";await f.pool.query("create database serrian_expansion_bootstrap_empty");
 const pool=new pg.Pool({connectionString:target.toString()}),original=process.env.DATABASE_URL;
 try{
  await migrate(drizzle(pool),{migrationsFolder:"drizzle"});const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8")),ledger=[];
  for(const e of journal.entries){const bytes=await readFile(`drizzle/${e.tag}.sql`),lf=bytes.toString().replaceAll("\r\n","\n"),hash=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");ledger.push({timestamp:String(e.when),hashes:[...new Set([hash(bytes),hash(lf),hash(lf.replaceAll("\n","\r\n"))])]});}
  const {databaseProbe}=await import("../ops/bootstrap-probe.mjs"),expected={name:target.pathname.slice(1),role:target.username,port:Number(target.port),ledger};process.env.DATABASE_URL=target.toString();
  const accepted=await databaseProbe(expected);assert.equal(accepted.migrations,164);assert(accepted.readOnly);assert(Object.values(accepted.records).every(n=>n===0));
  await assert.rejects(databaseProbe({...expected,ledger:ledger.slice(0,163)}),/BOOTSTRAP_MIGRATION_REQUIRED/);
  const altered=structuredClone(ledger);altered[163].hashes=["0".repeat(64)];await assert.rejects(databaseProbe({...expected,ledger:altered}),/BOOTSTRAP_MIGRATION_HASH/);
  const extra={timestamp:String(Number(ledger.at(-1)!.timestamp)+1),hashes:["b".repeat(64)]},row=(await pool.query("insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2) returning id",[extra.hashes[0],extra.timestamp])).rows[0];
  try{await assert.rejects(databaseProbe({...expected,ledger:[...ledger,extra]}),/BOOTSTRAP_MIGRATION_REQUIRED/);}finally{await pool.query("delete from drizzle.__drizzle_migrations where id=$1",[row.id]);}
  await writeFile(path.join(f.out,"expansion-bootstrap-results.json"),JSON.stringify({passed:true,actualEmptyPg18Probe:true,accepted164:true,missingMigrationRefused:true,alteredHashRefusedAtReleaseLength:true,matchingUnknown165RowsRefused:true,readOnly:true,sharedEnvironmentAccess:false},null,2));
 }finally{process.env.DATABASE_URL=original;await pool.end();}
}
