import {z} from "zod";
import type {TerrainGeometry} from "./terrain";
import type {TerrainFrame} from "./terrain-refinement";
import {REFINEMENT_LIMIT} from "./terrain-refinement";
import {ADVANCED_TERRAIN_LIMITS,landformProfileSchema,sharedReliefOperationSchema} from "./terrain-advanced-spec";
import type {AdvancedTerrainContext,AdvancedResult} from "./terrain-advanced";
import {planProfileWindow,type ProfileWindow,prepareWindowedProfile} from "./terrain-profile-window";

export type SharedProfile=z.infer<typeof landformProfileSchema>;
export type SharedReliefOperation=z.infer<typeof sharedReliefOperationSchema>;
export const sharedReliefWorkAreaSchema=z.object({x:z.number().finite().min(0),y:z.number().finite().min(0),width:z.number().finite().positive(),height:z.number().finite().positive()}).strict();
export type SharedReliefSource={id:string|null;revision:number;shape:TerrainGeometry;frame:TerrainFrame};
export type SharedReliefPlan={source:SharedReliefSource;window:ProfileWindow};
export type SharedReliefBudget={plans:SharedReliefPlan[];cells:number;sampleSteps:number;workingBytes:number;binaryBytes:number;rootPreviewBytes:number};

/** Plan every accepted source at its own resolution before allocating a grid.
 * Processing areas are execution boundaries, not geographic profile blends. */
export function planSharedRelief(sources:SharedReliefSource[],raw:SharedReliefOperation,rawArea:TerrainFrame,context:Omit<AdvancedTerrainContext,"frame">):SharedReliefBudget {
 const op=sharedReliefOperationSchema.parse(raw),area=sharedReliefWorkAreaSchema.parse(rawArea);
 if(sources.length>REFINEMENT_LIMIT+1||new Set(sources.map(s=>s.id)).size!==sources.length||sources.filter(s=>s.id===null).length!==1)throw Error("Load one World and its complete accepted terrain-source list.");
 let cells=0,n=0,axes=0;const plans:SharedReliefPlan[]=[];
 for(const source of sources){
  const window=planProfileWindow(source.shape,op,{...context,frame:source.frame},{shared:true,processingArea:area});if(!window)continue;
  cells+=window.nativeCells!;n+=window.width*window.height;axes+=(window.width+window.height)*4;plans.push({source,window});
 }
 if(!cells)throw Error("This work area contains no native samples from the selected profile.");
 const rootPlan=plans.find(p=>p.source.id===null),rootPreviewBytes=rootPlan&&(rootPlan.window.width!==rootPlan.source.shape.width||rootPlan.window.height!==rootPlan.source.shape.height)?rootPlan.source.shape.width*rootPlan.source.shape.height*2:0,
  sampleSteps=cells*(op.kind==="erosion"?op.iterations:op.points.length-1),binaryBytes=8+n*4,
  // Reserve the existing numerical kernel and binary before/after transport.
  // This is a combined bound over all affected sources, not a per-source reset.
  workingBytes=Math.max(n*10+cells*(op.kind==="erosion"&&op.preserveShoreline?65:64)+axes,n*8+cells*8+rootPreviewBytes)+ADVANCED_TERRAIN_LIMITS.packetCharacters+2*1048576;
 if(cells>ADVANCED_TERRAIN_LIMITS.cells||sampleSteps>ADVANCED_TERRAIN_LIMITS.work)throw Error("Choose a smaller native work area. Across all sources the limit is 262,144 samples and 8,388,608 sample-steps; every source keeps its native resolution.");
 if(workingBytes>ADVANCED_TERRAIN_LIMITS.workingBytes)throw Error("Choose a smaller native work area. Its combined numerical windows exceed the existing 32 MiB budget.");
 return {plans,cells,sampleSteps,workingBytes,binaryBytes,rootPreviewBytes};
}

/** Shared relief intentionally evaluates the same native intent through the
 * hierarchy. The separate atomic writer must certify the complete source and
 * water/site vector. Ordinary single-source editing still supplies its mask. */
export async function prepareSharedReliefSource(plan:SharedReliefPlan,base:Int16Array,manual:Uint8Array,op:SharedReliefOperation,context:Omit<AdvancedTerrainContext,"frame">,progress?:(value:number)=>void,signal?:AbortSignal,coastGuard?:Uint8Array):Promise<AdvancedResult> {
 if(coastGuard&&coastGuard.length!==base.length)throw Error("The accepted shared shoreline guard is incomplete.");
 return prepareWindowedProfile(base,plan.source.shape,op,{...context,frame:plan.source.frame,...op.kind==="erosion"?{shoreSupports:coastGuard}:{}},plan.window,coastGuard,manual,progress,signal);
}
