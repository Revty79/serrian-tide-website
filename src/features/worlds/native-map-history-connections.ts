import { worldProtectedContent,worldScopeAllowed } from "./world-access-service";
import { nativeWorldScope } from "./world-permissions";
import { requireWorldNativeFamily } from "./world-resource-permissions";
import { redactUnderground } from "./underground";
import "server-only";
import {nativeRelatedContext,nativeResource,type NativeContentContext} from "./native-map-history-context";
import {nativeConditions} from "./native-map-history-conditions";
import {nativeObjectPresent,nativeTargetKey,type NativeMapTarget} from "./native-map-history";
import type {NativeHistoryTx} from "./native-map-history-store";
import {nativeTerrainSource} from "./native-map-history-terrain-read";
import {nativeTargetInfo} from "./native-map-history-target";
import {nativeConnectionAccounts,nativePinnedEntranceContext,type NativeAccountSource} from "./native-map-history-connection-source";
import {WorldError} from "./world-service";
import {sameUndergroundMap,type UndergroundBundle,type UndergroundEndpoint,type UndergroundMap,type UndergroundConnection} from "./underground";
import type {TownMapBundle} from "./town-map";
import type {FloorBundle} from "./building-floor";
import {regionAreaContainsPoint} from "./terrain-region-geometry";

export function nativeEntranceTarget(map:UndergroundMap):NativeMapTarget{
  return map.kind==="world"?{kind:"terrain",id:map.atlasMapId}:map.kind==="town"?{kind:"town",id:map.townMapId}:map.kind==="interior"?{kind:"floor",id:map.floorId}:{kind:"underground",id:map.levelId};
}
export function nativeConnectionResource(context:NativeContentContext){return context.scope.target.kind==="underground"?"underground":"connections";}
export async function nativeConnectionBundle(tx:NativeHistoryTx,c:NativeContentContext){
  const payload=(await nativeResource(tx,c,nativeConnectionResource(c))).payload as unknown as UndergroundBundle&{bundle?:UndergroundBundle};
  const result=structuredClone(payload.bundle??payload),accounts=await nativeConnectionAccounts(tx,c);
  for(const {account} of accounts.values()){
    const dto={...account.connection,available:false,reason:"Historical connection coverage is being resolved.",historicalAccount:{...account.draft,sourceVersionId:account.source.sourceVersionId,destinationVersionId:account.source.destinationVersionId}};
    const index=result.connections.findIndex(v=>v.id===dto.id);if(index>=0)result.connections[index]=dto;else result.connections.push(dto);
  }
  return result;
}
/** Resolve geometry and presence exclusively from the destination's own dated
 * source. Canonical lookups below provide identity/URL bindings, never geometry. */
export async function resolveNativeEndpoint(tx:NativeHistoryTx,source:NativeContentContext,endpoint:UndergroundEndpoint,pinned?:string,geographyVersionId?:string){
  const target=nativeEntranceTarget(endpoint.map);requireWorldNativeFamily(source.worldId,target.kind);
  const c=pinned?await nativePinnedEntranceContext(tx,source,pinned,endpoint.map,geographyVersionId):await nativeRelatedContext(tx,source,target),year=source.scope.year;
  if(c.version.archived||c.version.startYear!>year||c.version.endYear!<year||c.authority&&(c.authority.version.archived||c.authority.version.startYear!>year||c.authority.version.endYear!<year))throw new WorldError("The destination's historical coverage is unknown at this year.",409);
  const conditions=(await nativeConditions(tx,c)).values;
  if(!nativeObjectPresent(conditions,target.id)||!nativeObjectPresent(conditions,endpoint.entranceId))throw new WorldError("This map or entrance is absent, destroyed, not established or unknown at this date.",409);
  const url=new URL(`/worlds/${c.worldId}?tab=atlas`,"https://atlas.invalid"),p=endpoint.point;
  let point=p,revision=0,locked=false;
  if(target.kind==="terrain"){
    const root=await nativeTerrainSource(tx,c),region=root.document.region;
    const bundle=await nativeConnectionBundle(tx,c);
    if(!bundle.worldEntrances?.places.some(v=>v.id===endpoint.entranceId)||p.x<0||p.y<0||p.x>root.shape.displayWidth||p.y>root.shape.displayHeight||region&&!regionAreaContainsPoint(region,p,{width:root.shape.displayWidth,height:root.shape.displayHeight,wrap:root.shape.wrap}))throw new WorldError("This dated surface entrance is unavailable.",409);
    revision=root.document.mapRevision??root.document.revision;url.searchParams.set("terrainMap",target.id);
  }else if(target.kind==="town"){
    const b=(await nativeResource(tx,c,"town")).payload as unknown as {bundle:TownMapBundle},d=b.bundle.document!;
    const f=d.design.features.find(f=>f.id===endpoint.entranceId&&!f.archived&&["building","landmark","square"].includes(f.kind));
    if(d.archived||!f||p.x<0||p.y<0||p.x>d.frame.width||p.y>d.frame.height)throw new WorldError("This dated Town entrance is unavailable.",409);
    point=f.points[0];revision=d.revision;locked=d.design.layers[f.kind==="building"?"buildings":"landmarks"].locked;
    url.searchParams.set("townMap",d.id);url.searchParams.set("townReturnMap",endpoint.context?.returnMapId??d.contextMapId);url.searchParams.set("townSelection",f.id);
  }else if(target.kind==="floor"){
    const b=(await nativeResource(tx,c,"floor")).payload as unknown as {bundle:FloorBundle},d=b.bundle.document!,building=b.bundle.building!;
    const f=d.design.features.find(f=>f.id===endpoint.entranceId&&!f.archived&&f.kind==="transition");
    if(d.archived||!f||f.variant!=="object"||p.x<0||p.y<0||p.x>building.frame.width||p.y>building.frame.height)throw new WorldError("This dated interior entrance is unavailable.",409);
    point=f.point;revision=d.revision;locked=d.design.layers.transitions.locked;
    const binding=await nativeTargetInfo(tx,c.worldId,target);
    if(endpoint.context?.townMapId&&binding.townMapId!==endpoint.context.townMapId||endpoint.context?.featureId&&binding.featureId!==endpoint.context.featureId)throw new WorldError("The retained interior entrance identifies a different exterior binding.",409);
    url.searchParams.set("townMap",binding.townMapId!);url.searchParams.set("interiorBuilding",binding.featureId!);url.searchParams.set("interiorFloor",d.id);
  }else{
    const b=await nativeConnectionBundle(tx,c),d=b.document!,site=b.sites.find(s=>s.id===d.siteId),f=d.design.features.find(f=>f.id===endpoint.entranceId&&!f.archived&&f.kind==="transition");
    if(!worldProtectedContent(c.worldId)&&!redactUnderground(d.design).features.some(feature=>feature.id===endpoint.entranceId))throw new WorldError("This retained historical connection is unavailable.",404);
    if(d.archived||!site||site.archived||!f||f.variant!=="object"||p.x<0||p.y<0||p.x>site.frame.width||p.y>site.frame.height)throw new WorldError("This dated underground entrance is unavailable.",409);
    point=f.point;revision=d.revision;locked=d.design.layers.transitions.locked;url.searchParams.set("undergroundLevel",d.id);
  }
  if(endpoint.anchor==="position")point=p;
  url.searchParams.set("atlasYear",String(year));url.searchParams.set("atlasTimeline",source.scope.timelineId);
  if(source.scope.versionId){url.searchParams.set("atlasState",c.scope.stateId);url.searchParams.set("atlasVersion",c.version.id);if(c.authority)url.searchParams.set("atlasGeographyVersion",c.authority.version.id);}
  if(source.scope.connectionSourceVersionId){url.searchParams.set("atlasConnectionSource",source.scope.connectionSourceVersionId);url.searchParams.set("atlasConnection",source.scope.connectionSourceId!);}
  if(source.scope.edit&&!source.scope.versionId)url.searchParams.set("atlasEditing","1");
  return {context:c,point,revision,locked,url};
}
export async function nativeConnectionReadable(tx:NativeHistoryTx,c:NativeContentContext,connection:UndergroundConnection){
 if(![connection.source,connection.destination].every(endpoint=>worldScopeAllowed(c.worldId,nativeWorldScope(nativeEntranceTarget(endpoint.map).kind))))return false;
 if(worldProtectedContent(c.worldId))return true;
 try{await resolveNativeEndpoint(tx,c,connection.source);await resolveNativeEndpoint(tx,c,connection.destination);return true;}catch(error){if(error instanceof WorldError)return false;throw error;}
}
export async function nativeConnectionView(tx:NativeHistoryTx,c:NativeContentContext,connection:UndergroundConnection):Promise<UndergroundConnection>{
  if(connection.archived)return {...connection,available:false,reason:"This dated connection is archived; its original endpoints remain retained."};
  try{
    const account=(await nativeConnectionAccounts(tx,c)).get(connection.id);assertNativeAccountYear(c,account);
    const source=await resolveNativeEndpoint(tx,c,connection.source,c.scope.versionId?account?.account.source.sourceVersionId:undefined,c.scope.versionId?account?.account.source.sourceGeographyVersionId:undefined);
    const destination=await resolveNativeEndpoint(tx,c,connection.destination,c.scope.versionId?account?.account.source.destinationVersionId:undefined,c.scope.versionId?account?.account.source.destinationGeographyVersionId:undefined);
    if(!c.scope.versionId)await assertNativeCounterpart(tx,c,nativeTargetKey(c.scope.target)===nativeTargetKey(nativeEntranceTarget(connection.source.map))?destination.context:source.context,connection,account);
    return {...connection,available:true,reason:""};
  }
  catch(e){if(!(e instanceof WorldError))throw e;return {...connection,available:false,reason:e.message};}
}
export async function navigateNativeUnderground(tx:NativeHistoryTx,c:NativeContentContext,id:string,reverse:boolean){
  const connection=(await nativeConnectionBundle(tx,c)).connections.find(v=>v.id===id);
  if(!connection||connection.archived||reverse&&!connection.twoWay)throw new WorldError("This retained historical connection is unavailable in this direction.",409);
  const from=reverse?connection.destination:connection.source,to=reverse?connection.source:connection.destination;
  if(nativeTargetKey(nativeEntranceTarget(from.map))!==nativeTargetKey(c.scope.target))throw new WorldError("Open the recorded source of this dated connection before following it.",409);
  const account=(await nativeConnectionAccounts(tx,c)).get(connection.id);assertNativeAccountYear(c,account);
  const pins=account?.account.source;
  await resolveNativeEndpoint(tx,c,from,c.scope.versionId?reverse?pins?.destinationVersionId:pins?.sourceVersionId:undefined,c.scope.versionId?reverse?pins?.destinationGeographyVersionId:pins?.sourceGeographyVersionId:undefined);
  const destination=await resolveNativeEndpoint(tx,c,to,c.scope.versionId?reverse?pins?.sourceVersionId:pins?.destinationVersionId:undefined,c.scope.versionId?reverse?pins?.sourceGeographyVersionId:pins?.destinationGeographyVersionId:undefined);
  let counterpart=connection;
  if(c.scope.versionId&&account){destination.url.searchParams.set("atlasConnectionSource",account.sourceVersionId);destination.url.searchParams.set("atlasConnection",connection.id);}
  else counterpart=await assertNativeCounterpart(tx,c,destination.context,connection,account);
  destination.url.searchParams.set("atlasArrival",JSON.stringify({entranceId:to.entranceId,point:destination.point}));
  if(connection.twoWay&&counterpart.twoWay)destination.url.searchParams.set("undergroundReturn",JSON.stringify({connectionId:connection.id,reverse:!reverse}));
  return {url:destination.url.pathname+destination.url.search,from,to:{...to,point:destination.point}};
}

function assertNativeAccountYear(c:NativeContentContext,account?:NativeAccountSource){
 if(account&&(account.account.draft.status!=="available"||account.account.draft.startYear>c.scope.year||account.account.draft.endYear<c.scope.year))throw new WorldError("This connection account does not establish an available route at this year. Its original endpoints remain retained.",409);
}
async function assertNativeCounterpart(tx:NativeHistoryTx,c:NativeContentContext,d:NativeContentContext,connection:UndergroundConnection,account?:NativeAccountSource){
 const links=(await nativeConnectionBundle(tx,d)).connections;
 const counterpart=links.find(v=>v.id===connection.id&&!v.archived&&sameUndergroundMap(v.source.map,connection.source.map)&&sameUndergroundMap(v.destination.map,connection.destination.map)&&v.source.entranceId===connection.source.entranceId&&v.destination.entranceId===connection.destination.entranceId);
 if(!counterpart)throw new WorldError("This destination has not retained the same explicit connection identity and endpoints. Review its dated source before navigating.",409);
 if(account){const other=(await nativeConnectionAccounts(tx,d)).get(connection.id);if(other?.componentId!==account.componentId)throw new WorldError("The two maps retain different connection accounts. Review compatible exact sources before travelling.",409);}
 return counterpart;
}
