"use client";
import {useCallback,useEffect,useState} from "react";
import {GuidedField} from "@/components/field-guidance";
import {CLASSIC_RELIEF,ENHANCED_RELIEF,parseTerrainRelief,type TerrainRelief} from "./terrain-relief";
import {MapAppearanceControls} from "./terrain-appearance-controls";
import {appearanceRelief,visualAppearance} from "./terrain-appearance";
import type {MeasurementPreferences} from "./terrain-units";
import styles from "./terrain.module.css";

/** View preferences are deliberately outside terrain commands and recovery. */
export function useTerrainRelief(key:string,physicalDefault:boolean){
 const [relief,setRelief]=useState(physicalDefault?ENHANCED_RELIEF:CLASSIC_RELIEF);
 useEffect(()=>{let alive=true;void Promise.resolve().then(()=>{try{const saved=parseTerrainRelief(JSON.parse(localStorage.getItem("st:terrain-relief:"+key)??"null"));if(alive&&saved)setRelief(saved);}catch{/* Storage can be disabled; numerical terrain is unaffected. */}});return()=>{alive=false;};},[key]);
 const change=useCallback((next:TerrainRelief)=>{if(!parseTerrainRelief(next))return;setRelief(next);try{localStorage.setItem("st:terrain-relief:"+key,JSON.stringify(next));}catch{/* The view remains usable for this tab. */}},[key]);
 return [relief,change] as const;
}
export function TerrainReliefControls({value,onChange,disabled=false,heightUnit="m"}:{value:TerrainRelief;onChange:(r:TerrainRelief)=>void;disabled?:boolean;heightUnit?:MeasurementPreferences["height"]}){
 const realistic=value.appearance?.style==="realistic-terrain",selected=value.mode==="classic"?"classic":({1:"natural",20:"enhanced",80:"dramatic"} as Record<number,string>)[value.exaggeration]??"custom";
 const changeRelief=(next:TerrainRelief)=>onChange(appearanceRelief({...visualAppearance(value),style:next.mode==="classic"?"classic-elevation":visualAppearance(value).style==="classic-elevation"?"physical-relief":visualAppearance(value).style,relief:next.exaggeration}));
 return <div className={`${styles.controls} ${styles.appearanceControls}`}><MapAppearanceControls value={value} onChange={onChange} disabled={disabled} heightUnit={heightUnit}/><GuidedField label="Visual relief" help={realistic?"Surface lighting only. Realistic Terrain uses scale-aware artistic emphasis of saved physical slopes. These presets add no measured elevation or geological detail.":"Appearance only. Classic retains the original rendering. Physical relief uses elevation divided by actual east/west and north/south distances; exaggeration makes gentle slopes easier to see. Heights and saves never change."} controlClassName="st-control"><select aria-label="Visual relief" value={selected} disabled={disabled} onChange={e=>changeRelief(e.target.value==="classic"?CLASSIC_RELIEF:{mode:"physical",exaggeration:({natural:1,enhanced:20,dramatic:80,custom:10} as Record<string,number>)[e.target.value]})}><option value="classic">Classic relief (original)</option><option value="natural">Natural physical relief (1x)</option><option value="enhanced">Enhanced physical relief (20x)</option><option value="dramatic">Dramatic physical relief (80x)</option><option value="custom">Custom physical relief</option></select></GuidedField>{value.mode==="physical"&&<GuidedField label={realistic?"Surface lighting intensity":"Visual relief exaggeration"} help={realistic?"Artistic lighting intensity, from 1 to 1000. The renderer uses a bounded artistic curve on actual physical slopes; this is not a literal elevation multiplier. Heights remain unchanged.":"Display slope multiplier, from 1 to 1000. This adds no numerical detail and does not change mountain heights. Preview changes stay in this browser until you save the map appearance."} controlClassName="st-control"><input type="number" min={1} max={1000} step={1} value={value.exaggeration} disabled={disabled} onChange={e=>{const exaggeration=Number(e.target.value);if(exaggeration>=1&&exaggeration<=1000)changeRelief({mode:"physical",exaggeration});}}/></GuidedField>}</div>;
}
