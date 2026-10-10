import { z } from "zod";
import { MAP_WIDTH, MAP_HEIGHT, rounded } from "./atlas-coordinates";
import { validateGeometry } from "./atlas-geometry";
import type { Point } from "./atlas";
export const settlementKinds = ["street", "district", "building", "wall", "waterway", "space", "landmark"] as const;
export const settlementLayers = ["waterways", "roads", "districts", "buildings", "walls", "landmarks", "labels"] as const;
const id=z.string().uuid(), coordinate=z.number().finite(), point=z.object({x:coordinate.min(0).max(MAP_WIDTH),y:coordinate.min(0).max(MAP_HEIGHT)}).strict(), vertex=point.extend({id});
export const settlementEntitySchema=z.object({geographyId:id,revision:z.number().int().positive().nullable(),kind:z.enum(settlementKinds),classification:z.string().trim().max(160),districtIds:z.array(id).max(128)}).strict();
const common={version:z.literal(1),id,geographyId:id,archived:z.boolean(),variant:z.enum(["plain","main","lane","trail","bridge","gate","tower","park","plaza","harbor","custom"])};
export const settlementShapeSchema=z.discriminatedUnion("type",[
 z.object({...common,type:z.literal("line"),points:z.array(vertex).min(2).max(256),width:coordinate.min(1).max(100),curve:coordinate.min(0).max(1)}).strict(),
 z.object({...common,type:z.literal("area"),points:z.array(vertex).min(3).max(256)}).strict(),
 z.object({...common,type:z.literal("marker"),point,size:coordinate.min(4).max(160),rotation:coordinate.min(-180).max(180)}).strict()
]);
const state=z.object({visible:z.boolean(),locked:z.boolean()}).strict();
export const settlementStateSchema=z.object({version:z.literal(1),layers:z.object({waterways:state,roads:state,districts:state,buildings:state,walls:state,landmarks:state,labels:state}).strict()}).strict();
export const defaultSettlementState=()=>settlementStateSchema.parse({version:1,layers:Object.fromEntries(settlementLayers.map(l=>[l,{visible:true,locked:false}]))});
export type SettlementShape=z.infer<typeof settlementShapeSchema>;
export type SettlementEntity=z.infer<typeof settlementEntitySchema>;
export type SettlementState=z.infer<typeof settlementStateSchema>;
export const settlementLayer=(kind:typeof settlementKinds[number])=>({street:"roads",district:"districts",building:"buildings",wall:"walls",waterway:"waterways",space:"districts",landmark:"landmarks"})[kind] as typeof settlementLayers[number];
export function validateSettlement(shapes:SettlementShape[],entities:SettlementEntity[]){
 if(shapes.length>4000||entities.length>4000)throw new Error("A settlement map supports 4,000 representations and places.");
 if(new Set(shapes.map(s=>s.id)).size!==shapes.length||new Set(entities.map(e=>e.geographyId)).size!==entities.length)throw new Error("Settlement identities cannot repeat.");
 const byId=new Map(entities.map(e=>[e.geographyId,e]));let total=0;
 for(const s of shapes){settlementShapeSchema.parse(s);const e=byId.get(s.geographyId);if(!e)throw new Error("Each representation needs its persistent place.");
  const expected=e.kind==="building"||e.kind==="district"||e.kind==="space"?"area":e.kind==="landmark"?"marker":"line";
  if(s.type!==expected)throw new Error("Choose geometry matching this settlement place.");
  const points=s.type==="marker"?[s.point]:s.points;total+=points.length;
  if(points.some(p=>Math.abs(p.x-rounded(p.x))>1e-8||Math.abs(p.y-rounded(p.y))>1e-8))throw new Error("Use at most two decimal places for map coordinates.");
  if(s.type==="area")validateGeometry({version:1,type:"polygon",points:s.points});
  if(s.type==="line"&&(new Set(s.points.map(p=>p.id)).size!==points.length||s.points.some((p,i)=>i>0&&p.x===points[i-1].x&&p.y===points[i-1].y)))throw new Error("Line points need distinct identities and consecutive positions.");
 }
 if(total>64000)throw new Error("A settlement map supports 64,000 total editable points.");
 for(const e of entities){settlementEntitySchema.parse(e);if(new Set(e.districtIds).size!==e.districtIds.length||e.districtIds.includes(e.geographyId))throw new Error("Choose distinct districts other than this place.");}
}
export function shapePoints(s:SettlementShape){return s.type==="marker"?[s.point]:s.points;}
export function transformShape(s:SettlementShape,dx=0,dy=0,degrees=0,scale=1):SettlementShape{
 const points=shapePoints(s),cx=points.reduce((n,p)=>n+p.x,0)/points.length,cy=points.reduce((n,p)=>n+p.y,0)/points.length,r=degrees*Math.PI/180;
 const move=<T extends Point>(p:T):T=>({...p,x:rounded(cx+(p.x-cx)*scale*Math.cos(r)-(p.y-cy)*scale*Math.sin(r)+dx),y:rounded(cy+(p.x-cx)*scale*Math.sin(r)+(p.y-cy)*scale*Math.cos(r)+dy)});
 return s.type==="marker"?{...s,point:move(s.point),rotation:Math.max(-180,Math.min(180,s.rotation+degrees)),size:s.size*scale}:{...s,points:s.points.map(move)};
}

export function settlementVariants(kind:typeof settlementKinds[number]):SettlementShape["variant"][]{return kind==="street"?["plain","main","lane","trail","bridge"]:kind==="space"?["plain","park","plaza","harbor"]:kind==="landmark"?["plain","gate","tower","custom"]:["plain","custom"];}
