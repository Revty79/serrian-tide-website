import "server-only";
import {craftCommandSchema,CRAFT_LIMITS,type CraftBundle,type CraftPlacement} from "./craft";
import {nativeRelatedContext,nativeResource,type NativeContentContext} from "./native-map-history-context";
import type {NativeHistoryTx} from "./native-map-history-store";
import type {NativeWriteResult} from "./native-map-history-write";
import {nativeAllRefinementIndex,nativeTerrainSource} from "./native-map-history-terrain-read";
import {assertNativeTarget,assertNativeRevision} from "./native-map-history-resources";
import {nativeConditions} from "./native-map-history-conditions";
import {nativeObjectPresent} from "./native-map-history";
import {normalizePlacePoint} from "./world-towns";
import {boundedRegionalLayer} from "./terrain-regional-authoring-service";
import {requireRegionalPath} from "./terrain-regional-scope";
import {WorldError} from "./world-service";
import {nativeCraftIdentities} from "./native-map-history-craft-create";

type Positions=CraftBundle&{revision?:number;positions?:CraftPlacement[]};
async function positions(tx:NativeHistoryTx,c:NativeContentContext){
  const source=await nativeTerrainSource(tx,c),row=await nativeResource(tx,c,"craft-positions"),value=structuredClone(row.payload) as unknown as Positions;
  // Earlier native snapshots retain the original accepted marker revision and
  // coordinates. Materialize only those explicit references when first edited.
  value.positions??=value.markers.map(marker=>({craftId:marker.id,worldId:c.worldId,terrainId:source.document.terrainId,sourceMapId:source.document.region?.parentMapId??c.scope.target.id,x:marker.x,y:marker.y,rotation:marker.rotation,revision:marker.revision,removed:false}));
  return {row,value,source};
}
export async function nativeCraftPlacements(tx:NativeHistoryTx,c:NativeContentContext,q:URLSearchParams){
  const {value,source}=await positions(tx,c),conditions=(await nativeConditions(tx,c)).values;
  const inventory=(await nativeCraftIdentities(tx,c)).crafts;
  const all=inventory.map(craft=>({...craft,placed:value.positions!.some(position=>position.craftId===craft.id&&!position.removed)})).filter(craft=>!q.get("q")||craft.name.toLowerCase().includes(q.get("q")!.slice(0,120).toLowerCase()));
  const offset=Math.max(0,Math.min(CRAFT_LIMITS.crafts,Number(q.get("offset")??0)||0));
  const map={id:c.scope.target.id,width:source.shape.displayWidth,height:source.shape.displayHeight,wrap:source.shape.wrap};
  const region=source.document.region;
  const markers=value.markers.filter(marker=>nativeObjectPresent(conditions,marker.id)).filter(marker=>{
    if(!region)return true;
    try{requireRegionalPath([marker],0,{frame:region.frame,footprint:region.footprint,world:{width:map.width,height:map.height,wrap:map.wrap}});return true;}catch{return false;}
  });
  const regional=region?{version:1 as const,regionMapId:c.scope.target.id,parentMapId:region.parentMapId,terrainId:source.document.terrainId,regionRevision:region.revision,sourceState:(await nativeAllRefinementIndex(tx,c)).sourceState}:undefined;
  return {...value,crafts:all.slice(offset,offset+50),next:all.length>offset+50?offset+50:null,markers,map:{...map,...regional?{regional}:{}},canEdit:c.canEdit};
}
export async function nativeCraftPosition(tx:NativeHistoryTx,c:NativeContentContext,craftId:string){
  try{
    const root=await nativeRelatedContext(tx,c,{kind:"terrain",id:c.version.mapId}),{value}=await positions(tx,root);
    const condition=(await nativeConditions(tx,root)).values;
    return {placement:nativeObjectPresent(condition,craftId)?value.positions!.find(position=>position.craftId===craftId)??null:null,positionCoverage:"established" as const};
  }catch(error){if(error instanceof WorldError&&error.status===409)return {placement:null,positionCoverage:"unknown" as const};throw error;}
}
export async function saveNativeCraftPlacement(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown):Promise<NativeWriteResult>{
  const command=craftCommandSchema.parse(raw);
  if(command.action!=="place"&&command.action!=="unplace")throw new WorldError("Choose an explicit dated craft placement.",400);
  if(c.scope.target.kind!=="terrain")throw new WorldError("Open the dated World or Region to author this craft's position.",409);
  if(command.action==="place")assertNativeTarget(c,command.mapId,"terrain");
  const {row,value,source}=await positions(tx,c),old=value.positions!.find(position=>position.craftId===command.craftId),region=source.document.region;
  assertNativeRevision(old?.revision??0,command.revision);
  if((old?.revision??0)>=10000)throw new WorldError("This dated craft reached its placement revision allowance.",413);
  if(command.action==="unplace"&&(!old||old.removed))throw new WorldError("This craft has no active dated placement to remove.",409);
  if(command.action==="place"&&!!region!==!!command.regional)throw new WorldError("Review the exact regional geography before placing this craft.",409);
  if(command.action==="place"&&region&&command.regional){
    const pin=command.regional,index=await nativeAllRefinementIndex(tx,c);
    if(pin.regionMapId!==c.scope.target.id||pin.parentMapId!==region.parentMapId||pin.terrainId!==source.document.terrainId||pin.regionRevision!==region.revision||pin.sourceState!==index.sourceState)throw new WorldError("The dated regional geography changed. Your original placement request remains retained.",409);
  }
  const craft=await nativeRelatedContext(tx,c,{kind:"craft",id:command.craftId}),saved=await nativeResource(tx,craft,"craft"),record=(saved.payload as unknown as {bundle:CraftBundle}).bundle.craft;
  if(!record||record.archived||!nativeObjectPresent((await nativeConditions(tx,craft)).values,record.id))throw new WorldError("Establish an active dated craft appearance before placing its representation.",409);
  const world={widthMetres:source.shape.displayWidth,heightMetres:source.shape.displayHeight,wrap:source.shape.wrap};
  const point=command.action==="unplace"?old!:boundedRegionalLayer(()=>normalizePlacePoint(command.x,command.y,world));
  if(region)boundedRegionalLayer(()=>requireRegionalPath([...old&&!old.removed?[old]:[],point],0,{frame:region.frame,footprint:region.footprint,world:{width:world.widthMetres,height:world.heightMetres,wrap:world.wrap}},"The dated craft placement"));
  if(!old&&value.positions!.length>=CRAFT_LIMITS.crafts)throw new WorldError("This dated World reached its retained craft placement allowance.",413);
  const placement:CraftPlacement={craftId:record.id,worldId:c.worldId,terrainId:source.document.terrainId,sourceMapId:source.document.region?.parentMapId??c.scope.target.id,x:point.x,y:point.y,rotation:command.action==="unplace"?old!.rotation:command.rotation,revision:(old?.revision??0)+1,removed:command.action==="unplace"};
  value.positions=value.positions!.filter(position=>position.craftId!==record.id).concat(placement);
  value.markers=value.markers.filter(marker=>marker.id!==record.id);
  if(!placement.removed)value.markers.push({id:record.id,name:record.name,classification:record.classification,x:placement.x,y:placement.y,rotation:placement.rotation,revision:placement.revision});
  const summary={id:record.id,name:record.name,classification:record.classification,revision:record.revision,archived:record.archived,placed:!placement.removed};
  value.crafts=value.crafts.filter(item=>item.id!==record.id).concat(summary).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));value.revision=row.revision+1;
  return {updates:[{key:"craft-positions",kind:"placement",payload:value as unknown as Record<string,unknown>}],result:{craftId:record.id,placementRevision:placement.revision}};
}
