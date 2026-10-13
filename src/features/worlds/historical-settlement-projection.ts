import type { AtlasBundle } from "./atlas";
import { placeIsPresent } from "./historical-places";

/** Remove unavailable local places and inverse references before ordinary serialization. */
export function projectOrdinarySettlement(bundle:AtlasBundle,mapId:string):AtlasBundle {
  const map=bundle.maps.find(m=>m.id===mapId);
  if(!map?.historicalPlaces||!map.geographyId)return bundle;
  const visible=new Set(map.historicalPlaces.filter(p=>placeIsPresent(map.historicalPlaces,p.geographyId)).map(p=>p.geographyId));
  const hidden=new Set(map.historicalPlaces.filter(p=>!visible.has(p.geographyId)).map(p=>p.geographyId));
  // Shared entities created after this source are not evidence of historical existence.
  for(const g of bundle.geographies)if(g.parentId===map.geographyId&&!visible.has(g.id))hidden.add(g.id);
  let changed=true;
  while(changed){changed=false;for(const g of bundle.geographies)if(g.parentId&&hidden.has(g.parentId)&&!hidden.has(g.id)){hidden.add(g.id);changed=true;}}
  const maps=bundle.maps.filter(m=>m.id===mapId||!m.geographyId||!hidden.has(m.geographyId)).map(m=>({
    ...m,
    ...(m.id===mapId&&hidden.has(map.geographyId!)?{name:"Historically unavailable settlement",description:"This source does not establish a present settlement in this period."}:{}),
    features:m.features.filter(f=>!hidden.has(f.geographyId)),drawings:m.drawings?.filter(d=>!d.geographyId||!hidden.has(d.geographyId)),
    settlementShapes:m.settlementShapes?.filter(s=>!hidden.has(s.geographyId)),
    settlementEntities:m.settlementEntities?.filter(e=>!hidden.has(e.geographyId)).map(e=>({...e,districtIds:e.districtIds.filter(id=>!hidden.has(id))})),
    historicalPlaces:m.historicalPlaces?.filter(p=>!hidden.has(p.geographyId)),
  }));
  const mapIds=new Set(maps.map(m=>m.id));
  return {...bundle,canEdit:false,maps,geographies:bundle.geographies.filter(g=>!hidden.has(g.id)),
    connections:bundle.connections?.filter(c=>mapIds.has(c.sourceMapId)&&mapIds.has(c.destinationMapId)&&!hidden.has(c.geographyId)&&(!c.destinationGeographyId||!hidden.has(c.destinationGeographyId))),
    buildingIds:bundle.buildingIds?.filter(id=>!hidden.has(id)),floors:bundle.floors?.filter(f=>!hidden.has(f.buildingId)&&!hidden.has(f.id)),
    dungeonSites:bundle.dungeonSites?.filter(s=>!hidden.has(s.id)),dungeonLevels:bundle.dungeonLevels?.filter(l=>!hidden.has(l.siteId)&&!hidden.has(l.id)),
  };
}
