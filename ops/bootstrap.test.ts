import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {migrationHashes} from "../scripts/environment/migration-hashes";
import {bootstrapReleaseSupported} from "./bootstrap-release-schema";

test("bootstrap recovery recognizes the actual coverage release and preserves explicit older and unknown-schema gates",async()=>{
 const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));assert.equal(journal.entries.length,164);assert(bootstrapReleaseSupported(journal));
 for(const count of [162,163])assert(bootstrapReleaseSupported({entries:journal.entries.slice(0,count)}));
 assert.equal(bootstrapReleaseSupported({entries:journal.entries.slice(0,161)}),false);
 const altered=structuredClone(journal);altered.entries[163].tag="0163_unknown";assert.equal(bootstrapReleaseSupported(altered),false);
 assert.equal(bootstrapReleaseSupported({entries:[...journal.entries,{tag:"0164_unknown"}]}),false);
});

test("exact LF and Windows CRLF migration bytes are recognized without accepting SQL edits",async()=>{
 const sql=await readFile("drizzle/0161_atlas_expanded_numerical_terrain.sql"),lf=sql.toString().replaceAll("\r\n","\n"),crlf=lf.replaceAll("\n","\r\n"),hash=(s:string)=>createHash("sha256").update(s).digest("hex");
 assert.deepEqual(new Set(migrationHashes(Buffer.from(lf))),new Set([hash(lf),hash(crlf)]));
 assert.deepEqual(new Set(migrationHashes(Buffer.from(crlf))),new Set([hash(lf),hash(crlf)]));
 assert(!migrationHashes(sql).includes(hash(lf.replace("2048","4096"))));
 assert(!migrationHashes(sql).includes(hash(lf+"\n-- unreviewed alteration\n")));
});

test("bootstrap recovery reaches its explicit input guard without an implicit application database",()=>{
 const env={...process.env};delete env.DATABASE_URL;
 const result=spawnSync(process.execPath,["--conditions=react-server","--import","tsx","ops/bootstrap-recovery.ts"],{env,input:"{}",encoding:"utf8",timeout:30000,windowsHide:true});
 assert.equal(result.status,1);
 assert.equal(result.stdout,"");
 assert.equal(result.stderr.trim(),"HOST_PROBE_FAILED: BOOTSTRAP_RECOVERY_PATH");
});
