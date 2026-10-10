"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { draftOf, type AtlasMap, type GeographyRecord } from "./atlas";
import { CartographyScene } from "./cartography-scene";
import styles from "./atlas.module.css";

const VisibleArtwork=memo(function VisibleArtwork({map,geographies}:{map:AtlasMap;geographies:GeographyRecord[]}) {
  const draft=useMemo(()=>draftOf(map,geographies),[map,geographies]);
  return <svg className={styles.preview} viewBox="0 0 2000 1200"><CartographyScene draft={draft} id={`thumb-${map.id}`} editable={false}/></svg>;
});

export function AtlasThumbnail({map,geographies}:{map:AtlasMap;geographies:GeographyRecord[]}) {
  const ref=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
  useEffect(()=>{
    const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{rootMargin:"240px"});
    if(ref.current)observer.observe(ref.current);
    return()=>observer.disconnect();
  },[]);
  return <div ref={ref} className={styles.thumbnail} aria-hidden="true">{visible&&<VisibleArtwork map={map} geographies={geographies}/>}</div>;
}
