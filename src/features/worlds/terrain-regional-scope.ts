import {z} from "zod";
import type {TerrainFrame} from "./terrain-refinement";
import {regionAreaContainsPath,regionAreaContainsFrame,regionCanonicalX,type RegionFootprint} from "./terrain-region-geometry";

/** A retained request pins accepted identities; bounds are always resolved by the server. */
export const regionalAuthoringSchema=z.object({
 version:z.literal(1),regionMapId:z.uuid(),parentMapId:z.uuid(),terrainId:z.uuid(),regionRevision:z.number().int().positive(),
 sourceState:z.string().min(2).max(8192),compositionRevision:z.number().int().nonnegative().optional(),
}).strict();
export type RegionalAuthoring=z.infer<typeof regionalAuthoringSchema>;
export type RegionalScope={frame:TerrainFrame;footprint?:RegionFootprint;world:{width:number;height:number;wrap:boolean}};
export type RegionalPoint={x:number;y:number};
export const regionalEqual=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function regionalDeltaX(a:number,b:number,world:RegionalScope["world"]){let dx=b-a;if(world.wrap)dx-=Math.round(dx/world.width)*world.width;return dx;}
function localX(x:number,scope:RegionalScope){const dx=x-scope.frame.x;return scope.world.wrap?(dx%scope.world.width+scope.world.width)%scope.world.width:dx;}
const outside=(name:string)=>Error(`${name} extends beyond this region. Keep its complete affected area inside the saved bounds, or edit it on the parent World map.`);
export function requireRegionalPath(points:readonly RegionalPoint[],radius:number,scope:RegionalScope,name="This edit",closed=false){
 if(!points.length||!Number.isFinite(radius)||radius<0)throw outside(name);
 const {frame,world}=scope,fullWidth=world.wrap&&frame.width===world.width;
 let previous:RegionalPoint|undefined,previousX=0;
 for(const point of [...points,...closed?[points[0]]:[]]){
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||(world.wrap?point.x>=world.width:point.x>world.width)||point.y<0||point.y>world.height)throw outside(name);
  const x=previous?previousX+regionalDeltaX(previous.x,point.x,world):localX(point.x,scope);
  if(!fullWidth&&(x-radius<0||x+radius>frame.width)||point.y-radius<frame.y||point.y+radius>frame.y+frame.height)throw outside(name);
  previous=point;previousX=x;
 }
 if(scope.footprint&&!regionAreaContainsPath(scope,points,world,radius,closed))throw outside(name);
}
export function requireRegionalFrame(frame:TerrainFrame,scope:RegionalScope,name="This edit"){
 const x=localX(frame.x,scope),fullWidth=scope.world.wrap&&scope.frame.width===scope.world.width;
 if(![frame.x,frame.y,frame.width,frame.height].every(Number.isFinite)||frame.width<=0||frame.height<=0||frame.width>scope.world.width||!fullWidth&&(x<0||x+frame.width>scope.frame.width)||frame.y<scope.frame.y||frame.y+frame.height>scope.frame.y+scope.frame.height)throw outside(name);
 if(scope.footprint&&!regionAreaContainsFrame(scope,frame,scope.world))throw outside(name);
}
export function requireRegionalArtwork(placement:{x:number;y:number;widthM:number;rotation:number},scope:RegionalScope){
 if(scope.footprint){const angle=placement.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),w=placement.widthM/2,h=placement.widthM*.75/2,corners=[[-w,-h],[w,-h],[w,h],[-w,h]].map(([x,y])=>({x:regionCanonicalX(placement.x+x*cos-y*sin,scope.world),y:placement.y+x*sin+y*cos}));if(!regionAreaContainsPath(scope,corners,scope.world,0,true))throw outside("The rotated artwork");return;}
 const radians=placement.rotation*Math.PI/180,cos=Math.abs(Math.cos(radians)),sin=Math.abs(Math.sin(radians));
 const halfWidth=placement.widthM*(cos+.75*sin)/2,halfHeight=placement.widthM*(sin+.75*cos)/2;
 requireRegionalPath([{x:placement.x,y:placement.y-halfHeight},{x:placement.x,y:placement.y+halfHeight}],0,scope,"The rotated artwork");
 const x=localX(placement.x,scope);if(!(scope.world.wrap&&scope.frame.width===scope.world.width)&&(x-halfWidth<0||x+halfWidth>scope.frame.width))throw outside("The rotated artwork");
}
/** Changed line segments require unchanged in-region attachment points on both sides. */
export function requireRegionalPathChange(before:readonly RegionalPoint[],after:readonly RegionalPoint[],scope:RegionalScope,name:string,radius=0){
 let prefix=0,suffix=0;while(prefix<Math.min(before.length,after.length)&&regionalEqual(before[prefix],after[prefix]))prefix++;
 while(suffix<Math.min(before.length,after.length)-prefix&&regionalEqual(before[before.length-1-suffix],after[after.length-1-suffix]))suffix++;
 if(prefix===before.length&&prefix===after.length)return;
 requireRegionalPath(before.slice(Math.max(0,prefix-1),suffix?before.length-suffix+1:before.length),radius,scope,name);
 requireRegionalPath(after.slice(Math.max(0,prefix-1),suffix?after.length-suffix+1:after.length),radius,scope,name);
}
/** Reconstruct from accepted records; an omitted or changed outside record is rejected. */
export function mergeRegionalRecords<T extends {id:string}>(before:readonly T[],after:readonly T[],validate:(value:T,old:T|undefined)=>void):T[]{
 const existing=new Map(before.map(value=>[value.id,value])),next=new Map(after.map(value=>[value.id,value]));
 if(existing.size!==before.length||next.size!==after.length)throw Error("Geographic identities must remain unique.");
 if(!regionalEqual(before.filter(value=>next.has(value.id)).map(value=>value.id),after.filter(value=>existing.has(value.id)).map(value=>value.id)))throw Error("Reordering accepted geographic records is a parent-World operation. Keep their order while editing local features.");
 for(const old of before)if(!next.has(old.id))validate(old,old);
 return after.map(value=>{const old=existing.get(value.id);if(regionalEqual(old,value))return old!;validate(value,old);return {...value};});
}
export function requireRegionalSettings(before:Record<string,unknown>,after:Record<string,unknown>,collections:readonly string[]){
 for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if(!collections.includes(key)&&!regionalEqual(before[key],after[key]))throw Error("World-wide layer settings remain parent-World operations. Keep those settings and edit the local geographic features here.");
}
