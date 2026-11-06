import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import type {NativeHistoryScope} from "../src/features/worlds/native-map-history";
import type {FloorBundle} from "../src/features/worlds/building-floor";

export async function validateNativeFloorCreation(f:RegionalFixture,timelineId:string){
  const {nativeContentRequest}=await import("../src/features/worlds/native-map-history-api"),{nativeHistoryUrl}=await import("../src/features/worlds/native-map-history"),{getNativeMapHistory,changeNativeMapHistory}=await import("../src/features/worlds/native-map-history-service"),{getBuildingFloors}=await import("../src/features/worlds/building-floor-service"),{initialBuildingFloor}=await import("../src/features/worlds/building-floor-alignment"),{roomFeatures,floorRound}=await import("../src/features/worlds/building-floor");
  const fixture=JSON.parse(await readFile(path.join(f.out,"native-town-creation.json"),"utf8")).fixture as {mapId:string;scope:NativeHistoryScope},scope=fixture.scope;
  const call=(binding:NativeHistoryScope,query:string,body?:unknown)=>nativeContentRequest(new Request("http://owned.invalid"+nativeHistoryUrl(`/api/worlds/${f.world}/${query}`,binding),body?{method:"POST",body:JSON.stringify(body)}:undefined),"world-god");
  const town=await call(scope,`town-maps?map=${fixture.mapId}`) as import("../src/features/worlds/town-map").TownMapBundle,building=town.document!.design.features.find(feature=>feature.kind==="building"&&feature.shape==="area"&&!feature.archived)!;assert.ok(building);
  const query=`building-floors?townMap=${fixture.mapId}&building=${building.id}`,empty=await call(scope,query) as FloorBundle;assert.equal(empty.building,null);assert.equal(empty.canEdit,true);
  const parent=(await getNativeMapHistory("world-god",f.world,scope.target,timelineId,{year:500})).selected!;
  const enter={action:"enter",requestId:randomUUID(),townMapId:fixture.mapId,featureId:building.id};const opened=await call(scope,"building-floors",enter);assert.deepEqual(await call(scope,"building-floors",enter),opened);
  const start=await call(scope,query) as FloorBundle;assert.ok(start.building);assert.equal(start.document,null);assert.equal(start.bound,true);
  const design=initialBuildingFloor("outline",start.building.footprint,start.building.frame,randomUUID),command={action:"create",requestId:randomUUID(),buildingId:start.building.id,name:"Ground Floor in 500",order:0,elevation:0,design,copyFloorId:null,copyRevision:null};
  const accepted=await call(scope,"building-floors",command) as {buildingId:string;floorId:string;revision:number};assert.deepEqual(await call(scope,"building-floors",command),accepted);assert.equal(accepted.buildingId,start.building.id);
  const target={kind:"floor" as const,id:accepted.floorId},history=await getNativeMapHistory("world-god",f.world,target,timelineId,{year:500}),floorScope:NativeHistoryScope={target,timelineId,year:500,stateId:history.selected!.id,edit:true};assert.equal(history.baselineAvailable,false);
  const floor=await call(floorScope,query+`&floor=${accepted.floorId}`) as FloorBundle;assert.deepEqual(floor.document!.design,design);assert.equal(floor.canEdit,true);
  const identity=await call(floorScope,`building-floors?identities=1&floor=${accepted.floorId}`) as import("../src/features/worlds/native-map-history-floor-create").NativeFloorSourceContext;assert.equal(identity.townMapId,fixture.mapId);assert.equal(identity.featureId,building.id);assert.ok(identity.worldMapId);
  await assert.rejects(call(floorScope,`building-floors?identities=1&floor=${accepted.floorId}&townMap=${randomUUID()}&building=${building.id}`),/recorded building source is unavailable/);
  const entry=await call(scope,query) as FloorBundle;assert.equal(entry.document,null);assert.equal(entry.selectedFloorId,accepted.floorId);assert.equal(entry.building!.id,start.building.id);
  const retainedEntry=await call({...scope,edit:false,versionId:parent.versionId},query) as FloorBundle;assert.equal(retainedEntry.selectedFloorId,accepted.floorId);assert.equal(retainedEntry.document,null,"An immutable exterior discovers a dated floor identity without borrowing its geometry");
  assert.equal((await getNativeMapHistory("world-god",f.world,scope.target,timelineId,{year:500})).selected!.versionId,parent.versionId);
  assert.equal((await getNativeMapHistory("world-god",f.world,target,timelineId,{year:100})).coverage,"unknown");
  await assert.rejects(getBuildingFloors("world-god",f.world,{townMapId:fixture.mapId,featureId:building.id,floorId:accepted.floorId}),/unavailable/);
  const later=await changeNativeMapHistory("world-god",f.world,{action:"create",requestId:randomUUID(),timelineId,target,sourceVersionId:history.selected!.versionId,baselinePin:null,details:{name:"Renovated floor in 900",startYear:900,endYear:900,account:"Exact original dated floor retained before renovation",protected:false}}),laterScope={...floorScope,year:900,stateId:String(later.id)},frame=start.building.frame;
  const rooms=roomFeatures([{x:frame.width*.15,y:frame.height*.15},{x:frame.width*.45,y:frame.height*.15},{x:frame.width*.45,y:frame.height*.45},{x:frame.width*.15,y:frame.height*.45}].map(point=>({x:floorRound(point.x),y:floorRound(point.y)})),randomUUID);
  await call(laterScope,"building-floors",{action:"save",requestId:randomUUID(),floorId:accepted.floorId,revision:floor.document!.revision,name:"Renovated Ground Floor",order:0,elevation:0,design:{...design,features:[...design.features,...rooms]}});
  assert.deepEqual((await call(floorScope,query+`&floor=${accepted.floorId}`) as FloorBundle).document!.design,design);
  assert.equal((await call(laterScope,query+`&floor=${accepted.floorId}`) as FloorBundle).document!.design.features.length,design.features.length+rooms.length);
  const canonical=(await f.pool.query("select design,native_origin_version_id from world_building_floor where id=$1",[accepted.floorId])).rows[0];assert.deepEqual(canonical.design,design);assert.equal(canonical.native_origin_version_id,parent.versionId);
  await writeFile(path.join(f.out,"native-floor-creation.json"),JSON.stringify({passed:true,datedOnlyBuildingEntry:true,exactEnterAndCreationRetries:true,firstDatedFloorAppearance:true,canonicalAlignmentAndFloorGeometryRetained:true,parentTownHeadExact:true,noEarlierOrBaselineFloorInferred:true,datedRoomRenovationIndependent:true,sameBuildingAndFloorIdentities:true,sharedDatabaseAccess:false,fixture:{townMapId:fixture.mapId,featureId:building.id,buildingId:accepted.buildingId,floorId:accepted.floorId,scope:floorScope}},null,2));
}
