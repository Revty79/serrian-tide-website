"use client";
import {TerrainStyleWorkshop} from "./terrain-style-workshop";
import {useEffect,useRef,useState} from "react";
import {worldApi} from "./client-api";
import {useTerrainRelief} from "./terrain-relief-controls";
import {parseTerrainRelief} from "./terrain-relief";
import {appearanceRelief,visualAppearance,appearanceSaveSchema,type MapAppearance} from "./terrain-appearance";
type Saved={available:boolean;revision:number;spec:MapAppearance|null};
type Pending=ReturnType<typeof appearanceSaveSchema.parse>;
export function useMapAppearance(key:string,physicalDefault:boolean,api:string,mapId:string){
 const [value,setValue]=useTerrainRelief(key,physicalDefault),[remote,setRemote]=useState<Saved>(),[saving,setSaving]=useState(false),[pendingState,setPendingState]=useState(false),[notice,setNotice]=useState("Loading map appearance..."),[error,setError]=useState("");
 const [preview,setPreview]=useState<MapAppearance>(),[editing,setEditing]=useState(false);
 const pending=useRef<Pending|undefined>(undefined),alive=useRef(true),storageKey="st:map-appearance-pending:"+key,base=api.split("?")[0]+"/appearance?"+(api.split("?")[1]?api.split("?")[1]+"&":"")+"terrainMap="+mapId;
 useEffect(()=>{alive.current=true;let live=true;void worldApi<Saved>(base,"GET").then(result=>{
  if(!live)return;setRemote(result);setNotice(result.available?"Appearance changes preview in this browser. Save them to set this map's default.":"MIGRATION 0139 REQUIRED to save map appearances. You can still preview every style.");
  try{const local=parseTerrainRelief(JSON.parse(localStorage.getItem("st:terrain-relief:"+key)??"null"));if(!local?.appearance&&result.spec)setValue(appearanceRelief(result.spec));const raw=localStorage.getItem(storageKey);if(raw){const original=appearanceSaveSchema.parse(JSON.parse(raw));if(original.mapId===mapId){pending.current=original;setPendingState(true);setNotice("An original appearance save is retained. Retry it or explicitly load the map's saved appearance.");}}}catch{/* Local preferences can be unavailable; server values and terrain remain safe. */}
 }).catch(failure=>{if(live){setError((failure as Error).message);setNotice("Appearance is available as a local preview.");}});return()=>{live=false;alive.current=false;};},[base,key,mapId,setValue,storageKey]);
 async function save(){if(saving||!remote?.available)return;const command=pending.current??{mapId,revision:remote.revision,requestId:crypto.randomUUID(),spec:visualAppearance(value)};pending.current=command;setPendingState(true);try{localStorage.setItem(storageKey,JSON.stringify(command));}catch{/* A stable in-memory request still protects retries for this tab. */}setSaving(true);setError("");
  try{const result=await worldApi<{revision:number;spec:MapAppearance}>(base,"POST",command);pending.current=undefined;try{localStorage.removeItem(storageKey);}catch{}if(alive.current){setRemote({available:true,...result});setPendingState(false);setNotice("Map appearance saved separately. Numerical terrain and its revision are unchanged.");}}
  catch(failure){if(alive.current)setError((failure as Error).message+" Retry uses the original appearance request.");}finally{if(alive.current)setSaving(false);}
 }
 async function reload(){setError("");try{const result=await worldApi<Saved>(base,"GET");if(!alive.current)return;setRemote(result);if(result.spec)setValue(appearanceRelief(result.spec));pending.current=undefined;setPendingState(false);try{localStorage.removeItem(storageKey);}catch{}setNotice(!result.available?"MIGRATION 0139 REQUIRED to save map appearances. Your local preview is retained.":result.spec?"The saved map appearance is loaded. Numerical terrain is unchanged.":"This map has no saved appearance yet. Your local preview is retained.");}catch(failure){if(alive.current)setError((failure as Error).message);}}
 return [preview?appearanceRelief(preview):value,setValue,{editing,setEditing,preview:setPreview,spec:visualAppearance(value),setValue,mapId,stylesBase:base.replace("/appearance?","/styles?"),remote,saving,pending:pendingState,notice,error,save,reload,dirty:!!remote&&JSON.stringify(remote.spec)!==JSON.stringify(visualAppearance(value))}] as const;
}
export function MapAppearancePersistence({state,editable}:{state:ReturnType<typeof useMapAppearance>[2];editable:boolean}){
 return <div aria-label="Map appearance persistence"><p role="status">{state.notice}</p>{state.error&&<p role="alert">{state.error}</p>}{editable&&<div><button type="button" className="st-button is-secondary" disabled={state.editing||state.saving||!state.remote?.available||!state.dirty&&!state.pending} onClick={()=>void state.save()}>{state.saving?"Saving appearance...":state.pending?"Retry appearance save":"Save map appearance"}</button> <button type="button" className="st-button is-secondary" disabled={state.editing||state.saving} onClick={()=>void state.reload()}>Load saved appearance</button></div>}{editable&&<TerrainStyleWorkshop state={state} onEditing={state.setEditing}/>} {!editable&&<p>Your appearance changes are view-only in this read-only review.</p>}</div>;
}
