"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {worldApi} from "./client-api";
import {AtlasRecordEditor,type AtlasRecordTarget} from "./atlas-record-editor";
import {GeographicWorkspace} from "./geographic-workspace";
import type {GeographyDirectory} from "./geography-directory";
import styles from "./atlas.module.css";
import {WorldRecordMapLinks} from "./world-atlas-discovery-client";
import {useWorldScope} from "./world-permission-context";

export function GeographyDirectoryPanel({worldId,timelineId,mapId,review,ordinary,onDirty,onClose,initialParentId}:{worldId:string;timelineId:string;mapId:string;review:boolean;ordinary:boolean;onDirty:(value:boolean)=>void;onClose:()=>void;initialParentId?:string}){
 const placeScope=useWorldScope(worldId,"settlements");
 const dialog=useRef<HTMLDialogElement>(null),dirty=useRef(false),[mode,setMode]=useState<"records"|"sources">("records"),[parentId,setParent]=useState<string|null>(initialParentId??null),[after,setAfter]=useState<string|null>(null),[search,setSearch]=useState(""),[draftSearch,setDraftSearch]=useState(""),[refresh,setRefresh]=useState(0),[result,setResult]=useState<{key:string;value:GeographyDirectory}|null>(null),[error,setError]=useState(""),[target,setTarget]=useState<AtlasRecordTarget|null>(null);
 const api=`/api/worlds/${worldId}/terrain/geography/records`,query=new URLSearchParams({directory:"1",...parentId?{parent:parentId}:{},...after?{after}:{},search,...review?{review:"1"}:{},...ordinary?{knowledge:"ordinary"}:{}}).toString(),key=`${api}:${query}:${refresh}`,page=result?.key===key?result.value:null;
 const markDirty=useCallback((value:boolean)=>{dirty.current=value;onDirty(value);},[onDirty]);
 useEffect(()=>{dialog.current?.showModal();return()=>onDirty(false);},[onDirty]);
 useEffect(()=>{const controller=new AbortController();worldApi<GeographyDirectory>(`${api}?${query}`,"GET",undefined,controller.signal).then(value=>{if(!controller.signal.aborted){setResult({key,value});setError("");}}).catch(e=>{if(!controller.signal.aborted){setResult(null);setError(e.message);}});return()=>controller.abort();},[api,query,key]);
 function close(){if(dirty.current&&!window.confirm("Leave this unsaved geography draft? Saved records and boundaries are retained."))return;onClose();}
 function browse(id:string|null){setParent(id);setAfter(null);setSearch("");setDraftSearch("");}
 function edit(value:AtlasRecordTarget){setTarget(value);markDirty(true);}
 return <dialog ref={dialog} className={styles.dialog} style={{width:"min(1200px,95vw)",maxHeight:"90vh"}} aria-label="Geography records and boundaries" onCancel={e=>{e.preventDefault();close();}}>
  <button type="button" className="st-button is-secondary" onClick={close}>Return to physical map</button>
  <h2>Geography records and boundaries</h2><p>Saved places share one World hierarchy. Political source boundaries keep their own versions and provenance; they do not change terrain.</p>
  {mode==="sources"?<GeographicWorkspace worldId={worldId} timelineId={timelineId} review={review||ordinary} defaultMapId={mapId} native onPlace={id=>{browse(id);setRefresh(n=>n+1);setMode("records");}} onDirtyChange={markDirty} onReturn={()=>{if(!dirty.current||window.confirm("Leave this unsaved geographic draft?")){markDirty(false);setRefresh(n=>n+1);setMode("records");}}}/>:<>
   <button type="button" className="st-button is-secondary" onClick={()=>setMode("sources")}>Read and edit boundary sources</button>
   <nav aria-label="Geographic hierarchy"><button type="button" className="st-button is-secondary" onClick={()=>browse(null)}>World</button>{page?.ancestors.map(g=><button type="button" className="st-button is-secondary" key={g.id} onClick={()=>browse(g.id)}>{g.name}</button>)}</nav>
   <form aria-label="Search saved geography" onSubmit={e=>{e.preventDefault();setSearch(draftSearch);setAfter(null);}}><label>Find geography <input className="st-control" maxLength={160} value={draftSearch} onChange={e=>setDraftSearch(e.target.value)}/></label><button className="st-button is-secondary">Search saved places</button></form>
   {error?<p role="alert">{error} <button type="button" className="st-button is-secondary" onClick={()=>setRefresh(n=>n+1)}>Retry geography directory</button></p>:!page?<p role="status">Loading saved geography…</p>:<section aria-label="Saved geography directory">
    <h3>{search?`Search: ${search}`:page.parent?.name??"World geography"}</h3>{page.parent&&<><p>{page.parent.description}</p>{placeScope&&<WorldRecordMapLinks key={page.parent.id} context={{worldId,timelineId,review,ordinary}} subject={{kind:"place",id:page.parent.id}}/>}{page.canEdit&&<button type="button" className="st-button is-secondary" onClick={()=>edit({kind:"geography",record:page.parent!})}>Edit this geography</button>}</>}
    {page.canEdit&&<button type="button" className="st-button" onClick={()=>edit({kind:"geography",...(parentId?{parentId}:{}),defaultKind:parentId?"location":"continent"})}>Create child geography</button>}
    {!page.records.length&&<p>No saved places in this selection.</p>}
    {page.records.map(g=><article key={g.id}><h4>{g.name}</h4><p>{g.kind}{g.context&&g.context!=="place"?` · ${g.context}`:""} · revision {g.revision}</p>{search&&g.parentId&&<p>Parent: {[...page.ancestors,...page.records,...(page.relatedParents??[])].find(p=>p.id===g.parentId)?.name??"Unavailable in this context"}</p>}<p>{g.description}</p><button type="button" className="st-button is-secondary" onClick={()=>browse(g.id)}>Open geography: {g.name}</button>{g.hasChildren&&<span> Saved subdivisions</span>}{page.canEdit&&<button type="button" className="st-button is-secondary" onClick={()=>edit({kind:"geography",record:g})}>Edit geography: {g.name}</button>}</article>)}
    {page.nextAfter&&<button type="button" className="st-button is-secondary" onClick={()=>setAfter(page.nextAfter)}>Next geography page</button>}{after&&<button type="button" className="st-button is-secondary" onClick={()=>setAfter(null)}>First geography page</button>}
   </section>}
  </>}
  {target&&page&&<AtlasRecordEditor regionalOnly target={target} geographies={[...new Map([...page.ancestors,...page.records,...(page.relatedParents??[])].map(g=>[g.id,g])).values()]} onClose={()=>{setTarget(null);markDirty(false);}} onSave={async body=>{await worldApi(api,"POST",(body as {draft:unknown}).draft);setTarget(null);markDirty(false);setRefresh(n=>n+1);}}/>}
 </dialog>;
}
