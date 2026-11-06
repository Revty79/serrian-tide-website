import {compositionSchema} from "./atlas-assets";
import {z} from "zod";
import {validateGeometry} from "./atlas-geometry";
import {openingAnchor,interiorCenter,duplicateInteriorSource,type InteriorShape} from "./interior";
import type {TownFeature,TownFrame,TownPoint} from "./town-map";

export const FLOOR_LIMITS={features:2000,points:32000,floors:64,buildings:20000,history:30,historyBytes:12*1024*1024,draftBytes:4_000_000} as const;
export const floorLayers=["ground","rooms","walls","openings","furnishings","transitions","annotations"] as const;
export const floorFurnishings=["table","chair","bed","shelf","cabinet","desk","counter","chest","fireplace","column","stove","sink","barrel","workbench","rug"] as const;
export const floorTransitions=["stairs","ladder","lift","hatch"] as const;
export const floorOpenings=["door","double door","passage","entrance","window","arch"] as const;
const id=z.uuid(),number=z.number().finite(),point=z.object({x:number.min(0).max(20000),y:number.min(0).max(20000)}).strict(),vertex=point.extend({id}),name=z.string().trim().min(1).max(160);
export const floorFrameSchema=z.object({x:number.min(-20000).max(20000),y:number.min(-20000).max(20000),width:number.min(4).max(20000),height:number.min(4).max(20000),rotation:number.min(-180).max(180)}).strict();
export type FloorFrame=z.infer<typeof floorFrameSchema>;
const base={version:z.literal(1),id,entityId:id,name:z.string().trim().max(160),archived:z.boolean()};
export const floorFeatureSchema=z.discriminatedUnion("variant",[
 z.object({...base,variant:z.literal("area"),kind:z.literal("room"),points:z.array(vertex).min(3).max(256)}).strict(),
 z.object({...base,variant:z.literal("wall"),kind:z.literal("wall"),roomId:id.nullable(),points:z.array(vertex).min(2).max(257),width:number.min(.05).max(3)}).strict(),
 z.object({...base,variant:z.literal("opening"),kind:z.literal("opening"),wallId:id,startId:id,endId:id,at:number.min(0).max(1),width:number.min(.2).max(20),style:z.enum(floorOpenings)}).strict(),
 z.object({...base,variant:z.literal("object"),kind:z.enum(["furnishing","transition","annotation"]),point,width:number.min(.1).max(100),height:number.min(.1).max(100),rotation:number.min(-180).max(180),symbol:z.string().max(80),destination:z.object({floorId:id,point}).strict().nullable()}).strict(),
]);
export type FloorFeature=z.infer<typeof floorFeatureSchema>;
const layer=z.object({visible:z.boolean(),locked:z.boolean()}).strict();
export const floorDesignSchema=z.object({version:z.literal(1),features:z.array(floorFeatureSchema).max(FLOOR_LIMITS.features),flooring:z.enum(["plain","boards","tiles","stone"]),grid:number.min(.1).max(10),snap:z.boolean(),layers:z.object({ground:layer,rooms:layer,walls:layer,openings:layer,furnishings:layer,transitions:layer,annotations:layer}).strict()}).strict();
export type FloorDesign=z.infer<typeof floorDesignSchema>;
export const emptyFloor=():FloorDesign=>({version:1,features:[],flooring:"boards",grid:.5,snap:true,layers:Object.fromEntries(floorLayers.map(l=>[l,{visible:true,locked:false}])) as FloorDesign["layers"]});
export const floorLayer=(f:FloorFeature):typeof floorLayers[number]=>({room:"rooms",wall:"walls",opening:"openings",furnishing:"furnishings",transition:"transitions",annotation:"annotations"})[f.kind] as typeof floorLayers[number];
export const floorRound=(v:number)=>Math.round(v*100)/100;
/** The retained opening and wall-segment rules are independent of the old editor's drawing units. */
export const legacyFloorShapes=(features:FloorFeature[])=>features.map(f=>f.variant==="opening"&&f.style==="arch"?{...f,style:"passage"}:f) as InteriorShape[];
export function floorAnchor(f:FloorFeature,features:FloorFeature[]){return interiorCenter(legacyFloorShapes([f])[0],legacyFloorShapes(features));}
export function validateFloor(design:FloorDesign,frame:Pick<FloorFrame,"width"|"height">){
 floorDesignSchema.parse(design);if(new Set(design.features.map(f=>f.id)).size!==design.features.length)throw Error("Each room, wall and object needs its own identity.");
 let count=0;const shapes=legacyFloorShapes(design.features),byId=new Map(design.features.map(f=>[f.id,f]));
 const check=(p:TownPoint)=>{if(p.x<0||p.y<0||p.x>frame.width||p.y>frame.height||Math.abs(p.x-floorRound(p.x))>1e-7||Math.abs(p.y-floorRound(p.y))>1e-7)throw Error("Keep the floor drawing inside its physical extent, rounded to centimetres.");};
 for(const f of design.features){if(f.id!==f.entityId)throw Error("Floor objects retain their own stable identity.");count+="points" in f?f.points.length:1;
  if(f.variant==="area")validateGeometry({version:1,type:"polygon",points:f.points},frame.width,frame.height);
  if("points" in f){if(new Set(f.points.map(p=>p.id)).size!==f.points.length)throw Error("Each corner needs its own identity.");f.points.forEach(check);}
  if(f.variant==="wall"){if(f.points.some((p,i)=>i&&Math.hypot(p.x-f.points[i-1].x,p.y-f.points[i-1].y)<.01))throw Error("A wall needs distinct adjacent corners.");if(f.roomId&&(byId.get(f.roomId)?.variant!=="area"||!f.archived&&byId.get(f.roomId)?.archived))throw Error("Restore the room for this attached wall.");}
  if(f.variant==="opening"&&!f.archived){openingAnchor(legacyFloorShapes([f])[0] as Extract<InteriorShape,{variant:"opening"}>,shapes);const wall=byId.get(f.wallId);if(!wall||wall.variant!=="wall")throw Error("Attach this opening to a wall.");}
  if(f.variant==="object"){check(f.point);if(f.kind==="furnishing"&&!floorFurnishings.includes(f.symbol as typeof floorFurnishings[number])||f.kind==="transition"&&!floorTransitions.includes(f.symbol as typeof floorTransitions[number]))throw Error("Choose a supported furniture or stair piece.");if(f.destination)check(f.destination.point);if(f.kind!=="transition"&&f.destination)throw Error("Only stairs, ladders, lifts and hatches connect floors.");}
 }
 if(count>FLOOR_LIMITS.points)throw Error("This floor supports 32,000 retained drawing points. Simplify a shape before adding more.");
 if(JSON.stringify(design).length>FLOOR_LIMITS.draftBytes)throw Error("This floor is too large for safe recovery. Keep the draft and simplify it before saving.");
}
export function floorFootprint(feature:TownFeature):{frame:FloorFrame;points:TownPoint[]}{
 const xs=feature.points.map(p=>p.x),ys=feature.points.map(p=>p.y),x=floorRound(Math.min(...xs)-1),y=floorRound(Math.min(...ys)-1),width=floorRound(Math.max(4,Math.max(...xs)-x+1)),height=floorRound(Math.max(4,Math.max(...ys)-y+1));
 if(width>20000||height>20000)throw Error("This building exceeds the 20,000 metre floor limit. Use a smaller exterior outline.");
 return {frame:{x,y,width,height,rotation:0},points:feature.points.map(p=>({x:floorRound(p.x-x),y:floorRound(p.y-y)}))};
}
export function roomFeatures(points:TownPoint[],newId:()=>string):FloorFeature[]{const roomId=newId(),wallId=newId(),ps=points.map(p=>({...p,id:newId()}));return [{version:1,id:roomId,entityId:roomId,kind:"room",variant:"area",name:"Room",archived:false,points:ps},{version:1,id:wallId,entityId:wallId,kind:"wall",variant:"wall",name:"Room walls",archived:false,roomId,width:.2,points:[...points,points[0]].map(p=>({...p,id:newId()}))}];}
export function initialFloor(mode:"blank"|"outline"|"generate",footprint:TownPoint[],frame:FloorFrame,newId:()=>string,rooms=3):FloorDesign{
 const d=emptyFloor();if(mode==="blank")return d;d.features=roomFeatures(footprint,newId);
 if(mode==="generate"){
  // Exact line/polygon intersections keep partitions joined to unconventional exteriors.
  const count=Math.max(2,Math.min(8,rooms));for(let i=1;i<count;i++){const x=floorRound(frame.width*i/count),ys:number[]=[];
   for(let j=0;j<footprint.length;j++){const a=footprint[j],b=footprint[(j+1)%footprint.length];if(a.x<=x&&b.x>x||b.x<=x&&a.x>x)ys.push(floorRound(a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x)));}ys.sort((a,b)=>a-b);
   for(let j=0;j+1<ys.length;j+=2){if(ys[j+1]-ys[j]<2)continue;const wallId=newId(),a={x,y:ys[j],id:newId()},b={x,y:ys[j+1],id:newId()};d.features.push({version:1,id:wallId,entityId:wallId,kind:"wall",variant:"wall",roomId:null,name:"Partition",archived:false,points:[a,b],width:.15});const door=newId();d.features.push({version:1,id:door,entityId:door,kind:"opening",variant:"opening",name:"Door",archived:false,wallId,startId:a.id,endId:b.id,at:.5,width:1,style:"door"});}
  }
 }validateFloor(d,frame);return d;
}
export function copyFloor(design:FloorDesign,newId:()=>string):FloorDesign{
 const originals=design.features.filter(f=>!f.archived),copies=duplicateInteriorSource(legacyFloorShapes(originals),newId),ids=new Map(originals.map((f,i)=>[f.id,copies[i].id]));return {...structuredClone(design),features:originals.map((f,i)=>({...f,...copies[i],entityId:copies[i].id,...f.variant==="wall"?{roomId:f.roomId?ids.get(f.roomId)??null:null}:{},...f.variant==="object"?{destination:null}: {},...f.variant==="opening"?{style:f.style}:{}})) as FloorFeature[]};
}
export function retainFloor(next:FloorDesign,saved:FloorDesign):FloorDesign{const ids=new Set(next.features.map(f=>f.id));return {...next,features:[...next.features,...saved.features.filter(f=>!ids.has(f.id)).map(f=>({...f,archived:true}))]};}
export function changeFloorFeature(design:FloorDesign,next:FloorFeature):FloorDesign{
 const previous=design.features.find(f=>f.id===next.id);let features=previous?design.features.map(f=>f.id===next.id?next:f):[...design.features,next];
 if(next.variant==="area")features=features.map(f=>f.variant==="wall"&&f.roomId===next.id?{...f,archived:next.archived,points:[...next.points,next.points[0]].map((p,i)=>({...p,id:f.points[i]?.id??crypto.randomUUID()}))}:f);
 const removedWalls=new Set(features.filter(f=>f.variant==="wall"&&f.archived).map(f=>f.id));features=features.map(f=>f.variant==="opening"&&removedWalls.has(f.wallId)?{...f,archived:true}:f);return {...design,features};
}
export function transformFloorFeature(f:FloorFeature,features:FloorFeature[],dx=0,dy=0,degrees=0,sx=1,sy=sx):FloorFeature{
 if(f.variant==="opening")return {...f,width:floorRound(Math.max(.2,Math.min(20,f.width*sx)))};
 const c=floorAnchor(f,features),r=degrees*Math.PI/180,move=(p:TownPoint)=>({x:floorRound(c.x+dx+(p.x-c.x)*sx*Math.cos(r)-(p.y-c.y)*sy*Math.sin(r)),y:floorRound(c.y+dy+(p.x-c.x)*sx*Math.sin(r)+(p.y-c.y)*sy*Math.cos(r))});
 return f.variant==="object"?{...f,point:move(f.point),width:floorRound(f.width*sx),height:floorRound(f.height*sy),rotation:floorRound(((f.rotation+degrees+540)%360)-180)}:{...f,points:f.points.map(p=>({...p,...move(p)}))};
}
const metadata={name,order:z.number().int().min(-1000).max(1000),elevation:number.min(-20000).max(20000).nullable()};
export const floorCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("enter"),requestId:id,townMapId:id,featureId:id}).strict(),
 z.object({action:z.literal("create"),requestId:id,buildingId:id,...metadata,design:floorDesignSchema,copyFloorId:id.nullable(),copyRevision:z.number().int().positive().nullable(),templateImages:compositionSchema.optional()}).strict(),
 z.object({action:z.literal("save"),requestId:id,floorId:id,revision:z.number().int().positive(),...metadata,design:floorDesignSchema}).strict(),
 z.object({action:z.literal("lifecycle"),requestId:id,floorId:id,revision:z.number().int().positive(),archived:z.boolean()}).strict(),
 z.object({action:z.literal("connect"),requestId:id,floorId:id,revision:z.number().int().positive(),featureId:id,destinationFloorId:id,destinationRevision:z.number().int().positive(),point,reciprocal:z.boolean()}).strict(),
]);
export type FloorCommand=z.infer<typeof floorCommandSchema>;
export type FloorSummary={id:string;buildingId:string;name:string;order:number;elevation:number|null;revision:number;archived:boolean};
export type InteriorBuilding={id:string;worldId:string;townId:string;placeId:string|null;name:string;frame:FloorFrame;footprint:TownPoint[];townFrame:TownFrame};
export type FloorDocument=FloorSummary&{worldId:string;design:FloorDesign;history:{revision:number;requestId:string}[]};
export type FloorBundle={available:boolean;canEdit:boolean;reason:string;bound?:boolean;building:InteriorBuilding|null;floors:FloorSummary[];document:FloorDocument|null;selectedFloorId?:string};
