"use client";
import {useEffect,useRef,useState} from "react";
import type {MapStateBundle} from "./map-states";
import {worldApi} from "./client-api";
import {StudioPanel} from "./map-studio";
import {decodeIslandRecovery,encodeIslandRecovery,ISLAND_RECOVERY_BYTES,islandRecoveryKey,type IslandRecoveryBundle,type IslandRecoveryContext,type IslandRecoveryDomains,type RecoveryView} from "./island-recovery";
import styles from "./island-recovery-panel.module.css";

type Domain=keyof IslandRecoveryDomains;
export type IslandSaveStatus={id:string;label:string;dirty:boolean;pending?:boolean;action?:string;save?:()=>void|Promise<unknown>;disabled?:boolean;detail?:string};
const names:Record<Domain,string>={artwork:"Map artwork",source:"Coastline / geographic source",setup:"Geographic surface setup",generation:"Generation recipe and preview",elevation:"Elevation presentation and source",landCover:"Land-cover presentation and source"};
const domainIds=Object.keys(names) as Domain[];
type Identity={worldId:string;mapId:string;timelineId:string};

/** Read authorization afresh; a local file never confers access or creates missing records. */
export async function authorizeIslandRecovery(identity:Identity,expectedUser?:string):Promise<IslandRecoveryContext>{
 const [session,state]=await Promise.all([
  worldApi<{user:{id:string}}|null>("/api/auth/get-session"),
  worldApi<MapStateBundle>(`/api/worlds/${identity.worldId}/atlas/states?map=${identity.mapId}&timeline=${identity.timelineId}`),
 ]);
 const map=state.bundle.maps.find(m=>m.id===identity.mapId);
 if(!session?.user.id||expectedUser&&session.user.id!==expectedUser||!state.canEdit||!state.bundle.canEdit||state.timelineId!==identity.timelineId||state.selected||state.coverage!=="baseline"||!map||map.archived||map.unavailable||(map.mapKind??"generic")!=="generic")throw new Error("Recovery needs the original signed-in owner and an active, editable shared-baseline map and timeline. Nothing was restored.");
 return {...identity,userId:session.user.id,scope:"shared-baseline"};
}

export function IslandRecoveryPanel({identity,allowed,blocked,token,statuses,capture,restore,restoreView}:{identity:Identity;allowed:boolean;blocked:string;token:string;statuses:IslandSaveStatus[];capture:()=>{view:RecoveryView;domains:IslandRecoveryDomains};restore:(id:Domain,value:NonNullable<IslandRecoveryDomains[Domain]>)=>Promise<void>|void;restoreView:(view:RecoveryView)=>void}){
 const identityKey=JSON.stringify(identity),[access,setAccess]=useState<{key:string;context:IslandRecoveryContext}|null>(null),[enabled,setEnabled]=useState(false),[status,setStatus]=useState("Checking recovery access…"),[error,setError]=useState(""),[checkpointError,setCheckpointError]=useState(""),[held,setHeld]=useState(false),[local,setLocal]=useState<IslandRecoveryBundle|null>(null),[candidate,setCandidate]=useState<IslandRecoveryBundle|null>(null),[busy,setBusy]=useState(false),[include,setInclude]=useState<Domain[]>(domainIds);
 const callbacks=useRef({capture,restore,restoreView}),live=useRef(identityKey),dialog=useRef<HTMLDialogElement>(null);
 const context=access?.key===identityKey?access.context:null,key=context?islandRecoveryKey(context):"";
 useEffect(()=>{callbacks.current={capture,restore,restoreView};},[capture,restore,restoreView]);
 useEffect(()=>{live.current=identityKey;},[identityKey]);
 useEffect(()=>{
  if(!allowed)return;let cancelled=false;
  void(async()=>{try{
   const current=await authorizeIslandRecovery(JSON.parse(identityKey) as Identity);if(cancelled)return;
   setAccess({key:identityKey,context:current});const storageKey=islandRecoveryKey(current);
   try{
    const opted=localStorage.getItem(`${storageKey}:enabled`)==="1",text=localStorage.getItem(storageKey);setEnabled(opted);
    if(text){const bundle=decodeIslandRecovery(text,current);setLocal(bundle);setHeld(true);setStatus("A device checkpoint is available. Review or download it before replacing it with current work.");}
    else setStatus(opted?"Device recovery enabled; waiting for a completed operation.":"Device recovery is off. Unsaved edits are not guaranteed after a browser interruption; you can download a recovery bundle.");
   }catch(e){setHeld(true);setError(`Device recovery could not be read: ${(e as Error).message} The live draft is unchanged. Download a bundle to keep a copy.`);}
  }catch(e){if(!cancelled){setAccess(null);setError((e as Error).message);}}})();return()=>{cancelled=true;};
 },[allowed,identityKey]);
 useEffect(()=>{if(candidate)dialog.current?.showModal();},[candidate]);
 function build(current:IslandRecoveryContext,selected?:Domain[]):IslandRecoveryBundle{
  const snapshot=callbacks.current.capture(),domains=selected?Object.fromEntries(Object.entries(snapshot.domains).filter(([id])=>selected.includes(id as Domain))):snapshot.domains;
  return {format:"serrian-atlas-island-recovery",version:1,context:current,createdAt:new Date().toISOString(),view:snapshot.view,domains};
 }
 useEffect(()=>{
  if(!allowed||!context||!enabled||held)return;
  if(blocked)return;
  const timer=setTimeout(()=>{
   try{const bundle=build(context),text=encodeIslandRecovery(bundle);localStorage.setItem(key,text);setLocal(bundle);setCheckpointError("");setStatus(`Device checkpoint saved ${new Date(bundle.createdAt).toLocaleTimeString()} · ${new TextEncoder().encode(text).byteLength.toLocaleString()} bytes. Includes ${Object.keys(bundle.domains).length} unsaved domains and view settings; no server save.`);}
   catch(e){setCheckpointError(`Device checkpoint failed: ${(e as Error).message} Your live draft is retained. Download a recovery bundle for a separate copy.`);}
  },200);return()=>clearTimeout(timer);
  // Snapshot callbacks stay current without restarting the completed-operation timer.
 },[allowed,context,enabled,held,blocked,key,token]);
 async function verify(){if(!context)throw new Error("Recovery access has not been verified.");const current=await authorizeIslandRecovery(JSON.parse(identityKey) as Identity,context.userId);if(live.current!==identityKey)throw new Error("The active map changed. Nothing was restored.");return current;}
 function downloadBundle(bundle:IslandRecoveryBundle){const text=encodeIslandRecovery(bundle),url=URL.createObjectURL(new Blob([text],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download=`serrian-island-recovery-${bundle.context.mapId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function download(){setBusy(true);setError("");try{if(!context)throw new Error("Recovery access has not been verified.");downloadBundle(build(context,include));setStatus("Recovery bundle downloaded. Restore it here to stage drafts for review; it does not save the server map.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function loadFile(file:File){setBusy(true);setError("");try{if(file.size>ISLAND_RECOVERY_BYTES)throw new Error("This file exceeds the 4-MiB recovery limit. Nothing was changed.");const current=await verify(),text=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());setCandidate(decodeIslandRecovery(text,current));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function reviewLocal(){setBusy(true);setError("");try{const current=await verify();if(local)setCandidate(decodeIslandRecovery(encodeIslandRecovery(local),current));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function setDevice(value:boolean){if(!context)return;try{localStorage.setItem(`${key}:enabled`,value?"1":"0");setEnabled(value);setError("");setStatus(value?held?"Device recovery enabled. The existing checkpoint is held until you choose to replace it.":"Device recovery enabled; the next completed operation will be checkpointed.":"Device recovery is off. Unsaved edits are not guaranteed after interruption. Existing checkpoints remain until deliberately forgotten.");}catch(e){setError(`Device recovery could not be enabled: ${(e as Error).message} Download a recovery bundle instead.`);}}
 function forget(){try{localStorage.removeItem(key);setLocal(null);setHeld(false);setEnabled(false);localStorage.setItem(`${key}:enabled`,"0");setStatus("Device checkpoint forgotten and device recovery turned off. Live drafts are retained.");setError("");}catch(e){setError((e as Error).message);}}
 async function apply(selected:Domain[],view:boolean){if(!candidate)return;setBusy(true);setError("");const results:string[]=[];try{
  await verify();for(const id of selected){const value=candidate.domains[id];if(!value)continue;try{await callbacks.current.restore(id,value);results.push(`${names[id]} staged`);}catch(e){results.push(`${names[id]} retained in the bundle: ${(e as Error).message}`);}}
  if(view)try{callbacks.current.restoreView(candidate.view);results.push("View settings staged");}catch(e){results.push(`View unchanged: ${(e as Error).message}`);}
  setStatus(`${results.join(". ")}. No server save was performed. Review each draft and its base revision before saving.`);setCandidate(null);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <StudioPanel section="recovery"><section className={styles.panel} aria-label="Save and recovery"><h3>Save each part of your map</h3><p>Each action saves only the part named below. Undo in Artwork changes artwork; Geography has its own undo history. A recovery bundle keeps current drafts and unfinished boundaries, rather than the full undo history.</p>
  <div className={styles.domains}>{statuses.map(s=><div className={styles.domain} key={s.id}><strong>{s.label}</strong><span>{s.pending?"Save pending":s.dirty?"Unsaved changes":"No unsaved changes"}</span>{s.detail&&<p>{s.detail}</p>}{s.save&&<button className="st-button is-secondary" disabled={s.disabled||s.pending||!s.dirty} onClick={()=>void s.save?.()}>{s.action??`Save ${s.label.toLocaleLowerCase()}`}</button>}</div>)}</div>
  {!allowed?<p>Recovery bundles are available for live owned generic maps on the shared baseline. Other views retain their existing independent save actions.</p>:<><h3>Keep a recovery copy</h3><p>Restoring stages the selected drafts in this same signed-in owner, World, map and timeline. It never saves automatically or recreates deleted records.</p>
  <label><input type="checkbox" checked={enabled} disabled={!context||busy} onChange={e=>setDevice(e.target.checked)}/> Keep a recovery draft on this device</label>
  {blocked&&<p role="status">Apply/finish needed: {blocked} The last completed checkpoint is retained.</p>}
  <p className={styles.status} role="status">{status}</p>{held&&<p>Automatic replacement is paused to protect the checkpoint found when opening this map. Restoring any subset keeps that original copy until you choose to replace or forget it.</p>}
  <div className={styles.actions}><button className="st-button" disabled={!context||busy||!!blocked} onClick={()=>void download()}>Download recovery bundle</button>{local&&<><button className="st-button is-secondary" disabled={!context||busy||!!blocked} onClick={()=>void reviewLocal()}>Review device checkpoint</button><button className="st-button is-secondary" disabled={!context||busy} onClick={()=>{try{downloadBundle(local);}catch(e){setError((e as Error).message);}}}>Download device checkpoint</button></>}{held&&<button className="st-button is-secondary" disabled={!context||busy||!!blocked} onClick={()=>{setHeld(false);setError("");setStatus("Current completed drafts chosen for the next checkpoint. The previous copy will be replaced.");}}>Replace checkpoint with current drafts</button>}{local&&<button className="st-button is-secondary" disabled={!context||busy} onClick={forget}>Forget device checkpoint</button>}</div>
  <details><summary>Choose domains for the downloaded bundle</summary><p>The device checkpoint includes all supported dirty domains. For a smaller manual bundle, choose the domains to download. View settings are included.</p>{domainIds.map(id=><label key={id}><input type="checkbox" checked={include.includes(id)} onChange={e=>setInclude(v=>e.target.checked?[...v,id]:v.filter(k=>k!==id))}/> {names[id]}</label>)}</details>
  <label>Restore a recovery bundle<input className={styles.input} type="file" accept="application/json,.json" disabled={!context||busy||!!blocked} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)void loadFile(file);}}/></label></>}
  {error&&<p role="alert">{error}</p>}{checkpointError&&<p role="alert">{checkpointError}</p>}
  {candidate&&<RecoveryReview bundle={candidate} dialog={dialog} busy={busy} onClose={()=>setCandidate(null)} onRestore={apply}/>}
 </section></StudioPanel>;
}

function RecoveryReview({bundle,dialog,busy,onClose,onRestore}:{bundle:IslandRecoveryBundle;dialog:React.RefObject<HTMLDialogElement|null>;busy:boolean;onClose:()=>void;onRestore:(ids:Domain[],view:boolean)=>Promise<void>}){
 const ids=domainIds.filter(id=>!!bundle.domains[id]),[selected,setSelected]=useState(ids),[view,setView]=useState(true);
 return <dialog ref={dialog} className={styles.dialog} aria-labelledby="island-recovery-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><h2 id="island-recovery-title">Review recovery drafts</h2><p>Checkpoint {new Date(bundle.createdAt).toLocaleString()}. {new TextEncoder().encode(encodeIslandRecovery(bundle)).byteLength.toLocaleString()} bytes. These drafts use their original base revisions. A newer saved version requires comparison and a deliberate rebase.</p><p>Staging replaces only the selected draft domains. Download your current work first if you want both copies. Artwork restoration is one undoable artwork action; other editors keep their own draft histories.</p>
  {ids.map(id=>{const value=bundle.domains[id];return <label key={id}><input disabled={busy} type="checkbox" checked={selected.includes(id)} onChange={e=>setSelected(v=>e.target.checked?[...v,id]:v.filter(k=>k!==id))}/><span>{names[id]}{"baseRevision"in value!?` · base revision ${value.baseRevision??"new source"}`:""}{"requestId"in value!?` · request ${value.requestId}`:""}</span></label>;})}
  <label><input type="checkbox" checked={view} disabled={busy} onChange={e=>setView(e.target.checked)}/> Restore view settings</label>
  <div className={styles.actions}><button className="st-button is-secondary" disabled={busy} onClick={onClose}>Keep current drafts</button><button className="st-button" disabled={busy||!selected.length&&!view} onClick={()=>void onRestore(selected,view)}>{busy?"Staging drafts…":"Stage selected recovery drafts"}</button></div>
 </dialog>;
}
