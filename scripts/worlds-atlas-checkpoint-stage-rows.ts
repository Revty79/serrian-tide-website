import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";

// Explicit additive defaults of the published later stages. Missing tables
// become empty; missing origin fields become null. Actual nonempty/non-null
// values are retained, so the original preservation comparisons still fail on
// any unexpected change. PostgreSQL serializes numbers without JS rounding.
const addedTables=["world_map_state_component","world_map_state_component_ref","world_map_state_native_dependency","world_map_state_native_request","world_map_state_asset_pin","world_access_audit","world_access_invitation","world_access_participant","world_editor_lease","world_canon_copy","world_canon_copy_identity","world_canon_copy_row"];
const origins=new Set(["world_town_map","world_building_floor","world_underground_level","world_craft","world_craft_deck"]);
export async function stageRowRecords(f:RegionalFixture,names:readonly string[],includeAdded=true){
 const result:Record<string,{payload:string}[]>=Object.fromEntries((includeAdded?addedTables:[]).map(name=>[name,[]]));
 for(const name of names){
  assert.match(name,/^[a-z0-9_]+$/);
  const value=origins.has(name)?"(to_jsonb(t)||jsonb_build_object('native_origin_version_id',coalesce(to_jsonb(t)->'native_origin_version_id','null'::jsonb)))":"to_jsonb(t)";
  result[name]=(await f.pool.query<{payload:string}>(`select ${value}::text payload from "${name}" t order by ${value}::text`)).rows;
 }
 return result;
}
export async function stageRowHashes(f:RegionalFixture,names:readonly string[],includeAdded=true){
 return Object.fromEntries(Object.entries(await stageRowRecords(f,names,includeAdded)).map(([name,rows])=>[name,createHash("sha256").update(JSON.stringify(rows)).digest("hex")]));
}
export async function worldWriteSnapshot(f:RegionalFixture){
 return {worlds:(await f.pool.query<{id:string;stable:string;stamp:string}>("select id,(to_jsonb(w)-'updated_at')::text stable,updated_at::text stamp from world w order by id")).rows,audits:(await f.pool.query<{id:string;payload:string}>("select id,to_jsonb(a)::text payload from world_access_audit a order by id")).rows,clock:(await f.pool.query<{clock:string}>("select clock_timestamp()::text clock")).rows[0].clock};
}
export async function assertWorldWriteEffects(f:RegionalFixture,before:Awaited<ReturnType<typeof worldWriteSnapshot>>,worldIds:readonly string[],scopes:readonly string[]){
 const after=await worldWriteSnapshot(f),oldIds=new Set(before.audits.map(row=>row.id)),allowedWorlds=new Set(worldIds),allowedScopes=new Set(scopes);
 assert.deepEqual(after.worlds.map(({id,stable})=>({id,stable})),before.worlds.map(({id,stable})=>({id,stable})),"Every World field except its explicitly audited write timestamp stays exact");
 assert.deepEqual(after.audits.filter(row=>oldIds.has(row.id)),before.audits,"Existing audit records stay byte-exact and append-only");
 const added=after.audits.filter(row=>!oldIds.has(row.id));assert.ok(added.length>0);
 for(const row of added){const audit=JSON.parse(row.payload) as {world_id:string;actor_id:string;action:string;outcome:string;input_hash:string;after_state:{scopes:string|string[]};result:{saved:boolean}};assert.ok(allowedWorlds.has(audit.world_id));assert.equal(audit.actor_id,"world-god");assert.equal(audit.action,"content-write");assert.equal(audit.outcome,"accepted");assert.deepEqual(audit.result,{saved:true});const requested=Array.isArray(audit.after_state.scopes)?audit.after_state.scopes:[audit.after_state.scopes];assert.ok(requested.length>0&&requested.every(scope=>allowedScopes.has(scope)));assert.equal(audit.input_hash,createHash("sha256").update(JSON.stringify(audit.after_state.scopes)).digest("hex"));}
 for(const old of before.worlds){const current=after.worlds.find(row=>row.id===old.id)!;if(!allowedWorlds.has(old.id)){assert.equal(current.stamp,old.stamp);continue;}assert.ok((await f.pool.query<{valid:boolean}>("select (updated_at at time zone 'UTC') >= $2::timestamptz and (updated_at at time zone 'UTC') <= clock_timestamp() and exists(select 1 from world_access_audit a where a.world_id=w.id and a.action='content-write' and a.created_at>=(w.updated_at at time zone 'UTC')) valid from world w where id=$1",[old.id,before.clock])).rows[0].valid);}
}
