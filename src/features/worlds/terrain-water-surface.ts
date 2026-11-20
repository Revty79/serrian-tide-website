import type {TerrainGeometry} from "./terrain";
import type {TerrainFrame} from "./terrain-refinement";
import type {HydroLayer} from "./terrain-hydrology";
import {unwrapWaterRing} from "./terrain-water-geometry";
import {explicitDrySurfaceIndex} from "./terrain-dry-surface";

/** Geometry only: save pins/review metadata do not invalidate presentation. */
const keys=new WeakMap<HydroLayer,string>();
export function waterSurfaceKey(layer?:HydroLayer){if(layer&&keys.has(layer))return keys.get(layer)!;if(!layer?.visible||layer.opacity<=0)return "";const lakes=(layer.lakes??[]).filter(l=>l.condition==="standing");const key=lakes.length?JSON.stringify(lakes.map(l=>[l.levelM,l.rings])):"";keys.set(layer,key);return key;}

// The same 8,192 geometry memberships, grouped in 128 eight-square blocks.
// This avoids per-sample eviction churn during fine-source overview drawing.
// Heights are never cached, including when an editor mutates its grid in place.
const membership=new Map<string,{known:Uint8Array;levels:Float64Array}>(),indexIds=new WeakMap<object,number>();let nextIndexId=0;

/** A read-only composite surface for shading. Submerged native samples contribute
 * water level; actual ground buffers, inspection and all editing stay untouched.
 * Coast supports adjoining unmapped sea are retained conservatively. No heights
 * are cached: native editors may update their arrays in place. */
export function waterSurfaceReader(read:(x:number,y:number)=>number|undefined,shape:TerrainGeometry,world:TerrainGeometry,water:HydroLayer|undefined,sea:number,frame:TerrainFrame={x:0,y:0,width:world.displayWidth,height:world.displayHeight}){
 if(!waterSurfaceKey(water))return read;
 const index=explicitDrySurfaceIndex(water!,{width:world.displayWidth,height:world.displayHeight,wrap:world.wrap}),dx=frame.width/shape.width,dy=frame.height/shape.height;
 const identity=indexIds.get(index)??++nextIndexId;indexIds.set(index,identity);
 const cachePrefix=identity+"/"+frame.x+"/"+frame.y+"/"+dx+"/"+dy+"/";
 const standing=water!.lakes!.filter(l=>l.condition==="standing"),maximum=Math.max(...standing.map(l=>l.levelM));
 const bounds=standing.flatMap(l=>{const ring=unwrapWaterRing(l.rings[0],{width:world.displayWidth,height:world.displayHeight,wrap:world.wrap}),left=Math.min(...ring.map(p=>p.x)),right=Math.max(...ring.map(p=>p.x)),top=Math.min(...ring.map(p=>p.y)),bottom=Math.max(...ring.map(p=>p.y));return (world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]).map(offset=>({left:(left+offset-frame.x)/dx,right:(right+offset-frame.x)/dx,top:(top-frame.y)/dy,bottom:(bottom-frame.y)/dy}));}).filter(b=>b.right>=-2&&b.left<=shape.width+1&&b.bottom>=-2&&b.top<=shape.height+1);
 // Unrelated accepted source frames retain their original sampling path.
 if(!bounds.length)return read;
 const point=(x:number,y:number)=>{x=shape.wrap?((x%shape.width)+shape.width)%shape.width:Math.max(0,Math.min(shape.width-1,x));y=Math.max(0,Math.min(shape.height-1,y));return {x,y};};
 const level=(x:number,y:number)=>{
  const p=point(x,y),wx=frame.x+p.x*dx,wy=frame.y+p.y*dy;
  if(index.maximumStandingLevelAt(wx,wy)===-Infinity)return null;
  // Fractional readers retain exact geometry without quantizing a coordinate.
  if(!Number.isInteger(p.x)||!Number.isInteger(p.y))return index.standingWaterLevel(wx,wy);
  const key=cachePrefix+Math.floor(p.x/8)+":"+Math.floor(p.y/8),slot=(p.y%8)*8+p.x%8;let tile=membership.get(key);
  if(tile)membership.delete(key);else tile={known:new Uint8Array(64),levels:new Float64Array(64)};
  membership.set(key,tile);if(membership.size>128)membership.delete(membership.keys().next().value!);
  if(tile.known[slot])return tile.known[slot]===2?null:tile.levels[slot];
  const value=index.standingWaterLevel(wx,wy);tile.known[slot]=value===null?2:1;if(value!==null)tile.levels[slot]=value;return value;
 };
 return (x:number,y:number)=>{const z=read(x,y);if(z===undefined)return;
  // A sample already above every standing surface cannot be projected.
  if(z>=maximum)return z;const p=point(x,y);if(z>=index.maximumStandingLevelAt(frame.x+p.x*dx,frame.y+p.y*dy))return z;const surface=level(p.x,p.y);if(surface===null||z>=surface)return z;
  for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){const q=point(x+i,y+j),raw=read(q.x,q.y);if(raw===undefined)return z;if(raw<=sea&&level(q.x,q.y)===null&&!index.at(frame.x+q.x*dx,frame.y+q.y*dy,raw)&&index.unresolvedIslandLevel(frame.x+q.x*dx,frame.y+q.y*dy,raw)===null)return z;}
  return surface;
 };
}
