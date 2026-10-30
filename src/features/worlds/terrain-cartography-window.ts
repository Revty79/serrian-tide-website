import type {TerrainGeometry} from "./terrain";
import type {TerrainFrame,TerrainViewport} from "./terrain-refinement";
export type CartographicWindow={x:number;y:number;width:number;height:number;pixelsX:number;pixelsY:number};
/** Visual subdivisions only. Coordinates remain fractional offsets in the same
 * accepted numerical tile; each temporary bitmap stays at most 256 by 256. */
export function cartographicWindows(frame:TerrainFrame,shape:TerrainGeometry,key:number,view:TerrainViewport,world:TerrainGeometry,dpr=1):CartographicWindow[]{
 const cols=shape.width/32,w=frame.width/cols,h=frame.height/(shape.height/32),x=frame.x+key%cols*w,y=frame.y+Math.floor(key/cols)*h;
 const divisions=(span:number)=>Math.max(1,2**Math.min(44,Math.max(0,Math.ceil(Math.log2(span*view.scale*dpr/256))))),nx=divisions(w),ny=divisions(h);
 if(nx===1&&ny===1)return [];
 const windows=new Map<string,CartographicWindow>();
 for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){
 const left=Math.max(0,Math.floor((view.left-x-offset)/w*nx)),right=Math.min(nx-1,Math.floor((view.right-x-offset)/w*nx)),top=Math.max(0,Math.floor((view.top-y)/h*ny)),bottom=Math.min(ny-1,Math.floor((view.bottom-y)/h*ny));
 for(let j=top;j<=bottom;j++)for(let i=left;i<=right;i++)windows.set(`${i}/${j}`,{x:i/nx*32,y:j/ny*32,width:32/nx,height:32/ny,pixelsX:Math.max(1,Math.min(256,Math.ceil(w/nx*view.scale*dpr))),pixelsY:Math.max(1,Math.min(256,Math.ceil(h/ny*view.scale*dpr)))});
 }
 return [...windows.values()];
}
