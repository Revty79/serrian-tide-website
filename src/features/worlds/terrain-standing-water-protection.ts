import type {TerrainGeometry} from "./terrain";
import type {AdvancedTerrainContext} from "./terrain-advanced";
import {ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";
import {framesOverlap} from "./terrain-refinement";
import {insideWaterRings,waterBounds} from "./terrain-water-geometry";

/** Saved outlines protect their ground independently of sea level, display
 * visibility, lake level or the current numerical construction height. The
 * request-local cache is bounded; no full-source water mask is allocated. */
export function standingWaterProtection(shape:TerrainGeometry,context:AdvancedTerrainContext){
 const world=context.world,frame=context.frame??{x:0,y:0,width:shape.displayWidth,height:shape.displayHeight},
  sx=frame.width/shape.width,sy=frame.height/shape.height;
 if(![world.width,world.height,frame.x,frame.y,frame.width,frame.height,sx,sy].every(Number.isFinite)||world.width<=0||world.height<=0||sx<=0||sy<=0)throw Error("The saved standing-water context does not match this terrain.");
 const bodies=[...(context.water.lakes??[]),...(context.water.features??[]).filter(f=>f.kind==="wetland")].map(body=>{
  const rings=body.rings,vertices=rings.reduce((n,ring)=>n+ring.length,0);
  if(!rings.length||rings.some(ring=>ring.length<3)||vertices>ADVANCED_TERRAIN_LIMITS.work)throw Error("The saved standing-water outline is unavailable or exceeds this operation's bound.");
  return {rings,vertices,bounds:waterBounds(rings.flat(),world)};
 });
 type Tile={bodies:typeof bodies;values?:Uint8Array};
 const cache=new Map<string,Tile>(),limit=256,rootLattice=frame.x===0&&frame.y===0&&frame.width===world.width&&frame.height===world.height&&shape.wrap===world.wrap;let geometryWork=0;
 const position=(x:number,y:number)=>({x:world.wrap?((frame.x+x*sx)%world.width+world.width)%world.width:Math.max(0,Math.min(world.width,frame.x+x*sx)),y:Math.max(0,Math.min(world.height,frame.y+y*sy))});
 function wet(x:number,y:number){
  if(rootLattice){x=shape.wrap?((x%shape.width)+shape.width)%shape.width:Math.max(0,Math.min(shape.width-1,x));y=Math.max(0,Math.min(shape.height-1,y));}
  const tx=Math.floor(x/32),ty=Math.floor(y/32),key=tx+":"+ty;let tile=cache.get(key);
  if(!tile){
   const bounds={x:frame.x+tx*32*sx,y:frame.y+ty*32*sy,width:32*sx,height:32*sy},possible=bodies.filter(body=>framesOverlap(bounds,body.bounds,world.width,world.wrap,Math.max(sx,sy)));
   tile={bodies:possible,...possible.length?{values:new Uint8Array(1024)}:{}};
  }else cache.delete(key);
  cache.set(key,tile);while(cache.size>limit)cache.delete(cache.keys().next().value!);
  if(!tile.values)return false;
  const offset=((y%32+32)%32)*32+(x%32+32)%32,ready=tile.values[offset];if(ready)return ready===2;
  const point=position(x,y);let inside=false;
  for(const body of tile.bodies){
   const b=body.bounds,dx=world.wrap?((point.x-b.x)%world.width+world.width)%world.width:point.x-b.x;
   if(point.y<b.y||point.y>b.y+b.height||dx<0||dx>b.width)continue;
   geometryWork+=body.vertices;if(geometryWork>ADVANCED_TERRAIN_LIMITS.work)throw Error("Choose a smaller area. Its saved standing-water protection exceeds 8,388,608 shoreline steps.");
   if(insideWaterRings(point,body.rings,world)){inside=true;break;}
  }
  tile.values[offset]=inside?2:1;return inside;
 }
 return {protected:(index:number)=>{
  const x=index%shape.width,y=Math.floor(index/shape.width);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(wet(x+dx,y+dy))return true;
  return false;
 },diagnostics:()=>({cachedTiles:cache.size,cacheLimit:limit,geometryWork})};
}
