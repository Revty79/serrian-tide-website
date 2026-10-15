import {draftOf,type AtlasBundle} from "./atlas";
/** Trim an already-authorized existing-service result, never bypass its filtering. */
export function atlasPreviewBundle(bundle:AtlasBundle,mapId:string):AtlasBundle{
 const map=bundle.maps.find(m=>m.id===mapId);if(!map)return {...bundle,maps:[],geographies:[],connections:[]};
 const ids=new Set(draftOf(map,bundle.geographies).geographies.map(g=>g.id));
 return {...bundle,maps:[map],geographies:bundle.geographies.filter(g=>ids.has(g.id)),connections:[],floors:[],dungeonSites:[],dungeonLevels:[],buildingIds:[]};
}
