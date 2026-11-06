import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";

export async function validateNativeComparison(f:RegionalFixture,timelineId:string){
  const {compareNativeMaps}=await import("../src/features/worlds/native-map-history-comparison-service"),{getNativeMapHistory}=await import("../src/features/worlds/native-map-history-service");
  const target={kind:"terrain" as const,id:(await f.pool.query("select id from world_atlas_map where world_id=$1 and name='Historical numerical World'",[f.world])).rows[0].id};
  const rows=async()=>(await f.pool.query("select count(*)::int versions,(select count(*)::int from world_map_state_native_request) requests from world_map_state_version")).rows[0];const before=await rows();
  const input={target,left:{timelineId,year:100},right:{timelineId,year:500}};
  const dated=await compareNativeMaps("world-god",f.world,input);assert.equal(dated.readOnly,true);assert.equal(dated.left.coverage,"established");assert.equal(dated.right.coverage,"established");
  assert.equal(dated.numeric.points.length,64);assert.ok(dated.numeric.points.some(point=>point.difference!==0));assert.ok(dated.components.some(component=>component.key==="terrain"&&component.status==="different retained component"));
  const unknown=await compareNativeMaps("world-god",f.world,{...input,right:{timelineId,year:300}});assert.equal(unknown.right.coverage,"unknown");assert.equal(unknown.numeric.points.length,0);assert.ok(unknown.components.every(component=>component.status==="unknown coverage"));
  const baseline=await compareNativeMaps("world-god",f.world,{...input,left:{timelineId,baseline:true}});assert.equal(baseline.left.coverage,"current-reference");assert.ok(baseline.left.baselinePin);assert.equal(baseline.left.year,undefined);assert.ok(baseline.numeric.points.some(point=>point.difference!==0));
  const current=await getNativeMapHistory("world-god",f.world,target,timelineId,{year:500}),old=current.revisions.at(-1)!;assert.ok(old);
  const retained=await compareNativeMaps("world-god",f.world,{...input,left:{timelineId,stateId:old.id,versionId:old.versionId}});assert.equal(retained.left.versionId,old.versionId);
  const branch=(await f.pool.query("select id from world_timeline where world_id=$1 and name='Independent map interpretation'",[f.world])).rows[0].id;
  const alternate=await compareNativeMaps("world-god",f.world,{...input,left:{timelineId:branch,year:100},right:{timelineId:branch,year:500}});assert.equal(alternate.left.coverage,"established");assert.equal(alternate.right.coverage,"unknown");
  await assert.rejects(compareNativeMaps("other-god",f.world,input),/unavailable/);await assert.rejects(compareNativeMaps("world-god",f.world,input,{ordinary:true}),/unavailable/);
  const admin=await compareNativeMaps("world-admin",f.world,{...input,left:{timelineId,baseline:true}},{review:true});assert.equal(admin.readOnly,true);assert.equal(new URL(admin.right.href!,"http://owned.invalid").searchParams.get("review"),"1");
  assert.deepEqual(await rows(),before,"Comparison may not append map versions or request receipts");
  await writeFile(path.join(f.out,"native-comparison.json"),JSON.stringify({passed:true,explicitYearsAndRetainedRevision:true,matchedNumericalSamples64:true,differentNumericalValues:true,baselineIsUndatedReference:true,unadoptedBranchCoverageUnknown:true,ordinaryAndForeignOwnerDenied:true,administratorReadOnly:true,noMapVersionOrRequestWrites:true,sharedDatabaseAccess:false},null,2));
}
