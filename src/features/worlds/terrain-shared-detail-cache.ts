import type {CachedDetailTile} from "./terrain-refinement-cache";

/** Per-tab immutable numeric reuse after an authorized terrain/index read.
 * At most two terrain sources, each with the existing 2,048-tile bound.
 * Renderer bitmaps remain local to the current Canvas and are released normally.
 */
const sources=new Map<string,Map<string,CachedDetailTile>>();
export function sharedTerrainDetails(worldId:string,terrainId:string){
 const key=worldId+":"+terrainId,cache=sources.get(key)??new Map<string,CachedDetailTile>();
 sources.delete(key);sources.set(key,cache);
 while(sources.size>2)sources.delete(sources.keys().next().value!);
 return cache;
}
