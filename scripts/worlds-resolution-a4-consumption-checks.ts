import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {publicTableDigests} from "./worlds-collaboration-fixture";
import type {ConsumptionRequest} from "../src/features/worlds/atlas-map-consumption";
export async function resolutionConsumptionChecks(f:RegionalFixture){
 const expected=JSON.parse(await(await import("node:fs/promises")).readFile(path.join(f.out,"a4-browser/expected-native-sources.json"),"utf8")),actor="world-god",target={kind:"terrain" as const,id:expected.mapId},timelineId=(await f.pool.query("select id from world_timeline where world_id=$1 and is_primary",[expected.world])).rows[0].id;
 const history=await import("../src/features/worlds/native-map-history-service"),readers=await import("../src/features/worlds/atlas-map-consumption-service"),{withWorldRequestAuthority}=await import("../src/features/worlds/world-authorization-context");
 // Browser shutdown can interrupt its keepalive release. Respect the original
 // deadline instead of altering leases or weakening the normal writer guard.
 const deadline=Date.now()+135000;while((await f.pool.query("select exists(select 1 from world_editor_lease where world_id=$1 and expires_at>clock_timestamp()) alive",[expected.world])).rows[0].alive){assert(Date.now()<deadline,"The prior owned browser still holds its editing lease");await new Promise(resolve=>setTimeout(resolve,200));}
 const baseline=await history.getNativeMapHistory(actor,expected.world,target,timelineId,{prepareBaseline:true}),created=await history.changeNativeMapHistory(actor,expected.world,{action:"create",requestId:randomUUID(),target,timelineId,baselinePin:baseline.baselinePin,sourceVersionId:null,details:{name:"A4 immutable synthetic acceptance",startYear:2026,endYear:2026,account:"Synthetic native resolution verification",protected:false}}) as {id:string;versionId:string};
 const sessionId=randomUUID();await f.pool.query("insert into session(id,user_id,token,expires_at,updated_at) values($1,$2,$3,(clock_timestamp() at time zone 'UTC')+interval '1 hour',now())",[sessionId,actor,randomUUID()]);
 const as=<T>(body:()=>Promise<T>)=>withWorldRequestAuthority({userId:actor,sessionId,proof:null,review:false,operationId:randomUUID(),reads:new Map()},body),request:ConsumptionRequest={target,timelineId,year:2026,stateId:created.id,versionId:created.versionId},before=await publicTableDigests(f.pool);
 await assert.rejects(as(()=>readers.readAtlasMapContract(actor,expected.world,request)),/contract version 2/i);
 const manifest=await as(()=>readers.readAtlasMapContract(actor,expected.world,{...request,contractVersion:2}));assert.equal(manifest.schemaVersion,2);assert.equal(manifest.pin.schemaVersion,2);const resources=[];
 for(const descriptor of manifest.resources){const resource=await as(()=>readers.readAtlasMapResource(actor,manifest.pin,descriptor.key));if(resource.kind!=="numerical"&&!(resource.kind==="geometry"&&"tiles"in resource.value))continue;const numeric=resource.kind==="numerical"?resource:resource.value;assert("tiles"in numeric);const indexes=[0,numeric.tiles.length-1];const values=await as(()=>readers.readAtlasMapTiles(actor,manifest.pin,descriptor.key,indexes));assert.equal(values.length,2);assert(values.every(v=>v.samples.length===1024));resources.push({key:descriptor.key,references:numeric.tiles.length});await assert.rejects(as(()=>readers.readAtlasMapTiles(actor,manifest.pin,descriptor.key,Array.from({length:33},(_,n)=>n))));}
 assert.equal(resources.length,3);assert.deepEqual(await publicTableDigests(f.pool),before,"Internal contract reads must not mutate any public row");
 await writeFile(path.join(f.out,"a4-consumption.json"),JSON.stringify({passed:true,legacyLargeSourceExplicitlyRefused:true,version2Negotiated:true,immutableStateId:created.id,immutableVersionId:created.versionId,resources,originalTileBatch32Enforced:true,allPublicRowsExact:true,readOnly:true,noEndpointAdded:true,sharedAccess:false},null,2));
}
