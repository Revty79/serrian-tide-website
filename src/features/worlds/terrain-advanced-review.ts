import {regionAreaOverlaps,type RegionArea} from "./terrain-region-geometry";
import {waterBounds} from "./terrain-water-geometry";
import type {TerrainFrame} from "./terrain-refinement";
import type {AdvancedTerrainContext} from "./terrain-advanced";
import type {EnvironmentLayer,EnvironmentRegion} from "./terrain-environment";

/** Advisory only: accepted objects are never rewritten or deleted by a height edit. */
export function advancedTerrainReview(context:AdvancedTerrainContext,affected:TerrainFrame|null,environment?:EnvironmentLayer){
  if(!affected)return {rivers:[],lakes:[],wetlands:[],watersheds:[],climate:[],manualCover:[]} as Record<string,string[]>;
  const overlap=(a:RegionArea)=>regionAreaOverlaps({frame:affected},a,context.world);
  const bounds=(points:{x:number;y:number}[])=>({frame:waterBounds(points,context.world)});
  return {
    rivers:context.water.edges.filter(e=>overlap(bounds(e.points))).map(e=>e.name||e.id),
    lakes:(context.water.lakes??[]).filter(e=>overlap(bounds(e.rings.flat()))).map(e=>e.name||e.id),
    wetlands:(context.water.features??[]).filter(e=>e.kind==="wetland"&&overlap(bounds(e.rings.flat()))).map(e=>e.name||e.id),
    watersheds:(context.water.catchments??[]).filter(e=>overlap(bounds(e.rings.flat()))).map(e=>e.name||e.id),
    climate:(environment?.fields??[]).filter(e=>overlap({frame:e.frame})).map(e=>e.id),
    manualCover:(environment?.regions??[]).filter(e=>overlap(bounds(e.points))).map(e=>e.name),
  };
}
/** Existing environmental coverage: bare ash/debris is explicitly visual-only.
 * Insert beneath retained manual regions; no manual coverage is erased or replaced. */
export function volcanicAshCover(id:string,centre:{x:number;y:number},radius:number):EnvironmentRegion{
  return {id,name:"Volcanic ash / debris (visual only)",kind:"biome",effect:"override",shape:"brush",
    points:[centre],radiusM:radius,strength:1,biome:"coldDesert",vegetation:"bare",density:0,scaleM:8,clustering:0,protected:true};
}
