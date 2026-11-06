import "server-only";
import {randomUUID} from "node:crypto";
import {worldMapState,worldMapStateHead} from "@/db/world-map-state-schema";
import {appendNativeVersion,storeNativeComponent,type NativeHistoryTx} from "./native-map-history-store";
import {nativeContentContext,type NativeContentContext} from "./native-map-history-context";
import {nativeTargetKey,type NativeMapTarget,type NativeResource,type NativeManifest} from "./native-map-history";
import {bindNativeTownBackdrop} from "./native-map-history-backdrop";
import {saveNativeComposition} from "./native-map-history-shapes";
import {commitNativeUpdates} from "./native-map-history-write";
import type {AssetComposition} from "./atlas-assets";

export const emptyNativeConnections=()=>({available:true,canEdit:false,canRecover:false,ordinary:false,reason:"Each destination resolves its own dated appearance.",sites:[],levels:[],document:null,connections:[]});
export const emptyNativeComposition=()=>({available:true,revision:0,layer:{version:1,placements:[]},history:[]});
/** Reserve the existing family identity first, then establish its first dated
 * appearance atomically. No current baseline is created or inferred. */
export async function createNativeMapAppearance(tx:NativeHistoryTx,parent:NativeContentContext,target:NativeMapTarget,name:string,resources:{key:string;kind:NativeResource["kind"];payload:Record<string,unknown>}[],images?:AssetComposition,sourceDependencies:NativeManifest["dependencies"]=[]){
  const id=randomUUID(),refs:NativeResource[]=[];
  for(const resource of resources)refs.push({key:resource.key,kind:resource.kind,componentId:await storeNativeComponent(tx,parent.worldId,parent.userId,resource.kind,resource.payload)});
  const dependencies:NativeManifest["dependencies"]=[{target:parent.scope.target,versionId:parent.version.id}];
  if(parent.authority&&nativeTargetKey(parent.authority.scope.target)!==nativeTargetKey(parent.scope.target))dependencies.push({target:parent.authority.scope.target,versionId:parent.authority.version.id});
  for(const dependency of sourceDependencies)if(!dependencies.some(known=>nativeTargetKey(known.target)===nativeTargetKey(dependency.target)))dependencies.push(dependency);
  let manifest:NativeManifest={version:1,target,resources:refs,dependencies};
  const rootVersion=parent.authority?.version.id??parent.version.id;
  manifest=await bindNativeTownBackdrop(tx,parent.worldId,parent.userId,parent.scope.timelineId,parent.scope.year,manifest,rootVersion,target.kind==="town");
  await tx.insert(worldMapState).values({id,worldId:parent.worldId,mapId:parent.version.mapId,originTimelineId:parent.scope.timelineId});
  const birthSource=await appendNativeVersion(tx,{worldId:parent.worldId,anchorMapId:parent.version.mapId,timelineId:parent.scope.timelineId,authorId:parent.userId,stateId:null,manifest,baselineRevision:1,sourceAccount:`Exact initial content for a native identity introduced from dated source ${parent.version.id}. This immutable source receipt establishes no current baseline or independent period.`});
  const version=await appendNativeVersion(tx,{worldId:parent.worldId,anchorMapId:parent.version.mapId,timelineId:parent.scope.timelineId,authorId:parent.userId,stateId:id,source:birthSource,manifest,baselineRevision:1,details:{name,startYear:parent.scope.year,endYear:parent.scope.year,account:`Introduced deliberately from retained map source ${parent.version.id} at canonical Year ${parent.scope.year}.`,protected:true}});
  await tx.insert(worldMapStateHead).values({worldId:parent.worldId,mapId:parent.version.mapId,timelineId:parent.scope.timelineId,stateId:id,versionId:version.id,revision:1,mode:"authored"});
  let result={stateId:id,versionId:version.id,revision:1,timelineId:parent.scope.timelineId,year:parent.scope.year};
  if(images?.placements.length){
    const context=await nativeContentContext(tx,parent.userId,parent.worldId,{timelineId:parent.scope.timelineId,target,stateId:id,year:parent.scope.year,edit:true},{ownerId:parent.userId,archived:false,review:false,ordinary:false});
    const composed=await saveNativeComposition(tx,context,{action:"compose",requestId:randomUUID(),target:{kind:target.kind==="deck"?"craft-deck":target.kind,id:target.id},revision:0,layer:images});
    const accepted=await commitNativeUpdates(tx,context,composed.updates);result={...result,versionId:accepted.version.id,revision:accepted.revision};
  }
  return result;
}
