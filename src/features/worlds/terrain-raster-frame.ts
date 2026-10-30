import type {TerrainView} from "./terrain";
import type {TerrainFrame} from "./terrain-refinement";
/** Adjacent cached pictures own adjacent device pixels. Fractional per-tile
 * clips otherwise antialias against the underlying map and leave dark seams,
 * including on fully opaque, constant-color terrain. Source coordinates stay
 * unchanged; only the final raster coverage is rounded by at most half a pixel. */
export function terrainRasterFrame(view:TerrainView,frame:TerrainFrame,dpr=1){
 const ratio=Number.isFinite(dpr)&&dpr>0?dpr:1,snap=(n:number)=>Math.round(n*ratio)/ratio,x=snap(view.x+frame.x*view.scale),y=snap(view.y+frame.y*view.scale),right=snap(view.x+(frame.x+frame.width)*view.scale),bottom=snap(view.y+(frame.y+frame.height)*view.scale);
 return {x,y,width:Math.max(0,right-x),height:Math.max(0,bottom-y)};
}
