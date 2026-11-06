import "server-only";
import {sql} from "drizzle-orm";
import {undergroundCommandSchema,sameUndergroundMap,UNDERGROUND_LIMITS,type UndergroundConnection,type UndergroundEndpoint} from "./underground";
import {historicalConnectionDraftSchema} from "./historical-connections";
import {nativeTargetKey} from "./native-map-history";
import {nativeContentContext,nativeRelatedContext,type NativeContentContext} from "./native-map-history-context";
import {nativeConnectionBundle,nativeEntranceTarget,resolveNativeEndpoint} from "./native-map-history-connections";
import {nativeConnectionAccounts} from "./native-map-history-connection-source";
import {nativeConnectionAccountSchema,nativeConnectionEditSchema,type NativeConnectionAccount} from "./native-map-history-connection-account";
import {commitNativeUpdates,type NativeWriteResult} from "./native-map-history-write";
import {nativeContentHash,type NativeHistoryTx} from "./native-map-history-store";
import {WorldError} from "./world-service";

function recorded(connection:UndergroundConnection){const {id,name,source,destination,twoWay,revision,archived}=connection;return {id,name,source,destination,twoWay,revision,archived};}
function sameEndpoint(a:UndergroundEndpoint,b:UndergroundEndpoint){return nativeContentHash(a)===nativeContentHash(b);}
function checkEndpointPoint(endpoint:UndergroundEndpoint,actual:{x:number;y:number}){
  if(endpoint.anchor!=="position"&&Math.hypot(endpoint.point.x-actual.x,endpoint.point.y-actual.y)>.001)throw new WorldError("This dated entrance moved. Reload its saved marker before connecting; no drawing was changed.",409);
}
async function editableDestination(tx:NativeHistoryTx,c:NativeContentContext,map:UndergroundEndpoint["map"]){
  const target=nativeEntranceTarget(map),read=await nativeRelatedContext(tx,c,target);
  const scope={...read.scope,edit:true,versionId:undefined,connectionSourceVersionId:undefined,geographyStateId:read.authority?.scope.stateId,geographyVersionId:undefined};
  const result=await nativeContentContext(tx,c.userId,c.worldId,scope,{ownerId:c.userId,archived:false,review:false,ordinary:false});
  if(!result.canEdit)throw new WorldError("Explicitly retain and open compatible editable appearances for both endpoints before connecting them.",409);
  return result;
}
function compatiblePeriods(source:NativeContentContext,destination:NativeContentContext){
  const a=source.selected,b=destination.selected;
  const startYear=Math.max(a.startYear,b.startYear),endYear=Math.min(a.endYear,b.endYear);
  if(startYear>endYear)throw new WorldError("The endpoints have no overlapping historical coverage. Choose compatible appearances before connecting them.",409);
  return {startYear,endYear};
}
function assertFree(links:UndergroundConnection[],point:UndergroundEndpoint,except?:string){
  if(links.some(c=>!c.archived&&c.id!==except&&[c.source,...c.twoWay?[c.destination]:[]].some(e=>sameUndergroundMap(e.map,point.map)&&e.entranceId===point.entranceId)))throw new WorldError("This dated entrance already has a connection. Archive that account before authoring another; customized arrivals remain retained.",409);
}
/** Both heads and one shared immutable connection account commit under the
 * existing World lock and exact request ledger. Neither native drawing changes. */
export async function saveNativeConnection(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown):Promise<NativeWriteResult>{
  const command=raw&&typeof raw==="object"&&"action"in raw&&raw.action==="historical-account"?nativeConnectionEditSchema.parse(raw):undergroundCommandSchema.parse(raw);
  if(command.action!=="connect"&&command.action!=="historical-account"&&!(command.action==="lifecycle"&&command.kind==="connection"))throw new WorldError("Choose an explicit connection request.",400);
  const sourceBundle=await nativeConnectionBundle(tx,c),old=command.action!=="connect"?sourceBundle.connections.find(v=>v.id===command.id):undefined;
  if(command.action!=="connect"&&(!old||old.revision!==command.revision))throw new WorldError("This connection account changed. Your exact request and source remain retained.",409);
  const source=command.action==="connect"?command.source:old!.source,destination=command.action==="connect"?command.destination:old!.destination;
  const here=nativeTargetKey(c.scope.target),sourceKey=nativeTargetKey(nativeEntranceTarget(source.map)),destinationKey=nativeTargetKey(nativeEntranceTarget(destination.map));
  if(sourceKey===destinationKey||here!==sourceKey&&here!==destinationKey||command.action==="connect"&&here!==sourceKey)throw new WorldError("Open the recorded source map and deliberately choose a different dated destination.",400);
  const prior=(await nativeConnectionAccounts(tx,c)).get(old?.id??"")?.account;
  const archiving=command.action==="lifecycle"&&command.archived;
  let other:NativeContentContext|undefined;
  try{other=await editableDestination(tx,c,here===sourceKey?destination.map:source.map);}catch(error){if(!archiving||!(error instanceof WorldError))throw error;}
  // An owner can retire an unusable route even after its other appearance has
  // lost coverage. Keep its exact source pins; no endpoint is reconstructed.
  if(!other){
    if(!prior||!old||!archiving)throw new WorldError("This route has no retained source account to archive safely.",409);
    const revision=old.revision+1,account=nativeConnectionAccountSchema.parse({...prior,revision,connection:{...prior.connection,revision,archived:true}});
    return {updates:[{key:"connection:"+old.id,kind:"connections",payload:account as unknown as Record<string,unknown>}],result:{connectionId:old.id,revision,retiredUnavailableCounterpart:true}};
  }
  const sourceContext=here===sourceKey?c:other,destinationContext=here===sourceKey?other:c;
  const twoWay=command.action==="connect"?command.twoWay:old!.twoWay;
  const period=archiving?undefined:compatiblePeriods(sourceContext,destinationContext);
  const checkGeometry=!archiving&&(command.action!=="historical-account"||command.draft.status==="available"||command.refreshSources);
  const s=checkGeometry?await resolveNativeEndpoint(tx,sourceContext,source):undefined,d=checkGeometry?await resolveNativeEndpoint(tx,destinationContext,destination):undefined;
  if(s?.locked||d?.locked)throw new WorldError("Unlock both dated entrance layers before changing this connection.",400);
  if(command.action==="connect"){
    if(s!.revision!==command.sourceRevision||d!.revision!==command.destinationRevision)throw new WorldError("A dated endpoint changed after selection. Reload both saved entrances before connecting.",409);
    checkEndpointPoint(source,s!.point);checkEndpointPoint(destination,d!.point);
  }
  const otherBundle=await nativeConnectionBundle(tx,other),links=[...sourceBundle.connections,...otherBundle.connections];
  const archived=command.action==="lifecycle"&&command.archived,id=command.action==="connect"?command.requestId:command.id;
  if(!archived){assertFree(links,source,id);if(twoWay)assertFree(links,destination,id);}
  if(command.action==="connect"){
    if(sourceBundle.connections.length>=UNDERGROUND_LIMITS.mapConnections||otherBundle.connections.length>=UNDERGROUND_LIMITS.mapConnections)throw new WorldError("A map supports 128 retained entrance connections. Review existing accounts before adding another.",400);
    const collision=(await tx.execute(sql`select id from world_underground_connection where id=${id}
      union all select id from world_map_state_component where kind='connections' and payload->'connection'->>'id'=${id} limit 1`)).rows;
    if(collision.length)throw new WorldError("That connection identity is already retained. Reuse its recorded endpoints instead of retargeting it.",409);
    const identities=(await tx.execute(sql`select id from (
      select id::text from world_underground_connection where world_id=${c.worldId}
      union select payload->'connection'->>'id' id from world_map_state_component where world_id=${c.worldId} and kind='connections' and payload ? 'original'
    ) connections limit 4097`)).rows;
    if(identities.length>=UNDERGROUND_LIMITS.connections)throw new WorldError("This World reached its 4,096 retained underground connection identities. Saved history remains available.",400);
  }else{
    const counterpart=otherBundle.connections.find(v=>v.id===id);
    if(!counterpart){if(command.action!=="historical-account"||!command.refreshSources||otherBundle.connections.length>=UNDERGROUND_LIMITS.mapConnections)throw new WorldError("The destination has not retained this connection account. Explicitly refresh its saved entrance sources to adopt this account at both appearances.",409);}
    else if(counterpart.revision!==old!.revision||!sameEndpoint(counterpart.source,source)||!sameEndpoint(counterpart.destination,destination))throw new WorldError("The two dated maps retain different connection sources. Review matching accounts before archiving or restoring this route.",409);
  }
  const revision=(old?.revision??0)+1,connection=recorded({id,name:command.action==="connect"?command.name:command.action==="historical-account"?command.draft.name:old!.name,source,destination,twoWay,revision,archived,available:false,reason:""});
  const geometry={sourceVersionId:sourceContext.version.id,destinationVersionId:destinationContext.version.id,sourceGeographyVersionId:sourceContext.authority?.version.id,destinationGeographyVersionId:destinationContext.authority?.version.id,connection};
  const draft=command.action==="historical-account"?command.draft:prior?.draft??historicalConnectionDraftSchema.parse({name:connection.name,...period,status:"available",destinationMapId:nativeEntranceTarget(destination.map).id,destinationGeographyId:destination.entranceId,account:`Explicit connection between ${sourceContext.selected.name} and ${destinationContext.selected.name}. Both retained entrances were selected deliberately.`,accountYear:c.scope.year,originalNotation:"",protected:true});
  if(!archived&&draft.status==="available"&&(draft.destinationMapId!==nativeEntranceTarget(destination.map).id||draft.destinationGeographyId!==destination.entranceId||draft.startYear<period!.startYear||draft.endYear>period!.endYear))throw new WorldError("An available route must keep its recorded destination and fit both endpoints' inclusive periods. Other dates remain unknown.",409);
  const account:NativeConnectionAccount=nativeConnectionAccountSchema.parse({version:1,revision,connection,draft,source:archiving?prior?.source??geometry:command.action==="historical-account"&&!command.refreshSources?prior?.source??geometry:geometry,original:prior?.original??geometry});
  const update={key:"connection:"+id,kind:"connections" as const,payload:account as unknown as Record<string,unknown>};
  await commitNativeUpdates(tx,other,[update]);
  return {updates:[update],result:{connectionId:id,levelId:c.scope.target.kind==="underground"?c.scope.target.id:null,revision}};
}
