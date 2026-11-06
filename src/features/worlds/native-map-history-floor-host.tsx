"use client";
import {useEffect,useState} from "react";
import {BuildingInteriorWorkspace} from "./building-floor-editor";
import {useNativeWorldApi,useNativeHistory,useNativeNavigationGuard,replaceNativeAtlasUrl} from "./native-map-history-client";
import type {NativeFloorSourceContext} from "./native-map-history-floor-create";

/** Independent floor coverage must not require a Town appearance at that year. */
export function NativeFloorHost({worldId,review,onDirty}:{worldId:string;review:boolean;onDirty:(dirty:boolean)=>void}){
  const scope=useNativeHistory()!,api=useNativeWorldApi(),guard=useNativeNavigationGuard(),[source,setSource]=useState<NativeFloorSourceContext>(),[error,setError]=useState(""),[epoch,setEpoch]=useState(0);
  useEffect(()=>{const controller=new AbortController(),q=new URLSearchParams({floor:scope.target.id,identities:"1"}),route=new URL(location.href).searchParams;if(route.has("townMap")&&route.has("interiorBuilding")){q.set("townMap",route.get("townMap")!);q.set("building",route.get("interiorBuilding")!);}if(route.has("townReturnMap"))q.set("returnMap",route.get("townReturnMap")!);if(review)q.set("review","1");api<NativeFloorSourceContext>(`/api/worlds/${worldId}/building-floors?${q}`,"GET",undefined,controller.signal).then(value=>{if(!controller.signal.aborted){setSource(value);setError("");}}).catch(failure=>{if(!controller.signal.aborted)setError(failure.message);});return()=>controller.abort();},[api,scope.target.id,worldId,review,epoch]);
  function exit(mapId?:string){
    if(!source)return;const url=new URL(location.href);for(const key of ["interiorFloor","interiorBuilding","atlasState","atlasVersion","atlasGeographyVersion","atlasConnection","atlasConnectionSource"])url.searchParams.delete(key);
    if(mapId){url.searchParams.delete("townMap");url.searchParams.delete("townReturnMap");url.searchParams.set("terrainMap",mapId);}else{url.searchParams.set("townMap",source.townMapId);url.searchParams.set("terrainMap",source.worldMapId);}
    guard(mapId?"Open Source Atlas Map":"Return to Dated Town Map",()=>replaceNativeAtlasUrl(url.pathname+url.search));
  }
  if(!source)return <section style={{minHeight:720}}><h3>Building Interior</h3><p role={error?"alert":"status"}>{error||"Loading the floor's recorded source identity…"}</p>{error&&<button type="button" className="st-button" onClick={()=>setEpoch(value=>value+1)}>Retry Recorded Floor Source</button>}</section>;
  return <BuildingInteriorWorkspace worldId={worldId} mapId={source.townMapId} featureId={source.featureId} review={review} onDirty={onDirty} onReturn={()=>exit()} atlasNavigation={{regionId:source.regionId,worldMapId:source.worldMapId,onNavigate:exit}}/>;
}
