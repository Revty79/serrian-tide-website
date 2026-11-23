"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {CreatorWorkshop} from "./creator-workshop";
import {TerrainCanvas,type TerrainCanvasHandle} from "./terrain-canvas";
import {terrainGeometry,type TerrainDocument,type TerrainPatch} from "./terrain";
import {useTerrainPreviewScene,type TerrainPreviewWorld} from "./terrain-preview-scene";
import type {TerrainCamera} from "./terrain-reload-view";
import type {HydroLayer} from "./terrain-hydrology";
import {useNativeWorldApi} from "./native-map-history-client";
import {useSharedReliefScene} from "./terrain-shared-relief-scene";
import {useMeasurementPreferences} from "./terrain-measurement-preferences";
import {formatHeight,type TerrainInspection} from "./terrain-units";
import {appearanceRelief,DEFAULT_MAP_APPEARANCE,mapAppearanceNames,type MapAppearance} from "./terrain-appearance";
import {prepareSavedElevationsAsync,savedElevationListSchema,savedElevationWindowMeta,validateSavedElevationIdentity,type SavedElevationList} from "./terrain-saved-elevations";
import styles from "./terrain-saved-elevations-workshop.module.css";

export type SavedElevationInput={kind:"saved-elevations";savedElevations:true;document:TerrainDocument;rootRevision?:number;base:Int16Array;blocked:Uint8Array;world:TerrainPreviewWorld;water:HydroLayer;waterRevision:number;sourceState:string};
const endpoint=(worldId:string,mapId:string,refinementId?:string)=>`/api/worlds/${worldId}/terrain/saved-elevations?terrainMap=${mapId}${refinementId?"&refinement="+refinementId:""}`;
const locations={markers:[],selectedId:null,point:null};

/** Capability comes from the owner-only reader; delegated editors and review
 * contexts do not gain access to private numerical history. */
export function SavedElevationsButton({worldId,mapId,refinementId,enabled,onOpen}:{worldId:string;mapId:string;refinementId?:string;enabled:boolean;onOpen:()=>void}){
 const api=useNativeWorldApi(),[allowed,setAllowed]=useState(false);
 useEffect(()=>{if(!enabled)return;const c=new AbortController();void api<unknown>(endpoint(worldId,mapId,refinementId),"GET",undefined,c.signal).then(value=>{const list=savedElevationListSchema.parse(value);setAllowed(list.refinementId===refinementId);}).catch(()=>{if(!c.signal.aborted)setAllowed(false);});return()=>c.abort();},[api,worldId,mapId,refinementId,enabled]);
 return allowed?<button type="button" className="st-button is-secondary" disabled={!enabled} onClick={onOpen}>Saved elevations</button>:null;
}

export function SavedElevationsWorkshop({input,waterRevision,sourceState,onDirty,onClose,onApply}:{input:SavedElevationInput;waterRevision:number|undefined;sourceState:string|undefined;onDirty:(value:boolean)=>void;onClose:()=>void;onApply:(patch:TerrainPatch,elapsedMs:number)=>void}){
 const api=useNativeWorldApi(),[preferences]=useMeasurementPreferences(),shape=useMemo(()=>terrainGeometry(input.document.settings),[input.document.settings]),
  [section,setSection]=useState("revision"),[history,setHistory]=useState<SavedElevationList>(),[selected,setSelected]=useState(0),
  [proposal,setProposal]=useState<{result:Awaited<ReturnType<typeof prepareSavedElevationsAsync>>;target:number;elapsedMs:number;serial:number}>(),
  [busy,setBusy]=useState(false),[error,setError]=useState(""),[progress,setProgress]=useState(0),[before,setBefore]=useState(false),[ack,setAck]=useState(false),[renderReady,setRenderReady]=useState(false),
  [inspection,setInspection]=useState<TerrainInspection>(),[appearance,setAppearance]=useState<MapAppearance["style"]>("topographic"),[initialView,setInitialView]=useState<TerrainCamera>(),
  controller=useRef<AbortController|null>(null),serial=useRef(0),alive=useRef(true),canvas=useRef<TerrainCanvasHandle>(null),camera=useRef<TerrainCamera|undefined>(undefined),
  accepted=useSharedReliefScene(input.document.worldId,input.document.id,input.world.shape,undefined,false,{enabled:!input.document.refinement,rootRevision:input.rootRevision??input.document.revision}),
  waterOverlay=useMemo(()=>({layer:input.water,suggestions:null,selected:null,selectedPreview:false}),[input.water]),
  relief=useMemo(()=>appearanceRelief({...DEFAULT_MAP_APPEARANCE,style:appearance}),[appearance]),
  contextReady=waterRevision===input.waterRevision&&sourceState===input.sourceState,
  fresh=!!proposal&&proposal.target===selected&&contextReady;
 const expected={worldId:input.document.worldId,mapId:input.document.id,terrainId:input.document.terrainId,...input.document.refinement?{refinementId:input.document.refinement.id}:{},headRevision:input.document.revision,sourceState:input.sourceState,waterRevision:input.waterRevision};
 useEffect(()=>{
  alive.current=true;serial.current++;onDirty(true);const c=new AbortController();controller.current=c;
  void api<unknown>(endpoint(input.document.worldId,input.document.id,input.document.refinement?.id),"GET",undefined,c.signal).then(value=>{const list=savedElevationListSchema.parse(value);validateSavedElevationIdentity(list,{worldId:input.document.worldId,mapId:input.document.id,terrainId:input.document.terrainId,...input.document.refinement?{refinementId:input.document.refinement.id}:{},headRevision:input.document.revision,sourceState:input.sourceState,waterRevision:input.waterRevision});if(!alive.current)return;setHistory(list);setSelected(list.versions.find(v=>v.revision<list.headRevision)?.revision??list.headRevision);}).catch(e=>{if(!c.signal.aborted&&alive.current)setError(e.message);});
  return()=>{alive.current=false;controller.current?.abort();onDirty(false);};
 },[api,input.document.worldId,input.document.id,input.document.terrainId,input.document.refinement,input.document.revision,input.sourceState,input.waterRevision,onDirty]);
 function cancel(){serial.current++;controller.current?.abort();setBusy(false);}
 function close(){cancel();onClose();}
 async function prepare(){
  cancel();const attempt=++serial.current,c=new AbortController();controller.current=c;setBusy(true);setError("");setProgress(0);setAck(false);const started=performance.now();
  try{
   if(!contextReady)throw Error("Saved terrain or standing water changed. Close this comparison and reopen the current map.");
   const packet=await api<unknown>(endpoint(input.document.worldId,input.document.id,input.document.refinement?.id)+"&revision="+selected,"GET",undefined,c.signal),
    result=await prepareSavedElevationsAsync(input.base,shape,packet,expected,input.blocked,c.signal,setProgress,!!input.document.refinement);
   if(!alive.current||attempt!==serial.current)return;
   camera.current=undefined;setInitialView(undefined);setRenderReady(false);setBefore(false);setProposal({result,target:selected,elapsedMs:performance.now()-started,serial:attempt});setSection("review");
  }catch(e){if(!c.signal.aborted&&alive.current&&attempt===serial.current)setError(e instanceof Error?e.message:"The saved elevation comparison could not be prepared.");}
  finally{if(alive.current&&attempt===serial.current)setBusy(false);}
 }
 const grid=input.document.refinement||before||!fresh?input.base:proposal!.result.grid,probe=inspection?Math.max(0,Math.min(shape.height-1,inspection.row))*shape.width+Math.max(0,Math.min(shape.width-1,inspection.column)):undefined;
 const prepared=useMemo(()=>{const meta=input.document.refinement,w=proposal?.result.window;if(!meta||!w||!fresh||before)return;return {meta:savedElevationWindowMeta(meta,w,proposal.serial),grid:proposal.result.grid};},[input.document.refinement,proposal,fresh,before]);
 const native=useTerrainPreviewScene(input.document.refinement,input.world,input.base,prepared),changedFrame=proposal?.result.frame,frame=changedFrame&&input.document.refinement?{...changedFrame,x:changedFrame.x+input.document.refinement.frame.x,y:changedFrame.y+input.document.refinement.frame.y}:changedFrame,sceneReady=input.document.refinement?true:accepted.ready;
 const selectedElevation=probe===undefined?undefined:(()=>{const w=proposal?.result.window;if(!proposal)return input.base[probe];if(!w)return input.document.refinement?input.base[probe]:proposal.result.grid[probe];const x=probe%shape.width-w.x,y=Math.floor(probe/shape.width)-w.y;return x>=0&&y>=0&&x<w.width&&y<w.height?proposal.result.grid[y*w.width+x]:input.base[probe];})();
 const preview=<div className={styles.stage}>
  <div className={styles.canvas}><TerrainCanvas paused={busy} key={(proposal?.serial??"current")+":"+before} handleRef={canvas} shape={shape} grid={grid} seaLevel={input.document.seaLevel} brush={{tool:"level",radius:1,strength:1}} tool="pan" initialFrame={frame} initialView={initialView} worldShape={native.worldShape} worldGrid={native.worldGrid} frame={native.frame} details={input.document.refinement?native.scene:accepted.scene} water={waterOverlay} relief={relief} onViewport={v=>{if(input.document.refinement)native.onViewport(v);else accepted.onViewport(v);camera.current={x:v.left/2+v.right/2,y:v.top/2+v.bottom/2,scale:v.scale};}} locations={locations} onLocation={()=>{}} canEdit={false} onStroke={()=>{}} onWorking={()=>{}} onInspect={setInspection} onMeasure={()=>{}} onRenderReady={setRenderReady}/></div>
  <div className={styles.actions}><button type="button" className="st-button is-secondary" onClick={()=>canvas.current?.zoom(1.4)}>Zoom in</button><button type="button" className="st-button is-secondary" onClick={()=>canvas.current?.zoom(1/1.4)}>Zoom out</button><button type="button" className="st-button is-secondary" disabled={!frame} onClick={()=>frame&&canvas.current?.focusFrame(frame)}>Fit changed area</button><button type="button" className="st-button is-secondary" disabled={!fresh} onClick={()=>{setInitialView(camera.current);setBefore(v=>!v);}}>{before?"Show selected saved elevations":"Show current saved elevations"}</button></div>
  <output className={styles.status}>{probe===undefined?"Pan or inspect the native World samples.":`World native sample: current ${formatHeight(input.base[probe],preferences.height)}${proposal?`; selected saved ${formatHeight(selectedElevation!,preferences.height)}`:""}.`}</output>
 </div>;
 return <CreatorWorkshop title={input.document.refinement?"Restore saved terrain elevations":"Restore saved World elevations"} introduction="Compare earlier native elevations, then restore them as a new undoable edit." sections={[{id:"revision",label:"Saved revision"},{id:"review",label:"Review restoration"}]} section={section} onSection={setSection} onClose={close} mapFirst preview={preview} footer={<div className={styles.actions}><button type="button" className="st-button is-secondary" onClick={close}>Cancel</button>{busy?<button type="button" className="st-button is-secondary" onClick={cancel}>Cancel comparison</button>:<button type="button" className="st-button is-secondary" disabled={!history||!selected||!contextReady} onClick={()=>void prepare()}>Prepare saved elevation comparison</button>}<button type="button" className="st-button is-primary" disabled={busy||!fresh||!proposal?.result.changed||!ack||!renderReady||!sceneReady||!!accepted.error} onClick={()=>{if(proposal&&fresh)onApply(proposal.result.patch,proposal.elapsedMs);}}>Restore selected elevations</button></div>}>
  <h3>{input.document.refinement?`Saved elevations: ${input.document.refinement.name}`:"Saved World elevations"}</h3><p>Current revision {input.document.revision}. Earlier revisions remain retained after restoration.</p>
  <label className={styles.field}>Saved elevation revision<select className="st-control" aria-label="Saved elevation revision" disabled={busy||!history} value={selected} onChange={e=>{setSelected(Number(e.target.value));setAck(false);}}>{history?.versions.map(v=><option key={v.revision} value={v.revision}>Revision {v.revision} · {v.kind} · {new Date(v.createdAt).toLocaleString()}</option>)}</select></label>
  {busy&&<p role="status">Comparing saved elevations… {Math.round(progress*100)}%</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}{accepted.error&&<p role="alert" className={styles.error}>{accepted.error}</p>}
  {!contextReady&&<p role="status">Saved terrain or standing water changed. Reopen the current map before restoring elevations.</p>}
  {proposal&&<><h3>Elevation comparison</h3><p>{proposal.result.changed.toLocaleString()} native samples differ between current revision {input.document.revision} and saved revision {proposal.target}.</p><p>Restoration applies those saved heights through the ordinary terrain editor. Current sea level, water records, added coverage and other terrain sources stay retained.</p><label className={styles.field}>Preview appearance<select className="st-control" aria-label="Preview appearance" value={appearance} onChange={e=>setAppearance(e.target.value as MapAppearance["style"])}>{Object.entries(mapAppearanceNames).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label><input type="checkbox" aria-label="I reviewed the saved elevation comparison" checked={ack} disabled={!fresh} onChange={e=>setAck(e.target.checked)}/> I reviewed the saved elevation comparison.</label>{!fresh&&<p>Prepare a new comparison for the selected revision.</p>}</>}
 </CreatorWorkshop>;
}
