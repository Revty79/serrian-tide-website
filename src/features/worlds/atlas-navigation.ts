import type { AtlasBundle, AtlasMap, GeographyRecord } from "./atlas";

export function geographyPath(id: string|null|undefined, geographies: GeographyRecord[]) {
  const byId=new Map(geographies.map(g=>[g.id,g])), seen=new Set<string>(), path:GeographyRecord[]=[];
  while(id){if(seen.has(id))break;seen.add(id);const record=byId.get(id);if(!record)break;path.unshift(record);id=record.parentId;}
  return path;
}
export function geographyType(place:GeographyRecord){return place.kind==="location"&&place.context&&place.context!=="place"?place.context:place.kind;}
export function navigationIndex(bundle:AtlasBundle) {
  const places=new Map(bundle.geographies.map(g=>[g.id,g])),maps=new Map(bundle.maps.map(m=>[m.id,m]));
  const destinations=new Map<string,AtlasMap[]>();
  for(const map of bundle.maps){if(!map.archived&&map.geographyId&&!places.get(map.geographyId)?.archived){const list=destinations.get(map.geographyId)??[];list.push(map);destinations.set(map.geographyId,list);}}
  const preferred=new Map((bundle.connections??[]).map(c=>[`${c.sourceMapId}:${c.geographyId}`,c.destinationMapId]));
  return {places,maps,destinations,preferred};
}
export function representedPlaces(map:AtlasMap,bundle:AtlasBundle) {
  return new Set([...map.features.filter(f=>!f.archived).map(f=>f.geographyId),...(map.drawings??[]).filter(d=>!d.archived&&d.geographyId).map(d=>d.geographyId!),...(bundle.connections??[]).filter(c=>c.sourceMapId===map.id).map(c=>c.geographyId)]);
}
// Visiting a previous map truncates the trail. Geography ancestry is a separate relationship.
export function visitMap(trail:string[],id:string){const old=trail.indexOf(id);return old>=0?trail.slice(0,old+1):[...trail,id].slice(-40);}
