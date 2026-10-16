import {useEffect,useSyncExternalStore} from "react";
import {islandAsset,type AssetReference} from "./island-assets";
import {islandArtwork,prepareIslandArtwork} from "./island-artwork-source";

export function useIslandArtwork(references:readonly AssetReference[]){
 useSyncExternalStore(islandArtwork.subscribe,islandArtwork.version,()=>0);
 const key=JSON.stringify(references);
 useEffect(()=>{void prepareIslandArtwork(JSON.parse(key)).catch(()=>{});},[key]);
 const states=references.map(reference=>{try{return islandArtwork.read(islandAsset(reference));}catch{return {state:"error" as const,error:"An exact saved illustration revision is unavailable. Restore the matching artwork release."};}});
 return {ready:states.every(state=>state.state==="ready"),failed:states.some(state=>state.state==="error"),signature:states.map(state=>state.state).join(":"),error:states.find(state=>state.error)?.error};
}
export function IslandArtworkLoading({references,unitsPerPixel=1}:{references:AssetReference[];unitsPerPixel?:number}){
 const status=useIslandArtwork(references);if(status.ready)return null;
 return <g data-export-omit data-artwork-feedback pointerEvents="none"><text x={30} y={45*unitsPerPixel} fontSize={18*unitsPerPixel} fill="var(--map-ink)" stroke="var(--map-paper)" strokeWidth={3*unitsPerPixel} paintOrder="stroke" role={status.failed?"alert":"status"}>{status.failed?"Illustration unavailable. Editable source retained.":"Loading illustrations..."}<title>{status.error??"Only the exact illustrations used in this view are loading."}</title></text></g>;
}
export function IslandArtworkNotice({references}:{references:AssetReference[]}){
 const status=useIslandArtwork(references);if(status.ready)return null;
 return <div aria-label="Artwork loading status"><p role={status.failed?"alert":"status"}>{status.failed?`${status.error} Your editable artwork and saved references are retained.`:"Loading the exact illustrations used in this view..."}</p>{status.failed&&<button type="button" className="st-button is-secondary" onClick={()=>{void prepareIslandArtwork(references,true).catch(()=>{});}}>Retry illustrations</button>}</div>;
}
