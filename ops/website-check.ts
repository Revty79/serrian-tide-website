/** Normal deployment checks only. Never restores, migrates or changes accounts. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {probe,safeProbeFailure} from "./host-probe.mjs";
import {verifyBuild} from "./stamp-build.mjs";
import {poolFor,databaseState,comparableDatabase,noOtherClients,verifyReferences} from "../scripts/environment/database";
import {inventoryFiles,checkRootLayout,privatePermissions} from "../scripts/environment/private-files";
import {canonicalJson,type EnvironmentProfile} from "../scripts/environment/model";
import pg from "pg";
import {migrationHashes} from "../scripts/environment/migration-hashes";
export async function checkWebsite(frozen=false){
 const receipt=await verifyBuild(process.cwd(),process.env.SERRIAN_RELEASE_COMMIT??"");if(process.env.SERRIAN_EXPECTED_SOURCE_HASH)assert.equal(receipt.sourceHash,process.env.SERRIAN_EXPECTED_SOURCE_HASH);
 const observed=await probe(),journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));assert.equal(observed.database.ledger.length,journal.entries.length,"SCHEMA_MIGRATION_REQUIRED");
 for(const [i,row]of observed.database.ledger.entries()){const sql=await readFile(`drizzle/${journal.entries[i].tag}.sql`);assert.equal(row.created_at,String(journal.entries[i].when));assert(migrationHashes(sql).includes(row.hash),"MIGRATION_HASH");}
 const structural=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});try{const client=await structural.connect();try{await client.query("begin read only");const constraints=(await client.query("select conname,pg_get_constraintdef(oid) definition from pg_constraint where conname in ('world_terrain_valid','world_terrain_tile_valid','world_terrain_refinement_valid','world_terrain_refinement_tile_valid')")).rows;for(const [name,bounds]of [["world_terrain_valid",["2048"]],["world_terrain_tile_valid",["63"]],["world_terrain_refinement_valid",["4096"]],["world_terrain_refinement_tile_valid",["127","7"]]] as const){const constraint=constraints.find(row=>row.conname===name);assert(constraint&&bounds.every(value=>constraint.definition.includes(value)),"SCHEMA_CONSTRAINTS");}assert((await client.query("select to_regclass('public.world_terrain_transfer') a,to_regclass('public.world_terrain_transfer_tile') b")).rows.every(row=>row.a&&row.b),"SCHEMA_TRANSFER_TABLES");await client.query("commit");}finally{await client.query("rollback").catch(()=>{});client.release();}}finally{await structural.end();}
 const roots={terrain:observed.roots.terrain.path,artwork:observed.roots.artwork.path,raster:observed.roots.raster.path};await checkRootLayout(roots);for(const root of Object.values(roots))await privatePermissions(root);
 // Full schema/row/file equality is a conservative pre-write rollback witness,
 // not a backup. It is captured only with the old and new writers stopped.
 let stateHash:string|undefined;
 if(frozen){process.env.SERRIAN_INFRA_WEBSITE=process.env.DATABASE_URL;const profile:EnvironmentProfile={version:1,environmentId:"website-deployment",purpose:"source",database:{urlEnv:"SERRIAN_INFRA_WEBSITE",expectedName:observed.database.name,expectedHost:observed.database.host,expectedPort:observed.database.port,expectedRole:observed.database.role},roots,application:{directory:process.cwd(),commit:receipt.commit,origin:observed.auth.base,trustFile:"/not-used",hosting:"ubuntu"},reserveBytes:0},pool=poolFor(profile),client=await pool.connect();
  try{await client.query("begin isolation level repeatable read read only");await noOtherClients(client);const state=await databaseState(client,profile);await verifyReferences(state,roots);const files=await inventoryFiles(roots);await noOtherClients(client);await client.query("commit");stateHash=createHash("sha256").update(canonicalJson({database:comparableDatabase(state),files})).digest("hex");}finally{await client.query("rollback").catch(()=>{});client.release();await pool.end();}
 }
 return {passed:true,commit:receipt.commit,buildId:receipt.buildId,sourceHash:receipt.sourceHash,readOnly:true,migrations:journal.entries.length,roots:observed.roots,auth:observed.auth,database:{host:observed.database.host,name:observed.database.name,role:observed.database.role,port:observed.database.port},...stateHash?{stateHash}:{}};
}
if(process.argv.includes("--check")||process.argv.includes("--frozen"))checkWebsite(process.argv.includes("--frozen")).then(v=>console.log(JSON.stringify(v))).catch(error=>{const known=["SCHEMA_MIGRATION_REQUIRED","MIGRATION_HASH","SCHEMA_CONSTRAINTS","SCHEMA_TRANSFER_TABLES","WRITERS_ACTIVE"],code=known.find(value=>String(error?.message).startsWith(value)||error?.code===value)??safeProbeFailure(error);console.error("WEBSITE_PREFLIGHT_FAILED: "+code);process.exitCode=1;});
