import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {townFeature,type TownMapBundle} from "../src/features/worlds/town-map";
import type {FloorBundle} from "../src/features/worlds/building-floor";
import type {NativeHistoryScope} from "../src/features/worlds/native-map-history";

export async function validateNativeAddedBuilding(f:RegionalFixture){
  const fixture=JSON.parse(await readFile(path.join(f.out,"worlds-atlas-integration.json"),"utf8")).fixture as {townMap:{id:string};sources:Record<string,NativeHistoryScope>},scope=fixture.sources["town:500"],early=fixture.sources["town:100"];
  const {nativeContentRequest}=await import("../src/features/worlds/native-map-history-api"),{nativeHistoryUrl}=await import("../src/features/worlds/native-map-history"),{initialBuildingFloor}=await import("../src/features/worlds/building-floor-alignment"),{getBuildingFloors}=await import("../src/features/worlds/building-floor-service");
  const call=(binding:NativeHistoryScope,path:string,body?:unknown)=>nativeContentRequest(new Request("http://owned.invalid"+nativeHistoryUrl(`/api/worlds/${f.world}/${path}`,binding),body?{method:"POST",body:JSON.stringify(body)}:undefined),"world-god");
  const baseline=(await f.pool.query("select design from world_town_map where id=$1",[fixture.townMap.id])).rows[0].design,old=(await call(early,`town-maps?map=${fixture.townMap.id}`) as TownMapBundle).document!,later=(await call(scope,`town-maps?map=${fixture.townMap.id}`) as TownMapBundle).document!;
  const feature={...townFeature("building","area",[{x:80,y:80},{x:108,y:80},{x:108,y:102},{x:80,y:102}],randomUUID()),name:"Inn introduced only500"};
  const road=townFeature("road","line",[{x:60,y:60},{x:60,y:130}],randomUUID());
  await call(scope,"town-maps",{action:"save",requestId:randomUUID(),mapId:later.id,revision:later.revision,name:later.name,design:{...later.design,features:[...later.design.features,feature,road]}});
  const command={action:"enter",requestId:randomUUID(),townMapId:later.id,featureId:feature.id},accepted=await call(scope,"building-floors",command);assert.deepEqual(await call(scope,"building-floors",command),accepted);
  const entry=await call(scope,`building-floors?townMap=${later.id}&building=${feature.id}`) as FloorBundle;assert.ok(entry.building);
  const floor=await call(scope,"building-floors",{action:"create",requestId:randomUUID(),buildingId:entry.building.id,name:"New inn ground500",order:0,elevation:0,design:initialBuildingFloor("outline",entry.building.footprint,entry.building.frame,randomUUID),copyFloorId:null,copyRevision:null}) as {floorId:string};assert.ok(floor.floorId);
  await assert.rejects(call(early,`building-floors?townMap=${later.id}&building=${feature.id}`),/not present/);await assert.rejects(getBuildingFloors("world-god",f.world,{townMapId:later.id,featureId:feature.id}),/unavailable|building|saved/);
  const count=(await f.pool.query("select count(*)::int n from world_building_interior_source where world_id=$1",[f.world])).rows[0].n;
  for(const featureId of [randomUUID(),road.id])await assert.rejects(f.pool.query("insert into world_building_interior_source(id,world_id,building_id,town_map_id,feature_id) values($1,$2,$3,$4,$5)",[randomUUID(),f.world,entry.building.id,later.id,featureId]),/saved building in the same Town and World/);
  const otherTown=JSON.parse(await readFile(path.join(f.out,"native-town-creation.json"),"utf8")).fixture.mapId as string;
  await assert.rejects(f.pool.query("insert into world_building_interior_source(id,world_id,building_id,town_map_id,feature_id) values($1,$2,$3,$4,$5)",[randomUUID(),f.world,entry.building.id,otherTown,feature.id]),/saved building in the same Town and World/);
  assert.equal((await f.pool.query("select count(*)::int n from world_building_interior_source where world_id=$1",[f.world])).rows[0].n,count);assert.deepEqual((await f.pool.query("select design from world_town_map where id=$1",[later.id])).rows[0].design,baseline);assert.deepEqual((await call(early,`town-maps?map=${later.id}`) as TownMapBundle).document!.design,old.design);
  await writeFile(path.join(f.out,"native-added-building.json"),JSON.stringify({passed:true,existingBaselineTownAcceptsNewDatedBuildingInterior:true,onlyAcceptedNativeHeadCanEstablishBinding:true,forgedAndActuallySavedRoadAndCrossTownSourcesDenied:true,currentAndEarlierTownGeometryExact:true,currentFloorAndEarlierBuildingNotBorrowed:true,exactEntryRetry:true,sharedDatabaseAccess:false,fixture:{townMap:later.id,buildingFeature:feature.id,floorId:floor.floorId}},null,2));
}
