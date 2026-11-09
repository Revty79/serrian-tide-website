"use client";
import {useEffect,useRef,useState} from "react";
import type {SourceImport,SpatialReference} from "./geographic";
import type {GeographicImportReview} from "./geographic-import-preview";
import {worldApi} from "./client-api";
import type {GeographyDirectory} from "./geography-directory";

export function GeographicImportReviewPanel({worldId,source,reference,approved,onApprove}:{worldId:string;source:SourceImport;reference:SpatialReference;approved:boolean;onApprove:(value:boolean)=>void}){
 const worker=useRef<Worker|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),[result,setResult]=useState<{source:SourceImport;reference:SpatialReference;value:GeographicImportReview}|null>(null),[pending,setPending]=useState(false),[error,setError]=useState("");
 const current=result?.source===source&&result.reference===reference?result.value:null;
 const [headers,setHeaders]=useState<{source:SourceImport;worldId:string;values:Record<string,GeographyDirectory>;error:string}|null>(null),identities=headers?.source===source&&headers.worldId===worldId?headers:null;
 useEffect(()=>{const controller=new AbortController(),ids=[...new Set(source.records.flatMap(r=>[...r.parentId?[r.parentId]:[],...r.geographyId?[r.geographyId]:[]]))];Promise.all(ids.map(async id=>[id,await worldApi<GeographyDirectory>(`/api/worlds/${worldId}/terrain/geography/records?header=1&parent=${id}`,"GET",undefined,controller.signal)] as const)).then(values=>{if(!controller.signal.aborted)setHeaders({source,worldId,values:Object.fromEntries(values),error:""});}).catch(e=>{if(!controller.signal.aborted)setHeaders({source,worldId,values:{},error:e.message});});return()=>controller.abort();},[source,worldId]);
 const placeLabel=(id:string|null)=>id?identities?.values[id]?.ancestors.map(g=>g.name).join(" → ")??"Loading saved parent…":"World root";
 function stop(){worker.current?.terminate();worker.current=null;clearTimeout(timer.current);}
 useEffect(()=>()=>{worker.current?.terminate();clearTimeout(timer.current);},[]);
 function review(focus?:number){stop();onApprove(false);setPending(true);setError("");if(typeof Worker==="undefined"){setPending(false);setError("Boundary preview needs browser worker support. The source draft is retained.");return;}
  const engine=new Worker(new URL("./geographic-import-preview.worker.ts",import.meta.url),{type:"module"});worker.current=engine;
  timer.current=setTimeout(()=>{stop();setPending(false);setError("This preview exceeded 30 seconds. Review a smaller source batch; accepted geography is unchanged.");},30000);
  engine.onmessage=({data}:{data:{result?:GeographicImportReview;error?:string}})=>{if(worker.current!==engine)return;stop();setPending(false);if(data.result)setResult({source,reference,value:data.result});else{setResult(null);setError(data.error??"The source preview could not be verified.");}};
  engine.onerror=()=>{if(worker.current!==engine)return;stop();setPending(false);setResult(null);setError("The source preview failed. Your import draft is retained.");};engine.postMessage({source,reference,...focus!==undefined?{focus}:{}});
 }
 return <section aria-label="Geographic source acceptance preview"><h4>Review before saving</h4><p>Inspect the source edition, actual parent links and positions. These boundaries record the provider&apos;s interpretation; they do not establish universally agreed sovereignty.</p><button type="button" className="st-button is-secondary" disabled={pending} onClick={()=>review()}>Preview source batch</button>{pending&&<p role="status">Validating source geometry and preparing the preview…</p>}{error&&<p role="alert">{error}</p>}{current&&<>
  <p>{current.provider} · {current.dataset} · {current.edition}</p><p>Coordinate extent: {current.bounds.join(", ")} · {reference.units}. Preview paths are fitted to this screen; original coordinates remain unchanged.</p>
  <svg viewBox="0 0 1000 600" role="img" aria-label="Boundary source preview" style={{width:"100%",maxHeight:500,background:"var(--st-surface-deep)",border:"1px solid var(--st-border)"}}><rect x="0" y="0" width="1000" height="600" fill="none" stroke="currentColor"/>{current.records.map((r,i)=><path key={r.externalId} d={r.path} fill="none" stroke={`hsl(${i*137.5%360} 65% 68%)`} strokeWidth="1.3"><title>{r.name}</title></path>)}</svg>
  <ol>{current.records.map((r,i)=><li key={r.externalId}><strong>{r.name}</strong> · {r.semantic} · {r.vertices.toLocaleString()} original vertices <button type="button" className="st-button is-secondary" disabled={pending} onClick={()=>review(i)}>Focus preview: {r.name}</button><p>Parent: {placeLabel(r.parentId)}</p>{r.geographyId&&<p>Reuse: {placeLabel(r.geographyId)}</p>}<details><summary>Source identity</summary><p>Source identifier: {r.externalId}</p><p>Parent identity: {r.parentId??"World root"}</p><p>Existing geography identity: {r.geographyId??"Create a new saved place"}</p></details></li>)}</ol><p>{current.credit}</p>
  {identities?.error&&<p role="alert">The saved parent or geography could not be verified: {identities.error}</p>}<label><input type="checkbox" checked={approved} disabled={pending||!identities||!!identities.error} onChange={e=>onApprove(e.target.checked)}/>I reviewed these positions, source dates, identities and parent links.</label>
 </>}</section>;
}
