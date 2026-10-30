"use client";
import {useEffect,useState} from "react";
import {RENDER_QUALITY_KEY,renderQuality,renderQualityNames,type TerrainRenderQuality} from "./terrain-render-quality";
export function useTerrainRenderQuality(){
 const [quality,setQuality]=useState<TerrainRenderQuality>("balanced");
 useEffect(()=>{let live=true;void Promise.resolve().then(()=>{try{if(live)setQuality(renderQuality(localStorage.getItem(RENDER_QUALITY_KEY)));}catch{}});const update=(e:StorageEvent)=>{if(e.key===RENDER_QUALITY_KEY)setQuality(renderQuality(e.newValue));};window.addEventListener("storage",update);return()=>{live=false;window.removeEventListener("storage",update);};},[]);
 return {quality,choose:(value:TerrainRenderQuality)=>{setQuality(value);try{localStorage.setItem(RENDER_QUALITY_KEY,value);}catch{}}};
}
export function TerrainQualityControl({quality,choose}:{quality:TerrainRenderQuality;choose:(v:TerrainRenderQuality)=>void}){
 return <label title="This browser only. Changes artwork preparation; saved geography, artistic styling and history stay the same.">Device quality <select aria-label="Device rendering quality" value={quality} onChange={e=>choose(renderQuality(e.target.value))}>{Object.entries(renderQualityNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>;
}
