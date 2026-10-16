"use client";
import {useEffect,useImperativeHandle,useRef,useState,type RefObject} from "react";
import {GuidedField as Field} from "@/components/field-guidance";
import {SaveError,worldApi} from "./client-api";
import {geographicPresets,geographicRecipeSchema,generationOutputDigest,type GeographicGeneration,type GeographicRecipe} from "./geographic-generation";
import {projectedSourcePath} from "./geographic-projection";
import type {AtlasGeography} from "./atlas-geographic-workspace";
import type {GenerationSaved} from "./geographic-generation-service";
import {sameSpatialReference,type SourceGeometry} from "./geographic";
import type {GenerationRecovery} from "./island-recovery";
import styles from "./geographic-authoring.module.css";

export type GeographicGenerationRecoveryController={restore:(value:GenerationRecovery)=>Promise<void>;accept:()=>Promise<void>;preview:()=>Promise<void>};
type Preview={recipe:GeographicRecipe;result:GeographicGeneration;context:string;digest:string;id:string;ms:number};
export function GeographicGenerator({geo,mapId,blocked,onDirty,onSelect,onPreview,recoveryRef,onRecovery}:{recoveryRef:RefObject<GeographicGenerationRecoveryController|null>;onRecovery:(value:GenerationRecovery|null)=>void;geo:AtlasGeography;mapId:string;blocked:boolean;onDirty:(value:boolean)=>void;onSelect:(id:string)=>void;onPreview:(geometry:SourceGeometry|null)=>void}){
 const layer=geo.layer!,context=geo.context!,reference=layer.surface.reference,key=JSON.stringify([context,mapId,layer.surface]),endpoint=`/api/worlds/${context.worldId}/geography/generation`,query=new URLSearchParams({map:mapId,timeline:context.timelineId}).toString();
 const [seed,setSeed]=useState("new-horizon"),[settings,setSettings]=useState<GeographicRecipe["settings"]>({...geographicPresets.island.settings}),[extent,setExtent]=useState(()=> (reference.kind==="plane"?reference.bounds:[-50,-35,50,35]).map(String)),[name,setName]=useState("Generated coast"),[note,setNote]=useState("Creator-generated fictional geography"),[privateSource,setPrivate]=useState(false);
 const [preview,setPreview]=useState<Preview|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(""),[conflict,setConflict]=useState(false),[saved,setSaved]=useState<GenerationSaved|null>(null),[attempt,setAttempt]=useState<unknown>(null);
 const restoreReject=useRef<((error:Error)=>void)|null>(null);
 const worker=useRef<Worker|null>(null),controller=useRef<AbortController|null>(null),serial=useRef(0),alive=useRef(true);
 useEffect(()=>{onDirty(dirty||busy||pending);},[dirty,busy,pending,onDirty]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;restoreReject.current?.(new Error("Generation recovery was interrupted. Its bundle is retained."));restoreReject.current=null;worker.current?.terminate();controller.current?.abort();onDirty(false);};},[key,onDirty]);
 const recipe:GeographicRecipe={version:1,algorithm:"serrian-geography-v1",seed,reference,extent:extent.map(Number) as GeographicRecipe["extent"],settings};
 const stale=!!preview&&(extent.some(value=>!value.trim())||JSON.stringify(geographicRecipeSchema.safeParse(recipe).data)!==JSON.stringify(preview.recipe));
 useEffect(()=>{onPreview(preview&&!stale?{type:"MultiPolygon",coordinates:preview.result.features.map(f=>(f.geometry as Extract<SourceGeometry,{type:"Polygon"}>).coordinates)}:null);return()=>onPreview(null);},[preview,stale,onPreview]);
 function cancel(){restoreReject.current?.(new Error("Generation recovery was cancelled. Its bundle is retained."));restoreReject.current=null;serial.current++;worker.current?.terminate();worker.current=null;controller.current?.abort();controller.current=null;setBusy(false);}
 function changed(){cancel();setDirty(true);setError("");setSaved(null);}
 function discard(){if(pending)return;if(!window.confirm("Discard this generated preview and recipe changes? If a save response was lost, retry first: the new sources may already be saved."))return;cancel();setPreview(null);setAttempt(null);setSaved(null);setDirty(false);setError("");setConflict(false);}
 async function build(){
  if(blocked||busy||pending||attempt)return;setError("");setSaved(null);setConflict(false);setDirty(true);setBusy(true);const jobId=++serial.current;
  try{
   if(extent.some(v=>!v.trim()))throw new Error("Enter all four generation bounds; zero is a valid coordinate.");
   const parsed=geographicRecipeSchema.parse(recipe);controller.current=new AbortController();
   const latest=await worldApi<{context:string;layer:AtlasGeography["layer"]}>(`${endpoint}?${query}`,"GET",undefined,controller.current.signal);
   if(!alive.current||jobId!==serial.current)return;
   if(JSON.stringify(latest.layer?.surface)!==JSON.stringify(layer.surface))throw new Error("The surface changed. Reopen the editor before generating.");
   const job=new Worker(new URL("./geographic-generation.worker.ts",import.meta.url),{type:"module"}),started=performance.now();worker.current=job;
   job.onmessage=async(event:MessageEvent<{result?:GeographicGeneration;error?:string}>)=>{
    job.terminate();if(!alive.current||jobId!==serial.current)return;worker.current=null;
    try{if(event.data.error||!event.data.result)throw new Error(event.data.error??"The geographic preview was incomplete.");const result=event.data.result,digest=await generationOutputDigest(result);if(!alive.current||jobId!==serial.current)return;setPreview({recipe:parsed,result,context:latest.context,digest,id:crypto.randomUUID(),ms:performance.now()-started});}catch(failure){setError((failure as Error).message);}finally{if(alive.current&&jobId===serial.current)setBusy(false);}
   };
   job.onerror=event=>{event.preventDefault();job.terminate();if(alive.current&&jobId===serial.current){worker.current=null;setBusy(false);setError("Generation could not finish. Your recipe is retained; retry or use another seed.");}};job.postMessage(parsed);
  }catch(failure){if(alive.current&&jobId===serial.current){setBusy(false);setError((failure as Error).message);}}
 }
 async function accept(){if(!preview||stale||pending||blocked)return;setPending(true);setError("");setConflict(false);const body=attempt??{mapId,timelineId:context.timelineId,requestId:preview.id,surfaceId:layer.surface.id,expectedContext:preview.context,outputDigest:preview.digest,recipe:preview.recipe,name,note,protected:privateSource};setAttempt(body);
  try{const result=await worldApi<GenerationSaved>(endpoint,"POST",body);if(!alive.current)return;setSaved(result);setPreview(null);setAttempt(null);setDirty(false);geo.retry();}catch(failure){if(alive.current){setError((failure as Error).message);setConflict(failure instanceof SaveError&&failure.status===409);}}finally{if(alive.current)setPending(false);}
 }
 async function review(){if(!preview||!conflict)return;setPending(true);setError("");try{const latest=await worldApi<{context:string}>(`${endpoint}?${query}`);if(!alive.current)return;geo.retry();setPreview({...preview,context:latest.context,id:crypto.randomUUID()});setAttempt(null);setConflict(false);setError("");}catch(failure){if(alive.current)setError((failure as Error).message);}finally{if(alive.current)setPending(false);}}
 const recoverySnapshot:GenerationRecovery|null=dirty||busy||pending?{surfaceId:layer.surface.id,fields:{seed,settings:{...settings,continents:Number.isFinite(settings.continents)?settings.continents:"",islands:Number.isFinite(settings.islands)?settings.islands:"",landCoverage:Number.isFinite(settings.landCoverage)?settings.landCoverage:"",complexity:Number.isFinite(settings.complexity)?settings.complexity:""},extent,name,note,protected:privateSource},preview:preview?{recipe:preview.recipe,context:preview.context,digest:preview.digest,requestId:preview.id}:null,attempt:attempt as GenerationRecovery["attempt"]}:null;
 const recoveryFingerprint=JSON.stringify(recoverySnapshot);
 useEffect(()=>{onRecovery(JSON.parse(recoveryFingerprint));},[recoveryFingerprint,onRecovery]);
 async function restoreRecovery(value:GenerationRecovery){
  if(pending||busy)throw new Error("Finish or cancel the active generation operation before restoring another recipe.");
  if(value.surfaceId!==layer.surface.id)throw new Error("This generation draft belongs to another geographic surface.");
  const meta=value.preview??(value.attempt?{recipe:value.attempt.recipe,context:value.attempt.expectedContext,digest:value.attempt.outputDigest,requestId:value.attempt.requestId}:null);
  if(meta&&!sameSpatialReference(meta.recipe.reference,reference))throw new Error("The retained generation reference differs from this surface. No coordinates were reinterpreted.");
  cancel();setSeed(value.fields.seed);setSettings({...value.fields.settings,continents:value.fields.settings.continents===""?NaN:value.fields.settings.continents,islands:value.fields.settings.islands===""?NaN:value.fields.settings.islands,landCoverage:value.fields.settings.landCoverage===""?NaN:value.fields.settings.landCoverage,complexity:value.fields.settings.complexity===""?NaN:value.fields.settings.complexity});setExtent([...value.fields.extent]);setName(value.fields.name);setNote(value.fields.note);setPrivate(value.fields.protected);setAttempt(value.attempt);setPreview(null);setSaved(null);setError("");setDirty(true);setConflict(false);
  if(!meta)return;
  const parsed=geographicRecipeSchema.parse(meta.recipe),jobId=++serial.current;setBusy(true);
  try{const result=await new Promise<GeographicGeneration>((resolve,reject)=>{const job=new Worker(new URL("./geographic-generation.worker.ts",import.meta.url),{type:"module"});worker.current=job;restoreReject.current=reject;
   job.onmessage=(event:MessageEvent<{result?:GeographicGeneration;error?:string}>)=>{job.terminate();if(worker.current===job)worker.current=null;if(!alive.current||jobId!==serial.current)return reject(new Error("The generation recovery context changed."));if(event.data.error||!event.data.result)reject(new Error(event.data.error??"The retained generation could not be rebuilt."));else resolve(event.data.result);};
   job.onerror=event=>{event.preventDefault();job.terminate();if(worker.current===job)worker.current=null;reject(new Error("The retained recipe could not be rebuilt. Its recovery file remains available."));};job.postMessage(parsed);
  });
   if(await generationOutputDigest(result)!==meta.digest)throw new Error("The retained generation digest does not match this algorithm output. Keep the matching release and recovery file; nothing was accepted.");
   if(!alive.current||jobId!==serial.current)return;
   setPreview({recipe:parsed,result,context:meta.context,digest:meta.digest,id:meta.requestId,ms:0});setError("Generation draft restored for review. The original request ID and base context remain; retry or explicitly review newer geography before acceptance.");
  }finally{restoreReject.current=null;if(alive.current&&jobId===serial.current)setBusy(false);}
 }
 useImperativeHandle(recoveryRef,()=>({restore:restoreRecovery,accept,preview:build}));
 const path=preview?{type:"MultiPolygon" as const,coordinates:preview.result.features.map(f=>(f.geometry as Extract<typeof f.geometry,{type:"Polygon"}>).coordinates)}:null;
 return <details open className={styles.generator} data-geographic-generator><summary>Generate editable geography</summary><section aria-label="Generate authoritative geography"><h4>Start with an island</h4><p>Preview an editable coastline, then choose Use this island on the map. Your existing land and artwork stay in place. Open Island settings to change its shape or seed.</p>
 {!reference.crs.startsWith("AUTHORED:")?<p>Choose a creator-declared fictional surface to generate geography. Imported Earth references remain unchanged.</p>:<>
 {blocked&&<p>Save or discard the current geographic edit before configuring a generated preview.</p>}
 <fieldset disabled={blocked||busy||pending||!!attempt}>
 <button className="st-button" onClick={()=>void build()}>Preview geographic generation</button><details><summary>Island settings (optional)</summary>
 <Field label="Geographic generation preset" help="Choose a starting arrangement of continents or coherent island chains. Adjust its settings and preview before accepting any new geography."><select defaultValue="island" onChange={e=>{changed();setSettings({...geographicPresets[e.target.value as keyof typeof geographicPresets].settings});}}>{Object.entries(geographicPresets).map(([id,p])=><option key={id} value={id}>{p.label}</option>)}</select></Field>
 <Field label="Geographic generation seed" help="The same seed, algorithm version, surface and complete settings reproduce the same coordinates. Different saves receive new identities; regeneration never replaces edited sources."><input value={seed} maxLength={64} onChange={e=>{changed();setSeed(e.target.value);}}/></Field>
 <button className="st-button is-secondary" onClick={()=>{changed();setSeed(crypto.randomUUID());}}>Use a different geographic seed</button>
 {([['continents','Major landmasses',0,4,'Number of separate continental sources. Zero produces an island-only world.'],['islands','Offshore islands',0,20,'Additional editable islands, arranged in irregular chains or scattered offshore. At most 24 complete sources per acceptance.'],['landCoverage','Approximate land coverage',10,55,'Requested percentage is a broad tendency; size, ocean separation and coastal variation determine the measured result.'],['complexity','Coastline complexity',0,100,'Higher values add fine coastal variation to bays, peninsulas and asymmetric coastlines. Each source remains within D2 editing limits.']] as const).map(([id,label,min,max,help])=><Field key={id} label={label} help={help}><input type="number" min={min} max={max} step={1} value={Number.isNaN(settings[id])?"":settings[id]} onChange={e=>{changed();setSettings({...settings,[id]:e.target.value===""?NaN:Number(e.target.value)});}}/></Field>)}
 <Field label="Approximate landmass size" help="Choose small, medium, large or varied relative sizes inside the selected area. The preview reports actual coverage."><select value={settings.size} onChange={e=>{changed();setSettings({...settings,size:e.target.value as typeof settings.size});}}>{['small','medium','large','varied'].map(v=><option key={v}>{v}</option>)}</select></Field>
 <Field label="Coastline structure" help="Use balanced, elongated, crescent or varied forms. Seeded bays, peninsulas and unequal companion islands avoid repeated stamped shapes."><select value={settings.shape} onChange={e=>{changed();setSettings({...settings,shape:e.target.value as typeof settings.shape});}}>{['balanced','elongated','crescent','varied'].map(v=><option key={v}>{v}</option>)}</select></Field>
 {['west','south','east','north'].map((side,i)=><Field key={side} label={`Generation ${side} bound`} help={`Coordinates in ${reference.units}. Generate only inside these bounds. Spherical areas must stay within 75 degrees latitude and span less than 120 degrees longitude; unsupported topologies need later adapters.`}><input type="number" step="any" value={extent[i]} onChange={e=>{changed();setExtent(extent.map((v,j)=>i===j?e.target.value:v));}}/></Field>)}
 <Field label="Generated source name" help="A shared name prefix for the new places and sources; you can rename places later. No existing source is replaced."><input value={name} maxLength={120} onChange={e=>{changed();setName(e.target.value);}}/></Field>
 <Field label="Generation account" help="Record why you accepted these sources. Their seed, complete recipe, creation context and original geometry remain retained after manual edits."><textarea value={note} maxLength={2000} onChange={e=>{changed();setNote(e.target.value);}}/></Field>
 <Field label="Author-only generated geography" help="Withhold all sources in this batch and their retained versions from ordinary viewing. This does not grant access to the World or its surface."><input type="checkbox" checked={privateSource} onChange={e=>{changed();setPrivate(e.target.checked);}}/></Field>
</details></fieldset>
 {busy&&<><p role="status">Generating and validating coastlines in a browser worker...</p><button className="st-button is-secondary" onClick={cancel}>Cancel geographic generation</button></>}
 {preview&&<><p role="status">{preview.result.features.length} editable sources, {preview.result.vertices} vertices; actual planar design coverage {preview.result.coverage}%. Processing {preview.ms.toFixed(1)} ms.{stale&&' Settings changed: preview again before saving.'}</p><svg data-generation-preview viewBox="0 0 1000 600" role="img" aria-label="Generated geographic candidate"><g transform={reference.kind==="plane"?"translate(0 600) scale(1 -1)":undefined}><path className={styles.draft} fillRule="evenodd" d={projectedSourcePath(path!,reference,preview.recipe.extent,reference.kind==='plane'?'planar':'equirectangular')}/></g></svg><p>Algorithm {preview.recipe.algorithm}, using Atlas V2 land algorithms. Seed: {preview.recipe.seed}. Preview coordinates are authoritative; this is not saved artwork or a terrain simulation.</p><button className="st-button" disabled={pending||busy||blocked||stale||!name.trim()||!note.trim()} onClick={()=>void accept()}>Accept generated geography</button><button className="st-button is-secondary" disabled={pending} onClick={()=>{const blob=new Blob([JSON.stringify(preview,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='serrian-geographic-generation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Download geographic preview and recipe</button></>}
 {pending&&<p role="status">Saving or reviewing this complete batch; your preview and recipe are retained.</p>}
 {conflict&&<p>Review the latest saved geography on the main map, then explicitly accept this retained preview as new sources. Existing sources are preserved.</p>}
 {conflict&&<button className="st-button is-secondary" disabled={pending} onClick={()=>void review()}>Review latest geography before adding</button>}
 {dirty&&<button className="st-button is-secondary" disabled={pending} onClick={discard}>Discard geographic generation</button>}
 {saved&&<><p role="status">Generated geography saved as {saved.features.length} new sources. Existing geography, artwork and raster preferences are retained.</p>{saved.features.map((f,i)=><button key={f.id} className="st-button is-secondary" onClick={()=>onSelect(f.id)}>Edit generated coastline {i+1}</button>)}</>}
 {error&&<p role="alert">{error}</p>}
 </>}</section></details>;
}
