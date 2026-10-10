import type { AtlasBundle } from "./atlas";
/** Runs on the server after World authorization. No sharing access is created. */
export function redactDungeonBundle(bundle:AtlasBundle,protectedIds:Set<string>):AtlasBundle {
 const hidden=new Set(protectedIds);let changed=true;
 while(changed){changed=false;for(const g of bundle.geographies)if(g.parentId&&hidden.has(g.parentId)&&!hidden.has(g.id)){hidden.add(g.id);changed=true;}}
 const maps=bundle.maps.filter(m=>!m.geographyId||!hidden.has(m.geographyId)).map(m=>{
  const removedWalls=new Set((m.dungeonShapes??[]).filter(s=>hidden.has(s.entityId)).map(s=>s.id));
  const shapes=m.dungeonShapes?.filter(s=>!hidden.has(s.entityId)&&(s.variant!=="opening"||!removedWalls.has(s.wallId)));
  const retained=new Set(shapes?.map(s=>s.entityId));
  return {...m,generation:undefined,features:m.features.filter(f=>!hidden.has(f.geographyId)),drawings:m.drawings?.filter(d=>!d.geographyId||!hidden.has(d.geographyId)),dungeonShapes:shapes,dungeonEntities:m.dungeonEntities?.filter(e=>retained.has(e.id)).map(e=>({...e,privateNotes:""})),dungeonLinks:m.dungeonLinks?.filter(l=>retained.has(l.entityId)&&!hidden.has(l.destinationGeographyId??"")),interiorLinks:m.interiorLinks?.filter(l=>!hidden.has(l.destinationGeographyId??""))};
 });
 const ids=new Set(maps.map(m=>m.id));
 for(const map of maps){map.dungeonLinks=map.dungeonLinks?.filter(l=>!l.destinationMapId||ids.has(l.destinationMapId));map.interiorLinks=map.interiorLinks?.filter(l=>!l.destinationMapId||ids.has(l.destinationMapId));}
 return {...bundle,ordinaryProjection:true,canEdit:false,maps,geographies:bundle.geographies.filter(g=>!hidden.has(g.id)),dungeonSites:bundle.dungeonSites?.filter(s=>!hidden.has(s.id)),dungeonLevels:bundle.dungeonLevels?.filter(l=>!hidden.has(l.id)),connections:bundle.connections?.filter(c=>ids.has(c.sourceMapId)&&ids.has(c.destinationMapId)&&!hidden.has(c.geographyId)&&!hidden.has(c.destinationGeographyId??""))};
}
