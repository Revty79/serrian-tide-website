"use client";
import {useEffect,useRef,useState,type RefObject} from "react";
import {GuidedField} from "@/components/field-guidance";
import {worldApi} from "./client-api";
import type {TerrainDocument,TerrainGeometry} from "./terrain";
import {frameGeometry,normalizeTerrainX,overviewLevels,refinementSizes,rootFrame,validateRefinement,type RefinementMeta,type TerrainFrame,type RefinementCreate} from "./terrain-refinement";
import {refinementRecovery} from "./terrain-refinement-recovery";
import {numericalChecksum} from "./terrain-refinement-cache";
import type {RefinementIndex} from "./terrain-refinement-client";
import type {TerrainCanvasHandle} from "./terrain-canvas";
import {distanceEditUnit,formatDistance,inputCoordinate,toMetres,type MeasurementPreferences} from "./terrain-units";
import styles from "./terrain.module.css";

export type TerrainRefinementPreview={meta:RefinementMeta;grid:Int16Array;shape:TerrainGeometry};
type Props={api:string;root:TerrainDocument;world:TerrainGeometry;current:TerrainDocument;shape:TerrainGeometry;grid:Int16Array;revision:number;index?:RefinementIndex;preferences:MeasurementPreferences;canvas:RefObject<TerrainCanvasHandle|null>;disabled:boolean;editable:boolean;frame?:TerrainFrame;onFrame:(v:TerrainFrame|undefined)=>void;onSelect:(id:string|null)=>void;onDraw:()=>void;onPreview:(v:TerrainRefinementPreview|undefined)=>void;onDirty:(v:boolean)=>void;onAccepted:(id:string)=>Promise<void>};
export function TerrainRefinementControls(p:Props){
 const [name,setName]=useState("Local terrain"),[width,setWidth]=useState(20000),[height,setHeight]=useState(20000),[east,setEast]=useState(p.world.displayWidth/2),[south,setSouth]=useState(p.world.displayHeight/2),[columns,setColumns]=useState(1024),[rows,setRows]=useState(1024),[custom,setCustom]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[preview,setPreview]=useState<TerrainRefinementPreview>(),[attempt,setAttempt]=useState<RefinementCreate>(),[ready,setReady]=useState(false);
 const onDirty=p.onDirty,drawnFrame=p.frame;
 const worker=useRef<Worker|null>(null),generation=useRef(0),alive=useRef(true),key=`${p.root.worldId}:${p.root.id}:create-detail`,unit=distanceEditUnit(p.preferences.distance),parentFrame=p.current.refinement?.frame??rootFrame(p.world);
 const fingerprint=JSON.stringify({name,width,height,east,south,columns,rows,parent:p.current.refinement?.id,revision:p.revision}),prepared=useRef("");
 useEffect(()=>{alive.current=true;const counter=generation;return()=>{alive.current=false;counter.current++;worker.current?.terminate();};},[]);
 useEffect(()=>{let live=true;void refinementRecovery("read",key).then(value=>{if(live&&value){setAttempt(value);setError("An original detail acceptance request was retained. Retry it to confirm that same identity.");}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setReady(true);});return()=>{live=false;};},[key]);
 useEffect(()=>{onDirty(!!preview||!!attempt||busy);},[onDirty,preview,attempt,busy]);
 useEffect(()=>{if(!drawnFrame||preview)return;let live=true;void Promise.resolve().then(()=>{if(live){setEast(drawnFrame.x+drawnFrame.width/2);setSouth(drawnFrame.y+drawnFrame.height/2);setWidth(drawnFrame.width);setHeight(drawnFrame.height);}});return()=>{live=false;};},[drawnFrame,preview]);
 function cancel(){generation.current++;worker.current?.terminate();worker.current=null;setBusy(false);setPreview(undefined);p.onPreview(undefined);p.onFrame(undefined);setError("");}
 function useView(){const v=p.canvas.current?.viewport();if(!v)return;const w=Math.max(100,Math.min(parentFrame.width/2*columns/p.shape.width,(v.right-v.left)*.8)),h=Math.max(100,Math.min(parentFrame.height/2*rows/p.shape.height,(v.bottom-v.top)*.8));setWidth(w);setHeight(h);setEast((v.left+v.right)/2);setSouth((v.top+v.bottom)/2);p.onFrame(undefined);}
 async function prepare(){
  if(busy||attempt||p.disabled||!ready)return;setError("");
  const frame={x:p.world.wrap?normalizeTerrainX(east-width/2,p.world.displayWidth):east-width/2,y:south-height/2,width,height};
  try{if(!name.trim())throw Error("Give this refined area a useful label.");validateRefinement(frame,columns,rows,p.shape,parentFrame,p.world);}catch(e){setError(e instanceof Error?e.message:"Check the bounds and sample dimensions.");return;}
  const token=++generation.current;worker.current?.terminate();setBusy(true);
  const engine=new Worker(new URL("./terrain-refinement.worker.ts",import.meta.url),{type:"module"});worker.current=engine;
  engine.onmessage=({data}:{data:{grid?:ArrayBuffer;error?:string}})=>{if(token!==generation.current||!alive.current)return;engine.terminate();worker.current=null;setBusy(false);if(data.error){setError(data.error);return;}
   const meta:RefinementMeta={id:"refinement-preview",name:name.trim(),worldId:p.root.worldId,terrainId:p.root.terrainId,mapId:p.root.id,parentId:p.current.refinement?.id??null,parentRevision:p.revision,revision:1,level:(p.current.refinement?.level??0)+1,frame,gridWidth:columns,gridHeight:rows,overviewLevels:overviewLevels(columns,rows),updatedAt:new Date().toISOString()},value={meta,grid:new Int16Array(data.grid!),shape:frameGeometry(meta,p.world)};prepared.current=fingerprint;setPreview(value);p.onPreview(value);p.onFrame(frame);};
  engine.onerror=()=>{if(token===generation.current){setBusy(false);setError("The inheritance worker could not run. Your choices are retained.");engine.terminate();}};
  const base=p.grid.slice().buffer;engine.postMessage({base,parent:p.shape,parentFrame,frame,width:columns,height:rows,world:p.world},[base]);
 }
 async function accept(){
  if(busy||!ready)return;setBusy(true);setError("");
  try{let command=attempt;if(!command){if(!preview||prepared.current!==fingerprint)throw Error("Prepare and inspect the current refinement before accepting.");command={action:"create",requestId:crypto.randomUUID(),mapId:p.root.id,parentId:preview.meta.parentId,parentRevision:preview.meta.parentRevision,name:preview.meta.name,frame:preview.meta.frame,gridWidth:columns,gridHeight:rows,previewHash:await numericalChecksum(preview.grid)};await refinementRecovery("write",key,command);setAttempt(command);}
   const result=await worldApi<{refinementId:string}>(p.api,"POST",command);await refinementRecovery("delete",key);setAttempt(undefined);setPreview(undefined);p.onPreview(undefined);p.onFrame(undefined);await p.onAccepted(result.refinementId);
  }catch(e){setError(e instanceof Error?e.message:"The detail was not accepted. Its request is retained.");}finally{if(alive.current)setBusy(false);}
 }
 return <div className={styles.townFields}>
  <GuidedField label="Editing terrain source" help="All sources belong to this same map. Save completed edits before switching. A finer source adds real height samples only inside its physical bounds." controlClassName="st-control"><select value={p.current.refinement?.id??""} disabled={p.disabled||busy||!!preview||!!attempt} onChange={e=>p.onSelect(e.target.value||null)}><option value="">Whole World base</option>{p.index?.refinements.map(m=><option key={m.id} value={m.id}>{m.name} · level {m.level}</option>)}</select></GuidedField>
  <p data-testid="terrain-active-detail">Active: {p.current.refinement?.name??"Whole World base"}. Numerical spacing {formatDistance(p.shape.displayWidth/p.shape.width,p.preferences.distance)} × {formatDistance(p.shape.displayHeight/p.shape.height,p.preferences.distance)}. {p.shape.width} × {p.shape.height} samples.</p>
  <div className={styles.actions}><button type="button" className="st-button is-secondary" onClick={()=>p.canvas.current?.focusFrame(parentFrame)}>Go to active terrain</button><button type="button" className="st-button is-secondary" onClick={()=>p.canvas.current?.fit()}>View whole World</button></div>
  <p>Inherited edge samples stay connected to their parent. Parent samples beneath finer coverage are protected; choose that finer source to sculpt there. Other parent terrain remains editable.</p>
  {!p.index?.available?<p>Terrain detail requires the pending database upgrade. The existing base map remains available.</p>:p.editable&&<fieldset className={styles.townFields} disabled={busy||p.disabled||!!attempt}>
   <legend>Refine terrain here</legend>
   <GuidedField label="Refined area label" help="A label for numerical coverage in this map. This creates no separate World, map or lore Region." controlClassName="st-control"><input value={name} maxLength={160} onChange={e=>setName(e.target.value)}/></GuidedField>
   <div className={styles.actions}><button type="button" className="st-button is-secondary" onClick={useView}>Use current view</button><button type="button" className="st-button is-secondary" onClick={p.onDraw}>Draw physical bounds</button></div>
   {([["Centre east",east,setEast],["Centre south",south,setSouth],["Physical width",width,setWidth],["Physical height",height,setHeight]] as const).map(([label,value,change])=><GuidedField key={label} label={`${label} (${unit})`} help={label.startsWith("Centre")?"An exact position in the original World metre frame; unit changes preserve the stored position.":"The physical coverage of the new numerical grid. Smaller coverage or more samples gives finer terrain."} controlClassName="st-control"><input type="number" step="any" value={inputCoordinate(value,unit)} onChange={e=>change(toMetres(Number(e.target.value),unit))}/></GuidedField>)}
   <GuidedField label="Detail resolution" controlClassName="st-control"><select value={custom?"custom":columns} onChange={e=>{const custom=e.target.value==="custom";setCustom(custom);if(!custom){setColumns(Number(e.target.value));setRows(Number(e.target.value));}}}><option value={256}>Regional · 256 × 256</option><option value={512}>Local · 512 × 512</option><option value={1024}>Fine · 1024 × 1024</option><option value="custom">Custom dimensions</option></select></GuidedField>
   {custom&&([["Sample columns",columns,setColumns],["Sample rows",rows,setRows]] as const).map(([label,value,change])=><GuidedField key={label} label={label} controlClassName="st-control"><select value={value} onChange={e=>change(Number(e.target.value))}>{refinementSizes.map(n=><option key={n} value={n}>{n}</option>)}</select></GuidedField>)}
   <p>Proposed numerical spacing: {formatDistance(width/columns,p.preferences.distance)} × {formatDistance(height/rows,p.preferences.distance)}. Inherited interpolation supplies the starting heights; your brushes add the actual fine terrain.</p>
   <button type="button" className="st-button is-secondary" onClick={()=>void prepare()}>Preview refined terrain</button>
  </fieldset>}
  {busy&&<p role="status">Preparing or accepting numerical detail…</p>}{error&&<p role="alert">{error}</p>}
  {(preview||attempt)&&<div className={styles.feedback}><p>{attempt?"Retry confirms the original request; it cannot create a duplicate area.":"This inherited surface is a temporary preview. Accept adds its numerical grid; Cancel creates nothing."}</p><button type="button" className="st-button is-primary" disabled={busy} onClick={()=>void accept()}>{attempt?"Retry detail acceptance":"Accept refined terrain"}</button>{!attempt&&<button type="button" className="st-button is-secondary" disabled={busy} onClick={cancel}>Cancel refinement</button>}{attempt&&<button type="button" className="st-button is-secondary" disabled={busy} onClick={()=>void refinementRecovery("delete",key).then(()=>{setAttempt(undefined);cancel();})}>Release retained request</button>}</div>}
 </div>;
}
