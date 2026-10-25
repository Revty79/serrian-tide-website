"use client";
import {useCallback,useEffect,useState} from "react";
import {DEFAULT_MEASUREMENT_PREFERENCES,parseMeasurementPreferences,type MeasurementPreferences} from "./terrain-units";
const KEY="st:terrain-measurement:v1";
export function useMeasurementPreferences(){
 const [preferences,setPreferences]=useState(DEFAULT_MEASUREMENT_PREFERENCES);
 useEffect(()=>{let alive=true;const read=()=>{try{const p=parseMeasurementPreferences(JSON.parse(localStorage.getItem(KEY)??"null"));if(alive&&p)setPreferences(p);}catch{/* View preferences must not block editing. */}},event=(e:Event)=>{const p=parseMeasurementPreferences((e as CustomEvent).detail);if(p)setPreferences(p);else read();};void Promise.resolve().then(read);window.addEventListener(KEY,event);window.addEventListener("storage",read);return()=>{alive=false;window.removeEventListener(KEY,event);window.removeEventListener("storage",read);};},[]);
 const change=useCallback((next:MeasurementPreferences)=>{const p=parseMeasurementPreferences(next);if(!p)return;setPreferences(p);try{localStorage.setItem(KEY,JSON.stringify(p));}catch{/* Shared local view still works when browser storage is disabled. */}window.dispatchEvent(new CustomEvent(KEY,{detail:p}));},[]);
 return [preferences,change] as const;
}
