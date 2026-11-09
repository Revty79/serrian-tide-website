"use client";
import {useEffect,useState} from "react";
import {worldApi,SaveError} from "./client-api";
import {geographicPages,GeographicPageError} from "./geographic-pages";
import {automaticGeographicDetail,sameGeographicViewport,type GeographicViewport,type GeographicViewportStatus} from "./geographic";
import {terrainReferenceExtent,type ReferenceBoundaryWorld} from "./terrain-reference-boundaries";
import type {TerrainViewport} from "./terrain-refinement";

export function useTerrainReferenceBoundaries(worldId:string,mapId:string,timelineId:string|undefined,world:ReferenceBoundaryWorld,view:TerrainViewport|undefined,enabled:boolean,review:boolean,sourceNamespace=""){
 const [retry,setRetry]=useState(0),[result,setResult]=useState<{key:string;packet?:GeographicViewport;loading:boolean;error:string}|null>(null),extent=view?terrainReferenceExtent(world,view):null,key=JSON.stringify([worldId,mapId,timelineId,extent,enabled,review,sourceNamespace,retry]),current=result?.key===key?result:null;
 useEffect(()=>{if(!enabled||!extent||!timelineId)return;const controller=new AbortController(),pages=geographicPages(mapId),timer=setTimeout(()=>{void(async()=>{
  setResult({key,loading:true,error:""});const q=new URLSearchParams({map:mapId,timeline:timelineId,bounds:JSON.stringify(extent),projection:"equirectangular",lod:automaticGeographicDetail(extent,{version:1,kind:"sphere",crs:"EPSG:4326",units:"degrees"}),semantics:"administrative-boundary",themes:"administrative",...review?{review:"1"}:{},...sourceNamespace?{sourceNamespace}:{}});let after="",lastPaint=0;
  do{if(after)q.set("cursor",after);else q.delete("cursor");const packet=await worldApi<GeographicViewport>(`/api/worlds/${worldId}/terrain/geography?${q}`,"GET",undefined,controller.signal);if(controller.signal.aborted)return;if(packet.layer.surface.reference.kind!=="sphere")throw Error("This native overlay needs an explicitly selected full angular surface. The original planar source remains available in Geography records and boundaries.");pages.append(packet,after);if(!packet.nextCursor||performance.now()-lastPaint>250){setResult({key,packet:pages.value()??undefined,loading:!!packet.nextCursor,error:""});lastPaint=performance.now();}after=packet.nextCursor??"";}while(after);
 })().catch(e=>{if(controller.signal.aborted)return;const denied=e instanceof SaveError&&[401,403,404].includes(e.status)||e instanceof GeographicPageError&&e.clear;setResult({key,packet:denied?undefined:pages.value()??undefined,loading:false,error:e instanceof SaveError&&e.status===404?"No readable reference boundary source is attached to this map. Open Geography records and boundaries to inspect its sources.":e.message});});},180);return()=>{clearTimeout(timer);controller.abort();};
 // The serialized extent is the stable query identity during canvas redraws.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 useEffect(()=>{const packet=current?.packet;if(!enabled||current?.loading!==false||!packet||!timelineId)return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const check=async()=>{try{const q=new URLSearchParams({map:mapId,timeline:timelineId,lod:packet.lod,semantics:"administrative-boundary",themes:"administrative",check:"1",...review?{review:"1"}:{},...sourceNamespace?{sourceNamespace}:{}}),status=await worldApi<GeographicViewportStatus>(`/api/worlds/${worldId}/terrain/geography?${q}`,"GET",undefined,controller.signal);if(controller.signal.aborted)return;if(!sameGeographicViewport(packet,status)){setRetry(n=>n+1);return;}timer=setTimeout(()=>void check(),30000);}catch(e){if(controller.signal.aborted)return;setResult({key,loading:false,error:e instanceof Error?e.message:"Reference boundary access must be checked again."});}};
  timer=setTimeout(()=>void check(),30000);return()=>{clearTimeout(timer);controller.abort();};
 },[current,key,enabled,mapId,timelineId,review,worldId,sourceNamespace]);
 return {packet:enabled?current?.packet:undefined,loading:enabled&&(!current||current.loading),error:enabled?current?.error??"":"",retry:()=>setRetry(n=>n+1)};
}
