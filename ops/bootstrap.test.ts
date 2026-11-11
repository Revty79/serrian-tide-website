import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {migrationHashes} from "../scripts/environment/migration-hashes";

test("exact LF and Windows CRLF migration bytes are recognized without accepting SQL edits",async()=>{
 const sql=await readFile("drizzle/0161_atlas_expanded_numerical_terrain.sql"),lf=sql.toString().replaceAll("\r\n","\n"),crlf=lf.replaceAll("\n","\r\n"),hash=(s:string)=>createHash("sha256").update(s).digest("hex");
 assert.deepEqual(new Set(migrationHashes(Buffer.from(lf))),new Set([hash(lf),hash(crlf)]));
 assert.deepEqual(new Set(migrationHashes(Buffer.from(crlf))),new Set([hash(lf),hash(crlf)]));
 assert(!migrationHashes(sql).includes(hash(lf.replace("2048","4096"))));
 assert(!migrationHashes(sql).includes(hash(lf+"\n-- unreviewed alteration\n")));
});
