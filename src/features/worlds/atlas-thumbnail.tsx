"use client";
import {memo,useEffect,useMemo,useRef,useState} from "react";
import {worldApi} from "./client-api";
import {draftOf,type AtlasBundle,type AtlasMap,type GeographyRecord} from "./atlas";
import type {MapStateBundle} from "./map-states";
import {CartographyScene} from "./cartography-scene";
import {GeographicThumbnail} from "./geographic-thumbnail";
import {scheduleThumbnail} from "./thumbnail-load";
import styles from "./atlas.module.css";

const ThumbnailArtwork=memo(function ThumbnailArtwork({map,geographies}:{map:AtlasMap;geographies:GeographyRecord[]}){
 const draft=useMemo(()=>draftOf(map,geographies),[map,geographies]);
 return <svg className={styles.preview} viewBox="0 0 2000 1200"><CartographyScene draft={draft} id={`thumb-${map.id}`} editable={false}/></svg>;
});
type Props={map:AtlasMap;geographies:GeographyRecord[];worldId?:string;timelineId?:string;ordinary?:boolean;review?:boolean;year?:string|null};
function VisibleThumbnail({map,geographies,worldId,timelineId,ordinary=false,review=false,year=null}:Props){
 const historical=year!==null&&!!timelineId&&["generic","settlement"].includes(map.mapKind??"generic"),local=["settlement","interior","dungeon"].includes(map.mapKind??"");
 const [retry,setRetry]=useState(0),key=`${worldId}:${map.id}:${map.revision}:${timelineId}:${ordinary}:${review}:${year}:${retry}`,[source,setSource]=useState<{key:string;bundle:AtlasBundle;caption:string}|null>(null),[failure,setFailure]=useState("");
 const needsSource=!!worldId;
 useEffect(()=>{const timer=setInterval(()=>setRetry(v=>v+1),30000),focus=()=>setRetry(v=>v+1);window.addEventListener("focus",focus);return()=>{clearInterval(timer);window.removeEventListener("focus",focus);};},[]);
 useEffect(()=>{
  if(!worldId||!needsSource)return;const controller=new AbortController();
  const q=new URLSearchParams({map:map.id,preview:"1",...review?{review:"1"}:{},...historical?{timeline:timelineId!,year:year!,...ordinary?{ordinary:"1"}:{}}:local?{ordinary:"1"}:ordinary?{ordinary:"1"}:{}});
  void scheduleThumbnail(async()=>{try{const result=await worldApi<AtlasBundle|MapStateBundle>(`/api/worlds/${worldId}/atlas${historical?"/states":""}?${q}`,"GET",undefined,controller.signal);if(controller.signal.aborted)return;const state="bundle"in result?result:null;if(!(state?state.bundle:result as AtlasBundle).maps.some(m=>m.id===map.id))throw new Error("Preview is unavailable");setSource({key,bundle:state?state.bundle:result as AtlasBundle,caption:state?state.selected?`Year ${year} · authored historical appearance`:`Year ${year} · unknown coverage; baseline artwork only`:"Shared baseline artwork"});setFailure("");}catch{if(!controller.signal.aborted)setFailure(key);}},controller.signal).catch(()=>{});
  return()=>controller.abort();
 },[worldId,needsSource,key,map.id,map.archived,map.unavailable,historical,timelineId,year,ordinary,review,retry,local]);
 const current=source?.key===key?source:null,m=current?.bundle.maps.find(m=>m.id===map.id)??map,g=current?.bundle.geographies??geographies;
 if(worldId&&!current)return <><div className={styles.thumbnail}/><div className={styles.thumbnailCaption}>{failure===key?<>Preview unavailable. <button className="st-button is-secondary" onClick={()=>setRetry(v=>v+1)}>Retry preview</button></>:historical?`Loading authorized artwork for Year ${year}`:"Loading authorized preview..."}</div></>;
 if(!historical&&!local&&worldId&&timelineId&&!m.archived&&!m.unavailable)return <GeographicThumbnail key={key} map={m} geographies={g} worldId={worldId} timelineId={timelineId} ordinary={ordinary} review={review}/>;
 return <><div className={styles.thumbnail} aria-hidden="true"><ThumbnailArtwork map={m} geographies={g}/></div><div className={styles.thumbnailCaption}>{current?.caption??(historical?`Year ${year} · baseline artwork while the historical preview loads`:"Shared baseline artwork")}{failure===key&&<><span>Preview unavailable; baseline artwork shown.</span><button className="st-button is-secondary" onClick={()=>setRetry(v=>v+1)}>Retry preview</button></>}</div></>;
}
export function AtlasThumbnail(props:Props){
 const ref=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
 useEffect(()=>{const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{rootMargin:"240px"});if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 return <div ref={ref} data-atlas-thumbnail={props.map.id} className={styles.thumbnailFrame}>{visible?<VisibleThumbnail {...props}/>:<><div className={styles.thumbnail}/><div className={styles.thumbnailCaption}>Preview loads near the screen.</div></>}</div>;
}
