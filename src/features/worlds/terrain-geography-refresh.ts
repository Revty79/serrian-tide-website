"use client";
import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {worldApi} from "./client-api";
import {GEOGRAPHY_CHANGED,GEOGRAPHY_REVISIONS,geographyChannel,type GeographyRevisions} from "./terrain-geography-notifications";
import {hydrologyUrl} from "./terrain-hydrology-loader";
import type {RegionalAuthoring} from "./terrain-regional-scope";
export function useTerrainGeographyRefresh(api:string,mapId:string,onNumerical:(packet:GeographyRevisions)=>void){
 const latest=useRef(onNumerical);useLayoutEffect(()=>{latest.current=onNumerical;});
 const [available,setAvailable]=useState<boolean>(),[error,setError]=useState(""),[snapshot,setSnapshot]=useState<GeographyRevisions>();
 useEffect(()=>{
  let live=true,busy=false,queued=false,timer:ReturnType<typeof setTimeout>|undefined;
  const endpoint=hydrologyUrl(api,mapId,"revisions"),worldId=api.match(/\/worlds\/([^/?]+)/)?.[1];
  async function refresh(){
   if(!live||document.visibilityState==="hidden")return;if(busy){queued=true;return;}busy=true;
   try{const packet=await worldApi<GeographyRevisions>(endpoint);if(!live)return;setAvailable(packet.regionalAvailable);setSnapshot(old=>JSON.stringify(old)===JSON.stringify(packet)?old:packet);setError("");window.dispatchEvent(new CustomEvent(GEOGRAPHY_REVISIONS,{detail:packet}));latest.current(packet);}
   catch(failure){if(live)setError(failure instanceof Error?failure.message:"Current geographic revisions could not be checked.");}
   finally{busy=false;if(live&&queued){queued=false;schedule();}}
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>void refresh(),80);}
  const changed=(event:Event)=>{if((event as CustomEvent<{worldId:string}>).detail?.worldId===worldId)schedule();};
  geographyChannel();window.addEventListener("focus",schedule);window.addEventListener("pageshow",schedule);document.addEventListener("visibilitychange",schedule);window.addEventListener(GEOGRAPHY_CHANGED,changed);void refresh();
  return()=>{live=false;clearTimeout(timer);window.removeEventListener("focus",schedule);window.removeEventListener("pageshow",schedule);document.removeEventListener("visibilitychange",schedule);window.removeEventListener(GEOGRAPHY_CHANGED,changed);};
 },[api,mapId]);
 return {available,error,snapshot};
}
/** Recheck after the request as well: interaction may start while a refresh is in flight. */
export function useLayerGeographyRefresh<T extends {regional?:RegionalAuthoring}>(options:{endpoint:string;mapId:string;kind:"materials"|"water"|"environment"|"artwork"|"labels";revision:()=>number;regional:()=>RegionalAuthoring|undefined;ready:()=>boolean;dirty:()=>boolean;apply:(value:T)=>void;conflict:(message:string)=>void}){
 const latest=useRef(options);useLayoutEffect(()=>{latest.current=options;});
 useEffect(()=>{
  let live=true,busy=false;
  const changed=async(event:Event)=>{
   const packet=(event as CustomEvent<GeographyRevisions>).detail,p=latest.current;if(!packet||packet.mapId!==p.mapId||!p.ready()||busy)return;
   const regional=p.regional(),changed=packet.heads[p.kind]!==p.revision()||!!regional&&packet.sourceState!==regional.sourceState||p.kind==="labels"&&!!regional&&packet.heads.composition!==regional.compositionRevision;
   if(!changed)return;
   const message="Accepted shared geography changed in another view. Your local draft and exact request are retained. Load saved geography when ready to review it.";
   if(p.dirty()){p.conflict(message);return;}busy=true;
   try{const value=await worldApi<T>(p.endpoint);if(!live)return;const current=latest.current;if(current.dirty()){current.conflict(message);return;}current.apply(value);}
   catch(failure){if(live)latest.current.conflict(failure instanceof Error?failure.message:"Shared geography could not be refreshed.");}
   finally{busy=false;}
  };
  window.addEventListener(GEOGRAPHY_REVISIONS,changed);return()=>{live=false;window.removeEventListener(GEOGRAPHY_REVISIONS,changed);};
 },[options.endpoint,options.mapId]);
}
