"use client";
import {useEffect,useState} from "react";
import {worldApi} from "./client-api";
import type {GeographicCatalog} from "./geographic";
import {GeographicWorkspace} from "./geographic-workspace";
import styles from "./geographic.module.css";
const readOnly=()=>{};
export function WorldGeographicPreview({worldId,timelineId,review,ordinary}:{worldId:string;timelineId:string;review:boolean;ordinary:boolean}){
  const key=`${worldId}:${timelineId}:${review}:${ordinary}`,[result,setResult]=useState<{key:string;value:GeographicCatalog}|null>(null),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  useEffect(()=>{const controller=new AbortController(),query=new URLSearchParams({timeline:timelineId,...review?{review:"1"}:{},...ordinary?{ordinary:"1"}:{}});void Promise.resolve().then(()=>{if(!controller.signal.aborted)setError("");});worldApi<GeographicCatalog>(`/api/worlds/${worldId}/geography?${query}`,"GET",undefined,controller.signal).then(value=>{if(!controller.signal.aborted)setResult({key,value});}).catch(()=>{if(!controller.signal.aborted)setError("The geographic preview could not load.");});return()=>controller.abort();},[worldId,timelineId,review,ordinary,key,retry]);
  const catalog=result?.key===key?result.value:null,layers=catalog?.layers.filter(l=>!l.surface.realmId&&!l.surface.protected)??[],map=catalog?.nextOffset===null&&layers.length===1?layers[0]:null;
  if(!map&&!error)return null;
  return <section className={styles.panel} aria-label="World geographic preview">{error?<p role="alert">{error}<button className="st-button is-secondary" onClick={()=>setRetry(v=>v+1)}>Retry World geography</button></p>:<GeographicWorkspace previewMapId={map!.mapId} worldId={worldId} timelineId={timelineId} review={review} onDirtyChange={readOnly}/>}</section>;
}
