import {compositionSchema} from "./atlas-assets";
import {z} from "zod";
import {FLOOR_LIMITS,floorCommandSchema,floorDesignSchema,validateFloor,type FloorDocument,type FloorFrame} from "./building-floor";
type Store=Pick<Storage,"getItem"|"setItem"|"removeItem"|"key"|"length">;
let documentTab:string|undefined;
export function floorRecoveryKey(worldId:string,floorId:string,creation=false,namespace=""){
 if(!documentTab){try{const key="st:building-floor-tab:v1",retained=sessionStorage.getItem(key),reload=(performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined)?.type==="reload";documentTab=reload&&retained?retained:crypto.randomUUID();sessionStorage.setItem(key,documentTab);}catch{documentTab=crypto.randomUUID();}}
 return `${creation?"st:floor-create:v1":"st:building-floor:v1"}${namespace}:${worldId}:${floorId}:${documentTab}`;
}
export const floorRecoveryPrefix=(key:string)=>key.slice(0,key.lastIndexOf(":"))+":";
type EditableFloor=Pick<FloorDocument,"id"|"name"|"order"|"elevation"|"design">;
export function readFloorRecovery(store:Store,key:string,saved?:EditableFloor){
 const own=store.getItem(key);if(own)return {key,raw:own,otherTab:false};const prefix=floorRecoveryPrefix(key),candidates:{key:string;raw:string;updated:number}[]=[];
 for(let i=0;i<store.length;i++){const candidate=store.key(i);if(!candidate?.startsWith(prefix))continue;const raw=store.getItem(candidate);if(!raw)continue;try{const value=JSON.parse(raw);if(saved&&value.version===1&&value.floorId===saved.id&&!value.pending&&Array.isArray(value.drawing)&&!value.drawing.length&&value.name===saved.name&&value.order===saved.order&&value.elevation===saved.elevation&&JSON.stringify(value.design)===JSON.stringify(saved.design))continue;candidates.push({key:candidate,raw,updated:typeof value.updatedAt==="number"?value.updatedAt:0});}catch{candidates.push({key:candidate,raw,updated:0});}}
 candidates.sort((a,b)=>b.updated-a.updated);return candidates[0]?{...candidates[0],otherTab:true}:undefined;
}
export type FloorRecoveryCandidate=NonNullable<ReturnType<typeof readFloorRecovery>>;
export function removeUnchangedFloorRecovery(store:Store,candidate:FloorRecoveryCandidate|undefined,ownKey:string){if(candidate&&candidate.key!==ownKey&&store.getItem(candidate.key)===candidate.raw){store.removeItem(candidate.key);return true;}return false;}
export const floorCreationDraftSchema=z.object({version:z.literal(1),buildingId:z.uuid(),name:z.string().max(160),position:z.number().int().min(-1000).max(1000),mode:z.enum(["blank","outline","generate","copy"]),rooms:z.number().int().min(2).max(8),show:z.boolean(),design:floorDesignSchema,copyDesign:floorDesignSchema.nullable(),copyFloorId:z.uuid().nullable(),copyRevision:z.number().int().positive().nullable(),templateImages:compositionSchema.optional()}).strict();
export type FloorCreationDraft=z.infer<typeof floorCreationDraftSchema>;
export function parseFloorCreationRecovery(raw:string,buildingId:string,frame:FloorFrame){
 const value=JSON.parse(raw),pending=value.pending?floorCommandSchema.parse(value.pending):value.action?floorCommandSchema.parse(value):undefined;
 if(pending&&(pending.action!=="create"||pending.buildingId!==buildingId))throw Error("This retained creation belongs to another building.");
 const draft=value.creation?floorCreationDraftSchema.parse(value.creation):undefined;
 if(!draft&&!pending)throw Error("This retained floor creation cannot be read. Export it before discarding.");
 if(draft){if(draft.buildingId!==buildingId)throw Error("This retained preview belongs to another building.");validateFloor(draft.design,frame);if(draft.copyDesign)validateFloor(draft.copyDesign,frame);if(draft.mode==="copy"&&(!draft.copyDesign||!draft.copyFloorId||!draft.copyRevision))throw Error("The copied floor's original identity is missing.");}
 if(pending?.action==="create")validateFloor(pending.design,frame);
 return {draft,pending:pending?.action==="create"?pending:undefined};
}
export function writeFloorRecovery(store:Store,key:string,value:unknown){const raw=JSON.stringify({...value as object,updatedAt:Date.now()});if(new TextEncoder().encode(raw).length>FLOOR_LIMITS.draftBytes)throw Error("This draft exceeds the four-million-byte recovery limit.");if(!store.getItem(key)){const prefix=floorRecoveryPrefix(key);let count=0;for(let i=0;i<store.length;i++)if(store.key(i)?.startsWith(prefix))count++;if(count>=4)throw Error("Four tab drafts are retained for this floor. Save or export an earlier tab draft before closing this editor.");}store.setItem(key,raw);}
