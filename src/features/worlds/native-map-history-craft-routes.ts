import "server-only";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {worldCraftOperation} from "@/db/world-craft-schema";
import {craftCommandSchema,craftFeature,CRAFT_LIMITS,type CraftBundle,type CraftConnection,type CraftSurfaceKey} from "./craft";
import {floorAnchor,floorLayer,type FloorFeature} from "./building-floor";
import {historicalConnectionDraftSchema} from "./historical-connections";
import {nativeCraftConnectionEditSchema} from "./native-map-history-connection-account";
import {nativeContentContext,nativeRelatedContext,nativeResource,type NativeContentContext} from "./native-map-history-context";
import {nativeConditions} from "./native-map-history-conditions";
import {nativeObjectPresent,nativeTargetKey,type NativeMapTarget} from "./native-map-history";
import {nativeContentHash,loadNativeVersion,nativeManifestOf,nativeVersionReachable,type NativeHistoryTx} from "./native-map-history-store";
import {commitNativeUpdates,type NativeWriteResult} from "./native-map-history-write";
import {createNativeDeck} from "./native-map-history-craft-create";
import {saveNativeCraft} from "./native-map-history-shapes";
import {WorldError} from "./world-service";

const point=z.object({x:z.number().finite(),y:z.number().finite()}).strict(),id=z.uuid();
const route=z.object({id,worldId:id,craftId:id,revision:z.number().int().positive().max(512),source:z.string(),sourceFeatureId:id,sourcePoint:point,destination:z.string(),arrivalFeatureId:id,arrivalPoint:point,kind:z.enum(["stairs","hatch","ladder","lift","ramp"]),twoWay:z.boolean(),archived:z.boolean()}).strict();
const pins=z.object({sourceVersionId:id,destinationVersionId:id,connection:route}).strict();
const accountSchema=z.object({version:z.literal(1),revision:z.number().int().positive(),connection:route,draft:historicalConnectionDraftSchema,source:pins,original:pins}).strict();
export const nativeCraftRouteAccountSchema=accountSchema;
type Account=z.infer<typeof accountSchema>;
const surfaceTarget=(craftId:string,surface:CraftSurfaceKey):NativeMapTarget=>surface==="exterior"?{kind:"craft",id:craftId}:{kind:"deck",id:surface};
const strip=(connection:CraftConnection)=>{const {id,worldId,craftId,revision,source,sourceFeatureId,sourcePoint,destination,arrivalFeatureId,arrivalPoint,kind,twoWay,archived}=connection;return {id,worldId,craftId,revision,source,sourceFeatureId,sourcePoint,destination,arrivalFeatureId,arrivalPoint,kind,twoWay,archived};};
function routeKey(id:string){return "craft-route:"+id;}
async function accounts(tx:NativeHistoryTx,c:NativeContentContext){
  const result=new Map<string,{account:Account;componentId:string;sourceVersionId:string}>();
  async function collect(context:NativeContentContext,external=false){for(const ref of context.manifest.resources.filter(ref=>external?ref.key===routeKey(c.scope.connectionSourceId!):ref.key.startsWith("craft-route:"))){const component=await nativeResource(tx,context,ref.key),account=accountSchema.parse(component.payload);if(ref.key!==routeKey(account.connection.id)||![account.connection.source,account.connection.destination].some(surface=>nativeTargetKey(surfaceTarget(account.connection.craftId,surface))===nativeTargetKey(c.scope.target)))throw new WorldError("This saved craft connection source identifies another surface.",409);result.set(account.connection.id,{account,componentId:component.id,sourceVersionId:context.version.id});}}
  await collect(c);
  if(c.scope.connectionSourceVersionId){const version=await loadNativeVersion(tx,c.worldId,c.scope.connectionSourceVersionId),manifest=nativeManifestOf(version);if(!version.stateId||!await nativeVersionReachable(tx,c.worldId,c.scope.timelineId,manifest.target,version.id))throw new WorldError("Retain this exact craft route source in the selected timeline.",409);await collect({...c,version,manifest,components:new Map()},true);if(!result.has(c.scope.connectionSourceId!))throw new WorldError("The explicit route source has no account on this craft surface.",409);}
  return result;
}
export async function nativeCraftRoutes(tx:NativeHistoryTx,c:NativeContentContext){
  const key=c.scope.target.kind==="deck"?"craft-context":"craft",bundle=(await nativeResource(tx,c,key)).payload as unknown as {bundle:CraftBundle},rows=structuredClone(bundle.bundle.connections),saved=await accounts(tx,c);
  for(const {account}of saved.values()){const connection={...account.connection,historicalAccount:{...account.draft,sourceVersionId:account.source.sourceVersionId,destinationVersionId:account.source.destinationVersionId}},index=rows.findIndex(row=>row.id===connection.id);if(index>=0)rows[index]=connection;else rows.push(connection);}
  return {rows,accounts:saved};
}
async function surfaceContext(tx:NativeHistoryTx,c:NativeContentContext,craftId:string,surface:CraftSurfaceKey,editable=false,pin?:string){
  const target=surfaceTarget(craftId,surface);
  let context:NativeContentContext;
  if(pin){const version=await loadNativeVersion(tx,c.worldId,pin,target);if(!version.stateId||!await nativeVersionReachable(tx,c.worldId,c.scope.timelineId,target,version.id))throw new WorldError("Retain the recorded craft entrance source in this timeline before travelling.",409);context=await nativeContentContext(tx,c.userId,c.worldId,{...c.scope,target,stateId:version.stateId,versionId:version.id,edit:false},{ownerId:"",archived:false,review:true,ordinary:false});}
  else{context=await nativeRelatedContext(tx,c,target);if(editable)context=await nativeContentContext(tx,c.userId,c.worldId,{...context.scope,edit:true,versionId:undefined},{ownerId:c.userId,archived:false,review:false,ordinary:false});}
  if(context.version.archived||context.version.startYear!>c.scope.year||context.version.endYear!<c.scope.year||!nativeObjectPresent((await nativeConditions(tx,context)).values,target.id))throw new WorldError("This craft surface is absent or has unknown historical coverage at this year.",409);
  if(editable&&!context.canEdit)throw new WorldError("Explicitly retain an editable appearance for both craft surfaces before connecting them.",409);
  const payload=(await nativeResource(tx,context,target.kind==="deck"?"deck":"craft")).payload as unknown as {deck?:NonNullable<CraftBundle["deck"]>;bundle?:CraftBundle},record=payload.deck??payload.bundle?.craft;
  if(!record||record.archived||"craftId"in record&&record.craftId!==craftId)throw new WorldError("This saved deck does not belong to the active dated craft.",409);
  return {context,record};
}
async function endpoint(tx:NativeHistoryTx,c:NativeContentContext,craftId:string,surface:CraftSurfaceKey,featureId:string,pin?:string){
  const resolved=await surfaceContext(tx,c,craftId,surface,false,pin),conditions=(await nativeConditions(tx,resolved.context)).values;
  if(!nativeObjectPresent(conditions,featureId))throw new WorldError("This craft entrance is absent, destroyed or unknown at this date.",409);
  const feature=craftFeature(resolved.record.surface.plan,featureId),locked=resolved.record.surface.plan.layers[floorLayer(feature)].locked;
  return {...resolved,feature,point:floorAnchor(feature,resolved.record.surface.plan.features),locked};
}
function checkAccountYear(c:NativeContentContext,account?:Account){if(account&&(account.draft.status!=="available"||account.draft.startYear>c.scope.year||account.draft.endYear<c.scope.year))throw new WorldError("This craft route account does not establish available coverage at this year.",409);}
async function compatibleCounterpart(tx:NativeHistoryTx,c:NativeContentContext,other:NativeContentContext,connection:CraftConnection,componentId?:string){
  const links=await nativeCraftRoutes(tx,other),found=links.rows.find(row=>row.id===connection.id&&!row.archived&&row.source===connection.source&&row.destination===connection.destination&&row.sourceFeatureId===connection.sourceFeatureId&&row.arrivalFeatureId===connection.arrivalFeatureId);
  if(!found||componentId&&links.accounts.get(connection.id)?.componentId!==componentId)throw new WorldError("The destination has not retained the same explicit craft route and entrance account.",409);return found;
}
export async function nativeCraftRouteView(tx:NativeHistoryTx,c:NativeContentContext,connection:CraftConnection):Promise<CraftConnection>{
  if(connection.archived)return {...connection,available:false,reason:"This dated craft route is archived; original entrances remain retained."};
  try{const account=(await accounts(tx,c)).get(connection.id);checkAccountYear(c,account?.account);
    const source=await endpoint(tx,c,connection.craftId,connection.source,connection.sourceFeatureId,c.scope.versionId?account?.account.source.sourceVersionId:undefined),destination=await endpoint(tx,c,connection.craftId,connection.destination,connection.arrivalFeatureId,c.scope.versionId?account?.account.source.destinationVersionId:undefined);
    if(!c.scope.versionId)await compatibleCounterpart(tx,c,nativeTargetKey(c.scope.target)===nativeTargetKey(surfaceTarget(connection.craftId,connection.source))?destination.context:source.context,connection,account?.componentId);
    return {...connection,available:true,reason:""};
  }catch(error){if(!(error instanceof WorldError))throw error;return {...connection,available:false,reason:error.message};}
}
export async function navigateNativeCraft(tx:NativeHistoryTx,c:NativeContentContext,id:string,reverse:boolean){
  const links=await nativeCraftRoutes(tx,c),connection=links.rows.find(row=>row.id===id),account=links.accounts.get(id)?.account;
  if(!connection||connection.archived||reverse&&!connection.twoWay)throw new WorldError("This dated craft route is unavailable in this direction.",409);
  const from=reverse?connection.destination:connection.source,to=reverse?connection.source:connection.destination;
  if(nativeTargetKey(c.scope.target)!==nativeTargetKey(surfaceTarget(connection.craftId,from)))throw new WorldError("Open the recorded source surface before following this craft route.",409);checkAccountYear(c,account);
  await endpoint(tx,c,connection.craftId,from,reverse?connection.arrivalFeatureId:connection.sourceFeatureId,c.scope.versionId?reverse?account?.source.destinationVersionId:account?.source.sourceVersionId:undefined);
  const destination=await endpoint(tx,c,connection.craftId,to,reverse?connection.sourceFeatureId:connection.arrivalFeatureId,c.scope.versionId?reverse?account?.source.sourceVersionId:account?.source.destinationVersionId:undefined);
  if(!c.scope.versionId)await compatibleCounterpart(tx,c,destination.context,connection,links.accounts.get(id)?.componentId);
  let nativeUrl:string|undefined;
  if(c.scope.versionId&&account){const query=new URLSearchParams({tab:"atlas",craft:connection.craftId,atlasYear:String(c.scope.year),atlasTimeline:c.scope.timelineId,timeline:c.scope.timelineId,atlasState:destination.context.scope.stateId,atlasVersion:destination.context.version.id,atlasConnectionSource:links.accounts.get(id)!.sourceVersionId,atlasConnection:id,craftArrival:JSON.stringify({featureId:reverse?connection.sourceFeatureId:connection.arrivalFeatureId,point:destination.point}),craftRoute:connection.twoWay?id+":"+Number(!reverse):""});if(to!=="exterior")query.set("craftDeck",to);nativeUrl=`/worlds/${c.worldId}?${query}`;}
  return {craftId:connection.craftId,surface:to,featureId:reverse?connection.sourceFeatureId:connection.arrivalFeatureId,point:destination.point,connectionId:id,returnReverse:!reverse,canReturn:connection.twoWay,...nativeUrl?{nativeUrl}:{}};
}
function free(links:CraftConnection[],surface:CraftSurfaceKey,featureId:string,except?:string){if(links.some(link=>link.id!==except&&!link.archived&&(link.source===surface&&link.sourceFeatureId===featureId||link.twoWay&&link.destination===surface&&link.arrivalFeatureId===featureId)))throw new WorldError("This dated craft entrance is already connected. Archive its account before creating another.",409);}
export async function saveNativeCraftRoute(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown):Promise<NativeWriteResult>{
  const command=raw&&typeof raw==="object"&&"action"in raw&&raw.action==="historical-account"?nativeCraftConnectionEditSchema.parse(raw):craftCommandSchema.parse(raw);
  if(command.action!=="connect"&&command.action!=="connection-lifecycle"&&command.action!=="historical-account")throw new WorldError("Choose an explicit dated craft route.",400);
  const own=await nativeCraftRoutes(tx,c),id=command.action==="historical-account"?command.id:command.connectionId,old=command.action!=="connect"?own.rows.find(row=>row.id===id):undefined,prior=own.accounts.get(id)?.account;
  if(command.action!=="connect"&&(!old||old.revision!==command.revision||old.craftId!==command.craftId))throw new WorldError("This craft route changed. Its original request and source remain retained.",409);
  const source=command.action==="connect"?command.source:old!.source,destination=command.action==="connect"?command.destination:old!.destination,sourceTarget=surfaceTarget(command.craftId,source),destinationTarget=surfaceTarget(command.craftId,destination),here=nativeTargetKey(c.scope.target);
  if(source===destination||here!==nativeTargetKey(sourceTarget)&&here!==nativeTargetKey(destinationTarget)||command.action==="connect"&&here!==nativeTargetKey(sourceTarget))throw new WorldError("Open the recorded source surface and deliberately choose a different deck.",400);
  if(command.action==="connect"&&command.newDeck){
    if(destination==="exterior"||command.destinationRevision!==0)throw new WorldError("Keep the new deck identity and its creation revision together.",400);
    await tx.insert(worldCraftOperation).values({requestId:command.requestId,worldId:c.worldId,authorId:c.userId,inputHash:nativeContentHash({scope:c.scope,command}),result:{craftId:command.craftId,surface:source,connectionId:id}});
    await createNativeDeck(tx,c,{id:destination,craftId:command.craftId,draft:command.newDeck,requestId:command.requestId});
  }
  const archiving=command.action==="connection-lifecycle"&&command.archived;
  const localUncertainty=command.action==="historical-account"&&command.draft.status!=="available"&&!command.refreshSources;
  let other:Awaited<ReturnType<typeof surfaceContext>>|undefined;
  try{other=await surfaceContext(tx,c,command.craftId,here===nativeTargetKey(sourceTarget)?destination:source,true);}catch(error){if(!archiving&&!localUncertainty||!(error instanceof WorldError))throw error;}
  if(!other){
    if(prior&&old){const revision=old.revision+1,account=accountSchema.parse({...prior,revision,...command.action==="historical-account"?{draft:command.draft}:{},connection:{...prior.connection,revision,archived:archiving||old.archived}});return {updates:[{key:routeKey(id),kind:"connections",payload:account as unknown as Record<string,unknown>}],result:{craftId:command.craftId,connectionId:id,revision}};}
    if(old){const key=c.scope.target.kind==="deck"?"craft-context":"craft",payload=structuredClone((await nativeResource(tx,c,key)).payload) as unknown as {bundle:CraftBundle};payload.bundle.connections=payload.bundle.connections.map(row=>row.id===id?{...strip(row),revision:row.revision+1,archived:true}:row);return {updates:[{key,kind:"craft",payload:payload as unknown as Record<string,unknown>}],result:{craftId:command.craftId,connectionId:id,revision:old.revision+1}};}
    throw new WorldError("The original craft route source is unavailable.",409);
  }
  const sourceContext=here===nativeTargetKey(sourceTarget)?c:other.context;let destinationContext=here===nativeTargetKey(destinationTarget)?c:other.context;
  if(command.action==="connect"){
    const s=await endpoint(tx,sourceContext,command.craftId,source,command.sourceFeatureId);if(s.record.revision!==command.sourceRevision||s.locked)throw new WorldError("The source craft entrance changed or is locked. Review its saved source.",409);
    let d=await surfaceContext(tx,destinationContext,command.craftId,destination,true),arrival=d.record.surface.plan.features.find(feature=>feature.id===command.arrivalFeatureId);
    if(d.record.revision!==(command.newDeck?1:command.destinationRevision))throw new WorldError("The destination surface changed after selection. Retain the original request and review it.",409);
    if(!arrival){
      if(d.record.surface.plan.layers.transitions.locked)throw new WorldError("Unlock the dated arrival transition layer before adding its endpoint.",400);
      const feature:FloorFeature={version:1,id:command.arrivalFeatureId,entityId:command.arrivalFeatureId,kind:"transition",variant:"object",name:"Arrival "+command.kind,archived:false,point:command.arrivalPoint,width:1.2,height:2,rotation:0,symbol:command.kind==="ramp"?"stairs":command.kind,destination:null};
      const draft={...d.record,surface:{...d.record.surface,plan:{...d.record.surface.plan,features:[...d.record.surface.plan.features,feature]},details:{...d.record.surface.details,[feature.id]:{notes:"",transition:command.kind}}}};
      const {id:_,worldId:__,revision:___,archived:____,craftId:_____,...clean}=draft as typeof draft&{craftId?:string};void _;void __;void ___;void ____;void _____;
      const updated=await saveNativeCraft(tx,d.context,{action:"save",requestId:command.requestId,craftId:command.craftId,surface:destination,revision:d.record.revision,draft:clean});await commitNativeUpdates(tx,d.context,updated.updates);
      d=await surfaceContext(tx,c,command.craftId,destination,true);destinationContext=d.context;arrival=feature;
    }
    const a=await endpoint(tx,destinationContext,command.craftId,destination,arrival.id);if(a.locked)throw new WorldError("Unlock the saved arrival layer before connecting it.",400);
    const recorded:CraftConnection={id,worldId:c.worldId,craftId:command.craftId,revision:1,source,sourceFeatureId:command.sourceFeatureId,sourcePoint:s.point,destination,arrivalFeatureId:a.feature.id,arrivalPoint:a.point,kind:command.kind,twoWay:command.twoWay,archived:false};
    const collision=(await tx.execute(sql`select id from world_craft_connection where id=${id} union all select id from world_map_state_component where world_id=${c.worldId} and payload->'connection'->>'id'=${id} and payload ? 'original' limit 1`)).rows;if(collision.length)throw new WorldError("This route identity is already retained. Keep its original request.",409);
    const total=(await tx.execute<{n:number}>(sql`select count(*)::int n from(select id from world_craft_connection where world_id=${c.worldId} and craft_id=${command.craftId} union select payload->'connection'->>'id' from world_map_state_component where world_id=${c.worldId} and payload->'connection'->>'craftId'=${command.craftId} and payload ? 'original') routes`)).rows[0].n;if(total>=CRAFT_LIMITS.connections)throw new WorldError("This craft reached its 1,024 retained route identities.",413);
    return finish(recorded);
  }
  return finish({...strip(old!),revision:old!.revision+1,archived:command.action==="connection-lifecycle"?command.archived:old!.archived} as CraftConnection);

  async function finish(connection:CraftConnection):Promise<NativeWriteResult>{
    if(connection.revision>CRAFT_LIMITS.revisions)throw new WorldError("This craft route reached 512 retained account revisions.",413);
    const otherContext=here===nativeTargetKey(sourceTarget)?destinationContext:sourceContext,otherLinks=await nativeCraftRoutes(tx,otherContext),counterpart=otherLinks.rows.find(row=>row.id===id);
    if(old&&counterpart&&(counterpart.revision!==old.revision||counterpart.source!==old.source||counterpart.destination!==old.destination||counterpart.sourceFeatureId!==old.sourceFeatureId||counterpart.arrivalFeatureId!==old.arrivalFeatureId))throw new WorldError("The craft surfaces retain different route accounts. Review matching exact sources before changing them.",409);
    if(old&&!counterpart&&(command.action!=="historical-account"||command.draft.status==="available"&&!command.refreshSources))throw new WorldError("Explicitly review both dated entrance sources to adopt this route at the destination.",409);
    const startYear=Math.max(sourceContext.version.startYear!,destinationContext.version.startYear!),endYear=Math.min(sourceContext.version.endYear!,destinationContext.version.endYear!);
    if(!archiving&&startYear>endYear)throw new WorldError("The craft entrances have no overlapping dated coverage.",409);
    const draft=command.action==="historical-account"?command.draft:prior?.draft??historicalConnectionDraftSchema.parse({name:connection.kind+" route",startYear,endYear,status:"available",destinationMapId:destinationTarget.id,destinationGeographyId:connection.arrivalFeatureId,account:"Both dated craft entrances were selected deliberately.",accountYear:c.scope.year,originalNotation:"",protected:true});
    if(!archiving&&draft.status==="available"&&(draft.startYear<startYear||draft.endYear>endYear||draft.destinationMapId!==destinationTarget.id||draft.destinationGeographyId!==connection.arrivalFeatureId))throw new WorldError("An available craft route must keep its exact arrival and fit both appearance periods.",409);
    if(!archiving&&(command.action!=="historical-account"||draft.status==="available"||command.refreshSources)){const s=await endpoint(tx,sourceContext,connection.craftId,source,connection.sourceFeatureId),d=await endpoint(tx,destinationContext,connection.craftId,destination,connection.arrivalFeatureId);if(s.locked||d.locked)throw new WorldError("Unlock both saved craft entrance layers before changing the route.",400);if(command.action==="historical-account"&&command.refreshSources)connection={...connection,sourcePoint:s.point,arrivalPoint:d.point};}
    if(!connection.archived){const all=[...own.rows,...otherLinks.rows];free(all,source,connection.sourceFeatureId,id);if(connection.twoWay)free(all,destination,connection.arrivalFeatureId,id);}
    const geometry={sourceVersionId:sourceContext.version.id,destinationVersionId:destinationContext.version.id,connection:strip(connection)},account=accountSchema.parse({version:1,revision:connection.revision,connection:strip(connection),draft,source:archiving||command.action==="historical-account"&&!command.refreshSources?prior?.source??geometry:geometry,original:prior?.original??geometry}),update={key:routeKey(id),kind:"connections" as const,payload:account as unknown as Record<string,unknown>};
    await commitNativeUpdates(tx,otherContext,[update]);return {updates:[update],result:{craftId:connection.craftId,surface:here===nativeTargetKey(sourceTarget)?source:destination,connectionId:id}};
  }
}
