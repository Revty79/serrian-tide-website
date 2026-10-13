import { placeIsPresent } from "./historical-places";
import type { AtlasBundle, AtlasMap, GeographyRecord } from "./atlas";

export function geographyPath(id: string|null|undefined, geographies: GeographyRecord[]) {
  const byId=new Map(geographies.map(g=>[g.id,g])), seen=new Set<string>(), path:GeographyRecord[]=[];
  while(id){if(seen.has(id))break;seen.add(id);const record=byId.get(id);if(!record)break;path.unshift(record);id=record.parentId;}
  return path;
}
export function geographyType(place:GeographyRecord){return place.kind==="location"&&place.context&&place.context!=="place"?place.context:place.kind;}
export function navigationIndex(bundle:AtlasBundle) {
  const places=new Map(bundle.geographies.map(g=>[g.id,g])),maps=new Map(bundle.maps.map(m=>[m.id,m]));
  for(const map of bundle.maps)for(const e of [...map.interiorEntities??[],...map.dungeonEntities??[]])if(!places.has(e.id))places.set(e.id,{id:e.id,name:e.name||`Unnamed ${e.kind}`,description:e.description,kind:"location",context:map.mapKind==="dungeon"?"dungeon":"interior",parentId:map.geographyId??null,revision:e.revision??1,archived:false});
  const destinations=new Map<string,AtlasMap[]>();
  for(const map of bundle.maps){if(!map.archived&&!map.unavailable&&map.geographyId&&!places.get(map.geographyId)?.archived){const list=destinations.get(map.geographyId)??[];list.push(map);destinations.set(map.geographyId,list);}}
  const preferred=new Map((bundle.connections??[]).map(c=>[`${c.sourceMapId}:${c.geographyId}`,c.destinationMapId]));
  const historicalPolicies=new Map((bundle.historicalConnectionPolicies??[]).map(p=>[p.geographyId,p]));
  return {places,maps,destinations,preferred,historicalPolicies};
}
export function representedPlaces(map:AtlasMap,bundle:AtlasBundle) {
  return new Set([...(map.dungeonShapes??[]).filter(s=>!s.archived).map(s=>s.entityId),...(map.interiorShapes??[]).filter(s=>!s.archived).map(s=>s.entityId),...(map.settlementShapes??[]).filter(s=>!s.archived).map(s=>s.geographyId),...map.features.filter(f=>!f.archived).map(f=>f.geographyId),...(map.drawings??[]).filter(d=>!d.archived&&d.geographyId).map(d=>d.geographyId!),...(bundle.connections??[]).filter(c=>c.sourceMapId===map.id).map(c=>c.geographyId)].filter(id=>placeIsPresent(map.historicalPlaces,id)&&placeIsPresent(map.historicalPlaces,map.geographyId)));
}
export function historicalDestinations(bundle:AtlasBundle,mapId:string,placeId:string){
  const index=navigationIndex(bundle),policy=index.historicalPolicies.get(placeId);
  if(index.places.get(placeId)?.archived)return [];
  const available=(m:AtlasMap)=>!m.archived&&!m.unavailable&&m.id!==mapId&&(!m.geographyId||index.places.get(m.geographyId)?.archived!==true);
  if(policy&&policy.basis!=="baseline-reference"){
    const destination=policy.connection?index.maps.get(policy.connection.destinationMapId):null;
    return destination&&available(destination)&&(!policy.connection?.destinationGeographyId||index.places.get(policy.connection.destinationGeographyId)?.archived!==true)?[destination]:[];
  }
  const associated=index.destinations.get(placeId)??[],preferred=index.maps.get(index.preferred.get(`${mapId}:${placeId}`)??"");
  return [...associated,...preferred&&!associated.some(m=>m.id===preferred.id)?[preferred]:[]].filter(available);
}
// Visiting a previous map truncates the trail. Geography ancestry is a separate relationship.
export function visitMap(trail:string[],id:string){const old=trail.indexOf(id);return old>=0?trail.slice(0,old+1):[...trail,id].slice(-40);}
