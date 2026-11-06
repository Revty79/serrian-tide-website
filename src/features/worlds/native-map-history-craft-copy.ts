import "server-only";
import {randomUUID} from "node:crypto";
import {craftCommandSchema,craftDraftSchema,deckDraftSchema,cloneCraftSurface,type CraftBundle,type CraftConnection,type CraftSurfaceKey} from "./craft";
import {nativeContentContext,nativeRelatedContext,nativeResource,type NativeContentContext} from "./native-map-history-context";
import {nativeContentHash,type NativeHistoryTx} from "./native-map-history-store";
import {createNativeCraft,createNativeDeck,nativeCraftIdentities} from "./native-map-history-craft-create";
import {nativeCraftRoutes,nativeCraftRouteAccountSchema} from "./native-map-history-craft-routes";
import {commitNativeUpdates,type NativeWriteResult} from "./native-map-history-write";
import {saveNativeCraft} from "./native-map-history-shapes";
import {nativeConditions} from "./native-map-history-conditions";
import {nativeObjectPresent} from "./native-map-history";
import type {AssetComposition} from "./atlas-assets";
import {WorldError} from "./world-service";

/** Copy the selected dated craft as a separate canonical craft. Every retained
 * deck must have an explicit source at this year; missing coverage blocks the
 * complete copy instead of silently borrowing a current-day deck. */
export async function duplicateNativeCraft(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown):Promise<NativeWriteResult>{
  const command=craftCommandSchema.parse(raw);
  if(command.action!=="duplicate"||c.scope.target.kind!=="craft"||c.scope.target.id!==command.craftId)throw new WorldError("Open this craft's editable dated exterior before duplicating its complete design.",409);
  const original=((await nativeResource(tx,c,"craft")).payload as unknown as {bundle:CraftBundle}).bundle.craft!;
  if(!original||original.archived||original.revision!==command.revision||!nativeObjectPresent((await nativeConditions(tx,c)).values,command.craftId))throw new WorldError("Review this exact active dated craft revision before copying it.",409);
  const identities=await nativeCraftIdentities(tx,c,command.craftId),sourceBySurface=new Map<CraftSurfaceKey,NativeContentContext>([["exterior",c]]),sources=new Map<string,NativeContentContext>();
  const exterior=cloneCraftSurface(original.surface,randomUUID),objectIds=new Map<CraftSurfaceKey,Map<string,string>>([["exterior",exterior.ids]]),surfaceIds=new Map<CraftSurfaceKey,CraftSurfaceKey>([["exterior","exterior"]]);
  const composition=async(context:NativeContentContext):Promise<AssetComposition>=>{const value=(await nativeResource(tx,context,"composition")).payload as unknown as {layer:AssetComposition};const ids=objectIds.get(context.scope.target.kind==="craft"?"exterior":context.scope.target.id)!;return {version:1,placements:value.layer.placements.map(p=>{const id=randomUUID();ids.set(p.id,id);return {...p,id};})};};
  const templateDecks:NonNullable<Extract<ReturnType<typeof craftCommandSchema.parse>,{action:"create"}>["templateDecks"]>=[],archived=new Set<string>();
  for(const identity of identities.decks){
    if(identity.historicalCoverage!=="established")throw new WorldError("Establish dated coverage for every retained deck before copying the complete craft. No modern or unknown deck geometry has been substituted.",409);
    const source=await nativeRelatedContext(tx,c,{kind:"deck",id:identity.id}),record=((await nativeResource(tx,source,"deck")).payload as unknown as {deck:NonNullable<CraftBundle["deck"]>}).deck;
    if(!record||record.craftId!==command.craftId)throw new WorldError("This copied deck's recorded craft source is unavailable.",409);
    const cloned=cloneCraftSurface(record.surface,randomUUID),id=randomUUID();surfaceIds.set(identity.id,id);objectIds.set(identity.id,cloned.ids);sourceBySurface.set(identity.id,source);sources.set(id,source);
    templateDecks.push({id,draft:deckDraftSchema.parse({name:record.name,order:record.order,height:record.height,frame:record.frame,surface:cloned.surface}),images:await composition(source)});if(record.archived)archived.add(id);
  }
  const snapshot=(r:CraftConnection)=>({id:r.id,worldId:r.worldId,craftId:r.craftId,revision:r.revision,source:r.source,sourceFeatureId:r.sourceFeatureId,sourcePoint:r.sourcePoint,destination:r.destination,arrivalFeatureId:r.arrivalFeatureId,arrivalPoint:r.arrivalPoint,kind:r.kind,twoWay:r.twoWay,archived:r.archived});
  const originalRoutes=new Map<string,{connection:CraftConnection;account?:Awaited<ReturnType<typeof nativeCraftRoutes>>["accounts"] extends Map<string,infer A>?A:never}>();
  for(const context of sourceBySurface.values()){
    const links=await nativeCraftRoutes(tx,context);
    for(const connection of links.rows){const previous=originalRoutes.get(connection.id);if(previous&&nativeContentHash(previous.connection)!==nativeContentHash(connection))throw new WorldError("The dated craft surfaces retain different route accounts. Review their original sources before copying the complete craft.",409);originalRoutes.set(connection.id,{connection,account:links.accounts.get(connection.id)});}
  }
  const created=await createNativeCraft(tx,c,{action:"create",requestId:command.requestId,craftId:command.newCraftId,draft:craftDraftSchema.parse({name:command.name,classification:original.classification,description:original.description,frame:original.frame,surface:exterior.surface}),templateImages:await composition(c)},sources);
  const child=created.result.childHistorical as {stateId:string},newBySurface=new Map<CraftSurfaceKey,NativeContentContext>();
  const resolve=async(surface:CraftSurfaceKey)=>{
    const target=surface==="exterior"?{kind:"craft" as const,id:command.newCraftId}:{kind:"deck" as const,id:surface};
    const context=surface==="exterior"?await nativeContentContext(tx,c.userId,c.worldId,{...c.scope,target,stateId:child.stateId,edit:true,versionId:undefined},{ownerId:c.userId,archived:false,review:false,ordinary:false}):await nativeRelatedContext(tx,c,target);
    return nativeContentContext(tx,c.userId,c.worldId,{...context.scope,edit:true,versionId:undefined},{ownerId:c.userId,archived:false,review:false,ordinary:false});
  };
  const copiedParent=await resolve("exterior");
  for(const deck of templateDecks)await createNativeDeck(tx,copiedParent,{id:deck.id,craftId:command.newCraftId,draft:deck.draft,requestId:command.requestId,images:deck.images,copySource:sources.get(deck.id)});
  for(const surface of surfaceIds.values())newBySurface.set(surface,await resolve(surface));
  const updates=new Map<CraftSurfaceKey,NativeWriteResult["updates"]>();
  for(const [oldSurface,context]of sourceBySurface){
    const surface=surfaceIds.get(oldSurface)!,before=await nativeConditions(tx,context),ids=objectIds.get(oldSurface)!;
    ids.set(oldSurface==="exterior"?command.craftId:oldSurface,surface==="exterior"?command.newCraftId:surface);
    const values=before.values.map(value=>{const id=ids.get(value.id);if(!id)throw new WorldError("This retained historical condition has no independent copied object. Review the original craft sources before duplicating.",409);return {...value,id};});
    if(values.length){await commitNativeUpdates(tx,newBySurface.get(surface)!,[{key:"conditions",kind:"conditions",payload:{revision:1,values}}]);newBySurface.set(surface,await resolve(surface));}
  }

  for(const id of archived){const context=await resolve(id),deck=((await nativeResource(tx,context,"deck")).payload as unknown as {deck:NonNullable<CraftBundle["deck"]>}).deck,update=await saveNativeCraft(tx,context,{action:"lifecycle",requestId:command.requestId,craftId:command.newCraftId,surface:id,revision:deck.revision,archived:true});await commitNativeUpdates(tx,context,update.updates);newBySurface.set(id,await resolve(id));}
  for(const {connection:old,account:oldAccount}of originalRoutes.values()){
    const source=surfaceIds.get(old.source),destination=surfaceIds.get(old.destination),sourceFeatureId=objectIds.get(old.source)?.get(old.sourceFeatureId),arrivalFeatureId=objectIds.get(old.destination)?.get(old.arrivalFeatureId);
    if(!source||!destination||!sourceFeatureId||!arrivalFeatureId)throw new WorldError("Restore the missing dated craft endpoint before duplicating this complete design.",409);
    const connection={id:randomUUID(),worldId:c.worldId,craftId:command.newCraftId,revision:1,source,destination,sourceFeatureId,arrivalFeatureId,sourcePoint:old.sourcePoint,arrivalPoint:old.arrivalPoint,kind:old.kind,twoWay:old.twoWay,archived:old.archived},pins={sourceVersionId:newBySurface.get(source)!.version.id,destinationVersionId:newBySurface.get(destination)!.version.id,connection};
    const account=nativeCraftRouteAccountSchema.parse({version:1,revision:1,connection,source:pins,original:oldAccount?.account.original??{sourceVersionId:sourceBySurface.get(old.source)!.version.id,destinationVersionId:sourceBySurface.get(old.destination)!.version.id,connection:snapshot(old)},draft:oldAccount?{...oldAccount.account.draft,destinationMapId:oldAccount.account.draft.status==="available"?(destination==="exterior"?command.newCraftId:destination):null,destinationGeographyId:null}:{destinationMapId:destination==="exterior"?command.newCraftId:destination,destinationGeographyId:null,startYear:c.scope.year,endYear:c.scope.year,status:"available",account:`Deliberate copy of retained craft route ${old.id} from selected dated geometry.`,accountYear:c.scope.year,originalNotation:"",protected:true,name:"Copied craft route"}});
    for(const surface of [source,destination]){const list=updates.get(surface)??[];list.push({key:"craft-route:"+connection.id,kind:"connections",payload:account});updates.set(surface,list);}
  }
  for(const [surface,list]of updates)await commitNativeUpdates(tx,newBySurface.get(surface)!,list);

  const latest=await resolve("exterior");created.result.childHistorical={stateId:latest.scope.stateId,versionId:latest.version.id,revision:latest.selected.revision,timelineId:c.scope.timelineId,year:c.scope.year};return created;
}
