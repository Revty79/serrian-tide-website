import type {TerrainGeometry} from "./terrain";
import type {TerrainFrame} from "./terrain-refinement";
export class TerrainVisualInvalidation{
 generation=0;
 private areas:{frame:TerrainFrame;version:number}[]=[];
 /** Unknown/global changes reset the cache epoch. Bounded local changes retain
  * unrelated pictures; exceeding the descriptor budget safely resets globally. */
 invalidate(frames?:TerrainFrame[]){if(frames&&!frames.length)return false;this.generation++;if(!frames||this.areas.length+frames.length>64){this.areas=[];return true;}for(const frame of frames)this.areas.push({frame,version:this.generation});return false;}
 token(frame:TerrainFrame,world:Pick<TerrainGeometry,"wrap"|"displayWidth">,halo=0){let version=0;for(const area of this.areas)for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){const f=area.frame;if(f.x+offset<frame.x+frame.width+halo&&f.x+offset+f.width>frame.x-halo&&f.y<frame.y+frame.height+halo&&f.y+f.height>frame.y-halo)version=Math.max(version,area.version);}return version;}
}
/** A changed numerical tile plus the reconstruction stencil, in World metres. */
export function terrainDirtyFrames(keys:Iterable<number>|undefined,shape:TerrainGeometry,origin:{x:number;y:number}={x:0,y:0}):TerrainFrame[]|undefined{
 if(!keys)return undefined;const frames:TerrainFrame[]=[],columns=shape.width/shape.tileSize,sx=shape.displayWidth/shape.width,sy=shape.displayHeight/shape.height;
 for(const key of new Set(keys)){if(!Number.isInteger(key)||key<0||key>=shape.width*shape.height/shape.tileSize**2)continue;frames.push({x:origin.x+(key%columns*shape.tileSize-4)*sx,y:origin.y+(Math.floor(key/columns)*shape.tileSize-4)*sy,width:(shape.tileSize+8)*sx,height:(shape.tileSize+8)*sy});}return frames;
}
