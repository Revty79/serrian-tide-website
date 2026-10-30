"use client";
import {useEffect,useRef,useState} from "react";
import {GuidedField} from "@/components/field-guidance";
import {worldApi} from "./client-api";
import type {TerrainDocument,TerrainGeometry} from "./terrain";
import {regionCreateSchema,regionDraftSchema,validateRegionFrame,type RegionCreate} from "./terrain-regions";
import type {TerrainFrame} from "./terrain-refinement";
import {distanceEditUnit,formatDistance,inputCoordinate,toMetres,type MeasurementPreferences} from "./terrain-units";
import styles from "./terrain.module.css";

type Draft={name:string;frame:TerrainFrame;pending?:RegionCreate};
type Props={document:TerrainDocument;world:TerrainGeometry;sourceState?:string;frame?:TerrainFrame;preferences:MeasurementPreferences;disabled:boolean;onFrame:(frame:TerrainFrame|undefined)=>void;onDraw:()=>void;onFocus:(frame:TerrainFrame)=>void;onDirty:(dirty:boolean)=>void;onAccepted:(id:string)=>void;onReload:()=>void};
/** A recoverable geographic proposal; only Accept creates a map, never terrain. */
export function TerrainRegionControls(p:Props){
 const key=`st:region-create:${p.document.worldId}:${p.document.id}`;
 const [draft,setDraft]=useState<Draft>(),[preview,setPreview]=useState(false),[previewSource,setPreviewSource]=useState<Pick<RegionCreate,"parentRevision"|"sourceRevision"|"sourceState">>(),[busy,setBusy]=useState(false),[error,setError]=useState(""),[ready,setReady]=useState(false);
 const alive=useRef(true),onDirty=p.onDirty,drawn=p.frame,onFrame=p.onFrame;
 useEffect(()=>{alive.current=true;void Promise.resolve().then(()=>{if(!alive.current)return;try{const raw=JSON.parse(localStorage.getItem(key)??"null");if(raw&&typeof raw.name==="string"){const {frame}=regionDraftSchema.parse({name:raw.name,frame:raw.frame}),pending=raw.pending?regionCreateSchema.parse(raw.pending):undefined;if(!pending||pending.parentMapId===p.document.id){setDraft({name:raw.name,frame,pending});onFrame(frame);setError("A regional map draft was recovered. Review its bounds or retry its original acceptance request.");}}}catch{setError("The saved regional draft could not be read. Existing maps are unchanged.");}setReady(true);});return()=>{alive.current=false;};},[key,p.document.id,onFrame]);
 useEffect(()=>{onDirty(!!draft||busy);if(!ready)return;try{if(draft)localStorage.setItem(key,JSON.stringify(draft));else localStorage.removeItem(key);}catch{if(draft)queueMicrotask(()=>{if(alive.current)setError("Browser storage is unavailable. Keep this tab open to retain the regional draft.");});}},[draft,busy,key,ready,onDirty]);
 useEffect(()=>{if(!drawn)return;let live=true;void Promise.resolve().then(()=>{if(!live)return;setDraft(current=>current&&!current.pending?{...current,frame:drawn}:current);setPreview(false);});return()=>{live=false;};},[drawn]);
 function begin(){const frame={x:p.world.displayWidth*.25,y:p.world.displayHeight*.25,width:p.world.displayWidth*.5,height:p.world.displayHeight*.5};setDraft({name:"Regional map",frame});onFrame(frame);setError("");setPreview(false);}
 function cancel(){setDraft(undefined);onFrame(undefined);setPreview(false);setError("");onDirty(false);}
 function check(){if(!draft)return false;try{validateRegionFrame(draft.frame,p.world);if(!draft.name.trim())throw Error("Name this regional map before accepting it.");return true;}catch(e){setError(e instanceof Error?e.message:"Check the regional bounds.");return false;}}
 async function accept(){if(!draft||busy||p.disabled)return;if(!draft.pending&&(!preview||!check()))return;setBusy(true);setError("");
  try{const command=draft.pending??regionCreateSchema.parse({action:"create-region",requestId:crypto.randomUUID(),parentMapId:p.document.id,terrainId:p.document.terrainId,...previewSource,name:draft.name,frame:draft.frame});
   // Persist the exact request before transmitting; retry confirms the same map identity.
   localStorage.setItem(key,JSON.stringify({...draft,pending:command}));setDraft({...draft,pending:command});
   const result=await worldApi<{id:string}>(`/api/worlds/${p.document.worldId}/terrain/regions?terrainMap=${p.document.id}`,"POST",command);
   localStorage.removeItem(key);if(alive.current){cancel();setBusy(false);p.onAccepted(result.id);}
  }catch(e){if(alive.current)setError((e instanceof Error?e.message:"Regional creation failed.")+" Your draft and original acceptance request are retained.");}finally{if(alive.current)setBusy(false);}
 }
 const sourceChanged=!!previewSource&&(previewSource.sourceRevision!==p.document.revision||previewSource.parentRevision!==(p.document.mapRevision??1)||previewSource.sourceState!==p.sourceState);
 const unit=distanceEditUnit(p.preferences.distance);
 return <section aria-label="Create Regional Map" className={styles.details}>
  {!draft?<button type="button" className="st-button is-secondary" disabled={!ready||p.disabled} onClick={begin}>Create Regional Map</button>:<>
   <h4>Create Regional Map</h4><p>Select an extent in World coordinates. This preview adds no heights or saved records.</p>
   <fieldset className={styles.controls} disabled={busy||!!draft.pending}>
    <GuidedField label="Regional map name" controlClassName="st-control"><input maxLength={160} value={draft.name} onChange={e=>{setDraft({...draft,name:e.target.value});setPreview(false);}}/></GuidedField>
    {([['West',"x"],['North',"y"],['Regional width',"width"],['Regional height',"height"]] as const).map(([label,field])=><GuidedField key={field} label={`${label} (${unit})`} help="Physical coordinates in the original World. Wrapped east/west coverage may cross the seam; north/south edges stay fixed." controlClassName="st-control"><input type="number" step="any" value={inputCoordinate(draft.frame[field],unit)} onChange={e=>{const frame={...draft.frame,[field]:toMetres(Number(e.target.value),unit)};setDraft({...draft,frame});onFrame(frame);setPreview(false);}}/></GuidedField>)}
   </fieldset>
   <p data-testid="regional-extent">{formatDistance(draft.frame.width,p.preferences.distance)} × {formatDistance(draft.frame.height,p.preferences.distance)} · {(draft.frame.width*draft.frame.height/1e6).toLocaleString(undefined,{maximumFractionDigits:6})} km². East boundary {inputCoordinate(draft.frame.x+draft.frame.width,unit)} {unit}; south boundary {inputCoordinate(draft.frame.y+draft.frame.height,unit)} {unit}.</p>
   <div className={styles.actions}>
    <button type="button" className="st-button is-secondary" disabled={busy||!!draft.pending} onClick={p.onDraw}>Draw regional bounds</button>
    <button type="button" className="st-button is-secondary" disabled={busy||p.disabled||!!draft.pending} onClick={()=>{setError("");if(check()){if(!p.sourceState||Number(p.sourceState.split(";")[0])!==p.document.revision){setError("The accepted World base changed. Refresh it before previewing the retained region.");return;}setPreviewSource({parentRevision:p.document.mapRevision??1,sourceRevision:p.document.revision,sourceState:p.sourceState});setPreview(true);p.onFocus(draft.frame);}}}>Preview regional map</button>
    {(preview||draft.pending)&&<button type="button" className="st-button is-primary" disabled={busy||p.disabled||!draft.pending&&sourceChanged} onClick={()=>void accept()}>{busy?"Creating region…":draft.pending?"Retry regional creation":"Accept regional map"}</button>}
    {!draft.pending&&<button type="button" className="st-button is-secondary" disabled={busy} onClick={cancel}>Cancel regional map</button>}
    {draft.pending&&<button type="button" className="st-button is-secondary" disabled={busy} onClick={()=>{setDraft({...draft,pending:undefined});setPreview(false);setError("Original request released. Check the map browser for an accepted region before preparing another request.");}}>Release regional request</button>}
    {(error||sourceChanged)&&<button type="button" className="st-button is-secondary" disabled={busy} onClick={p.onReload}>Refresh accepted source</button>}
   </div>{preview&&sourceChanged&&!draft.pending&&<p role="alert">Accepted sources changed since this preview. Preview the retained bounds again before accepting.</p>}{preview&&<p role="status">Temporary regional preview. The original geography and numerical resolution are unchanged.</p>}
  </>}{error&&<p role="alert">{error}</p>}
 </section>;
}
