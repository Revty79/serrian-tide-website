"use client";
import { useCallback, useEffect, useRef,useState, useSyncExternalStore } from "react";
import type { WorldCollaborationView } from "./world-collaboration";
import { applyWorldEditorStatus, initializeWorldEditor, notifyWorldEditor, beginWorldEditorBootstrapCheck, finishWorldEditorBootstrap, markWorldEditorClaimAttempt,attachWorldEditorRoot,loadWorldEditorLatest, type WorldEditorClient } from "./world-editor-credentials";
import type { WorldPermission } from "./world-permissions";
import styles from "./world-collaboration.module.css";

export function useWorldPermission(worldId:string,initial:WorldPermission|undefined){
  const client=initial?initializeWorldEditor(worldId,initial):undefined;
  const subscribe=useCallback((notify:()=>void)=>{if(!client)return()=>{};client.permissionListeners.add(notify);return()=>client.permissionListeners.delete(notify);},[client]);
  return useSyncExternalStore(subscribe,()=>client?.permission??initial,()=>initial);
}
export function useWorldEditorBootstrap(worldId:string,initial:WorldPermission|undefined){
  const client=initial?initializeWorldEditor(worldId,initial):undefined;
  const subscribe=useCallback((notify:()=>void)=>{if(!client)return()=>{};client.listeners.add(notify);return()=>{client.listeners.delete(notify);};},[client]);
  return useSyncExternalStore(subscribe,()=>client?.bootstrapping??false,()=>initial?.role==="owner");
}
async function controlRequest(client:WorldEditorClient,body?:unknown):Promise<WorldCollaborationView>{
  const url=`/api/worlds/${client.worldId}/access`,response=await fetch(url,{method:body?"POST":"GET",credentials:"same-origin",cache:"no-store",headers:{"X-World-Actor":client.actorId,"X-World-Editor":JSON.stringify(client.proof),...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw Error(data.error??"Editing control could not be confirmed. Your draft is retained.");return body?data.access:data;
}
export async function refreshWorldEditor(client:WorldEditorClient){const generation=++client.generation;try{const data=await controlRequest(client);if(generation===client.generation)applyWorldEditorStatus(client,data);return data;}catch(error){if(generation===client.generation){client.error=error instanceof Error?error.message:"World access could not be confirmed.";notifyWorldEditor(client,{...client.permission,canEdit:false});}throw error;}}
export async function changeWorldEditor(client:WorldEditorClient,body:Record<string,unknown>){const generation=++client.generation;try{const data=await controlRequest(client,body);if(generation===client.generation)applyWorldEditorStatus(client,data);return data;}catch(error){if(generation===client.generation){client.error=error instanceof Error?error.message:"The editing action could not be confirmed.";notifyWorldEditor(client,{...client.permission,canEdit:false});}throw error;}}
export async function acquireRegistryWorldEditor(worldId:string,permission:WorldPermission){const client=initializeWorldEditor(worldId,permission);client.autoClaimAttempted=true;const data=await changeWorldEditor(client,{action:"acquire-control",requestId:crypto.randomUUID(),proof:client.proof});if(!data.editor.yours)throw Error("Another session holds editing control. Open this World to review or reclaim it.");client.readyFence=data.editor.fence;notifyWorldEditor(client,{...data.permission,canEdit:true});finishWorldEditorBootstrap(client);return client;}
async function releaseOnLeave(client:WorldEditorClient){if(!client.editor.yours||client.proof.fence===undefined)return;const body={action:"release-control",requestId:crypto.randomUUID(),proof:{...client.proof}};await fetch(`/api/worlds/${client.worldId}/access`,{method:"POST",credentials:"same-origin",cache:"no-store",keepalive:true,headers:{"Content-Type":"application/json","X-World-Actor":client.actorId,"X-World-Editor":JSON.stringify(client.proof)},body:JSON.stringify(body)}).catch(()=>{});}

export function WorldCollaborationBar({worldId,permission,readOnly=false,onManage,onLatest,onGuard}:{worldId:string;permission:WorldPermission;readOnly?:boolean;onManage:()=>void;onLatest:()=>Promise<void>;onGuard:(label:string,run:()=>void)=>void}){
  const [controlsOpen,setControlsOpen]=useState(false),controls=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const open=(event:Event)=>{if((event as CustomEvent).detail?.worldId===worldId)setControlsOpen(true);};window.addEventListener("atlas:collaboration",open);return()=>window.removeEventListener("atlas:collaboration",open);},[worldId]);
  useEffect(()=>{if(controlsOpen)controls.current?.showModal();else controls.current?.close();},[controlsOpen]);
  const latest=useRef(onLatest);useEffect(()=>{latest.current=onLatest;},[onLatest]);
  const client=initializeWorldEditor(worldId,permission),subscribe=useCallback((notify:()=>void)=>{client.listeners.add(notify);return()=>client.listeners.delete(notify);},[client]);useSyncExternalStore(subscribe,()=>client.version,()=>0);
  const loadLatest=useCallback(()=>loadWorldEditorLatest(client,()=>latest.current()),[client]);
  const perform=useCallback(async(action:string,extra:Record<string,unknown>={})=>{const settleBootstrap=beginWorldEditorBootstrapCheck(client);try{await changeWorldEditor(client,{action,requestId:crypto.randomUUID(),...extra,...(action==="approve-control"?{}:{proof:{...client.proof}})});await loadLatest();}catch{}finally{settleBootstrap();}},[client,loadLatest]);
  useEffect(()=>{
    const detach=attachWorldEditorRoot(client);let live=true;
    const sync=async()=>{if(document.visibilityState==="hidden")return;const settleBootstrap=beginWorldEditorBootstrapCheck(client);try{const data=await refreshWorldEditor(client);if(!live)return;if(!readOnly&&data.permission.role==="owner"&&data.editor.available&&!client.autoClaimAttempted){markWorldEditorClaimAttempt(client);await perform("acquire-control");}else await loadLatest();}catch{}finally{settleBootstrap();}};
    void sync();const timer=window.setInterval(()=>{if(document.visibilityState!=="visible")return;if(client.editor.yours&&client.proof.fence!==undefined)void perform("renew-control");else if(client.permission.role!=="viewer")void sync();},55_000);
    const focus=()=>{void sync();},leaving=()=>{void releaseOnLeave(client);};document.addEventListener("visibilitychange",focus);window.addEventListener("pagehide",leaving);
    return()=>{live=false;detach();window.clearInterval(timer);document.removeEventListener("visibilitychange",focus);window.removeEventListener("pagehide",leaving);setTimeout(()=>{if(!client.roots)void releaseOnLeave(client);},0);};
  },[client,readOnly,perform,loadLatest]);
  const editable=client.permission.role==="owner"||client.permission.role==="editor",holder=client.editor.holder;
  const content=<section className={styles.bar} aria-label="World collaboration"><div><strong>{readOnly?"Read-only view":client.loadingLatest?"Loading latest accepted state":client.editor.yours?client.permission.canEdit?"You are editing":"Editing control awaits confirmation":holder?`${holder.name} is editing`:client.permission.role==="viewer"?"Viewer · Read-only":"Viewing saved work"}</strong>{!readOnly&&client.editor.yours&&<small>Editing control is exclusive to this tab.</small>}{client.error&&<p role="alert">{client.error} Accepted changes and local drafts are retained.</p>}{!client.available&&<small>World sharing and safe editing require migration 0159.</small>}</div><div className={styles.actions}>{!readOnly&&editable&&client.available&&<>{client.editor.yours?<button className="st-button is-secondary" onClick={()=>onGuard("Release editing control",()=>{markWorldEditorClaimAttempt(client);void perform("release-control");})}>Release control</button>:client.editor.available?<button className="st-button" onClick={()=>onGuard("Load latest and start editing",()=>void perform("acquire-control"))}>Start editing</button>:client.permission.role==="owner"?<button className="st-button is-secondary" onClick={()=>onGuard("Reclaim editing control; the other editor's draft stays on their device",()=>void perform("reclaim-control",{confirm:true}))}>Reclaim control</button>:<button className="st-button is-secondary" onClick={()=>void perform("request-control")}>{client.editor.requestPending?"Request sent":"Request editing control"}</button>}</>}<button className="st-button is-ghost" onClick={()=>{void refreshWorldEditor(client).then(loadLatest).catch(()=>{});}}>Check editing status</button>{client.permission.role==="owner"&&!readOnly&&<button className="st-button is-secondary" onClick={()=>{setControlsOpen(false);onManage();}}>Manage access</button>}</div></section>;
  return <>{content}<dialog ref={controls} className={styles.modal} aria-label="Editing control" onCancel={()=>setControlsOpen(false)}><header className={styles.header}><h2>Editing control</h2><button className="st-button" onClick={()=>setControlsOpen(false)}>Back to map</button></header>{controlsOpen&&content}</dialog></>;
}

