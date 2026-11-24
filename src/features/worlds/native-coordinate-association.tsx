"use client";
import {useContext,useEffect,useMemo,useRef,useState} from "react";
import {GuidedField as Field} from "@/components/field-guidance";
import {worldApi} from "./client-api";
import type {GeographicCatalog} from "./geographic";
import {WorldPermissionContext} from "./world-permission-context";
import {currentWorldDraftActor} from "./world-editor-credentials";
import {accountWorldStorage} from "./world-draft-storage";
import {associationCommand,associationRecoveryKey,clearAssociationDraft,encodeAssociationDraft,readAssociationDraft,writeAssociationDraft,type AssociationDraft} from "./native-coordinate-association-recovery";

type Props={worldId:string;timelineId:string;catalog:GeographicCatalog;onDirtyChange:(dirty:boolean)=>void;onSaved:()=>void};
type Selection={draft:AssociationDraft;raw:string|null;stored:boolean};
function download(raw:string,name:string){const url=URL.createObjectURL(new Blob([raw],{type:"application/json"})),link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

/** Existing map/surface association only; no source geometry or terrain input. */
export function NativeCoordinateAssociation(p:Props){
 const permission=useContext(WorldPermissionContext),actorId=permission?.worldId===p.worldId?permission.permission.actorId:undefined,
  canEdit=permission?.worldId===p.worldId&&permission.permission.canEdit,
  context=useMemo(()=>actorId?{actorId,worldId:p.worldId,timelineId:p.timelineId}:undefined,[actorId,p.worldId,p.timelineId]),
  identity=context?JSON.stringify(context):"",live=useRef(identity),[loaded,setLoaded]=useState(""),[selection,setSelection]=useState<Selection>(),
  [unreadable,setUnreadable]=useState<{raw:string;error:string}>(),[pending,setPending]=useState(false),[reviewed,setReviewed]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[exported,setExported]=useState<string>();
 const {onDirtyChange}=p;
 useEffect(()=>{live.current=identity;return()=>{live.current="";};},[identity]);
 useEffect(()=>{
  if(!context)return;
  let active=true;
  queueMicrotask(()=>{
  if(!active||currentWorldDraftActor()!==context.actorId)return;
  setSelection(undefined);setUnreadable(undefined);setError("");setNotice("");setPending(false);setReviewed(false);
  try{const retained=readAssociationDraft(accountWorldStorage(),associationRecoveryKey(context),context);
   if(retained?.error)setUnreadable({raw:retained.raw,error:retained.error});
   else setSelection({draft:retained?.value??{format:"serrian-native-coordinate-association",version:1,...context,requestId:crypto.randomUUID(),mapId:"",surfaceId:"",attempted:false},raw:retained?.raw??null,stored:true});
  }catch(failure){setError(failure instanceof Error?failure.message:"Coordinate selection recovery is unavailable.");}
  setLoaded(identity);
  });
  return()=>{active=false;};
 },[context,identity]);
 const current=loaded===identity?selection:undefined,retainedError=loaded===identity?unreadable:undefined,dirty=!!current?.raw||!!current&&!current.stored||!!retainedError||pending;
 useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
 function assertCurrent(){if(!context||live.current!==identity||currentWorldDraftActor()!==context.actorId)throw Error("The editing account or geographic context changed. The original selection remains retained.");return context;}
 function retain(draft:AssociationDraft){
  const c=assertCurrent();if(!current)throw Error("Load the retained selection before changing it.");
  const raw=writeAssociationDraft(accountWorldStorage(),associationRecoveryKey(c),current.raw,draft,c);setSelection({draft,raw,stored:true});return raw;
 }
 function choose(field:"mapId"|"surfaceId",value:string){
  if(!current||current.draft.attempted||pending)return;
  const draft={...current.draft,[field]:value};setReviewed(false);setNotice("");setError("");
  try{retain(draft);}catch(failure){setSelection({...current,draft,stored:false});setError(failure instanceof Error?failure.message:"Keep or export this selection before saving.");}
 }
 async function save(){
  if(!current||!reviewed||pending)return;
  let c;try{c=assertCurrent();}catch(failure){setError((failure as Error).message);return;}
  const draft=current.draft,key=associationRecoveryKey(c);
  if(!p.catalog.maps.some(map=>map.id===draft.mapId)||!p.catalog.surfaces.some(surface=>surface.id===draft.surfaceId)){setError("Choose a currently readable map and surface. The original selection stays retained.");return;}
  setPending(true);setError("");setNotice("");let original:string|undefined;
  try{original=retain({...draft,attempted:true});const result=await worldApi<{surfaceId:string;reused:boolean}>(`/api/worlds/${p.worldId}/terrain/geography`,"POST",associationCommand({...draft,attempted:true}));
   assertCurrent();if(result.surfaceId!==draft.surfaceId)throw Error("The response does not match this retained surface selection.");
   clearAssociationDraft(accountWorldStorage(),key,original);
   setSelection({draft:{...draft,requestId:crypto.randomUUID(),attempted:false},raw:null,stored:true});setReviewed(false);
   setNotice(result.reused?"This coordinate association is already saved. Its original identities are retained.":"Coordinate surface associated. Existing terrain, source history and artwork are retained.");p.onSaved();
  }catch(failure){if(live.current===identity)setError(failure instanceof Error?failure.message:"The association could not be acknowledged. Retry the exact retained selection.");}
  finally{if(live.current===identity)setPending(false);}
 }
 function startNew(){
  try{const c=assertCurrent(),raw=unreadable?.raw??current?.raw;if(raw!==null&&raw!==undefined)clearAssociationDraft(accountWorldStorage(),associationRecoveryKey(c),raw);
   setUnreadable(undefined);setSelection({draft:{format:"serrian-native-coordinate-association",version:1,...c,requestId:crypto.randomUUID(),mapId:"",surfaceId:"",attempted:false},raw:null,stored:true});setReviewed(false);setError("");setNotice("");
  }catch(failure){setError(failure instanceof Error?failure.message:"The original selection stays retained.");}
 }
 const surface=p.catalog.surfaces.find(row=>row.id===current?.draft.surfaceId),map=p.catalog.maps.find(row=>row.id===current?.draft.mapId),disabled=pending||!!current?.draft.attempted;
 return <section aria-label="Associate coordinate surface"><h3>Associate an existing coordinate surface</h3>
  <p>Choose the coordinate context for an existing Atlas map. This declaration preserves accepted numerical heights and artwork; it does not resample terrain or establish surveyed positions, ground distances or elevation accuracy.</p>
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  {(!context||loaded!==identity)&&<p>Loading coordinate selection recovery…</p>}
  {retainedError&&<><p role="alert">{retainedError.error}</p><button type="button" className="st-button is-secondary" onClick={()=>{download(retainedError.raw,"original-coordinate-selection.json");setExported(retainedError.raw);}}>Export original selection</button><button type="button" className="st-button is-secondary" disabled={exported!==retainedError.raw} onClick={startNew}>Start a new selection</button></>}
  {current&&!retainedError&&<>
   <Field label="Map to associate" help="Choose an active Atlas map in this World. Its saved terrain and artwork remain intact."><select aria-label="Map to associate" value={current.draft.mapId} disabled={disabled} onChange={e=>choose("mapId",e.target.value)}><option value="">Choose a map</option>{p.catalog.maps.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
   <Field label="Coordinate surface to associate" help="Choose an existing readable coordinate surface from this World. A conflicting saved association will be refused."><select aria-label="Coordinate surface to associate" value={current.draft.surfaceId} disabled={disabled} onChange={e=>choose("surfaceId",e.target.value)}><option value="">Choose a surface</option>{p.catalog.surfaces.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
   {surface&&<p>{surface.name} · {surface.reference.crs} · {surface.reference.units} · {surface.reference.kind==="sphere"?"Spherical longitude / latitude":"Planar coordinates"}{surface.realmId?" · Realm coordinate context":" · World surface"}{surface.protected?" · Author-only":""}</p>}
   {current.draft.attempted&&<p>The exact attempted map, surface and request are retained. Retry to confirm the saved result. To leave this attempt, export its original selection first; any saved association remains intact.</p>}
   {!canEdit&&<p>Resume editing control before saving. Your coordinate selection remains retained.</p>}
   <label><input type="checkbox" aria-label="I reviewed this coordinate association" checked={reviewed} disabled={pending||!map||!surface} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the selected map, coordinate surface and meaning of this association.</label>
   <div><button type="button" className="st-button" disabled={pending||!canEdit||!reviewed||!map||!surface||!current.stored} onClick={()=>void save()}>{current.draft.attempted?"Retry coordinate association":"Associate coordinate surface"}</button>
    <button type="button" className="st-button is-secondary" onClick={()=>{const raw=current.raw&&current.stored?current.raw:encodeAssociationDraft(current.draft,assertCurrent());download(raw,"coordinate-selection.json");setExported(raw);}}>Export selection</button>
    {!current.stored&&<button type="button" className="st-button is-secondary" onClick={()=>{try{retain(current.draft);setError("");}catch(failure){setError((failure as Error).message);}}}>Retain this selection</button>}
    {current.raw&&!current.draft.attempted&&<button type="button" className="st-button is-secondary" disabled={pending} onClick={startNew}>Clear retained selection</button>}
    {current.raw&&current.draft.attempted&&<button type="button" className="st-button is-secondary" disabled={pending||exported!==current.raw} onClick={startNew}>Start another selection</button>}
   </div>
  </>}
 </section>;
}
