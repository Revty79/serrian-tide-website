import {compositionSchema} from "./atlas-assets";
import {z} from "zod";
import {emptyFloor,floorDesignSchema,floorFrameSchema,validateFloor,copyFloor,retainFloor,floorLayer,roomFeatures,type FloorDesign,type FloorFeature,type FloorFrame} from "./building-floor";
import {snapDungeonPoint,type DungeonGrid} from "./dungeon";
export const UNDERGROUND_LIMITS={sites:256,levels:64,connections:4096,features:2000,points:32000,marks:5000,history:30,historyBytes:12*1024*1024,draftBytes:4_000_000,sourceBytes:3_900_000,mapConnections:128} as const;
export const undergroundLayers=["ground","rooms","walls","openings","passages","environments","furnishings","transitions","annotations"] as const;
export const undergroundCategories=["room","cavern","wall","opening","passage","tunnel","water","rubble","chasm","blocked","furnishing","transition","trap","hazard","secret","landmark","annotation"] as const;
export const undergroundAttributeSchema=z.object({category:z.enum(undergroundCategories),visibility:z.enum(["ordinary","secret","god-only"]),notes:z.string().max(12000),material:z.enum(["stone","rock","masonry","earth","water","wood"]),width:z.number().finite().min(.2).max(30),travelStyle:z.enum(["stairs","ladder","ramp","lift","hatch","entrance"]).optional(),openingStyle:z.literal("gate").optional()}).strict();
export type UndergroundAttribute=z.infer<typeof undergroundAttributeSchema>;
const layer=z.object({visible:z.boolean(),locked:z.boolean()}).strict();
export const undergroundDesignSchema=floorDesignSchema.extend({attributes:z.record(z.uuid(),undergroundAttributeSchema),layers:z.object(Object.fromEntries(undergroundLayers.map(k=>[k,layer])) as Record<typeof undergroundLayers[number],typeof layer>).strict(),guides:z.object({kind:z.enum(["none","square","hex"]),size:z.number().min(.25).max(10),snap:z.boolean()}).strict()}).strict();
export type UndergroundDesign=z.infer<typeof undergroundDesignSchema>;
export function undergroundAttribute(category:UndergroundAttribute["category"]):UndergroundAttribute{return {category,visibility:category==="secret"?"secret":"ordinary",notes:"",material:category==="tunnel"||category==="cavern"?"rock":category==="water"?"water":"stone",width:3};}
export function emptyUnderground():UndergroundDesign{return {...emptyFloor(),flooring:"plain",attributes:{},layers:Object.fromEntries(undergroundLayers.map(k=>[k,{visible:true,locked:false}])) as UndergroundDesign["layers"],guides:{kind:"square",size:1,snap:true}};}
export function undergroundCategoryLayer(c:UndergroundAttribute["category"]):typeof undergroundLayers[number]{return c==="room"||c==="cavern"?"rooms":c==="wall"?"walls":c==="opening"?"openings":c==="furnishing"?"furnishings":c==="transition"?"transitions":c==="passage"||c==="tunnel"||c==="secret"?"passages":["water","rubble","chasm","blocked"].includes(c)?"environments":"annotations";}
export function undergroundLayer(f:FloorFeature,d:UndergroundDesign):typeof undergroundLayers[number]{const c=d.attributes[f.id]?.category;return c?undergroundCategoryLayer(c):floorLayer(f);}
export function floorProjection(d:UndergroundDesign):FloorDesign{return {version:1,features:d.features,flooring:d.flooring,grid:d.grid,snap:d.snap,layers:Object.fromEntries(["ground","rooms","walls","openings","furnishings","transitions","annotations"].map(k=>[k,d.layers[k as keyof typeof d.layers]])) as FloorDesign["layers"]};}
export function validateUnderground(d:UndergroundDesign,frame:FloorFrame){
 undergroundDesignSchema.parse(d);validateFloor(floorProjection(d),frame);const ids=new Set(d.features.map(f=>f.id));
 if(Object.keys(d.attributes).length!==ids.size||Object.keys(d.attributes).some(id=>!ids.has(id)))throw Error("Retain exactly one information record for every underground object.");
 for(const f of d.features){const info=d.attributes[f.id],c=info.category;const categories=f.variant==="area"?["room","cavern","water","rubble","chasm","blocked"]:f.variant==="wall"?["wall","passage","tunnel","secret","water"]:f.variant==="opening"?["opening"]:f.kind==="transition"?["transition"]:f.kind==="furnishing"?["furnishing"]:["annotation","trap","hazard","landmark","furnishing"];if(!categories.includes(c))throw Error("Keep each underground object's information category compatible with its editable geometry.");if(info.travelStyle&&f.kind!=="transition"||info.openingStyle&&f.variant!=="opening")throw Error("Keep entrance and gate styles attached to their original object type.");if((c==="passage"||c==="tunnel"||c==="secret")&&f.variant!=="wall")throw Error("Passages retain editable path points.");if(f.variant==="object"&&f.destination)throw Error("Use an explicit cross-map connection for underground travel.");}
 if(new TextEncoder().encode(JSON.stringify(d)).length>UNDERGROUND_LIMITS.sourceBytes)throw Error("This underground source exceeds its 3.9 MB safe-recovery limit.");
}
export function redactUnderground(d:UndergroundDesign):UndergroundDesign{
 const protectedRooms=d.features.filter(f=>f.variant==="area"&&d.attributes[f.id].visibility!=="ordinary");const inside=(p:{x:number;y:number})=>protectedRooms.some(room=>{if(room.variant!=="area")return false;let inside=false;for(let i=0,j=room.points.length-1;i<room.points.length;j=i++){const a=room.points[i],b=room.points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;});
 const hidden=new Set(d.features.filter(f=>d.attributes[f.id].visibility!=="ordinary"||f.variant==="object"&&inside(f.point)||"points" in f&&(f.points.every(inside)||["passage","tunnel","secret"].includes(d.attributes[f.id].category)&&(inside(f.points[0])||inside(f.points.at(-1)!)))).map(f=>f.id));let changed=true;
 while(changed){changed=false;for(const f of d.features)if(!hidden.has(f.id)&&(f.variant==="wall"&&!!f.roomId&&hidden.has(f.roomId)||f.variant==="opening"&&hidden.has(f.wallId))){hidden.add(f.id);changed=true;}}
 const features=d.features.filter(f=>!hidden.has(f.id));return {...d,features,attributes:Object.fromEntries(features.map(f=>[f.id,{...d.attributes[f.id],notes:""}]))};
}
export function retainUnderground(next:UndergroundDesign,saved:UndergroundDesign):UndergroundDesign{const features=retainFloor(floorProjection(next),floorProjection(saved)).features;return {...next,features,attributes:Object.fromEntries(features.map(f=>[f.id,next.attributes[f.id]??saved.attributes[f.id]]))};}
export function copyUnderground(d:UndergroundDesign,newId:()=>string):UndergroundDesign{const copied=copyFloor(floorProjection(d),newId),original=d.features.filter(f=>!f.archived);return {...structuredClone(d),features:copied.features,attributes:Object.fromEntries(copied.features.map((f,i)=>[f.id,structuredClone(d.attributes[original[i].id])]))};}
export function undergroundSnap(p:{x:number;y:number},d:UndergroundDesign){
 const round=(n:number)=>Math.round(n*100)/100;if(!d.guides.snap||d.guides.kind==="none")return {x:round(p.x),y:round(p.y)};
 const grid:DungeonGrid={kind:d.guides.kind,visible:true,size:d.guides.size,offsetX:0,offsetY:0,orientation:"pointy",snap:true,opacity:.2,scale:""};
 // A repeating local chart reuses the audited lattice without the retired editor's extent clamp.
 const size=d.guides.size,periodX=size*(d.guides.kind==="hex"?Math.sqrt(3):1),periodY=size*(d.guides.kind==="hex"?3:1),nx=Math.floor(p.x/periodX)-8,ny=Math.floor(p.y/periodY)-8,q=snapDungeonPoint({x:p.x-nx*periodX,y:p.y-ny*periodY},grid);
 if(d.guides.kind==="square")return {x:round((Math.round(q.x/size)+nx)*size),y:round((Math.round(q.y/size)+ny)*size)};
 const axialQ=Math.round((Math.sqrt(3)/3*q.x-q.y/3)/size)+nx-ny,axialR=Math.round(2*q.y/(3*size))+2*ny;return {x:round(size*Math.sqrt(3)*(axialQ+axialR/2)),y:round(size*1.5*axialR)};
}

const id=z.uuid(),point=z.object({x:z.number().finite().min(0).max(1e9),y:z.number().finite().min(0).max(1e9)}).strict(),name=z.string().trim().min(1).max(160),revision=z.number().int().positive();
export const undergroundMapSchema=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("underground"),levelId:id}).strict(),
 z.object({kind:z.literal("town"),townMapId:id}).strict(),
 z.object({kind:z.literal("interior"),floorId:id}).strict(),
 z.object({kind:z.literal("world"),atlasMapId:id}).strict(),
]);
export type UndergroundMap=z.infer<typeof undergroundMapSchema>;
export const undergroundEndpointSchema=z.object({map:undergroundMapSchema,entranceId:id,point,anchor:z.enum(["marker","position"]).optional(),context:z.object({townMapId:id.optional(),featureId:id.optional(),returnMapId:id.optional()}).strict().optional()}).strict();
export type UndergroundEndpoint=z.infer<typeof undergroundEndpointSchema>;
const metadata={name,order:z.number().int().min(-1000).max(1000),depth:z.string().max(160)};
export const undergroundSettingsSchema=z.object({mode:z.enum(["blank","dungeon","cave","sewer"]),size:z.number().int().min(30).max(160),complexity:z.number().int().min(2).max(24),density:z.number().min(.2).max(1),width:z.number().min(.5).max(12),branching:z.number().min(0).max(1),style:z.enum(["stone","rock","masonry"]),seed:z.string().max(80)}).strict();
export type UndergroundSettings=z.infer<typeof undergroundSettingsSchema>;
export const defaultUndergroundSettings:UndergroundSettings={mode:"dungeon",size:80,complexity:8,density:.7,width:3,branching:.5,style:"stone",seed:"first-descent"};
export const undergroundCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("create-site"),requestId:id,placeId:id.nullable(),newPlace:z.object({name,parentId:id.nullable()}).strict().nullable(),frame:floorFrameSchema,...metadata,design:undergroundDesignSchema,entrance:undergroundEndpointSchema.nullable(),entranceRevision:revision.nullable(),templateImages:compositionSchema.optional()}).strict(),
 z.object({action:z.literal("create-level"),requestId:id,siteId:id,...metadata,design:undergroundDesignSchema,copyLevelId:id.nullable(),copyRevision:revision.nullable(),templateImages:compositionSchema.optional()}).strict(),
 z.object({action:z.literal("save"),requestId:id,levelId:id,revision,...metadata,design:undergroundDesignSchema}).strict(),
 z.object({action:z.literal("lifecycle"),requestId:id,kind:z.enum(["site","level","connection"]),id,revision,archived:z.boolean()}).strict(),
 z.object({action:z.literal("connect"),requestId:id,name,source:undergroundEndpointSchema,destination:undergroundEndpointSchema,sourceRevision:revision,destinationRevision:revision,twoWay:z.boolean()}).strict(),
]);
export type UndergroundCommand=z.infer<typeof undergroundCommandSchema>;
export type UndergroundSite={id:string;worldId:string;name:string;placeId:string|null;frame:FloorFrame;revision:number;archived:boolean};
export type UndergroundLevel={id:string;worldId:string;siteId:string;name:string;order:number;depth:string;revision:number;archived:boolean};
export type UndergroundDocument=UndergroundLevel&{design:UndergroundDesign;history:{revision:number;requestId:string}[]};
export type UndergroundConnection={historicalAccount?:import("./historical-connections").HistoricalConnectionDraft&{sourceVersionId:string;destinationVersionId:string};id:string;name:string;source:UndergroundEndpoint;destination:UndergroundEndpoint;twoWay:boolean;revision:number;archived:boolean;available:boolean;reason:string};
export type UndergroundBundle={available:boolean;canEdit:boolean;canRecover:boolean;ordinary:boolean;reason:string;sites:UndergroundSite[];levels:UndergroundLevel[];document:UndergroundDocument|null;connections:UndergroundConnection[];worldEntrances?:{maps:{id:string;name:string;revision:number}[];places:{id:string;name:string}[]}};
export const sameUndergroundMap=(a:UndergroundMap,b:UndergroundMap)=>a.kind===b.kind&&("levelId" in a?a.levelId:"townMapId" in a?a.townMapId:"floorId" in a?a.floorId:a.atlasMapId)===("levelId" in b?b.levelId:"townMapId" in b?b.townMapId:"floorId" in b?b.floorId:b.atlasMapId);
export function generateUnderground(settings:UndergroundSettings,newId:()=>string):{frame:FloorFrame;design:UndergroundDesign}{
 const s=undergroundSettingsSchema.parse(settings),frame={x:0,y:0,width:s.size,height:s.size,rotation:0},d=emptyUnderground();if(s.mode==="blank")return {frame,design:d};
 let seed=2166136261;for(const c of s.seed)seed=Math.imul(seed^c.charCodeAt(0),16777619);const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},round=(n:number)=>Math.round(n*100)/100;
 const add=(f:FloorFeature,c:UndergroundAttribute["category"])=>{d.features.push(f);d.attributes[f.id]={...undergroundAttribute(c),material:c==="water"?"water":s.style,width:c==="water"?Math.max(.5,s.width*.3):s.width};};
 const centers:{x:number;y:number}[]=[];const cols=Math.ceil(Math.sqrt(s.complexity)),spacing=(s.size-16)/cols;
 for(let i=0;i<s.complexity;i++){const x=round(8+((s.mode==="cave"&&Math.floor(i/cols)%2?cols-1-i%cols:i%cols)+.5)*spacing),y=round(8+(Math.floor(i/cols)+.5)*spacing),r=Math.min(spacing*.32,3+spacing*.22*s.density);centers.push({x,y});const natural=s.mode==="cave",points=Array.from({length:natural?10:4},(_,j)=>{const angle=j*Math.PI*2/(natural?10:4)+(natural?0:Math.PI/4),radius=r*(natural?.8+random()*.3:1);return {x:round(x+Math.cos(angle)*radius),y:round(y+Math.sin(angle)*radius)};});for(const f of roomFeatures(points,newId))add({...f,name:f.variant==="area"?natural?"Cavern":s.mode==="sewer"?"Access chamber":"Room":"Chamber walls"},f.variant==="area"?natural?"cavern":"room":"wall");}
 const path=(a:{x:number;y:number},b:{x:number;y:number},c:UndergroundAttribute["category"])=>{const id=newId(),points=s.mode==="cave"?[a,{x:round((a.x+b.x)/2+(random()-.5)*spacing*.3),y:round((a.y+b.y)/2+(random()-.5)*spacing*.3)},b]:[a,{x:b.x,y:a.y},b].filter((p,i,ps)=>!i||Math.hypot(p.x-ps[i-1].x,p.y-ps[i-1].y)>.01);add({version:1,id,entityId:id,name:c==="water"?"Drainage channel":"Passage",kind:"wall",variant:"wall",roomId:null,width:.2,archived:false,points:points.map(p=>({...p,id:newId()}))},c);};
 for(let i=1;i<centers.length;i++){path(centers[i-1],centers[i],s.mode==="cave"?"tunnel":"passage");if(s.mode==="sewer")path(centers[i-1],centers[i],"water");if(i>cols&&random()<s.branching)path(centers[i-cols],centers[i],s.mode==="cave"?"tunnel":"passage");}
 // Give generated corridors real segment-attached gaps where they cross chamber walls.
 const paths=d.features.filter(f=>f.variant==="wall"&&["passage","tunnel"].includes(d.attributes[f.id].category)),walls=d.features.filter(f=>f.variant==="wall"&&f.roomId),seen=new Set<string>();
 for(const corridor of paths)for(const wall of walls){if(corridor.variant!=="wall"||wall.variant!=="wall")continue;for(let i=1;i<corridor.points.length;i++)for(let j=1;j<wall.points.length;j++){const a=corridor.points[i-1],b=corridor.points[i],c=wall.points[j-1],e=wall.points[j],dx=b.x-a.x,dy=b.y-a.y,ex=e.x-c.x,ey=e.y-c.y,den=dx*ey-dy*ex;if(Math.abs(den)<1e-8)continue;const t=((c.x-a.x)*ey-(c.y-a.y)*ex)/den,u=((c.x-a.x)*dy-(c.y-a.y)*dx)/den,length=Math.hypot(ex,ey);if(t<=0||t>=1||u<0||u>1||length<.5)continue;const width=round(Math.min(s.width,length*.65)),half=width/(2*length),at=Math.max(half,Math.min(1-half,u)),key=wall.id+":"+j+":"+Math.round(at*10);if(seen.has(key))continue;seen.add(key);const id=newId();add({version:1,id,entityId:id,name:"Passage opening",kind:"opening",variant:"opening",archived:false,wallId:wall.id,startId:wall.points[j-1].id,endId:wall.points[j].id,at,width,style:"passage"},"opening");}}
 const entry=newId();add({version:1,id:entry,entityId:entry,kind:"transition",variant:"object",archived:false,name:"Entrance",point:centers[0],width:1.2,height:2,rotation:0,symbol:s.mode==="sewer"?"ladder":"stairs",destination:null},"transition");validateUnderground(d,frame);return {frame,design:d};
}
