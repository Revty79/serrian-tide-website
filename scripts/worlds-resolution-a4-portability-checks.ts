import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {databaseState} from "./environment/database";
import {profileSchema} from "./environment/model";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
/** A staged-only object must participate in normal environment verification. */
export async function resolutionPortabilityChecks(f:RegionalFixture,sha256:string){
 const u=new URL(f.databaseUrl);assert.equal(u.hostname,"127.0.0.1");assert(!["5432","5433"].includes(u.port));assert.equal((await f.pool.query("select count(*)::int n from world_terrain_tile where sha256=$1",[sha256])).rows[0].n,0,"Use an object not yet accepted by a native revision");
 const profile=profileSchema.parse({version:1,environmentId:"atlas-resolution-a4",purpose:"source",database:{urlEnv:"SERRIAN_INFRA_A4_SOURCE",expectedHost:"127.0.0.1",expectedName:"serrian_regional_editing",expectedRole:"postgres",expectedPort:Number(u.port)},roots:{terrain:f.terrainRoot,artwork:path.join(f.root,"artwork"),raster:path.join(f.root,"raster")},application:{directory:f.root,origin:"http://127.0.0.1:1",trustFile:path.join(f.root,"unused-owned-trust.json")}}),client=await f.pool.connect();
 try{await client.query("begin read only isolation level repeatable read");const state=await databaseState(client,profile);assert(state.references.terrain.some(r=>r.sha256===sha256&&r.bytes===2048&&r.encoding==="i16le-v1"));await client.query("rollback");await writeFile(path.join(f.out,"a4-pending-object-portability.json"),JSON.stringify({passed:true,unacceptedTileReferenced:true,acceptedRevisionNotRequired:true,normalEnvironmentInventory:true,priorObjectFormatUnchanged:true,sharedAccess:false},null,2));}finally{await client.query("rollback");client.release();}
}
