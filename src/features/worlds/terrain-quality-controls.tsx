"use client";
import {useEffect,useState} from "react";
import {RENDER_QUALITY_KEY,renderQuality,renderQualityNames,qualityPixelRatio,type TerrainRenderQuality} from "./terrain-render-quality";
export function useTerrainRenderQuality(){
 const [quality,setQuality]=useState<TerrainRenderQuality>("balanced");
 const [dpr,setDpr]=useState(1);
 useEffect(()=>{let live=true;void Promise.resolve().then(()=>{try{if(live)setQuality(renderQuality(localStorage.getItem(RENDER_QUALITY_KEY)));}catch{}});const update=(e:StorageEvent)=>{if(e.key===RENDER_QUALITY_KEY)setQuality(renderQuality(e.newValue));};window.addEventListener("storage",update);return()=>{live=false;window.removeEventListener("storage",update);};},[]);
 useEffect(()=>{let live=true;const update=()=>{if(live)setDpr(Math.min(2,window.devicePixelRatio||1));};void Promise.resolve().then(update);window.addEventListener("resize",update);return()=>{live=false;window.removeEventListener("resize",update);};},[]);
 return {quality,detailScale:quality==="detailed"||quality==="maximum"?qualityPixelRatio(dpr,quality):1,choose:(value:TerrainRenderQuality)=>{setQuality(value);try{localStorage.setItem(RENDER_QUALITY_KEY,value);}catch{}}};
}
export function TerrainQualityControl({quality,choose}:{quality:TerrainRenderQuality;choose:(v:TerrainRenderQuality)=>void}){
 return <><label title="This browser only. Higher choices draw sharper imagery and request finer accepted terrain where available; saved geography, artistic styling and history stay the same.">Device quality <select aria-label="Device rendering quality" value={quality} onChange={e=>choose(renderQuality(e.target.value))}>{Object.entries(renderQualityNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><details><summary>About quality</summary><p>Balanced is the everyday setting. Fast draws lighter imagery; Detailed and Maximum draw sharper imagery and use finer accepted terrain where available, with more preparation time. This device setting never edits your map. Smooth imagery adds no height samples; use Refine Terrain Here for more editable detail.</p></details></>;
}
