import type {AtlasBundle,AtlasMap} from "./atlas";

/** Never promote a continent, local plan or archived map to a whole World. */
export function isWorldOverviewMap(map:AtlasMap){
  return map.scope==="world"&&(map.mapKind??"generic")==="generic"&&!map.archived&&!map.unavailable;
}

/** Only use an ordinary-view result from the existing Atlas service. */
export function worldOverviewMapChoices(bundle:AtlasBundle){
  return bundle.maps.filter(isWorldOverviewMap).map(({id,name,scope,mapKind,width,height,revision,archived})=>({id,name,scope,mapKind,width,height,revision,archived}));
}
export type WorldOverviewMapChoice=ReturnType<typeof worldOverviewMapChoices>[number];
