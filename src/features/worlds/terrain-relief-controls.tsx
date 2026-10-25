"use client";
import {useEffect,useState} from "react";
import {GuidedField} from "@/components/field-guidance";
import {CLASSIC_RELIEF,ENHANCED_RELIEF,parseTerrainRelief,type TerrainRelief} from "./terrain-relief";
import styles from "./terrain.module.css";

/** View preferences are deliberately outside terrain commands and recovery. */
export function useTerrainRelief(key:string,physicalDefault:boolean){
 const [relief,setRelief]=useState(physicalDefault?ENHANCED_RELIEF:CLASSIC_RELIEF);
 useEffect(()=>{let alive=true;void Promise.resolve().then(()=>{try{const saved=parseTerrainRelief(JSON.parse(localStorage.getItem("st:terrain-relief:"+key)??"null"));if(alive&&saved)setRelief(saved);}catch{/* Storage can be disabled; numerical terrain is unaffected. */}});return()=>{alive=false;};},[key]);
 const change=(next:TerrainRelief)=>{if(!parseTerrainRelief(next))return;setRelief(next);try{localStorage.setItem("st:terrain-relief:"+key,JSON.stringify(next));}catch{/* The view remains usable for this tab. */}};
 return [relief,change] as const;
}
export function TerrainReliefControls({value,onChange,disabled=false}:{value:TerrainRelief;onChange:(r:TerrainRelief)=>void;disabled?:boolean}){
 const selected=value.mode==="classic"?"classic":({1:"natural",20:"enhanced",80:"dramatic"} as Record<number,string>)[value.exaggeration]??"custom";
 return <div className={styles.controls}><GuidedField label="Visual relief" help="Appearance only. Classic retains the original rendering. Physical relief uses elevation divided by actual east/west and north/south distances; exaggeration makes gentle slopes easier to see. Heights and saves never change." controlClassName="st-control"><select aria-label="Visual relief" value={selected} disabled={disabled} onChange={e=>onChange(e.target.value==="classic"?CLASSIC_RELIEF:{mode:"physical",exaggeration:({natural:1,enhanced:20,dramatic:80,custom:10} as Record<string,number>)[e.target.value]})}><option value="classic">Classic relief (original)</option><option value="natural">Natural physical relief (1x)</option><option value="enhanced">Enhanced physical relief (20x)</option><option value="dramatic">Dramatic physical relief (80x)</option><option value="custom">Custom physical relief</option></select></GuidedField>{value.mode==="physical"&&<GuidedField label="Visual relief exaggeration" help="Display slope multiplier, from 1 to 1000. This adds no numerical detail and does not change mountain heights. The preference is kept only in this browser." controlClassName="st-control"><input type="number" min={1} max={1000} step={1} value={value.exaggeration} disabled={disabled} onChange={e=>{const exaggeration=Number(e.target.value);if(exaggeration>=1&&exaggeration<=1000)onChange({mode:"physical",exaggeration});}}/></GuidedField>}</div>;
}
