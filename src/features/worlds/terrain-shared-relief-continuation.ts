import {z} from "zod";
import {sharedReliefEffectSchema} from "./terrain-shared-relief-spec";
import {parseSharedReliefDraft,type SharedReliefDraft} from "./terrain-shared-relief-recovery";
import type {SharedReliefHistory} from "./terrain-shared-relief-client";
import {readTerrainReloadView,retainTerrainReloadView,type TerrainCamera} from "./terrain-reload-view";
import type {TerrainViewport} from "./terrain-refinement";

const acknowledgement=z.object({id:z.uuid(),groupId:z.uuid(),revision:z.number().int().positive(),action:z.enum(["apply","undo","redo"]),effects:z.array(sharedReliefEffectSchema).min(1).max(129)}).strict();
export type SharedReliefAcknowledgement=z.infer<typeof acknowledgement>;
/** One acknowledged native intent, in ephemeral UI memory only. No heights or authority. */
export type SharedReliefSavedContinuation={acknowledgement:SharedReliefAcknowledgement;settings:string;camera?:TerrainCamera};
export type BoundSharedReliefContinuation=SharedReliefSavedContinuation&{binding:string;sourceId:string|null};
export type ReadSharedReliefContinuation=BoundSharedReliefContinuation&{draft:SharedReliefDraft};

export function createSharedReliefContinuation(value:unknown,settings:string,expected:{worldId:string;mapId:string;rootRevision:number;requestId:string;retryOriginal?:boolean;action:"accept"|"undo"|"redo";kind:SharedReliefDraft["operation"]["kind"]},viewport?:TerrainViewport|null):SharedReliefSavedContinuation|undefined{
 const ack=acknowledgement.parse(value),draft=parseSharedReliefDraft(settings,expected.worldId,expected.mapId,expected.kind);
 if(draft.pending||ack.id!==expected.mapId||ack.groupId!==expected.requestId||ack.action!==(expected.action==="accept"?"apply":expected.action)||ack.revision>expected.rootRevision+1||!expected.retryOriginal&&ack.revision!==expected.rootRevision+1)throw Error("The saved relief acknowledgement does not match this native operation. Retry the retained original request.");
 // A genuine older exact retry is acknowledged normally, then returns to the
 // saved map. It cannot automatically resume over later accepted geography.
 if(ack.revision<expected.rootRevision)return;
 const camera=readTerrainReloadView("native-shared-continuation",retainTerrainReloadView("native-shared-continuation",viewport));
 return {acknowledgement:ack,settings,...camera?{camera}:{}};
}
export function bindSharedReliefContinuation(binding:string|undefined,sourceId:string|null,value:SharedReliefSavedContinuation):BoundSharedReliefContinuation|undefined{
 if(!binding||binding.length>16384||sourceId!==null&&!z.uuid().safeParse(sourceId).success)return;
 return {...value,binding,sourceId};
}
export function readSharedReliefContinuation(binding:string|undefined,sourceId:string|null,worldId:string,mapId:string,rootRevision:number,value:BoundSharedReliefContinuation|undefined):ReadSharedReliefContinuation|undefined{
 if(!binding||!value||value.binding!==binding||value.sourceId!==sourceId)return;
 try{const ack=acknowledgement.parse(value.acknowledgement),draft=parseSharedReliefDraft(value.settings,worldId,mapId);if(draft.pending||ack.id!==mapId||ack.revision!==rootRevision)return;const camera=value.camera?readTerrainReloadView(binding,{...value.camera,binding}):undefined;return {...value,camera,acknowledgement:ack,draft};}catch{return;}
}
/** This existing native history check covers the complete saved source/water/site context. */
export function sharedReliefContinuationMatchesHistory(value:ReadSharedReliefContinuation,history:SharedReliefHistory|undefined){
 const current=history?.current,ack=value.acknowledgement;
 return history?.available===true&&!!current&&current.groupId===ack.groupId&&current.revision===ack.revision&&current.action===ack.action&&(ack.action==="undo"?current.canRedo===true:current.canUndo===true);
}
