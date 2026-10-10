"use client";
import { worldApi } from "./client-api";
import type { AtlasBundle } from "./atlas";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { draftOf, type AtlasMap, type GeographyRecord } from "./atlas";
import { CartographyScene } from "./cartography-scene";
import styles from "./atlas.module.css";

const VisibleArtwork=memo(function VisibleArtwork({map,geographies}:{map:AtlasMap;geographies:GeographyRecord[]}) {
  const draft=useMemo(()=>draftOf(map,geographies),[map,geographies]);
  return <svg className={styles.preview} viewBox="0 0 2000 1200"><CartographyScene draft={draft} id={`thumb-${map.id}`} editable={false}/></svg>;
});

export function AtlasThumbnail({map,geographies,worldId,review=false}:{map:AtlasMap;geographies:GeographyRecord[];worldId?:string;review?:boolean}) {
  const ref=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
  const [source,setSource]=useState<AtlasBundle|null>(null);
  useEffect(()=>{if(!visible||!worldId||map.mapKind!=="settlement"||map.archived||map.settlementShapes)return;let alive=true;worldApi<AtlasBundle>(`/api/worlds/${worldId}/atlas?map=${map.id}${review?"&review=1":""}`).then(b=>{if(alive)setSource(b);}).catch(()=>{});return()=>{alive=false;};},[visible,worldId,map,review]);
  useEffect(()=>{
    const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{rootMargin:"240px"});
    if(ref.current)observer.observe(ref.current);
    return()=>observer.disconnect();
  },[]);
  return <div ref={ref} className={styles.thumbnail} aria-hidden="true">{visible&&<VisibleArtwork map={source?.maps.find(m=>m.id===map.id)??map} geographies={source?.geographies??geographies}/>}</div>;
}
