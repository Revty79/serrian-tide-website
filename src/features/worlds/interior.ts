import { z } from "zod";
import { MAP_HEIGHT, MAP_WIDTH, rounded } from "./atlas-coordinates";
import { validateGeometry } from "./atlas-geometry";
import type { Point } from "./atlas";

const id=z.string().uuid(), coordinate=z.number().finite();
const point=z.object({x:coordinate,y:coordinate}).strict(), vertex=point.extend({id});
export const interiorKinds=["room","wall","opening","window","transition","furnishing","landmark"] as const;
export const interiorLayers=["flooring","room","wall","opening","window","transition","furnishing","landmark","labels"] as const;
export const furnishings=["table","chair","bed","shelf","cabinet","desk","counter","chest","fireplace","column","machinery","decoration","custom"] as const;
export const transitions=["stairs","ladder","lift","ramp","shaft","hatch","portal","custom"] as const;
export const openingStyles=["door","double door","passage","entrance","gate","custom","window"] as const;
export const interiorEntitySchema=z.object({id,revision:z.number().int().positive().nullable(),kind:z.enum(interiorKinds),name:z.string().trim().max(160),description:z.string().max(12000),classification:z.string().max(160),geographyId:id.nullable()}).strict();
const base={version:z.literal(1),id,entityId:id,archived:z.boolean()};
export const interiorShapeSchema=z.discriminatedUnion("variant",[
 z.object({...base,variant:z.literal("area"),points:z.array(vertex).min(3).max(256)}).strict(),
 z.object({...base,variant:z.literal("wall"),points:z.array(vertex).min(2).max(256),width:z.number().min(1).max(100)}).strict(),
 z.object({...base,variant:z.literal("opening"),wallId:id,startId:id,endId:id,at:z.number().min(0).max(1),width:z.number().min(4).max(240),style:z.enum(openingStyles)}).strict(),
 z.object({...base,variant:z.literal("object"),point,width:z.number().min(4).max(500),height:z.number().min(4).max(500),rotation:z.number().min(-180).max(180),symbol:z.string().min(1).max(80)}).strict(),
]);
const layer=z.object({visible:z.boolean(),locked:z.boolean()}).strict();
export const interiorStateSchema=z.object({version:z.literal(1),flooring:z.enum(["plain","boards","tiles"]),layers:z.object(Object.fromEntries(interiorLayers.map(k=>[k,layer])) as Record<typeof interiorLayers[number],typeof layer>).strict()}).strict();
export const interiorLinkSchema=z.object({entityId:id,destinationMapId:id.nullable(),destinationGeographyId:id.nullable()}).strict();
export const floorDraftSchema=z.object({name:z.string().trim().min(1).max(160),description:z.string().max(12000),label:z.string().max(80),order:z.number().int().min(-100000).max(100000).nullable(),elevation:z.string().max(80),classification:z.string().max(160).default("")}).strict();
export type InteriorEntity=z.infer<typeof interiorEntitySchema>;
export type InteriorShape=z.infer<typeof interiorShapeSchema>;
export type InteriorState=z.infer<typeof interiorStateSchema>;
export type InteriorLink=z.infer<typeof interiorLinkSchema>;
export type InteriorFloor=z.infer<typeof floorDraftSchema>&{id:string;buildingId:string;revision:number;geographyRevision:number;archived:boolean};
export const defaultInteriorState=():InteriorState=>({version:1,flooring:"plain",layers:Object.fromEntries(interiorLayers.map(k=>[k,{visible:true,locked:false}])) as InteriorState["layers"]});
export const geographicInterior=(kind:InteriorEntity["kind"])=>["room","transition","landmark"].includes(kind);
export function openingAnchor(shape:Extract<InteriorShape,{variant:"opening"}>,shapes:InteriorShape[]) {
 const wall=shapes.find(s=>s.id===shape.wallId);
 if(!wall||wall.variant!=="wall"||wall.archived)throw new Error("This opening needs an active wall. Restore the wall or archive its openings first.");
 const index=wall.points.findIndex((p,i)=>p.id===shape.startId&&wall.points[i+1]?.id===shape.endId);
 if(index<0)throw new Error("This wall edit removes a segment used by an opening. Reattach or archive that opening first.");
 const a=wall.points[index],b=wall.points[index+1],length=Math.hypot(b.x-a.x,b.y-a.y),half=shape.width/(2*length);
 if(!length||shape.at-half<-.00001||shape.at+half>1.00001)throw new Error("This opening no longer fits its wall segment. Reduce its width, reposition it, or lengthen the wall.");
 return {wall,a,b,length,x:a.x+(b.x-a.x)*shape.at,y:a.y+(b.y-a.y)*shape.at,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI,from:shape.at-half,to:shape.at+half};
}
/** Actual remaining wall segments: openings are gaps in the source rendering. */
export function wallSegments(wall:Extract<InteriorShape,{variant:"wall"}>,shapes:InteriorShape[]) {
 return wall.points.slice(0,-1).flatMap((a,i)=>{const b=wall.points[i+1],gaps=shapes.filter((s):s is Extract<InteriorShape,{variant:"opening"}>=>s.variant==="opening"&&!s.archived&&s.wallId===wall.id&&s.startId===a.id&&s.endId===b.id).map(s=>openingAnchor(s,shapes)).sort((x,y)=>x.from-y.from);let cursor=0;const ranges:[number,number][]=[];for(const gap of gaps){if(gap.from>cursor)ranges.push([cursor,gap.from]);cursor=Math.max(cursor,gap.to);}if(cursor<1)ranges.push([cursor,1]);return ranges.map(([from,to])=>({a:{x:a.x+(b.x-a.x)*from,y:a.y+(b.y-a.y)*from},b:{x:a.x+(b.x-a.x)*to,y:a.y+(b.y-a.y)*to}}));});
}
export function validateInterior(shapes:InteriorShape[],entities:InteriorEntity[],links:InteriorLink[]=[]) {
 if(new Set(shapes.map(s=>s.id)).size!==shapes.length||new Set(entities.map(e=>e.id)).size!==entities.length||new Set(links.map(l=>l.entityId)).size!==links.length)throw new Error("Interior identities must not be repeated.");
 if(shapes.reduce((n,s)=>n+("points" in s?s.points.length:1),0)>64000)throw new Error("An interior supports up to 64,000 source points.");
 const byId=new Map(entities.map(e=>[e.id,e]));
 const checkPoint=(p:Point)=>{if(p.x<0||p.x>MAP_WIDTH||p.y<0||p.y>MAP_HEIGHT||rounded(p.x)!==p.x||rounded(p.y)!==p.y)throw new Error("Keep interior points inside the map, to two decimal places.");};
 for(const e of entities)if(geographicInterior(e.kind)?e.geographyId!==e.id:e.geographyId!==null)throw new Error("Rooms, transitions and landmarks retain their geographic identity; ordinary furnishings use their own stable object identity.");
 for(const s of shapes){const e=byId.get(s.entityId);if(!e)throw new Error("Each interior representation needs its retained entity.");
  if(s.variant==="area"){if(e.kind!=="room")throw new Error("Room boundaries must represent rooms.");validateGeometry({version:1,type:"polygon",points:s.points});}
  else if(s.variant==="wall"){if(e.kind!=="wall")throw new Error("Wall paths must represent walls.");if(new Set(s.points.map(p=>p.id)).size!==s.points.length)throw new Error("Wall vertices need distinct identities.");s.points.forEach((p,i)=>{checkPoint(p);if(i&&p.x===s.points[i-1].x&&p.y===s.points[i-1].y)throw new Error("Adjacent wall points must differ.");});}
  else if(s.variant==="opening"){if(e.kind!=="opening"&&e.kind!=="window"||e.kind==="window"&&s.style!=="window"||e.kind==="opening"&&s.style==="window")throw new Error("Choose an opening style appropriate to its layer.");if(!s.archived)openingAnchor(s,shapes);}
  else {if(!["transition","furnishing","landmark"].includes(e.kind))throw new Error("Choose a suitable object representation.");checkPoint(s.point);if(e.kind==="transition"&&!transitions.includes(s.symbol as typeof transitions[number])||e.kind==="furnishing"&&!furnishings.includes(s.symbol as typeof furnishings[number]))throw new Error("Choose a supported furnishing or transition symbol.");}
 }
 for(const link of links)if(byId.get(link.entityId)?.kind!=="transition"||!link.destinationMapId&&link.destinationGeographyId)throw new Error("Only transitions can have an authored destination, with an optional arrival place.");
}
export function interiorCenter(s:InteriorShape,shapes:InteriorShape[]):Point {
 if(s.variant==="object")return s.point;
 if(s.variant==="opening"){try{return openingAnchor(s,shapes);}catch{return {x:0,y:0};}}
 return {x:s.points.reduce((n,p)=>n+p.x,0)/s.points.length,y:s.points.reduce((n,p)=>n+p.y,0)/s.points.length};
}
export function transformInterior(s:InteriorShape,shapes:InteriorShape[],dx=0,dy=0,scale=1,rotation=0):InteriorShape {
 if(s.variant==="opening")return {...s,width:Math.max(4,Math.min(240,rounded(s.width*scale)))};
 const c=interiorCenter(s,shapes),r=rotation*Math.PI/180;
 const transform=(p:Point)=>({x:rounded(c.x+dx+((p.x-c.x)*Math.cos(r)-(p.y-c.y)*Math.sin(r))*scale),y:rounded(c.y+dy+((p.x-c.x)*Math.sin(r)+(p.y-c.y)*Math.cos(r))*scale)});
 return s.variant==="object"?{...s,point:transform(s.point),width:rounded(Math.max(4,Math.min(500,s.width*scale))),height:rounded(Math.max(4,Math.min(500,s.height*scale))),rotation:rounded(((s.rotation+rotation+540)%360)-180)}:{...s,points:s.points.map(p=>({...p,...transform(p)}))};
}
export function duplicateInteriorSource(shapes:InteriorShape[],newId:()=>string) {
 const ids=new Map<string,string>();for(const s of shapes){ids.set(s.id,newId());if("points" in s)for(const p of s.points)ids.set(p.id,newId());}
 return shapes.map(s=>({...s,id:ids.get(s.id)!,...("points" in s?{points:s.points.map(p=>({...p,id:ids.get(p.id)!}))}:s.variant==="opening"?{wallId:ids.get(s.wallId)??s.wallId,startId:ids.get(s.startId)??s.startId,endId:ids.get(s.endId)??s.endId}:{})})) as InteriorShape[];
}
