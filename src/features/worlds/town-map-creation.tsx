"use client";
import {templateImagePreview} from "./map-template-application";
import {townDesignSchema,validateTownDesign} from "./town-map";
import {compositionSchema,type AssetComposition} from "./atlas-assets";
import {MapTemplateLauncher} from "./map-template-launcher";
import {useEffect,useRef,useState} from "react";
import {useTownViewport} from "./town-map-viewport";
import {useNativeWorldApi,useNativeHistoryRecovery,useNativeHistory} from "./native-map-history-client";
import {defaultTownGeneration,townProblem,townFrameSchema,townGenerationSchema,type TownFrame,type TownGeneration,type TownBackdrop,type TownDesign,type TownMapCommand,type TownMapBundle} from "./town-map";
import type {TownBundle} from "./world-towns";
import type {RegionHierarchy} from "./terrain-region-hierarchy";
import {TownMapCanvas} from "./town-map-canvas";
import styles from "./town-map.module.css";

export function TownGenerationFields({value:v,onChange,startingOption=true}:{value:TownGeneration;onChange:(v:TownGeneration)=>void;startingOption?:boolean}) {
 const update=(key:keyof TownGeneration,value:unknown)=>onChange({...v,[key]:value});
 return <div className={styles.fields}>
  {startingOption&&<label>Starting option<select aria-label="Starting option" className="st-control" value={v.mode} onChange={e=>update("mode",e.target.value)}><option value="blank">Start Blank</option><option value="layout">Start from a Layout</option><option value="generate">Generate Town</option></select></label>}
  {v.mode!=="blank"&&<>
   <fieldset className={styles.sizeChoices}><legend>How big is your town?</legend><div className={styles.row}>
    {([["village","Village",400],["town","Town",2000],["city","City",12000]] as const).map(([category,label,population])=><button key={category} type="button" className={"st-button "+(v.category===category?styles.toolActive:"")} aria-pressed={v.category===category} onClick={()=>onChange({...v,category,population})}>{label}</button>)}
   </div></fieldset>
   <label>More space or more buildings?<input aria-label="Density" className="st-control" type="range" min={.1} max={1} step={.05} value={v.density} onChange={e=>update("density",Number(e.target.value))}/><small>Open and spacious ← → Densely built</small></label>
    <label>Building style<select aria-label="Architectural influence" className="st-control" value={v.culture} onChange={e=>update("culture",e.target.value)}><option value="local">Local mix</option><option value="courtyard">Courtyards</option><option value="timber">Timber</option><option value="stone">Stone</option></select></label>
    <label>Road layout<select aria-label="Road pattern" className="st-control" value={v.roads} onChange={e=>update("roads",e.target.value)}><option value="organic">Winding streets</option><option value="grid">Straight streets</option><option value="radial">Around a town centre</option></select></label>
   <details><summary>More layout choices</summary><div className={styles.fields}>
    <label>Layout<select aria-label="Layout" className="st-control" value={v.layout} onChange={e=>{const layout=e.target.value;onChange({...v,layout:layout as TownGeneration["layout"],roads:layout==="planned"?"grid":"organic",fortified:layout==="fortified"});}}><option value="village">Compact village</option><option value="planned">Planned town</option><option value="fortified">Fortified settlement</option></select></label>
    <label>Settlement scale<select aria-label="Settlement scale" className="st-control" value={v.category} onChange={e=>update("category",e.target.value)}>{["village","town","city"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Approximate population<input aria-label="Approximate population" className="st-control" type="number" min={1} max={10000000} value={v.population} onChange={e=>update("population",Number(e.target.value))}/></label>
    <label>Era<select aria-label="Era" className="st-control" value={v.era} onChange={e=>update("era",e.target.value)}>{["preindustrial","industrial","modern"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Surrounding land<select aria-label="Terrain character" className="st-control" value={v.terrain} onChange={e=>update("terrain",e.target.value)}><option value="adapt">Follow the World terrain</option><option value="coastal">Coast</option><option value="valley">Valley</option><option value="mountain">Mountains</option><option value="riverside">Riverside</option></select></label>
    <label><span><input type="checkbox" checked={v.fortified} onChange={e=>update("fortified",e.target.checked)}/> Include town walls</span></label>
    <label>Layout seed<input aria-label="Seed" className="st-control" value={v.seed} maxLength={80} onChange={e=>update("seed",e.target.value)}/></label>
    <p>These choices change the drawing. Your Town&apos;s recorded population and history stay under Town Details.</p>
   </div></details>
  </>}
 </div>;
}

type TemplateDrawing={design:TownDesign;images?:AssetComposition};
type Setup={name:string;anchorId:string;context:string;width:number;height:number;rotation:number;settings:TownGeneration;templateDrawing?:TemplateDrawing};
type Proposal={design:TownDesign;backdrop:TownBackdrop;warnings:string[];previewToken:string;templateImages?:AssetComposition};
export function TownMapCreation({worldId,townId,contextMapId,placementId,onAccepted,onCancel,onDirty}:{worldId:string;townId:string;contextMapId?:string;placementId?:string;onAccepted:(id:string)=>void;onCancel:()=>void;onDirty:(v:boolean)=>void}) {
 const worldApi=useNativeWorldApi(),historyRecovery=useNativeHistoryRecovery();const historicalScope=useNativeHistory();
 const [towns,setTowns]=useState<TownBundle>(),[load,setLoad]=useState(0),[available,setAvailable]=useState(true),[hierarchy,setHierarchy]=useState<RegionHierarchy>(),[anchorId,setAnchorId]=useState(placementId??""),[context,setContext]=useState(contextMapId??""),[name,setName]=useState(""),[width,setWidth]=useState(1500),[height,setHeight]=useState(1000),[rotation,setRotation]=useState(0),[settings,setSettings]=useState(()=>({...defaultTownGeneration(),seed:townId})),[proposal,setProposal]=useState<Proposal>(),[previewFrame,setPreviewFrame]=useState<TownFrame>(),[outdated,setOutdated]=useState(false),[error,setError]=useState(""),[pending,setPending]=useState(false),[attempt,setAttempt]=useState<TownMapCommand>(),[recovered,setRecovered]=useState<TownMapCommand>(),[options,setOptions]=useState(false),[recoveredSetup,setRecoveredSetup]=useState<Setup>();
 const [templateDrawing,setTemplateDrawing]=useState<TemplateDrawing>();
 const controller=useRef<AbortController>(null),surface=useRef<HTMLElement>(null),setupTouched=useRef(false),api="/api/worlds/"+worldId+"/town-maps",key="st:town-map-create:v1"+historyRecovery+":"+worldId+":"+townId;
 useTownViewport(surface);
 useEffect(()=>{
  let alive=true;
  void Promise.all([worldApi<TownBundle>("/api/worlds/"+worldId+"/towns?town="+townId),worldApi<RegionHierarchy>("/api/worlds/"+worldId+"/terrain/hierarchy"),worldApi<TownMapBundle>("/api/worlds/"+worldId+"/town-maps?town="+townId)]).then(([t,h,m])=>{
   if(!alive)return;
   setTowns(t);setHierarchy(h);setAvailable(m.available);setName(current=>{if(current)return current;const title=(t.towns.find(x=>x.id===townId)?.name??"Town")+" map";if(!m.maps.length)return title;let n=2;while(m.maps.some(map=>map.name===title+" "+n))n++;return title+" "+n;});
   const placements=t.placements.filter(p=>p.townId===townId&&!p.removed&&!p.archived);
   if(placements.length===1)setAnchorId(current=>current||placements[0].id);
  }).catch(e=>{if(alive)setError(e.message);});
  try {
   const raw=localStorage.getItem(key);
   if(raw)queueMicrotask(()=>{if(alive){setRecovered(JSON.parse(raw));onDirty(true);}});
   else {const rawSetup=localStorage.getItem(key+":settings");if(rawSetup){const value=JSON.parse(rawSetup) as Setup;townGenerationSchema.parse(value.settings);if(value.templateDrawing){townDesignSchema.parse(value.templateDrawing.design);if(value.templateDrawing.images)compositionSchema.parse(value.templateDrawing.images);}queueMicrotask(()=>{if(alive){setRecoveredSetup(value);onDirty(true);}});}}
  } catch {queueMicrotask(()=>setError("Your saved maps are safe, but this browser could not read the unfinished setup. Keep this page open and try again."));}
  return()=>{alive=false;controller.current?.abort();};
 },[worldId,townId,key,onDirty,load,worldApi]);
 const placements=towns?.placements.filter(p=>p.townId===townId&&!p.removed&&!p.archived)??[],anchor=placements.find(p=>p.id===anchorId),source=anchor?.mapId,contexts=hierarchy?.nodes.filter(n=>n.sourceWorldMapId===source&&!n.archived&&n.sourceAvailable)??[],chosenContext=contexts.find(c=>c.id===context)?.id??(context?"":source),frame:TownFrame|undefined=anchor?{x:anchor.x-width/2,y:anchor.y-height/2,width,height,rotation}:undefined;
 const ready=available&&!!towns&&!!hierarchy&&!!anchor&&!!chosenContext&&!!name.trim()&&!recoveredSetup&&!recovered;
 useEffect(()=>{if(!setupTouched.current||recoveredSetup||attempt||recovered)return;try{localStorage.setItem(key+":settings",JSON.stringify({name,anchorId,context,width,height,rotation,settings,templateDrawing}));}catch{queueMicrotask(()=>setError("This browser could not keep your setup. Keep this page open until the map is saved."));}},[key,name,anchorId,context,width,height,rotation,settings,templateDrawing,recoveredSetup,attempt,recovered]);
 function change(){setupTouched.current=true;controller.current?.abort();setOutdated(true);setError("");onDirty(true);}
 async function accept(original?:TownMapCommand,prepared?:Proposal,chosen=settings) {
  const result=prepared??proposal;
  if(!original&&(!result||!anchor||!source||!frame||!chosenContext))return;
  const command=original??attempt??{action:"create",requestId:worldApi.newRequestId(),townId,sourceMapId:source!,contextMapId:chosenContext!,placementId:anchor!.id,placementRevision:anchor!.revision,anchor:{x:anchor!.x,y:anchor!.y},frame:frame!,name,design:result!.design,previewToken:chosen.mode==="blank"?null:result!.previewToken,...result?.templateImages?{templateImages:result.templateImages}:{}};
  setAttempt(command);const submitted=JSON.stringify(command),submittedSetup=localStorage.getItem(key+":settings");
  try{localStorage.setItem(key,submitted);}catch{setError("This browser could not keep a recovery copy. Keep this page open until saving finishes.");}
  setPending(true);
  try{const saved=await worldApi<{id:string}>(api,"POST",command);if(localStorage.getItem(key)===submitted)localStorage.removeItem(key);if(localStorage.getItem(key+":settings")===submittedSetup)localStorage.removeItem(key+":settings");onDirty(false);onAccepted(saved.id);}
  catch(e){setError(townProblem(e)+" Your map is kept here. Choose Retry Save & Open to try again.");}
  finally{setPending(false);}
 }
 async function preview(chosen=settings,openBlank=false,manual:TemplateDrawing|null|undefined=templateDrawing) {
  if(!anchor||!source||!frame||!chosenContext){setError("Choose where this Town is placed below. If it has no location yet, place it on the World first.");return;}
  setPending(true);setError("");
  const c=new AbortController();controller.current=c;
  try {
   townGenerationSchema.parse(chosen);townFrameSchema.parse(frame);
   const result=await worldApi<Proposal>(api,"POST",{action:"preview",sourceMapId:source,frame,settings:chosen},c.signal);
   if(c.signal.aborted)return;
   if(manual){validateTownDesign(manual.design,frame);result.design={...manual.design,recipe:result.design.recipe};result.templateImages=manual.images;}setProposal(result);setPreviewFrame(frame);setOutdated(false);setOptions(false);onDirty(true);
   if(openBlank)await accept(undefined,result,chosen);
  } catch(e){if(!c.signal.aborted)setError(townProblem(e));}
  finally{if(controller.current===c)setPending(false);}
 }
 function start(mode:TownGeneration["mode"]) {const chosen={...settings,mode};change();setTemplateDrawing(undefined);setSettings(chosen);void preview(chosen,mode==="blank",null);}
 const locationChoices=<label>Town location<select aria-label="Town location" className="st-control" value={anchorId} onChange={e=>{change();setAnchorId(e.target.value);setContext("");}}><option value="">Choose where your Town is placed</option>{placements.map(p=><option key={p.id} value={p.id}>{p.mapName} · {p.x.toFixed(0)}, {p.y.toFixed(0)} m</option>)}</select></label>;
 const areaSettings=<details><summary>Map area & location</summary><div className={styles.fields}>
  {anchor&&locationChoices}
  {anchor&&<label>Return to map<select aria-label="Return to map" className="st-control" value={chosenContext} onChange={e=>{change();setContext(e.target.value);}}>{contexts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
  <div className={styles.two}><label>Map width (m)<input aria-label="Map width (m)" className="st-control" type="number" min={100} max={20000} value={width} onChange={e=>{change();setWidth(Number(e.target.value));}}/></label><label>Map height (m)<input aria-label="Map height (m)" className="st-control" type="number" min={100} max={20000} value={height} onChange={e=>{change();setHeight(Number(e.target.value));}}/></label></div>
  <label>Orientation (degrees)<input aria-label="Orientation (degrees)" className="st-control" type="number" min={-180} max={180} value={rotation} onChange={e=>{change();setRotation(Number(e.target.value));}}/></label>
 </div></details>;
 const recovery=<>
  {recovered&&<div className={styles.recovery}><h3>Pick up where you left off</h3><p>Your last map creation is kept here. Open it again safely, even if the last save already went through.</p><button className="st-button is-primary" disabled={pending} onClick={()=>void accept(recovered)}>Retry Save & Open</button><button className="st-button" disabled={pending} onClick={()=>{if(window.confirm("Discard this unfinished setup? Any map already saved stays in Switch Map.")){localStorage.removeItem(key);setRecovered(undefined);setAttempt(undefined);}}}>Discard unfinished setup</button></div>}
  {recoveredSetup&&<div className={styles.recovery}><h3>Continue your unfinished setup?</h3><p>Your previous choices are kept here.</p><button className="st-button is-primary" onClick={()=>{setName(recoveredSetup.name);setAnchorId(recoveredSetup.anchorId);setContext(recoveredSetup.context);setWidth(recoveredSetup.width);setHeight(recoveredSetup.height);setRotation(recoveredSetup.rotation);setSettings(recoveredSetup.settings);setTemplateDrawing(recoveredSetup.templateDrawing);setupTouched.current=true;setRecoveredSetup(undefined);setOptions(true);}}>Continue My Setup</button><button className="st-button" onClick={()=>{if(window.confirm("Discard your previous setup choices? Saved Town Maps stay safe.")){localStorage.removeItem(key+":settings");setRecoveredSetup(undefined);}}}>Start Fresh</button></div>}
 </>;
 return <section ref={surface} className={styles.workspace} aria-label="Create Town Map">
  <header className={styles.header}><div className={styles.identity}><strong>{proposal?"Your town preview":"Let’s make your Town Map"}</strong><small>{towns?.towns.find(t=>t.id===townId)?.name??"Loading Town…"}</small>{historicalScope&&<small className={styles.historicalCreationHint} role="status">New appearance for Year {historicalScope.year}. Adjust its period in History / Era after saving.</small>}</div><div className={styles.headerActions}><MapTemplateLauncher worldId={worldId} family="town" disabled={!ready||pending||!!attempt} application="start" context={frame?{frame}:undefined} capture={images=>proposal&&frame?{family:"town",settings,drawing:{frame,design:proposal.design},images:images&&proposal.templateImages?[{surface:0,layer:proposal.templateImages}]:[]}:{family:"town",settings,images:[]}} onApply={async c=>{if(c.family!=="town")throw Error("Choose a Town template.");change();const chosen=c.drawing?{...c.settings,mode:"blank" as const}:c.settings;setSettings(chosen);const manual=c.drawing?{design:c.drawing.design,images:c.images[0]?.layer}:undefined;setTemplateDrawing(manual);await preview(chosen,false,manual??null);}}/>
   {proposal&&<button className="st-button" aria-expanded={options} onClick={()=>setOptions(!options)}>Change Layout</button>}
   {(attempt||recovered)&&<button className="st-button is-primary" disabled={pending} onClick={()=>void accept(recovered??attempt)}>{pending?"Saving your map…":"Retry Save & Open"}</button>}
   {proposal&&!attempt&&!recovered&&<button className="st-button is-primary" disabled={pending} onClick={()=>outdated?void preview():void accept()}>{pending?"Preparing your town…":outdated?"Update Preview":"Save & Open Town Map"}</button>}
   <button className="st-button" disabled={pending&&!!attempt} onClick={()=>{controller.current?.abort();onCancel();}}>Cancel</button>
  </div></header>
  <div className={styles.main} data-tools="false" data-options={!!proposal&&options}><aside hidden/>
   <div className={styles.canvasColumn}>
    {error&&<p role="alert" className={styles.warning}>{error}{!towns&&<button className="st-button" onClick={()=>{setError("");setLoad(n=>n+1);}}>Try Again</button>}</p>}
    {proposal?<>
     <div className={styles.previewBadge}><strong>{outdated?"Your choices changed.":"Like this town?"}</strong> {outdated?"Update Preview to see them before saving.":"Save & Open Town Map to start moving buildings, drawing roads and making it yours."}</div>
     <TownMapCanvas composition={templateImagePreview(worldId,proposal?.templateImages,setError)} key={proposal.previewToken} handleRef={()=>{}} design={proposal.design} frame={previewFrame??frame!} backdrop={proposal.backdrop} tool="pan" shape="rectangle" selected="" onSelect={()=>{}} onChange={()=>{}} onError={setError} editable={false} onDraft={()=>{}} draft={[]} onFinish={()=>{}} onCancel={()=>{}} touchEdit={false}/>
     {proposal.warnings.length>0&&<details className={styles.previewNotes}><summary>About this layout</summary>{proposal.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
    </>:<div className={styles.creationStart}>
     {recovery}
     <h2>How would you like to start?</h2><p>Let the map maker build a town for you, or begin with empty ground. You can change everything afterward.</p>
     <label>Town Map name<input aria-label="Town Map name" className="st-control" value={name} maxLength={160} disabled={pending||!!attempt||!!recovered} onChange={e=>{change();setName(e.target.value);}}/></label>
     {!error&&(!towns||!hierarchy)&&<p role="status">Finding your Town&apos;s saved location…</p>}
     {!available&&<p className={styles.warning}>Town Maps need database update 0151 before they can be saved. Your Town and World maps are safe.</p>}{towns&&!!name.trim()===false&&<p>Give your map a name above, then choose how to start.</p>}{towns&&!placements.length&&<div className={styles.warning}><p>This Town needs a marker on your World before it can have a map.</p><a className="st-button" href={"/worlds/"+worldId+"?tab=atlas"}>Place This Town on the World</a></div>}
     {placements.length>0&&!anchor&&locationChoices}
     {anchor&&<p className={styles.locationSummary}>✓ Using {towns?.towns.find(t=>t.id===townId)?.name}&apos;s saved location. You can start now.</p>}
     <div className={styles.startChoices}>
      <button type="button" className="st-button" disabled={!ready||pending||!!attempt} onClick={()=>start("generate")}><svg viewBox="0 0 120 55" aria-hidden="true"><path d="M5 47Q40 26 115 36M55 54L68 6" fill="none" stroke="currentColor" strokeWidth="5"/><path d="M15 28V15L29 7L43 15V28ZM76 26V13L89 5L102 13V26ZM79 52V40L93 32L107 40V52Z" fill="none" stroke="currentColor" strokeWidth="2"/></svg><strong>{pending&&settings.mode!=="blank"?"Building your preview…":"Generate a Town"}</strong><span>Start with roads and buildings.<br/>Preview it, then make it your own.</span></button>
      <button type="button" className="st-button" disabled={!ready||pending||!!attempt} onClick={()=>start("blank")}><svg viewBox="0 0 120 55" aria-hidden="true"><path d="M21 45H94M24 39V12H54V39M68 37L94 11L104 21L78 47L65 50Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M91 14L101 24M68 37L78 47" fill="none" stroke="currentColor" strokeWidth="2"/></svg><strong>{pending&&settings.mode==="blank"?"Opening your map…":"Draw My Own"}</strong><span>Start with empty ground.<br/>We’ll show you how to add each part.</span></button>
     </div>
     <details><summary>Choose a starting layout or change the map area</summary><div className={styles.fields}>
      <fieldset disabled={pending||!!attempt||!!recovered||!!recoveredSetup}>
       <TownGenerationFields value={{...settings,mode:settings.mode==="blank"?"generate":settings.mode}} startingOption={false} onChange={v=>{change();setSettings(v);}}/>
       <button className="st-button" disabled={!ready} onClick={()=>start("layout")}>Preview a Starting Layout</button>
       {areaSettings}
      </fieldset>
     </div></details>
    </div>}
   </div>
   <aside hidden={!proposal||!options} className={styles.panel} aria-label="Town creation settings">
    {proposal&&<><h3>Make it your kind of town</h3><p>Change a choice, then Update Preview. Your current preview stays visible.</p>
     <fieldset disabled={pending||!!attempt||!!recovered}><TownGenerationFields value={settings} startingOption={false} onChange={v=>{change();setSettings(v);}}/>{areaSettings}</fieldset>
     <button className="st-button is-primary" disabled={pending||!!attempt||!!recovered} onClick={()=>void preview()}>{pending?"Building preview…":"Update Preview"}</button>
     <button className="st-button" disabled={pending||!!attempt||!!recovered} onClick={()=>{const chosen={...settings,seed:crypto.randomUUID()};change();setSettings(chosen);void preview(chosen);}}>Try Another Layout</button>
    </>}
   </aside>
  </div>
  <footer className={styles.footer} role="status">{pending?settings.mode==="blank"?"Preparing empty ground and saving your map…":"Preparing your town…":proposal?"Next: Save & Open Town Map. You can edit every road and building afterward.":"Choose Generate a Town or Draw My Own to begin."}</footer>
 </section>;
}
