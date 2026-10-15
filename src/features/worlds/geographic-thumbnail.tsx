"use client";
import {useEffect,useMemo,useState} from "react";
import {worldApi,SaveError} from "./client-api";
import {draftOf,type AtlasMap,type GeographyRecord} from "./atlas";
import type {GeographicViewport} from "./geographic";
import {atlasGeographicFrame} from "./atlas-geographic-frame";
import {CartographyScene} from "./cartography-scene";
import {GeographicScene} from "./geographic-scene";
import {GeographicCredits} from "./geographic-credits";
import {useElevation} from "./elevation-workspace";
import {useLandCover} from "./land-cover-workspace";
import {sameGeographicPreview,type GeographicPreviewStatus} from "./thumbnail-refresh";
import {scheduleThumbnail} from "./thumbnail-load";
import styles from "./atlas.module.css";

export function GeographicThumbnail({map,geographies,worldId,timelineId,ordinary,review}:{map:AtlasMap;geographies:GeographyRecord[];worldId:string;timelineId:string;ordinary:boolean;review:boolean}){
 const base=`${worldId}:${timelineId}:${map.id}:${ordinary}:${review}`,[refresh,setRefresh]=useState(0),key=base;
 const [result,setResult]=useState<{key:string;view:GeographicViewport|null;error:boolean}|null>(null),current=result?.key===key?result:null,viewport=current?.view??null;
 useEffect(()=>{const timer=setInterval(()=>setRefresh(v=>v+1),30000),focus=()=>setRefresh(v=>v+1);window.addEventListener("focus",focus);return()=>{clearInterval(timer);window.removeEventListener("focus",focus);};},[]);
 useEffect(()=>{const controller=new AbortController(),q=new URLSearchParams({map:map.id,timeline:timelineId,preview:"1",...ordinary?{ordinary:"1"}:{},...review?{review:"1"}:{}});
  void scheduleThumbnail(async()=>{try{if(current?.view&&!current.error){const status=await worldApi<GeographicPreviewStatus>(`/api/worlds/${worldId}/geography?${q}&check=1`,"GET",undefined,controller.signal);if(controller.signal.aborted)return;if(sameGeographicPreview(current.view,status)){if(JSON.stringify(current.view.layer)!==JSON.stringify(status.layer))setResult({...current,view:{...current.view,layer:status.layer}});return;}setResult({key,view:status.previewReader===current.view.previewReader?{...current.view,shapes:[],attributions:[]}:null,error:false});}
   const view=await worldApi<GeographicViewport>(`/api/worlds/${worldId}/geography?${q}`,"GET",undefined,controller.signal);if(!controller.signal.aborted)setResult({key,view,error:false});}catch(error){if(!controller.signal.aborted)setResult({key,view:null,error:!(error instanceof SaveError&&error.status===404)});}},controller.signal).catch(()=>{});return()=>controller.abort();
 // Current content is compared only after a fresh authorized metadata response.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[worldId,timelineId,map.id,ordinary,review,key,refresh]);
 const raster={worldId,timelineId,mapId:map.id,ordinary,review,viewport,preview:true},elevation=useElevation(raster),landCover=useLandCover(raster);
 const frame=useMemo(()=>viewport?atlasGeographicFrame(viewport.layer.surface.reference,viewport.bounds,viewport.projection):null,[viewport]),draft=useMemo(()=>draftOf(map,geographies),[map,geographies]);
 const incomplete=current?.error||elevation.error||landCover.error;
 return <><div className={styles.thumbnail} aria-hidden="true" data-geographic-preview={incomplete?"partial":viewport?"ready":current?"none":"loading"}><svg className={styles.preview} viewBox="0 0 2000 1200">{viewport&&frame&&<g transform="scale(2)"><GeographicScene viewport={viewport} elevation={elevation.image} landCover={landCover.image} flipY={frame.reference.kind==="plane"} labelsVisible={false}/></g>}<CartographyScene geographicFrame={frame??undefined} background={!frame} draft={draft} id={`thumb-${map.id}`} editable={false}/></svg></div><div className={styles.thumbnailCaption}><span>Shared baseline · {viewport?"coarse geographic preview":current?"authored artwork":"loading geographic preview"}</span>{incomplete&&<><span>Geographic preview is incomplete; available artwork remains shown.</span><button className="st-button is-secondary" onClick={()=>{setRefresh(v=>v+1);elevation.retry();landCover.retry();}}>Retry preview</button></>}{landCover.image&&landCover.credit&&<span>{landCover.credit.label}</span>}{(viewport?.attributions.length||elevation.credit||landCover.credit)&&<details><summary>Preview source credits</summary>{viewport?.attributions.map(c=><p key={JSON.stringify(c)}>{c.label} · <a href={c.url} target="_blank" rel="noreferrer">{c.license}</a></p>)}<GeographicCredits elevation={elevation.image?elevation.credit:null} landCover={landCover.image?landCover.credit:null}/></details>}</div></>;
}
