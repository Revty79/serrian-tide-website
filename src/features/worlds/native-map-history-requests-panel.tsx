"use client";

import {useCallback,useEffect,useState} from "react";
import {worldApi} from "./client-api";
import {nativeHistoryAppearanceBinding,nativeHistoryUrl,type NativeHistoryScope} from "./native-map-history";
import {NATIVE_TRANSPORT_LIMITS,nativeTransportPacketSchema,type NativeTransportPacket} from "./native-map-history-transport";
import {listNativeTransports,retainedNativeTransport,retainNativeTransport,releaseNativeTransport,type NativeTransportMeta} from "./native-map-history-transport-client";

export function NativeOriginalRequests({worldId,scope,disabled,onAccepted}:{worldId:string;scope?:NativeHistoryScope;disabled:boolean;onAccepted:()=>void}){
  const [rows,setRows]=useState<NativeTransportMeta[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[exported,setExported]=useState<string[]>([]);
  const refresh=useCallback(async()=>setRows(await listNativeTransports(worldId)),[worldId]);
  useEffect(()=>{
    let live=true;
    const load=()=>{void listNativeTransports(worldId).then(value=>{if(live)setRows(value);}).catch(failure=>{if(live)setError((failure as Error).message);});};
    load();window.addEventListener("atlas:original-requests",load);window.addEventListener("focus",load);
    return()=>{live=false;window.removeEventListener("atlas:original-requests",load);window.removeEventListener("focus",load);};
  },[worldId]);
  async function original(id:string){const packet=await retainedNativeTransport(id);if(!packet||packet.worldId!==worldId)throw Error("This retained request is no longer available. Refresh the request list.");return packet;}
  async function run(operation:()=>Promise<void>){if(busy)return;setBusy(true);setError("");try{await operation();await refresh();}catch(failure){setError((failure as Error).message);}finally{setBusy(false);}}
  function download(packet:NativeTransportPacket){
    const url=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:"application/json"})),link=document.createElement("a");
    link.href=url;link.download=`historical-request-${packet.requestId}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setExported(values=>[...values,packet.requestId]);
  }
  return <details aria-label="Original historical save requests"><summary>Original historical saves ({rows.length})</summary>
    <p>Each request retains its original World, map, timeline, year and command. Retrying does not move it to your viewing year. Accepted saves are checked against their server receipt.</p>
    <p>Unsubmitted drafts remain with their original viewing year. Return to that year and choose Edit This Appearance to recover them.</p>
    {error&&<p role="alert">{error}</p>}
    <label>Import an exported original request<input aria-label="Import original historical request" type="file" accept="application/json,.json" disabled={busy||disabled} onChange={event=>{
      const file=event.target.files?.[0];event.target.value="";if(!file)return;
      void run(async()=>{if(file.size>NATIVE_TRANSPORT_LIMITS.bodyBytes*2+32000)throw Error("This request export exceeds the recovery limit.");const packet=nativeTransportPacketSchema.parse(JSON.parse(await file.text()));if(packet.worldId!==worldId)throw Error("Open this request's original World before importing it.");await retainNativeTransport(packet);});
    }}/></label>
    {rows.map(row=>{
      const matching=scope?.edit&&nativeHistoryAppearanceBinding(scope)===nativeHistoryAppearanceBinding(row.scope);
      return <article key={row.requestId}><p>Year {row.scope.year} · {row.scope.target.kind} {row.scope.target.id} · timeline {row.scope.timelineId} · {Math.ceil(row.bytes/1024)} KiB</p><p>Request {row.requestId}</p>
        <button type="button" className="st-button" disabled={busy} onClick={()=>void run(async()=>download(await original(row.requestId)))}>Export Original Request</button>
        <button type="button" className="st-button" disabled={busy||disabled||!matching} onClick={()=>void run(async()=>{const packet=await original(row.requestId);await worldApi(nativeHistoryUrl(packet.endpoint,scope!),"POST",JSON.parse(packet.body));onAccepted();})}>Retry Exact Original Save</button>
        {!matching&&<p>Open this map and appearance in edit mode before retrying.</p>}
        <button type="button" className="st-button is-secondary" disabled={busy||!exported.includes(row.requestId)} onClick={()=>void run(async()=>{const packet=await original(row.requestId);if(!confirm("Have you kept the exported original request? Release only this browser's recovery copy? Its outcome may already be saved; releasing it does not undo or change server records."))return;await releaseNativeTransport(packet);})}>Release Exported Local Copy</button>
      </article>;
    })}
  </details>;
}
