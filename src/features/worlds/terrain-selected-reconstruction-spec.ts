import {z} from "zod";
import {regionAreaContainsPoint} from "./terrain-region-geometry";
import type {SharedProfile} from "./terrain-shared-relief";
import {SELECTED_RECONSTRUCTION_LIMIT} from "./terrain-selected-reconstruction";

export const selectedReconstructionSupportSchema=z.object({sourceId:z.uuid(),beforeRevision:z.number().int().positive(),afterRevision:z.number().int().positive(),
 x:z.number().finite().min(0),y:z.number().finite().min(0),weight:z.number().finite().positive().max(1+1e-12),before:z.number().int().min(-30000).max(30000),after:z.number().int().min(-30000).max(30000),
}).strict();
export const selectedReconstructionSupportsSchema=z.array(selectedReconstructionSupportSchema).min(1).max(SELECTED_RECONSTRUCTION_LIMIT);
export function validateSelectedReconstruction(supports:z.infer<typeof selectedReconstructionSupportsSchema>,before:number,after:number,
 selection:SharedProfile["selection"],world:{width:number;height:number;wrap:boolean},seaLevel:number){
 const seen=new Set<string>();let weight=0,delta=0;
 for(const node of supports){
  const key=node.sourceId+":"+node.x+":"+node.y;
  if(seen.has(key)||node.beforeRevision===node.afterRevision||node.before===node.after||node.before<=seaLevel||node.after<=seaLevel||node.x>world.width||node.y>world.height||!regionAreaContainsPoint(selection,node,world))return false;
  seen.add(key);weight+=node.weight;delta+=(node.after-node.before)*node.weight;
 }
 return weight<=1+1e-12&&Math.abs(delta-(after-before))<=1e-7;
}
