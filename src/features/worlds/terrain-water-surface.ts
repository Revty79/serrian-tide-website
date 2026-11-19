import type {TerrainGeometry} from "./terrain";
import type {TerrainFrame} from "./terrain-refinement";
import type {HydroLayer} from "./terrain-hydrology";
import {unwrapWaterRing} from "./terrain-water-geometry";
import {explicitDrySurfaceIndex} from "./terrain-dry-surface";

/** Geometry only: save pins/review metadata do not invalidate presentation. */
const keys=new WeakMap<HydroLayer,string>();
export function waterSurfaceKey(layer?:HydroLayer){if(layer&&keys.has(layer))return keys.get(layer)!;if(!layer?.visible||layer.opacity<=0)return "";const lakes=(layer.lakes??[]).filter(l=>l.condition==="standing");const key=lakes.length?JSON.stringify(lakes.map(l=>[l.levelM,l.rings])):"";keys.set(layer,key);return key;}

// One bounded membership cache across sources, snapshots and editor history.
const membership=new Map<string,number|null>(),indexIds=new WeakMap<object,number>();let nextIndexId=0;

/** A read-only composite surface for shading. Submerged native samples contribute
 * water level; actual ground buffers, inspection and all editing stay untouched.
 * Coast supports adjoining unmapped sea are retained conservatively. No heights
 * are cached: native editors may update their arrays in place. */
export function waterSurfaceReader(read:(x:number,y:number)=>number|undefined,shape:TerrainGeometry,world:TerrainGeometry,water:HydroLayer|undefined,sea:number,frame:TerrainFrame={x:0,y:0,width:world.displayWidth,height:world.displayHeight}){
 if(!waterSurfaceKey(water))return read;
 const index=explicitDrySurfaceIndex(water!,{width:world.displayWidth,height:world.displayHeight,wrap:world.wrap}),dx=frame.width/shape.width,dy=frame.height/shape.height;
 const identity=indexIds.get(index)??++nextIndexId;indexIds.set(index,identity);
 const standing=water!.lakes!.filter(l=>l.condition==="standing"),maximum=Math.max(...standing.map(l=>l.levelM));
 const bounds=standing.flatMap(l=>{const ring=unwrapWaterRing(l.rings[0],{width:world.displayWidth,height:world.displayHeight,wrap:world.wrap}),left=Math.min(...ring.map(p=>p.x)),right=Math.max(...ring.map(p=>p.x)),top=Math.min(...ring.map(p=>p.y)),bottom=Math.max(...ring.map(p=>p.y));return (world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]).map(offset=>({left:(left+offset-frame.x)/dx,right:(right+offset-frame.x)/dx,top:(top-frame.y)/dy,bottom:(bottom-frame.y)/dy}));}).filter(b=>b.right>=-2&&b.left<=shape.width+1&&b.bottom>=-2&&b.top<=shape.height+1);
 // Unrelated accepted source frames retain their original sampling path.
 if(!bounds.length)return read;
 const point=(x:number,y:number)=>{x=shape.wrap?((x%shape.width)+shape.width)%shape.width:Math.max(0,Math.min(shape.width-1,x));y=Math.max(0,Math.min(shape.height-1,y));return {x,y};};
 const level=(x:number,y:number)=>{const p=point(x,y),key=identity+"/"+(frame.x+p.x*dx)+"/"+(frame.y+p.y*dy);if(index.maximumStandingLevelAt(frame.x+p.x*dx,frame.y+p.y*dy)===-Infinity)return null;if(membership.has(key))return membership.get(key)!;const value=index.standingWaterLevel(frame.x+p.x*dx,frame.y+p.y*dy);membership.set(key,value);if(membership.size>8192)membership.delete(membership.keys().next().value!);return value;};
 return (x:number,y:number)=>{const z=read(x,y);if(z===undefined)return;
  // A sample already above every standing surface cannot be projected.
  if(z>=maximum)return z;const p=point(x,y);if(z>=index.maximumStandingLevelAt(frame.x+p.x*dx,frame.y+p.y*dy))return z;const surface=level(p.x,p.y);if(surface===null||z>=surface)return z;
  for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){const q=point(x+i,y+j),raw=read(q.x,q.y);if(raw===undefined)return z;if(raw<=sea&&level(q.x,q.y)===null&&!index.at(frame.x+q.x*dx,frame.y+q.y*dy,raw)&&index.unresolvedIslandLevel(frame.x+q.x*dx,frame.y+q.y*dy,raw)===null)return z;}
  return surface;
 };
}
