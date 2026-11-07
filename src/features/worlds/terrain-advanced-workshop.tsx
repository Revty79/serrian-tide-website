"use client";
import { accountWorldStorage } from "./world-draft-storage";
import {useEffect,useMemo,useRef,useState} from "react";
import {ZodError} from "zod";
import {CreatorWorkshop} from "./creator-workshop";
import {TerrainCanvas,type TerrainCanvasHandle,type TerrainCanvasTool} from "./terrain-canvas";
import {useTerrainPreviewScene,type TerrainPreviewWorld} from "./terrain-preview-scene";
import {terrainGeometry,type TerrainDocument} from "./terrain";
import {regionCanonicalX,regionFootprintFrame,simplifyRegionOutline,type RegionPoint} from "./terrain-region-geometry";
import type {RegionOutlineDrawing} from "./terrain-region-drawing";
import type {TerrainArea} from "./terrain-source";
import type {TerrainRelief} from "./terrain-relief";
import {appearanceRelief,visualAppearance,mapAppearanceNames,DEFAULT_MAP_APPEARANCE} from "./terrain-appearance";
import type {TerrainInspection} from "./terrain-units";
import {useMeasurementPreferences} from "./terrain-measurement-preferences";
import {TerrainTouchSwitch,useTerrainTouchControls} from "./terrain-touch-controls";
import {useNativeWorldApi,useNativeHistoryRecovery} from "./native-map-history-client";
import {advancedNames,advancedOperationSchema,ADVANCED_TERRAIN_LIMITS,type AdvancedKind,type AdvancedOperation,type AdvancedProvenance} from "./terrain-advanced-spec";
import {prepareAdvancedTerrainAsync,type AdvancedResult} from "./terrain-advanced";
import type {AdvancedContextPacket} from "./terrain-advanced-service";
import type {TerrainOperationReply} from "./terrain-operation-job";
import {parseAdvancedDraft,retireAdvancedDraft} from "./terrain-advanced-recovery";
import {advancedTerrainReview,volcanicAshCover} from "./terrain-advanced-review";
import type {EnvironmentLayer,EnvironmentRegion} from "./terrain-environment";
import styles from "./terrain-advanced-workshop.module.css";

export type AdvancedTerrainInput={
  document:TerrainDocument;base:Int16Array;blocked:Uint8Array;manual:Uint8Array;
  world:TerrainPreviewWorld;kind:AdvancedKind;riverId?:string;
};
type Props={
  input:AdvancedTerrainInput;relief?:TerrainRelief;environment:EnvironmentLayer;
  onClose:()=>void;onDirty:(value:boolean)=>void;
  onApply:(result:AdvancedResult,provenance:AdvancedProvenance)=>Promise<void>;
  onVisual:(layer:EnvironmentLayer)=>boolean;onWater:()=>void;
};
const emptyLocations={markers:[],selectedId:null,point:null};
function AdvancedNumber({label,value,onChange,min,max,step=1,disabled}:{label:string;value:number;onChange:(value:number)=>void;min?:number;max?:number;step?:number;disabled:boolean}){return <label>{label}<input aria-label={label} type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={event=>onChange(Number(event.target.value))}/></label>;}
function startingOperation(input:AdvancedTerrainInput):AdvancedOperation{
  const s=terrainGeometry(input.document.settings),frame=input.document.refinement?.frame??{x:0,y:0,width:s.displayWidth,height:s.displayHeight},
    world=input.world.shape,centre={x:regionCanonicalX(frame.x+frame.width/2,{width:world.displayWidth,height:world.displayHeight,wrap:world.wrap}),y:frame.y+frame.height/2},
    radius=Math.min(frame.width,frame.height)/6,spacing=Math.max(s.displayWidth/s.width,s.displayHeight/s.height),
    common={selection:{frame},preserveManual:true,strength:75};
  if(input.kind==="river-channel")return {...common,kind:"river-channel",riverId:input.riverId??"",course:"segment",first:0,last:null,widthM:spacing*2,depthM:40,bankSoftness:.6,smoothing:.4};
  if(input.kind==="erosion")return {...common,kind:"erosion",model:"runoff",iterations:12,direction:90,directionInfluence:.6,deposition:true,maxDepthM:120,reposeDegrees:30,featherM:spacing*2};
  if(input.kind==="eruption")return {...common,kind:"eruption",volcanoId:"00000000-0000-4000-8000-000000000000",effect:"collapse",source:centre,extentM:radius/2,widthM:spacing*2,magnitudeM:150,steps:128};
  return {...common,kind:"volcano",centre,form:"cone",radiusM:radius,heightM:1200,craterDiameterM:radius*.5,craterDepthM:400,profile:1,blendM:radius*.2,summitEastM:0,summitSouthM:0};
}
function download(value:string,name:string){
  const url=URL.createObjectURL(new Blob([value],{type:"application/json"})),a=document.createElement("a");
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function AdvancedTerrainWorkshop(p:Props){
 const localStorage=accountWorldStorage();
  const worldApi=useNativeWorldApi(),historyRecovery=useNativeHistoryRecovery();
  const {onDirty}=p;
  const [op,setOp]=useState<AdvancedOperation>(()=>startingOperation(p.input)),[packet,setPacket]=useState<AdvancedContextPacket>(),
    [section,setSection]=useState("settings"),[tool,setTool]=useState<TerrainCanvasTool>("pan"),
    [areaMode,setAreaMode]=useState<"rectangle"|"points"|"freehand">("rectangle"),[outline,setOutline]=useState<RegionPoint[]>([]),
    [drawing,setDrawing]=useState(false),[outlineTolerance,setOutlineTolerance]=useState(1),[proposal,setProposal]=useState<{result:AdvancedResult;fingerprint:string;elapsed:number}>(),
    [visualOnly,setVisualOnly]=useState(false),[visualReady,setVisualReady]=useState(false),[ash,setAsh]=useState<EnvironmentRegion>(),
    [before,setBefore]=useState(false),[busy,setBusy]=useState(false),[applying,setApplying]=useState(false),
    [progress,setProgress]=useState(0),[backend,setBackend]=useState(""),[error,setError]=useState(""),
    [acknowledged,setAcknowledged]=useState(false),[inspection,setInspection]=useState<TerrainInspection>(),
    [recovery,setRecovery]=useState<{key:string;raw:string}>(),[recoveryReady,setRecoveryReady]=useState(false);
  const [preferences]=useMeasurementPreferences(),[touch,setTouch,touchEpoch]=useTerrainTouchControls(),[armed,setArmed]=useState<number|null>(null);
  const doc=p.input.document,[shape]=useState(()=>terrainGeometry(p.input.document.settings)),
    prefix="st:terrain-advanced:v1"+historyRecovery+":"+doc.worldId+":"+doc.id+":"+(doc.refinement?.id??"root")+":",
    [key]=useState(()=>prefix+crypto.randomUUID()),canvas=useRef<TerrainCanvasHandle>(null),
    worker=useRef<Worker|null>(null),controller=useRef<AbortController|null>(null),serial=useRef(0),alive=useRef(true),
    watchdog=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),retained=useRef(""),exported=useRef(false),storageFailed=useRef(false),origin=useRef<{key:string;raw:string}|undefined>(undefined),retired=useRef(false);
  const fingerprint=JSON.stringify({op,visualOnly}),fresh=proposal?.fingerprint===fingerprint,
    previewGrid=!before&&fresh&&proposal?proposal.result.grid:p.input.base,
    scene=useTerrainPreviewScene(doc.refinement,p.input.world,previewGrid),
    selectedVolcano=op.kind==="eruption"?packet?.context.volcanoes.find(v=>v.id===op.volcanoId):undefined,
    environmentOverlay=useMemo(()=>({layer:visualOnly&&visualReady&&!before&&ash?{...p.environment,regions:[ash,...p.environment.regions]}:p.environment,drawing:[]}),[p.environment,visualOnly,visualReady,before,ash]),
    waterOverlay=useMemo(()=>packet?{layer:packet.context.water,suggestions:null,selected:op.kind==="river-channel"?op.riverId:null,selectedPreview:false}:undefined,[packet,op]),
    coverage=useMemo(()=>[{id:"operation-selection",name:"Selected operation area",...op.selection},...proposal?.result.metrics.affected?[{id:"operation-changed",name:"Changed terrain bounds",frame:proposal.result.metrics.affected}]:[]],[op.selection,proposal]),
    [appearance,setAppearance]=useState(()=>visualAppearance(p.relief).style),
    [previewRelief,setPreviewRelief]=useState(()=>{const value=visualAppearance(p.relief);return value.style==="classic-elevation"?DEFAULT_MAP_APPEARANCE.relief:value.relief;}),
    relief=useMemo(()=>appearanceRelief({...visualAppearance(p.relief),style:appearance,relief:previewRelief,version:appearance==="engraved-fantasy"?3:appearance==="realistic-terrain"?2:1}),[p.relief,appearance,previewRelief]),
    review=packet?advancedTerrainReview(packet.context,proposal?.result.metrics.affected??null,p.environment):undefined;
  function stop(){clearTimeout(watchdog.current);serial.current++;worker.current?.terminate();worker.current=null;controller.current?.abort();controller.current=null;setBusy(false);}
  useEffect(()=>{
    alive.current=true;const run=serial,workerRef=worker,control=controller,timeout=watchdog;
    onDirty(true);
    return()=>{clearTimeout(timeout.current);alive.current=false;run.current++;workerRef.current?.terminate();control.current?.abort();onDirty(false);};
  },[onDirty]);
  useEffect(()=>{
    let live=true;
    const endpoint="/api/worlds/"+doc.worldId+"/terrain/advanced?terrainMap="+doc.id+(doc.refinement?"&source="+doc.refinement.id:"");
    void worldApi<AdvancedContextPacket>(endpoint).then(value=>{if(live){
      if(value.sourceRevision!==doc.revision)throw Error("The accepted source changed. Close this proposal and load saved geography before previewing.");
      setPacket(value);
      setOp(current=>{
        if(current.kind==="river-channel"&&!current.riverId)return {...current,riverId:value.context.water.edges[0]?.id??""};
        if(current.kind==="eruption"&&current.volcanoId==="00000000-0000-4000-8000-000000000000"&&value.context.volcanoes[0])return {...current,volcanoId:value.context.volcanoes[0].id,source:value.context.volcanoes[0].operation.centre};
        return current;
      });
    }}).catch(e=>{if(live)setError(e instanceof Error?e.message:"Could not load accepted geography.");});
    try{for(let n=0;n<localStorage.length;n++){const candidate=localStorage.key(n);if(candidate?.startsWith(prefix)&&candidate!==key){const raw=localStorage.getItem(candidate)!;queueMicrotask(()=>{if(live)setRecovery({key:candidate,raw});});break;}}}
    catch{queueMicrotask(()=>{if(live)setError("Browser recovery storage is unavailable. Keep this editor open or export the operation settings.");});}
    queueMicrotask(()=>{if(live)setRecoveryReady(true);});return()=>{live=false;};
  },[doc.worldId,doc.id,doc.revision,doc.refinement,key,prefix,worldApi,localStorage]);
  useEffect(()=>{
    if(!recoveryReady||recovery||retired.current)return;
    const raw=JSON.stringify({version:1,mapId:doc.id,sourceId:doc.refinement?.id??null,revision:doc.revision,operation:op,visualOnly,outline,areaMode,drawing,simplificationM:outlineTolerance});
    try{if(raw.length>ADVANCED_TERRAIN_LIMITS.packetCharacters)throw Error("Operation recovery exceeds 250,000 characters.");localStorage.setItem(key,raw);retained.current=raw;exported.current=false;storageFailed.current=false;}
    catch{storageFailed.current=true;queueMicrotask(()=>{if(alive.current)setError("The settings could not be retained in browser recovery. Export them before closing; accepted terrain is unchanged.");});}
  },[op,visualOnly,outline,areaMode,drawing,outlineTolerance,recoveryReady,recovery,key,doc,localStorage]);
  function close(){
    if(applying)return;
    if((storageFailed.current||!retained.current&&!recovery)&&!exported.current){setError("Export these settings before closing because browser recovery is unavailable.");return;}
    stop();p.onClose();
  }
  function recover(){
    if(!recovery)return;
    try{
      const value=parseAdvancedDraft(recovery.raw,doc.id,doc.refinement?.id??null);
      setOp(value.operation);setVisualOnly(value.visualOnly);setOutline(value.outline??[]);setAreaMode(value.areaMode??"rectangle");setDrawing(value.drawing??false);setOutlineTolerance(value.simplificationM??1);setTool(value.drawing?(value.areaMode==="rectangle"?"select":"region"):"pan");origin.current=recovery;setRecovery(undefined);
      if(value.revision!==doc.revision)setError("These settings came from an older revision. They are restored for a new preview against the currently saved terrain; no old result is accepted.");
      else setError("");
    }catch(e){setError((e instanceof Error?e.message:"Unreadable recovery")+". The original bytes remain available to export.");}
  }
  function edit(value:Partial<AdvancedOperation>){
    stop();setAcknowledged(false);setVisualReady(false);setOp(current=>({...current,...value} as AdvancedOperation));
  }

  async function prepare(){
    stop();setError("");setAcknowledged(false);setBefore(false);
    if(!packet||recovery)return;
    try{advancedOperationSchema.parse(op);if(!packet.canEdit)throw Error("Only the World owner can accept numerical operations.");
      if(visualOnly){
        if(op.kind!=="eruption"||!selectedVolcano)throw Error("Choose an authored volcano first.");
        if(!p.environment.visible)throw Error("The environment layer is hidden. Enable it in the native environment controls before previewing visual cover.");
        setAsh(volcanicAshCover("00000000-0000-4000-8000-000000000001",{...selectedVolcano.operation.centre},op.extentM));setVisualReady(true);setSection("review");return;
      }
    }catch(e){setError(e instanceof ZodError?e.issues.map(issue=>issue.path.join(" ")+": "+issue.message).join("; "):e instanceof Error?e.message:"Check the operation settings.");return;}
    const token=++serial.current,started=performance.now();let lastProgress=started;
    setBusy(true);setProgress(0);
    const publishProgress=(value:number)=>{if(alive.current&&token===serial.current&&(value===1||performance.now()-lastProgress>=100)){lastProgress=performance.now();setProgress(value);}};
    const accept=(result:AdvancedResult)=>{
      if(!alive.current||token!==serial.current)return;
      setProposal({result,fingerprint,elapsed:performance.now()-started});setBusy(false);setSection("review");
    };
    const fallback=async()=>{
      if(token!==serial.current||!alive.current)return;
      worker.current?.terminate();worker.current=null;setBackend("Cooperative main-thread fallback");
      const abort=new AbortController();controller.current=abort;
      try{accept(await prepareAdvancedTerrainAsync(p.input.base,shape,op,packet.context,p.input.blocked,p.input.manual,publishProgress,abort.signal));}
      catch(e){if(alive.current&&token===serial.current){setBusy(false);setError(e instanceof Error?e.message:"The numerical preview failed.");}}
    };
    try{
      if(typeof Worker==="undefined"||new URLSearchParams(window.location.search).get("terrainWorker")==="off"){await fallback();return;}
      const engine=new Worker(new URL("./terrain-operation.worker.ts",import.meta.url),{type:"module"});worker.current=engine;setBackend("Terrain operation worker");
      const timer=setTimeout(()=>{if(token===serial.current){stop();setError("The preview exceeded 30 seconds. Choose a smaller area; accepted terrain is unchanged.");}},ADVANCED_TERRAIN_LIMITS.workerMs);watchdog.current=timer;
      engine.onmessage=({data}:MessageEvent<TerrainOperationReply>)=>{
        if(token!==serial.current)return;
        if(data.type==="progress"){publishProgress(data.progress);return;}
        clearTimeout(timer);engine.terminate();worker.current=null;
        if(data.type==="error"||!data.advancedMetrics){setBusy(false);setError(data.type==="error"?data.message:"The worker returned no numerical effect summary.");return;}
        accept({grid:new Int16Array(data.grid),patch:{indices:new Uint32Array(data.indices),before:new Int16Array(data.before),after:new Int16Array(data.after)},metrics:data.advancedMetrics});
      };
      engine.onerror=()=>{clearTimeout(timer);void fallback();};
      const base=p.input.base.slice().buffer,blocked=p.input.blocked.slice().buffer,manual=p.input.manual.slice().buffer;
      engine.postMessage({base,blocked,manual,shape,operation:op,context:packet.context},[base,blocked,manual]);
    }catch{await fallback();}
  }
  function selectRectangle(area:TerrainArea){
    if(!packet)return;const frame=packet.context.frame,world=packet.context.world;
    edit({selection:{frame:{x:regionCanonicalX(frame.x+area.x*frame.width/shape.width,world),y:frame.y+area.y*frame.height/shape.height,width:area.width*frame.width/shape.width,height:area.height*frame.height/shape.height}}});
  }
  function finishOutline(){
    if(!packet||outline.length<3){setError("Draw at least three boundary points.");return;}
    try{
      const points=simplifyRegionOutline(outline,outlineTolerance,packet.context.world),footprint={version:1 as const,kind:"polygon" as const,parts:[points]},
        frame=regionFootprintFrame(footprint,packet.context.world);
      if(points.length>128)throw Error("This outline still exceeds 128 points. Increase the explicit simplification distance or draw a shorter boundary.");
      edit({selection:{frame,footprint}});setDrawing(false);setTool("pan");setError("");
    }catch(e){setError(e instanceof Error?e.message:"Correct the selected outline.");}
  }
  const regionDrawing:RegionOutlineDrawing|undefined=drawing&&areaMode!=="rectangle"?{
    method:areaMode==="freehand"?"freehand":"points",parts:[{points:outline,closed:false}],activePart:0,operation:"append",vertex:0,
    onPick:point=>{if(outline.length>=128){setError("Finish this outline within 128 points or simplify it deliberately.");return;}setOutline(v=>[...v,point]);},
    onTrace:(points,phase)=>{if(points.length>8192){setError("Finish the trace within the existing 8,192 raw-point limit.");return;}setOutline(points);if(phase==="cancel")setDrawing(false);},
  }:undefined;
  async function apply(){
    if(!packet||!acknowledged||applying)return;
    setApplying(true);setError("");
    try{
      if(visualOnly&&visualReady&&ash){
        if(!p.onVisual({...p.environment,regions:[{...ash,id:crypto.randomUUID()},...p.environment.regions]}))throw Error("The native environment draft could not accept this cover. Resolve its pending work first.");
      }else{
        if(!proposal||!fresh||!proposal.result.metrics.affected||!proposal.result.metrics.changed)throw Error("Prepare a changed numerical proposal first.");
        await p.onApply(proposal.result,{version:1,contextPin:packet.pin,operation:op,effect:{changed:proposal.result.metrics.changed,affected:{frame:proposal.result.metrics.affected}}});
      }
      retired.current=true;try{if(retained.current)retireAdvancedDraft(localStorage,key,retained.current);
      if(origin.current)retireAdvancedDraft(localStorage,origin.current.key,origin.current.raw);}catch{/* The native accepted request is already durably retained; stale settings can be exported later. */}
      stop();p.onClose();
    }catch(e){setError(e instanceof Error?e.message:"Acceptance failed. Settings and accepted terrain are retained.");}
    finally{if(alive.current)setApplying(false);}
  }
  const pick=(point:{x:number;y:number})=>{
    if(op.kind==="volcano")edit({centre:point});
    else if(op.kind==="eruption")edit({source:point});
    setTool("pan");
  };
  const viewport=<div className={styles.stage}>
    <div className={styles.map} data-advanced-backend={backend} data-advanced-changed={proposal?.result.metrics.changed??0} data-advanced-visual={visualOnly&&visualReady?"1":"0"}>
      <TerrainCanvas handleRef={canvas} shape={shape} grid={previewGrid} seaLevel={doc.seaLevel} brush={{tool:"raise",radius:8,strength:100}}
        worldShape={scene.worldShape} worldGrid={scene.worldGrid} frame={scene.frame} initialFrame={scene.frame} details={scene.scene} onViewport={scene.onViewport}
        relief={relief} environment={environmentOverlay} water={waterOverlay}
        coverage={coverage} regionDrawing={regionDrawing} tool={busy||applying?"pan":tool} touchEdit={touch&&armed===touchEpoch}
        onSelect={selectRectangle} onLocation={pick} locations={emptyLocations} canEdit={false} onStroke={()=>{}} onWorking={()=>{}}
        onInspect={value=>{if(typeof value!=="string")setInspection(value);}} onMeasure={()=>{}} measurementPreferences={preferences}/>
    </div>
    <div className={styles.bar}>
      <button type="button" className="st-button is-secondary" onClick={()=>canvas.current?.zoom(1.4)} aria-label="Zoom in"><span className={styles.full}>Zoom in</span><span className={styles.short} aria-hidden="true">+</span></button>
      <button type="button" className="st-button is-secondary" onClick={()=>canvas.current?.zoom(1/1.4)} aria-label="Zoom out"><span className={styles.full}>Zoom out</span><span className={styles.short} aria-hidden="true">-</span></button>
      <button type="button" className="st-button is-secondary" onClick={()=>canvas.current?.fit()} aria-label="Fit preview"><span className={styles.full}>Fit preview</span><span className={styles.short} aria-hidden="true">Fit</span></button>
      <button type="button" className="st-button is-secondary" aria-pressed={before} onClick={()=>setBefore(v=>!v)} aria-label={before?"Show proposed terrain":"Show original terrain"}><span className={styles.full}>{before?"Show proposed terrain":"Show original terrain"}</span><span className={styles.short} aria-hidden="true">{before?"After":"Before"}</span></button>
      <button type="button" className="st-button is-secondary" onClick={()=>{setTool("pan");setDrawing(false);}} aria-label="Stop choosing / Pan"><span className={styles.full}>Stop choosing / Pan</span><span className={styles.short} aria-hidden="true">Stop / Pan</span></button>
    </div>
    <output className={styles.status} aria-label="Advanced terrain inspection">{inspection&&Number.isFinite(p.input.base[inspection.row*shape.width+inspection.column])?<><span className={styles.full}>{"Saved "+p.input.base[inspection.row*shape.width+inspection.column]+" m; proposed "+(fresh&&proposal?proposal.result.grid[inspection.row*shape.width+inspection.column]:p.input.base[inspection.row*shape.width+inspection.column])+" m. East "+Math.round(inspection.x)+" m, south "+Math.round(inspection.y)+" m."}</span><span className={styles.short}>{"Saved "+p.input.base[inspection.row*shape.width+inspection.column]+" m / proposed "+(fresh&&proposal?proposal.result.grid[inspection.row*shape.width+inspection.column]:p.input.base[inspection.row*shape.width+inspection.column])+" m"}</span></>:"Pan or tap to inspect heights."}</output>
    {busy&&<p className={styles.status} role="status">{backend+" — "+Math.round(progress*100)+"%"} <progress max={1} value={progress}/></p>}
  </div>;
  return <div className={styles.shell}><CreatorWorkshop mapFirst title={advancedNames[op.kind]} introduction="Preview, compare, then accept or cancel. Drawing water never carves automatically."
    sections={[{id:"settings",label:"Operation"},{id:"area",label:"Choose Area"},{id:"review",label:"Review Changes"}]} section={section} onSection={setSection} onClose={close}
    preview={viewport} footer={<>
      {error&&<p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" className="st-button is-secondary" disabled={applying} onClick={close} aria-label="Keep settings & Close">Keep & Close</button>
        <button type="button" className="st-button is-secondary" disabled={applying} onClick={()=>{stop();setProposal(undefined);setVisualReady(false);setAcknowledged(false);}}>Reject Preview</button>
        {busy?<button type="button" className="st-button is-secondary" onClick={stop}>Cancel Processing</button>:<button type="button" className="st-button is-primary" disabled={!packet||applying||!!recovery} onClick={()=>void prepare()}>Prepare Preview</button>}
        <button type="button" className="st-button is-primary" disabled={busy||applying||!acknowledged||!!recovery||!(visualOnly?visualReady:fresh&&!!proposal?.result.metrics.changed)} onClick={()=>void apply()}>{applying?"Retaining accepted request…":visualOnly?"Accept Visual Cover":"Accept Numerical Change"}</button>
      </div>
    </>}>
    {recovery&&<section className={styles.review}><h3>Retained terrain proposal</h3><p>Saved geography is intact. Recover these settings for a new preview, or export the original bytes before discarding them.</p><button className="st-button is-secondary" onClick={recover}>Recover Operation Settings</button><button className="st-button is-secondary" onClick={()=>download(recovery.raw,"terrain-operation-recovery.json")}>Export Retained Settings</button><button className="st-button is-secondary" onClick={()=>{retireAdvancedDraft(localStorage,recovery.key,recovery.raw);setRecovery(undefined);}}>Discard Retained Settings</button></section>}
    {!packet&&<p role="status">Loading accepted water, settlement supports and volcano history…</p>}
    <fieldset className={styles.fields} disabled={busy||applying||!!recovery} hidden={section!=="settings"}>
      <legend>Physical operation settings</legend>
      <label>Operation<select aria-label="Advanced operation" value={op.kind} onChange={e=>{stop();setOp(startingOperation({...p.input,kind:e.target.value as AdvancedKind}));setProposal(undefined);setVisualOnly(false);setAcknowledged(false);}}>{Object.entries(advancedNames).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label className={styles.check}><input aria-label="Protect existing manual heights" type="checkbox" checked={op.preserveManual} onChange={e=>edit({preserveManual:e.target.checked})}/> Protect existing manual heights. Clearing this explicitly permits replacement inside the selected area; finer detail and settlement/water supports remain protected.</label>
      {<AdvancedNumber key={"Terrain modification strength (%)"} label={"Terrain modification strength (%)"} value={op.strength} onChange={value=>edit({strength:value})} disabled={busy||applying||!!recovery} min={1} max={100}/>}
      {op.kind==="river-channel"&&<>
        <label>Saved river<select aria-label="Saved river" value={op.riverId} onChange={e=>edit({riverId:e.target.value,first:0,last:null})}><option value="">Choose a saved river</option>{packet?.context.water.edges.map(e=><option key={e.id} value={e.id}>{e.name||e.id}</option>)}</select></label>
        <label>Eligible course<select aria-label="Eligible course" value={op.course} onChange={e=>edit({course:e.target.value as "segment"|"downstream"})}><option value="segment">Selected saved segment</option><option value="downstream">Connected downstream course</option></select></label>
        {<AdvancedNumber key={"First river control point"} label={"First river control point"} value={op.first} onChange={value=>edit({first:value})} disabled={busy||applying||!!recovery} min={0} max={510}/>}
        {<AdvancedNumber key={"Last river control point"} label={"Last river control point"} value={op.last??Math.max(1,(packet?.context.water.edges.find(e=>e.id===op.riverId)?.points.length??2)-1)} onChange={value=>edit({last:value})} disabled={busy||applying||!!recovery} min={1} max={511}/>}
        {<AdvancedNumber key={"Channel width (m)"} label={"Channel width (m)"} value={op.widthM} onChange={value=>edit({widthM:value})} disabled={busy||applying||!!recovery} min={.1} max={100000}/>}
        {<AdvancedNumber key={"Channel depth (m)"} label={"Channel depth (m)"} value={op.depthM} onChange={value=>edit({depthM:value})} disabled={busy||applying||!!recovery} min={1} max={3000}/>}
        {<AdvancedNumber key={"Bank softness (%)"} label={"Bank softness (%)"} value={op.bankSoftness*100} onChange={value=>edit({bankSoftness:value/100})} disabled={busy||applying||!!recovery} min={0} max={100}/>}
        {<AdvancedNumber key={"Channel smoothing (%)"} label={"Channel smoothing (%)"} value={op.smoothing*100} onChange={value=>edit({smoothing:value/100})} disabled={busy||applying||!!recovery} min={0} max={100}/>}
        <p>Only saved downhill courses are eligible. Narrow channels need sufficient native samples; select finer terrain when needed. Carving preserves sea, lake and wetland samples.</p>
      </>}
      {op.kind==="erosion"&&<>
        <label>Erosion model<select aria-label="Erosion model" value={op.model} onChange={e=>edit({model:e.target.value as "runoff"|"thermal"})}><option value="runoff">Directional downhill runoff</option><option value="thermal">Gravity / talus transport</option></select></label>
        {<AdvancedNumber key={"Duration (erosion steps)"} label={"Duration (erosion steps)"} value={op.iterations} onChange={value=>edit({iterations:value})} disabled={busy||applying||!!recovery} min={1} max={40}/>}
        {<AdvancedNumber key={"Runoff direction (degrees clockwise from north)"} label={"Runoff direction (degrees clockwise from north)"} value={op.direction} onChange={value=>edit({direction:value})} disabled={busy||applying||!!recovery} min={0} max={360}/>}
        {<AdvancedNumber key={"Directional influence (%)"} label={"Directional influence (%)"} value={op.directionInfluence*100} onChange={value=>edit({directionInfluence:value/100})} disabled={busy||applying||!!recovery} min={0} max={100}/>}
        {<AdvancedNumber key={"Maximum wear at each sample (m)"} label={"Maximum wear at each sample (m)"} value={op.maxDepthM} onChange={value=>edit({maxDepthM:value})} disabled={busy||applying||!!recovery} min={1} max={3000}/>}
        {<AdvancedNumber key={"Talus repose angle (degrees)"} label={"Talus repose angle (degrees)"} value={op.reposeDegrees} onChange={value=>edit({reposeDegrees:value})} disabled={busy||applying||!!recovery} min={1} max={70}/>}
        {<AdvancedNumber key={"Selection edge feather (m)"} label={"Selection edge feather (m)"} value={op.featherM} onChange={value=>edit({featherM:value})} disabled={busy||applying||!!recovery} min={0}/>}
        <label className={styles.check}><input aria-label="Retain eroded material as local deposits" type="checkbox" checked={op.deposition} onChange={e=>edit({deposition:e.target.checked})}/> Retain eroded material as local downhill deposits</label>
        <p>Stylized mapmaking transport, not a geological forecast. Duration counts model steps, not years. Deposits retain material before metre rounding and bounds; with deposition off, material is removed from the model.</p>
      </>}
      {op.kind==="volcano"&&<>
        <label>Volcano form<select aria-label="Volcano form" value={op.form} onChange={e=>edit({form:e.target.value as typeof op.form})}><option value="cone">Conical volcano</option><option value="shield">Broad shield</option><option value="composite">Steep composite</option><option value="cratered">Cratered mountain</option><option value="caldera">Collapsed caldera</option></select></label>
        <button type="button" className="st-button is-secondary" onClick={()=>setTool("locations")}>Choose Volcano Location</button>
        {<AdvancedNumber key={"Volcano centre east (m)"} label={"Volcano centre east (m)"} value={op.centre.x} onChange={value=>edit({centre:{...op.centre,x:value}})} disabled={busy||applying||!!recovery} min={0}/>}
        {<AdvancedNumber key={"Volcano centre south (m)"} label={"Volcano centre south (m)"} value={op.centre.y} onChange={value=>edit({centre:{...op.centre,y:value}})} disabled={busy||applying||!!recovery} min={0}/>}
        {<AdvancedNumber key={"Volcano radius (m)"} label={"Volcano radius (m)"} value={op.radiusM} onChange={value=>edit({radiusM:value})} disabled={busy||applying||!!recovery} min={1}/>}
        {<AdvancedNumber key={"Height above existing land (m)"} label={"Height above existing land (m)"} value={op.heightM} onChange={value=>edit({heightM:value})} disabled={busy||applying||!!recovery} min={1} max={20000}/>}
        {<AdvancedNumber key={"Crater / caldera diameter (m)"} label={"Crater / caldera diameter (m)"} value={op.craterDiameterM} onChange={value=>edit({craterDiameterM:value})} disabled={busy||applying||!!recovery} min={0}/>}
        {<AdvancedNumber key={"Crater / caldera depth (m)"} label={"Crater / caldera depth (m)"} value={op.craterDepthM} onChange={value=>edit({craterDepthM:value})} disabled={busy||applying||!!recovery} min={0} max={20000}/>}
        {<AdvancedNumber key={"Slope profile"} label={"Slope profile"} value={op.profile} onChange={value=>edit({profile:value})} disabled={busy||applying||!!recovery} min={.5} max={4} step={.1}/>}
        {<AdvancedNumber key={"Blend / transition distance (m)"} label={"Blend / transition distance (m)"} value={op.blendM} onChange={value=>edit({blendM:value})} disabled={busy||applying||!!recovery} min={0}/>}
        {<AdvancedNumber key={"Summit offset east (m)"} label={"Summit offset east (m)"} value={op.summitEastM} onChange={value=>edit({summitEastM:value})} disabled={busy||applying||!!recovery}/>}
        {<AdvancedNumber key={"Summit offset south (m)"} label={"Summit offset south (m)"} value={op.summitSouthM} onChange={value=>edit({summitSouthM:value})} disabled={busy||applying||!!recovery}/>}
      </>}
      {op.kind==="eruption"&&<>
        <label>Authored volcano<select aria-label="Authored volcano" value={op.volcanoId} onChange={e=>{const v=packet?.context.volcanoes.find(v=>v.id===e.target.value);edit({volcanoId:e.target.value,...v?{source:v.operation.centre}:{}});}}><option value="">Choose a retained volcano</option>{packet?.context.volcanoes.map(v=><option key={v.id} value={v.id}>{v.operation.form+" — east "+Math.round(v.operation.centre.x)+" m, south "+Math.round(v.operation.centre.y)+" m; revision "+v.revision}</option>)}</select></label>
        <label>Eruption effect<select aria-label="Eruption effect" value={visualOnly?"ash":op.effect} onChange={e=>{edit({effect:e.target.value==="lava"?"lava":"collapse"});setVisualOnly(e.target.value==="ash");}}><option value="ash">Ash / debris cover — visual only</option><option value="collapse">Summit collapse — numerical lowering</option><option value="lava">Downhill lava deposit — numerical raising</option></select></label>
        {<AdvancedNumber key={"Maximum effect extent (m)"} label={"Maximum effect extent (m)"} value={op.extentM} onChange={value=>edit({extentM:value})} disabled={busy||applying||!!recovery} min={1}/>}
        {!visualOnly&&<AdvancedNumber key={op.effect==="lava"?"Lava deposit thickness (m)":"Summit collapse depth (m)"} label={op.effect==="lava"?"Lava deposit thickness (m)":"Summit collapse depth (m)"} value={op.magnitudeM} onChange={value=>edit({magnitudeM:value})} disabled={busy||applying||!!recovery} min={1} max={3000}/>}
        {!visualOnly&&op.effect==="lava"&&<>
          <button type="button" className="st-button is-secondary" onClick={()=>setTool("locations")}>Choose Lava Source</button>
          {<AdvancedNumber key={"Lava source east (m)"} label={"Lava source east (m)"} value={op.source.x} onChange={value=>edit({source:{...op.source,x:value}})} disabled={busy||applying||!!recovery} min={0}/>}
          {<AdvancedNumber key={"Lava source south (m)"} label={"Lava source south (m)"} value={op.source.y} onChange={value=>edit({source:{...op.source,y:value}})} disabled={busy||applying||!!recovery} min={0}/>}
          {<AdvancedNumber key={"Lava deposit width (m)"} label={"Lava deposit width (m)"} value={op.widthM} onChange={value=>edit({widthM:value})} disabled={busy||applying||!!recovery} min={1}/>}
          {<AdvancedNumber key={"Maximum lava route steps"} label={"Maximum lava route steps"} value={op.steps} onChange={value=>edit({steps:value})} disabled={busy||applying||!!recovery} min={1} max={2048}/>}
        </>}
        <p>{visualOnly?"Visual ash/debris uses native bare environmental cover beneath existing manual paint. It changes no elevations and saves through Environment.":"Numerical effects change accepted metre elevations only after explicit acceptance. Lava uses existing downhill gradients and stops at sinks or protected boundaries."}</p>
        <p>Authored volcano entries retain immutable operation intent; later sculpting may change their present shape. Event dating and historical-state playback require the future historical-map stage.</p>
      </>}
    </fieldset>
    <section className={styles.fields} hidden={section!=="area"}>
      <h3>Geographic selection</h3><p>Coordinates use canonical World metres. The existing region drawing tools define the permitted rectangle or polygon; outside samples remain exact.</p>
      <label>Selection method<select aria-label="Operation selection method" value={areaMode} onChange={e=>{setAreaMode(e.target.value as typeof areaMode);setDrawing(false);setOutline([]);}}><option value="rectangle">Rectangle</option><option value="points">Point-by-point polygon</option><option value="freehand">Freehand polygon</option></select></label>
      <button type="button" className="st-button is-secondary" onClick={()=>{setDrawing(true);setOutline([]);setTool(areaMode==="rectangle"?"select":"region");}}>Draw Selected Area</button>
      {areaMode==="freehand"&&<AdvancedNumber key={"Outline simplification distance (m)"} label={"Outline simplification distance (m)"} value={outlineTolerance} onChange={setOutlineTolerance} disabled={busy||applying||!!recovery} min={0}/>}
      {drawing&&areaMode!=="rectangle"&&<button type="button" className="st-button is-secondary" onClick={finishOutline}>Finish Selected Outline</button>}
      {(["x","y","width","height"] as const).map(axis=><AdvancedNumber key={"Selected "+axis+" (m)"} label={"Selected "+axis+" (m)"} value={op.selection.frame[axis]} onChange={value=>edit({selection:{frame:{...op.selection.frame,[axis]:value}}})} disabled={busy||applying||!!recovery} min={axis==="width"||axis==="height"?1:0}/>)}
      {op.selection.footprint&&<p>Selected polygon: {op.selection.footprint.parts.reduce((n,r)=>n+r.length,0)} retained points.</p>}
      <TerrainTouchSwitch enabled={touch} onChange={setTouch}/>
      {touch&&<label className={styles.check}><input type="checkbox" checked={armed===touchEpoch} onChange={e=>setArmed(e.target.checked?touchEpoch:null)}/> Enable one-finger location/area choice. Two fingers still navigate.</label>}
    </section>
    <section className={styles.review} hidden={section!=="review"&&section!=="preview"}>
      <h3>{visualOnly?"Visual eruption preview":"Numerical change preview"}</h3>
      <label>Preview appearance<select aria-label="Advanced preview appearance" value={appearance} onChange={e=>setAppearance(e.target.value as typeof appearance)}>{Object.entries(mapAppearanceNames).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>Preview relief strength<input aria-label="Preview relief strength" type="number" min={1} max={1000} value={previewRelief} onChange={e=>setPreviewRelief(Math.max(1,Math.min(1000,Number(e.target.value)||1)))}/></label><p>Vertical exaggeration changes this display only. Inspected and saved heights stay in metres.</p>
      {proposal&&<><p>{proposal.result.metrics.changed.toLocaleString()} changed samples. Maximum lowering {proposal.result.metrics.maxLoweringM} m; raising {proposal.result.metrics.maxRaisingM} m. Cut {Math.round(proposal.result.metrics.removedM3).toLocaleString()} m³; fill {Math.round(proposal.result.metrics.addedM3).toLocaleString()} m³.</p><p>{backend+"; "+proposal.elapsed.toFixed(1)+" ms. Numerical working-buffer estimate "+(proposal.result.metrics.workingBytes/1048576).toFixed(1)+" MiB; not process RSS."}</p><ul>{proposal.result.metrics.notices.map(n=><li key={n}>{n}</li>)}</ul></>}
      {proposal&&!fresh&&<p role="status">Settings changed. Prepare another preview before acceptance.</p>}
      {visualOnly&&visualReady&&<p>No height samples change. The cover is retained as a normal, undoable environmental draft; save Environment afterward.</p>}
      {review&&<><h4>Water and environment review</h4><p>Accepted features stay intact. Only automatically derived rendering is refreshed; water routes, drainage, climate assumptions and nearby decoration may need review.</p><ul>{Object.entries(review).map(([kind,items])=><li key={kind}>{kind+": "+(items.length?items.slice(0,12).join(", ")+(items.length>12?" … ("+items.length+" total)":""):"no intersecting saved records")}</li>)}</ul></>}
      <label className={styles.check}><input aria-label="I reviewed the affected geography" type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/> I reviewed the affected geography and retained manual features.</label>
      <button type="button" className="st-button is-secondary" onClick={()=>{close();p.onWater();}}>Return to Water Review</button>
    </section>
    <button type="button" className="st-button is-secondary" onClick={()=>{download(recovery?.raw??JSON.stringify({version:1,mapId:doc.id,sourceId:doc.refinement?.id??null,revision:doc.revision,operation:op,visualOnly,outline,areaMode,drawing,simplificationM:outlineTolerance}),"terrain-operation-settings.json");exported.current=true;}}>Export Operation Settings</button>
  </CreatorWorkshop></div>;
}
