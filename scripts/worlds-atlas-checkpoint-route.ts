import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import type {BrowserContext} from "playwright-core";
import {claimOwnedWorldPage} from "./worlds-owned-world-api";
import type {CollaborationFixture} from "./worlds-collaboration-fixture";
import type {TerrainDocument} from "../src/features/worlds/terrain";
import type {FloorBundle,FloorFeature} from "../src/features/worlds/building-floor";
import type {UndergroundBundle} from "../src/features/worlds/underground";
import type {NativeHistoryBundle,NativeHistoryScope,NativeMapTarget} from "../src/features/worlds/native-map-history";
import type {NativeConnectionAccount} from "../src/features/worlds/native-map-history-connection-account";

/** Deliberately publish an ordinary dated route from existing current geometry.
 * The separate retained narrative remains protected and must never be copied. */
export async function prepareCheckpointRoute(f:CollaborationFixture,context:BrowserContext,base:string,hall:{root:string;townMap:string;featureId:string;floorId:string;levelId:string}){
  const api=`/api/worlds/${f.worldA}`,p=await context.newPage();await p.goto(`${base}/worlds/${f.worldA}?tab=atlas&terrainMap=${hall.root}`);await claimOwnedWorldPage(p,base);
  async function get<T>(endpoint:string):Promise<T>{const r=await context.request.get(base+api+endpoint);assert.equal(r.status(),200,await r.text());return r.json();}
  async function post<T>(endpoint:string,data:unknown):Promise<T>{const r=await context.request.post(base+api+endpoint,{headers:{Origin:base},data});assert.equal(r.status(),200,await r.text());return r.json();}
  const root=(await get<{document:TerrainDocument}>(`/terrain?terrainMap=${hall.root}`)).document,refinements=await get<{sourceState:string}>(`/terrain/refinements?terrainMap=${hall.root}`),town=(await f.pool.query("select town_id,anchor_x x,anchor_y y from world_town_map where world_id=$1 and id=$2",[f.worldA,hall.townMap])).rows[0];assert.ok(town);
  const x=Number(town.x),y=Number(town.y),region=randomUUID();
  await post("/terrain/regions",{action:"create-region",requestId:region,parentMapId:hall.root,terrainId:root.terrainId,parentRevision:root.mapRevision,sourceRevision:root.revision,sourceState:refinements.sourceState,name:"Ordinary checkpoint route Region",frame:{x:Math.max(0,x-2000),y:Math.max(0,y-2000),width:4000,height:4000}});
  const floorQuery=`/building-floors?townMap=${hall.townMap}&building=${hall.featureId}&floor=${hall.floorId}`;
  const floor=(await get<FloorBundle>(floorQuery)).document!,level=(await get<UndergroundBundle>(`/underground?level=${hall.levelId}`)).document!;
  const stairs=(id:string):FloorFeature=>({version:1,id,entityId:id,kind:"transition",variant:"object",name:"Public connected stairs",archived:false,point:{x:5,y:5},width:1,height:1,rotation:0,symbol:"stairs",destination:null});
  const first=randomUUID(),second=randomUUID(),floorDesign=structuredClone(floor.design),levelDesign=structuredClone(level.design);floorDesign.features.push(stairs(first));levelDesign.features.push(stairs(second));
  const {undergroundAttribute}=await import("../src/features/worlds/underground");levelDesign.attributes[second]=undergroundAttribute("transition");
  await post("/building-floors",{action:"save",requestId:randomUUID(),floorId:hall.floorId,revision:floor.revision,name:floor.name,order:floor.order,elevation:floor.elevation,design:floorDesign});
  await post("/underground",{action:"save",requestId:randomUUID(),levelId:hall.levelId,revision:level.revision,name:level.name,order:level.order,depth:level.depth,design:levelDesign});
  const year=42,scopes=new Map<string,NativeHistoryScope>();
  for(const target of [{kind:"terrain",id:hall.root},{kind:"terrain",id:region},{kind:"town",id:hall.townMap},{kind:"floor",id:hall.floorId},{kind:"underground",id:hall.levelId}] as NativeMapTarget[]){
    const bundle=await get<NativeHistoryBundle>(`/atlas-history?kind=${target.kind}&id=${target.id}&timeline=${f.timelineA}&year=${year}&prepareBaseline=1`);assert.ok(bundle.baselinePin);
    const created=await post<{id:string}>("/atlas-history",{action:"create",requestId:randomUUID(),timelineId:f.timelineA,target,sourceVersionId:null,baselinePin:bundle.baselinePin,geographyVersionId:bundle.geographySource?.versionId??null,details:{name:`Ordinary checkpoint ${target.kind}42`,startYear:year,endYear:year,account:"Explicit ordinary saved geometry for independent Canon route validation",protected:false}});
    scopes.set(target.id,{target,timelineId:f.timelineA,stateId:created.id,year,edit:true});
  }
  const scope=scopes.get(hall.floorId)!,endpoint=`/underground?historicalAtlas=${encodeURIComponent(JSON.stringify(scope))}`,connectionId=randomUUID();
  const datedFloor=(await get<FloorBundle>(`${floorQuery}&historicalAtlas=${encodeURIComponent(JSON.stringify(scope))}`)).document!,datedLevel=(await get<UndergroundBundle>(`/underground?level=${hall.levelId}&historicalAtlas=${encodeURIComponent(JSON.stringify(scopes.get(hall.levelId)))}`)).document!;
  await post(endpoint,{action:"connect",requestId:connectionId,name:"Ordinary checkpoint floor to chamber",source:{map:{kind:"interior",floorId:hall.floorId},entranceId:first,point:{x:5,y:5},context:{townMapId:hall.townMap,featureId:hall.featureId,returnMapId:region}},destination:{map:{kind:"underground",levelId:hall.levelId},entranceId:second,point:{x:5,y:5}},sourceRevision:datedFloor.revision,destinationRevision:datedLevel.revision,twoWay:true});
  const account=(await f.pool.query("select c.payload from world_map_state_head h join world_map_state_component_ref r on r.version_id=h.version_id join world_map_state_component c on c.id=r.component_id where h.world_id=$1 and h.state_id=$2 and r.key=$3",[f.worldA,scope.stateId,"connection:"+connectionId])).rows[0]?.payload as NativeConnectionAccount|undefined;assert.ok(account);
  await post(endpoint,{action:"historical-account",requestId:randomUUID(),id:connectionId,revision:account.revision,draft:{...account.draft,protected:false,account:"Deliberate ordinary two-way floor/chamber connection"},refreshSources:false});
  await p.close();return {root:hall.root,region,townMap:hall.townMap,townId:town.town_id as string,buildingId:hall.featureId,groundId:hall.floorId,basementId:hall.floorId,dungeonId:hall.levelId,year,x,y,connectionId};
}
