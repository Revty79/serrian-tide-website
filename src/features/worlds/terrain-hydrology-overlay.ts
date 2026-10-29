import type {EngravingStyle} from "./terrain-engraving";
import type {TerrainStyle} from "./terrain-style";
import {paintWaterArtwork} from "./terrain-water-artwork";
import type {TerrainView} from "./terrain";
import type {HydroGeometry,HydroLayer,HydroPoint} from "./terrain-hydrology";
export type HydroOverlay={featurePreview?:HydroLayer|null;selectedFeature?:string|null;selectedFeaturePreview?:boolean;featureDrawing?:HydroPoint[];watershed?:import("./terrain-hydrology").HydroCatchment|null;showCatchments?:boolean;drawing?:HydroPoint[];selectedLake?:string|null;selectedLakePreview?:boolean;networkEdges?:string[];layer:HydroLayer;suggestions:HydroLayer|null;selected:string|null;selectedPreview:boolean;analysisCount?:number};
function dx(a:number,b:number,world:HydroGeometry){let delta=b-a;if(world.wrap)delta-=Math.round(delta/world.width)*world.width;return delta;}
export function drawHydrology(ctx:CanvasRenderingContext2D,view:TerrainView,world:HydroGeometry,overlay?:HydroOverlay,style?:string,art?:TerrainStyle,engraving?:EngravingStyle){if(overlay)paintWaterArtwork(ctx,view,world,overlay,style,art,engraving);}
export function hitHydrology(layer:HydroLayer,point:HydroPoint,world:HydroGeometry,tolerance:number){
  let best=tolerance*tolerance,result:string|undefined;
  for(const edge of layer.edges)for(let i=1;i<edge.points.length;i++){
    const a=edge.points[i-1],b=edge.points[i],x=dx(a.x,point.x,world),y=point.y-a.y,sx=dx(a.x,b.x,world),sy=b.y-a.y,t=Math.max(0,Math.min(1,(x*sx+y*sy)/(sx*sx+sy*sy||1))),distance=(x-t*sx)**2+(y-t*sy)**2;
    if(distance<=best){best=distance;result=edge.id;}
  }
  return result;
}
