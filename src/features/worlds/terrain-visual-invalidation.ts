import type {TerrainGeometry} from "./terrain";
import type {TerrainFrame} from "./terrain-refinement";
/** Crop a retained picture to the requested geographic footprint before scaling. */
export function terrainPictureSource(frame:TerrainFrame,source:TerrainFrame,pixels:number,halo=0){return {x:halo+(frame.x-source.x)/source.width*pixels,y:halo+(frame.y-source.y)/source.height*pixels,width:frame.width/source.width*pixels,height:frame.height/source.height*pixels};}
/** A completed replacement supersedes old versions at this exact footprint.
 * Other footprints/zoom levels remain available for progressive composition. */
export function retireTerrainFrame<T extends {frame:TerrainFrame}>(pictures:Map<string,T>,frame:TerrainFrame){const retired:string[]=[];for(const [key,picture]of pictures){const f=picture.frame;if(f.x===frame.x&&f.y===frame.y&&f.width===frame.width&&f.height===frame.height){pictures.delete(key);retired.push(key);}}return retired;}
export class TerrainVisualInvalidation{
 generation=0;
 /** Local edits may reset bounded dependency bookkeeping, but must not remove
  * the last composed picture while its replacement is being painted. */
 presentation=0;
 private areas:{frame:TerrainFrame;version:number}[]=[];
 /** Unknown/global changes reset the cache epoch. Bounded local changes retain
  * unrelated pictures; exceeding the descriptor budget safely resets globally. */
 invalidate(frames?:TerrainFrame[],retirePresentation=!frames){if(frames&&!frames.length)return false;this.generation++;if(retirePresentation)this.presentation++;if(!frames||this.areas.length+frames.length>64){this.areas=[];return true;}for(const frame of frames)this.areas.push({frame,version:this.generation});return false;}
 token(frame:TerrainFrame,world:Pick<TerrainGeometry,"wrap"|"displayWidth">,halo=0){let version=0;for(const area of this.areas)for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){const f=area.frame;if(f.x+offset<frame.x+frame.width+halo&&f.x+offset+f.width>frame.x-halo&&f.y<frame.y+frame.height+halo&&f.y+f.height>frame.y-halo)version=Math.max(version,area.version);}return version;}
}
/** A changed numerical tile plus the reconstruction stencil, in World metres. */
export function terrainDirtyFrames(keys:Iterable<number>|undefined,shape:TerrainGeometry,origin:{x:number;y:number}={x:0,y:0}):TerrainFrame[]|undefined{
 if(!keys)return undefined;const frames:TerrainFrame[]=[],columns=shape.width/shape.tileSize,sx=shape.displayWidth/shape.width,sy=shape.displayHeight/shape.height;
 for(const key of new Set(keys)){if(!Number.isInteger(key)||key<0||key>=shape.width*shape.height/shape.tileSize**2)continue;frames.push({x:origin.x+(key%columns*shape.tileSize-4)*sx,y:origin.y+(Math.floor(key/columns)*shape.tileSize-4)*sy,width:(shape.tileSize+8)*sx,height:(shape.tileSize+8)*sy});}return frames;
}
