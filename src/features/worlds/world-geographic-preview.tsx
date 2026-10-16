"use client";
import {useEffect,useState} from "react";
import {worldApi} from "./client-api";
import {AtlasThumbnail} from "./atlas-thumbnail";
import type {AtlasMap} from "./atlas";
import type {WorldOverviewMapChoice} from "./world-overview-map";
import styles from "./worlds.module.css";
type Choice=WorldOverviewMapChoice;
export function WorldGeographicPreview({worldId,timelineId,review,ordinary,onOpenAtlas}:{worldId:string;timelineId:string;review:boolean;ordinary:boolean;onOpenAtlas:()=>void}){
  const key=`${worldId}:${timelineId}:${review}:${ordinary}`;
  const [result,setResult]=useState<{key:string;maps:Choice[]}|null>(null),[error,setError]=useState(""),[retry,setRetry]=useState(0),[selection,setSelection]=useState<{key:string;id:string}|null>(null);
  useEffect(()=>{
    const controller=new AbortController(),query=new URLSearchParams({overview:"1",...review?{review:"1"}:{}});
    void worldApi<{maps:Choice[]}>(`/api/worlds/${worldId}/atlas?${query}`,"GET",undefined,controller.signal).then(value=>{if(!controller.signal.aborted){setResult({key,maps:value.maps});setError("");}}).catch(()=>{if(!controller.signal.aborted){setResult(null);setError("The World map could not load.");}});
    return()=>controller.abort();
  },[worldId,review,key,retry]);
  const maps=result?.key===key?result.maps:null,choice=maps?.find(map=>selection?.key===key&&map.id===selection.id)??maps?.[0];
  // Artwork is supplied only by the subsequent authorized map response.
  const map:AtlasMap|undefined=choice?{...choice,description:"",features:[]}:undefined;
  return <section className={styles.worldMap} aria-labelledby="overview-map-title" data-overview-section="map">
    <div className={styles.sectionHeading}><h2 id="overview-map-title">The World</h2><button className="st-button is-ghost" onClick={onOpenAtlas}>Open Atlas</button></div>
    {error?<p role="alert">{error} <button className="st-button is-secondary" onClick={()=>setRetry(value=>value+1)}>Retry World map</button></p>:!maps?<p className={styles.muted} role="status">Loading World map…</p>:map?<figure className={styles.worldMapImage} aria-label={`World map: ${map.name}`}><AtlasThumbnail key={`${key}:${map.id}`} map={map} geographies={[]} worldId={worldId} timelineId={timelineId} ordinary review={review} overview/></figure>:<p className={styles.muted}>No World map has been added yet. In Atlas, add a map with Map scope set to World.</p>}
    {maps&&maps.length>1&&<details className={styles.overviewDisclosure}><summary>Choose World map</summary><label className={styles.mapChoice}>Map to display<select className="st-control" value={choice?.id??""} onChange={event=>setSelection({key,id:event.target.value})}>{maps.map(map=><option key={map.id} value={map.id}>{map.name}</option>)}</select></label></details>}
  </section>;
}
