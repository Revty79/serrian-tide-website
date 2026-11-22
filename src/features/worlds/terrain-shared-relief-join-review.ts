import {z} from "zod";
import {ADVANCED_TERRAIN_LIMITS,advancedAreaSchema} from "./terrain-advanced-spec";
import type {AdvancedTerrainContext} from "./terrain-advanced";
import type {SharedReliefSnapshot} from "./terrain-shared-relief-spec";
import {frameLocalPoint,normalizeTerrainX,REFINEMENT_LIMIT,type TerrainFrame} from "./terrain-refinement";
import {regionAreaContainsPoint} from "./terrain-region-geometry";
import {insideWaterRings,waterBounds} from "./terrain-water-geometry";
import {profileWorkArea} from "./terrain-profile-work-area";
import {selectedReconstructionSupportsSchema,validateSelectedReconstruction} from "./terrain-selected-reconstruction-spec";
import type {SelectedReconstructionSupport} from "./terrain-selected-reconstruction";

const revision=z.number().int().positive(),height=z.number().finite().min(-30000).max(30000);
export const sharedReliefJoinSupportSchema=z.object({
 edge:z.enum(["east","south"]),index:z.number().int().min(0).max(4096),before:height,after:height,outsideWorkArea:z.boolean(),reconstruction:selectedReconstructionSupportsSchema.optional(),
}).strict();
export const sharedReliefJoinReviewDataSchema=z.object({
 scope:z.literal("selected-dry"),world:z.object({width:z.number().finite().positive(),height:z.number().finite().positive(),wrap:z.boolean()}).strict(),selection:advancedAreaSchema,workArea:advancedAreaSchema.shape.frame,seaLevel:height,reconstructionSupports:z.literal(true).optional(),
 sources:z.array(z.object({sourceId:z.uuid(),frame:advancedAreaSchema.shape.frame,columns:z.number().int().min(32).max(4096),rows:z.number().int().min(32).max(4096),oldParentRevision:revision,newParentRevision:revision,
  supports:z.array(sharedReliefJoinSupportSchema).min(1).max(8193),
 }).strict()).min(1).max(REFINEMENT_LIMIT),
}).strict().superRefine((value,c)=>{
 const ids=new Set<string>(),area=profileWorkArea(value.selection.frame,value.workArea,value.world);let total=0,outside=0,reconstruction=0;
 for(const source of value.sources){
  if(ids.has(source.sourceId))c.addIssue({code:"custom",message:"The border review repeats a source."});ids.add(source.sourceId);
  const seen=new Set<string>();for(const support of source.supports){
   const key=support.edge+":"+support.index;if(seen.has(key))c.addIssue({code:"custom",message:"The border review repeats a native support."});seen.add(key);
   if(support.before===support.after||support.before<=value.seaLevel||support.after<=value.seaLevel)c.addIssue({code:"custom",message:"Only changed dry supports belong to this border review."});
   const maximum=support.edge==="east"?source.rows:source.columns-1;
   if(support.index>maximum)c.addIssue({code:"custom",message:"The reviewed support is outside its native edge."});
   const raw={x:source.frame.x+(support.edge==="east"?source.frame.width:support.index/source.columns*source.frame.width),y:source.frame.y+(support.edge==="south"?source.frame.height:support.index/source.rows*source.frame.height)},
    point={x:value.world.wrap?normalizeTerrainX(raw.x,value.world.width):Math.min(value.world.width,raw.x),y:Math.min(value.world.height,raw.y)},
    selected=regionAreaContainsPoint(value.selection,point,value.world),inside=area.containsX(point.x)&&area.containsY(point.y)&&selected;
   const proof=support.reconstruction;
   if(proof){reconstruction+=proof.length;if(selected||!value.reconstructionSupports||!validateSelectedReconstruction(proof,support.before,support.after,value.selection,value.world,value.seaLevel))c.addIssue({code:"custom",message:"The border reconstruction does not match selected native supports."});}
   if(!selected&&!proof||support.outsideWorkArea===inside)c.addIssue({code:"custom",message:"The reviewed border scope does not match its native selection and window."});
   total++;if(support.outsideWorkArea)outside++;
  }
 }
 if(total+reconstruction>ADVANCED_TERRAIN_LIMITS.cells||!outside||!!value.reconstructionSupports!==!!reconstruction)c.addIssue({code:"custom",message:"The border review is empty or exceeds the existing sample bound."});
});
export const sharedReliefJoinReviewSchema=sharedReliefJoinReviewDataSchema.safeExtend({reviewHash:z.string().regex(/^[a-f0-9]{64}$/)});
export type SharedReliefJoinSupport=z.infer<typeof sharedReliefJoinSupportSchema>;
export type SharedReliefJoinReviewData=z.infer<typeof sharedReliefJoinReviewDataSchema>;
export type SharedReliefJoinReview=z.infer<typeof sharedReliefJoinReviewSchema>;
type Point={x:number;y:number};
export type SelectedDryJoinOptions={
 context:Omit<AdvancedTerrainContext,"frame">;selection:z.infer<typeof advancedAreaSchema>;workArea:TerrainFrame;
 preserveManual:boolean;nativeCells:number;workingBytes:number;work:(steps:number)=>void;allowReconstruction?:boolean;
};
export type SelectedReconstructionReview={supports:SelectedReconstructionSupport[];read:(support:SelectedReconstructionSupport)=>Promise<{frame:TerrainFrame;columns:number;rows:number;sample:(point:Point,next:boolean)=>number|Promise<number>}>};
/** Bounded native review data, never terrain input or an alternative writer. */
export function createSelectedDryJoinReview(options:SelectedDryJoinOptions){
 const {context,selection,workArea}=options,world=context.world,groups=new Map<string,SharedReliefJoinReviewData["sources"][number]>();
 if(options.preserveManual)throw Error("Keep manual heights protected, or explicitly permit their replacement before reviewing dry border joins.");
 if(context.sites.length>8192)throw Error("The saved settlement-support context exceeds its existing bound.");
 const lakes=context.water.lakes??[],features=context.water.features??[];
 options.work(lakes.length+features.length);
 const bodies=[...lakes,...features.filter(v=>v.kind==="wetland")].map(v=>{const vertices=v.rings.reduce((n,r)=>n+r.length,0);
  // Charge ring traversal, flattening, unwrapping and the bounds scan before
  // allocating their temporary geometry, including wrapped Worlds.
  options.work(1+v.rings.length+3*vertices);
  return {rings:v.rings,bounds:waterBounds(v.rings.flat(),world),vertices};
 });
 let samples=0,outside=0,reconstructionSamples=0;
 const canonical=(point:Point)=>({x:world.wrap?normalizeTerrainX(point.x,world.width):Math.max(0,Math.min(world.width,point.x)),y:Math.max(0,Math.min(world.height,point.y))});
 async function protect(source:Pick<SharedReliefSnapshot,"frame"|"columns"|"rows">,point:Point,sample:(point:Point,next:boolean)=>number|Promise<number>){
   const sx=source.frame.width/source.columns,sy=source.frame.height/source.rows;
   for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
    const p=canonical({x:point.x+x*sx,y:point.y+y*sy});options.work(2);
    const before=await sample(p,false),after=await sample(p,true);
    if(before<=context.seaLevel||after<=context.seaLevel)throw Error("The dry border join touches saved sea or shoreline supports. Keep their original parent context.");
    for(const body of bodies){
     const b=body.bounds,dx=world.wrap?((p.x-b.x)%world.width+world.width)%world.width:p.x-b.x;options.work(1);
     if(p.y<b.y||p.y>b.y+b.height||dx<0||dx>b.width)continue;options.work(body.rings.length+2*body.vertices);
     if(insideWaterRings(p,body.rings,world))throw Error("The dry border join touches a saved lake or wetland support. Its ground and water are preserved.");
    }
   }
   for(const site of context.sites){
    options.work(1);const p=frameLocalPoint(site,source.frame,world.width,world.wrap),gx=p.x/sx,gy=p.y/sy;
    if(gx<0||gx>=source.columns||gy<0||gy>=source.rows)continue;
    const centre=canonical({x:source.frame.x+Math.min(source.columns-1,Math.round(gx))*sx,y:source.frame.y+Math.min(source.rows-1,Math.round(gy))*sy});
    let dx=Math.abs(point.x-centre.x);if(world.wrap)dx=Math.min(dx,world.width-dx);
    if(dx<=sx+1e-7&&Math.abs(point.y-centre.y)<=sy+1e-7)throw Error("The dry border join touches a saved settlement support. Its original geography is preserved.");
   }
 }
 return {
  async add(source:SharedReliefSnapshot,point:Point,support:SharedReliefJoinSupport,oldParentRevision:number,newParentRevision:number,sample:(point:Point,next:boolean)=>number|Promise<number>,reconstruction?:SelectedReconstructionReview){
   options.work(selection.footprint?1+selection.footprint.parts.length+3*selection.footprint.parts.reduce((n,p)=>n+p.length,0):1);
   const selected=regionAreaContainsPoint(selection,point,world);
   if(!selected&&(!options.allowReconstruction||!reconstruction))throw Error("The dry border join leaves the original selected outline. Keep saved geography and review a selection containing the whole join.");
   if(support.reconstruction||reconstruction&&(selected||!options.allowReconstruction))throw Error("Reconstruction evidence must come from the selected native parent reader.");
   if(support.before<=context.seaLevel||support.after<=context.seaLevel)throw Error("A retained sea support cannot reconnect. Its saved geography is preserved.");
   const nodes=reconstruction?selectedReconstructionSupportsSchema.parse(reconstruction.supports):undefined;
   if(nodes){
    options.work(nodes.length*(selection.footprint?1+selection.footprint.parts.length+3*selection.footprint.parts.reduce((n,p)=>n+p.length,0):1));
    if(!validateSelectedReconstruction(nodes,support.before,support.after,selection,world,context.seaLevel))throw Error("The border reconstruction does not match selected native supports.");
   }
   const next=samples+1,nextReconstruction=reconstructionSamples+(nodes?.length??0);
   if(options.nativeCells+next+nextReconstruction>ADVANCED_TERRAIN_LIMITS.cells)throw Error("The native window and reviewed borders exceed the existing 262,144-sample bound. Choose a smaller window.");
   if(options.workingBytes+next*512+nextReconstruction*256>ADVANCED_TERRAIN_LIMITS.workingBytes)throw Error("The native window and complete border review exceed the existing 32 MiB bound. Choose a smaller window.");
   await protect(source,point,sample);
   if(nodes&&reconstruction)for(const node of nodes){const native=await reconstruction.read(node);await protect(native,node,native.sample);}
   let group=groups.get(source.id);if(!group){group={sourceId:source.id,frame:source.frame,columns:source.columns,rows:source.rows,oldParentRevision,newParentRevision,supports:[]};groups.set(source.id,group);}
   group.supports.push(nodes?{...support,reconstruction:nodes}:support);samples=next;reconstructionSamples=nextReconstruction;if(support.outsideWorkArea)outside++;
  },
  samples:()=>samples+reconstructionSamples,workingBytes:()=>samples*512+reconstructionSamples*256,
  review:():SharedReliefJoinReviewData|undefined=>outside?sharedReliefJoinReviewDataSchema.parse({scope:"selected-dry",world,selection,workArea,seaLevel:context.seaLevel,...reconstructionSamples?{reconstructionSupports:true}:{},sources:[...groups.values()]}):undefined,
 };
}
