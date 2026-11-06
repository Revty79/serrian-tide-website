import "server-only";
import type {NativeHistoryTx} from "./native-map-history-store";
import {nativeResource,type NativeContentContext} from "./native-map-history-context";
import {labelSourceCandidate} from "./terrain-labels-sources";
import type {LabelCandidate} from "./terrain-labels";
import type {HydroLayer} from "./terrain-hydrology";
import type {TownBundle} from "./world-towns";
import {nativeConditions} from "./native-map-history-conditions";
import {nativeObjectPresent} from "./native-map-history";
import {nativeTerrainSource} from "./native-map-history-terrain-read";
import {requireRegionalPath} from "./terrain-regional-scope";

/** Dated sources come only from the selected immutable geographic pack. */
export async function nativeLabelSourceCatalog(tx:NativeHistoryTx,c:NativeContentContext){
  const water=(await nativeResource(tx,c,"hydrology")).payload.layer as HydroLayer,places=(await nativeResource(tx,c,"places")).payload as unknown as TownBundle;
  const mapId=c.authority?.scope.target.id??c.scope.target.id,conditions=(await nativeConditions(tx,c)).values,catalog=new Map<string,LabelCandidate>();
  const {document,shape}=await nativeTerrainSource(tx,c),region=document.region;
  const add=(...args:Parameters<typeof labelSourceCandidate> extends [string,...infer Rest]?Rest:never)=>{
    const candidate=labelSourceCandidate(mapId,...args);if(!candidate||!nativeObjectPresent(conditions,candidate.source.id))return;
    if(region)try{requireRegionalPath([candidate.anchor,...candidate.path],0,{frame:region.frame,footprint:region.footprint,world:{width:shape.displayWidth,height:shape.displayHeight,wrap:shape.wrap}});}catch{return;}
    catalog.set(candidate.key,candidate);
  };
  for(const edge of water.edges)add("river",edge.id,edge.name,edge.points[Math.floor(edge.points.length/2)],edge.points,"river");
  for(const lake of water.lakes??[])if(lake.condition!=="potential")add("lake",lake.id,lake.name,lake.seed,[],"lake");
  for(const feature of water.features??[]){const point=feature.kind==="wetland"?feature.rings[0]?.[0]:feature.point;if(feature.kind!=="wetland"||feature.classification!=="potential")add("feature",feature.id,feature.name,point,[],"landmark");}
  for(const catchment of water.catchments??[])add("catchment",catchment.id,catchment.name,catchment.outlet,[],"region");
  for(const town of places.placements)if(!town.removed&&!town.archived)add("town",town.townId,town.name,town,[],"town");
  return new Map([...catalog].sort(([a],[b])=>a.localeCompare(b)));
}
