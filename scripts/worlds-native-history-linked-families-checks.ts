import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import type {NativeHistoryScope} from "../src/features/worlds/native-map-history";
import type {FloorBundle} from "../src/features/worlds/building-floor";
export async function validateNativeLinkedFamilies(f:RegionalFixture,timelineId:string){
  const fixture=JSON.parse(await readFile(path.join(f.out,"worlds-atlas-integration.json"),"utf8")).fixture as {townMap:{id:string};buildingId:string;placeId:string;sources:Record<string,NativeHistoryScope>};
  const {nativeContentRequest}=await import("../src/features/worlds/native-map-history-api"),{nativeHistoryUrl}=await import("../src/features/worlds/native-map-history"),{initialBuildingFloor}=await import("../src/features/worlds/building-floor-alignment"),{discoverWorldAtlas}=await import("../src/features/worlds/world-atlas-discovery-service"),{generateUnderground,defaultUndergroundSettings}=await import("../src/features/worlds/underground");
  const scope=fixture.sources["town:100"],call=(endpoint:string,body?:unknown)=>nativeContentRequest(new Request("http://owned.invalid"+nativeHistoryUrl(`/api/worlds/${f.world}/${endpoint}`,scope),body?{method:"POST",body:JSON.stringify(body)}:undefined),"world-god");
  await call("building-floors",{action:"enter",requestId:randomUUID(),townMapId:fixture.townMap.id,featureId:fixture.buildingId});
  const b=await call(`building-floors?townMap=${fixture.townMap.id}&building=${fixture.buildingId}`) as FloorBundle;assert.ok(b.building?.placeId===fixture.placeId);
  const floor=await call("building-floors",{action:"create",requestId:randomUUID(),buildingId:b.building.id,name:"Original Harbor hall100",order:0,elevation:0,design:initialBuildingFloor("outline",b.building.footprint,b.building.frame,randomUUID),copyFloorId:null,copyRevision:null}) as {floorId:string};
  const generated=generateUnderground(defaultUndergroundSettings,randomUUID),underground=await call("underground",{action:"create-site",requestId:randomUUID(),name:"Original Harbor cellar100",order:0,depth:"Explicit Place relationship",placeId:fixture.placeId,newPlace:null,...generated,entrance:null,entranceRevision:null}) as {levelId:string};
  const find=(year:number|undefined,ordinary=false,user="world-god",review=false)=>discoverWorldAtlas(user,f.world,{timelineId,year,subject:{kind:"place",id:fixture.placeId}},{ordinary,review});
  const found=await find(100),floorLink=found.maps.find(m=>m.target.kind==="floor"&&m.target.id===floor.floorId),levelLink=found.maps.find(m=>m.target.kind==="underground"&&m.target.id===underground.levelId);assert.ok(floorLink&&levelLink);
  const q=new URL(floorLink.href,"http://owned.invalid").searchParams;assert.equal(q.get("townMap"),fixture.townMap.id);assert.equal(q.get("interiorBuilding"),fixture.buildingId);assert.equal(q.get("interiorFloor"),floor.floorId);assert.equal(q.get("atlasYear"),"100");assert.equal(new URL(levelLink.href,"http://owned.invalid").searchParams.get("undergroundLevel"),underground.levelId);
  for(const year of [500,undefined])assert.equal((await find(year)).maps.filter(m=>[floor.floorId,underground.levelId].includes(m.target.id)).length,0,"Unknown or current contexts never borrow newly introduced dated interiors");
  assert.equal((await find(100,true)).maps.length,0);await assert.rejects(find(100,false,"world-player"),/access is required|unavailable/);const admin=await find(100,false,"world-admin",true);assert.ok(admin.maps.some(m=>m.target.id===floor.floorId&&new URL(m.href,"http://owned.invalid").searchParams.get("review")==="1"));
  await writeFile(path.join(f.out,"native-linked-families.json"),JSON.stringify({passed:true,realSavedFloorBuildingPlaceAndUndergroundPlaceBindings:true,exactNavigationIdentitiesAndYear:true,unknownBranchAndCurrentCoverageNotBorrowed:true,ordinaryAndPlayerWithheld:true,adminReviewPreserved:true,fixture:{floorId:floor.floorId,levelId:underground.levelId,townMap:fixture.townMap.id,building:fixture.buildingId,placeId:fixture.placeId},sharedDatabaseAccess:false},null,2));
}
