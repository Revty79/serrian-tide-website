"use client";
import {useCallback,useEffect,useState} from "react";
const KEY="st:terrain-touch-controls:v1";

/** Explicit interface preference; it never grants finger authoring permission. */
export function useTerrainTouchControls(){
 const [value,setValue]=useState({enabled:false,epoch:0});
 useEffect(()=>{let alive=true;const read=()=>{try{const stored=JSON.parse(localStorage.getItem(KEY)??"null");if(alive&&typeof stored?.enabled==="boolean")setValue(v=>v.enabled===stored.enabled?v:{enabled:stored.enabled,epoch:v.epoch+1});}catch{/* A display preference cannot block terrain editing. */}};void Promise.resolve().then(read);window.addEventListener(KEY,read);window.addEventListener("storage",read);return()=>{alive=false;window.removeEventListener(KEY,read);window.removeEventListener("storage",read);};},[]);
 const change=useCallback((enabled:boolean)=>{setValue(v=>v.enabled===enabled?v:{enabled,epoch:v.epoch+1});try{localStorage.setItem(KEY,JSON.stringify({enabled}));}catch{/* Current-session controls still work without storage. */}window.dispatchEvent(new Event(KEY));},[]);
 return [value.enabled,change,value.epoch] as const;
}
export function TerrainTouchSwitch({enabled,onChange}:{enabled:boolean;onChange:(enabled:boolean)=>void}){return <button type="button" className="st-button is-secondary" aria-pressed={enabled} onClick={()=>onChange(!enabled)}>Touch controls: {enabled?"On":"Off"}</button>;}
