"use client";
import {useState} from "react";
import {GuidedField} from "@/components/field-guidance";
import type {useTerrainWater} from "./terrain-water-client";
import {WaterSystemControls} from "./terrain-water-controls";
import type {HydroEdge} from "./terrain-hydrology";
import type {TerrainFrame,TerrainViewport} from "./terrain-refinement";
import type {MeasurementPreferences} from "./terrain-units";
import styles from "./terrain.module.css";

type State=ReturnType<typeof useTerrainWater>;
function viewFrame(state:State,view:TerrainViewport|undefined,selected:TerrainFrame,scope:string):TerrainFrame{
  const world=state.sources?.world;if(!world)return selected;
  if(scope==="world")return {x:0,y:0,width:world.width,height:world.height};
  if(scope!=="view"||!view)return selected;
  const width=Math.min(world.width,view.right-view.left),x=world.wrap?((view.left%world.width)+world.width)%world.width:Math.max(0,view.left),y=Math.max(0,view.top);
  return {x:world.wrap?width===world.width?0:x:x,y,width:world.wrap?width:Math.max(0,Math.min(world.width,view.right)-x),height:Math.max(0,Math.min(world.height,view.bottom)-y)};
}
export function TerrainHydrologyControls({state,editable,selectedFrame,viewport,onMap,preferences}:{state:State;editable:boolean;selectedFrame:TerrainFrame;viewport?:TerrainViewport;onMap:()=>void;preferences?:MeasurementPreferences}){
  const [scope,setScope]=useState("source"),[areaText,setAreaText]=useState(""),[version,setVersion]=useState(0),[draft,setDraft]=useState<{key:string;name:string;kind:HydroEdge["flowKind"];reason:string;protectedEdit:boolean}>(),[rawVertex,setVertex]=useState(0);
  const frame=viewFrame(state,viewport,selectedFrame,scope),defaultArea=Math.max(1,frame.width*frame.height/2000),requestedArea=areaText===""?defaultArea:Number(areaText)*1e6,validFrame=frame.width>0&&frame.height>0&&frame.y<(state.sources?.world.height??Infinity),validArea=Number.isFinite(requestedArea)&&requestedArea>0&&requestedArea<=1e18;
  const shown=state.selectedPreview?state.preview:state.layer,edge=shown?.edges.find(e=>e.id===state.selected),from=shown?.nodes.find(n=>n.id===edge?.from),to=shown?.nodes.find(n=>n.id===edge?.to);
  const formKey=JSON.stringify([edge?.id,edge?.name,edge?.flowKind,edge?.exceptionReason,edge?.protected,state.selectedPreview]),form=draft?.key===formKey?draft:{key:formKey,name:edge?.name??"",kind:edge?.flowKind??"manual",reason:edge?.exceptionReason??"",protectedEdit:edge?.protected??false},name=form.name,kind=form.kind,reason=form.reason,protectedEdit=form.protectedEdit,vertex=Math.min(rawVertex,Math.max(0,(edge?.points.length??1)-1));
  const currentList=state.selectedPreview?state.preview?.edges??[]:state.layer.edges;
  return <section aria-label="Water authoring">
    <h3>Water & drainage</h3>
    <p>Follow the saved land to suggest rivers, then choose what belongs in your World. Waterways have their own authoring and history; they never carve or repaint your terrain.</p>
    {!state.remote&&<p role="status">Loading water authoring...</p>}
    {state.remote&&!state.remote.available&&<p role="alert"><strong>MIGRATION 0141 REQUIRED</strong> to save waterways. You can review temporary drainage; existing terrain and artwork remain available.</p>}
    <WaterSystemControls state={state} frame={frame} minimumArea={requestedArea} onMap={onMap} preferences={preferences}/>
    {state.stale&&<p role="status">Terrain has changed since these waterways were analysed. Existing routes stay in place. Suggest rivers again and deliberately accept the changes you want.</p>}
    <label><input type="checkbox" checked={state.viewShown} onChange={e=>state.setViewShown(e.target.checked)}/> Show water overlay</label>
    <label><input type="checkbox" checked={state.previewShown} onChange={e=>state.setPreviewShown(e.target.checked)}/> Show temporary river suggestions</label>
    <GuidedField label="Geography to review" help="All calculations use saved terrain. The selected area chooses which river sources to suggest; downstream connections continue toward their actual outlet, including across refinement boundaries." controlClassName="st-control">
      <select value={scope} disabled={state.running} onChange={e=>setScope(e.target.value)}><option value="source">Selected terrain source</option><option value="view">Current view</option><option value="world">Whole World</option></select>
    </GuidedField>
    <div className={styles.tools}>
      <button type="button" className="st-button is-primary" disabled={!editable||!state.sources||state.running||!!state.recovered||!validArea||!validFrame} onClick={()=>{onMap();state.setMode("select");void state.suggest(frame,requestedArea);}}>Suggest rivers</button>
      <button type="button" className="st-button is-secondary" disabled={!state.canEdit||!state.sources||state.running||!validArea} onClick={()=>{onMap();state.addSource(frame,requestedArea);}}>Add river source</button>
      <button type="button" className="st-button is-secondary" onClick={()=>{onMap();state.setMode("select");}}>Inspect waterway on map</button>
      {state.running&&<button type="button" className="st-button is-secondary" onClick={state.cancel}>Cancel drainage calculation</button>}
    </div>
    {!validFrame&&<p role="alert">Move the view onto the map or choose another geography to review.</p>}
    {state.running&&<p role="status">{state.stage} <progress max={1} value={state.progress} aria-label="Drainage calculation progress"/> {Math.round(state.progress*100)}%</p>}
    <p data-testid="water-status">{state.saving?"Saving waterways... ":state.dirty?"Water draft has unsaved changes. ":""}{state.notice}</p>
    {state.mode!=="select"&&<p role="status">{state.mode==="source"?"Source placement: tap saved land; the new downstream route is only a suggestion.":"Position editing: choose the new point on the map. This is creator-authored flow."} On touch, enable one-finger editing to place points; two fingers still navigate.</p>}
    {state.error&&<p role="alert">{state.error}</p>}
    {state.recovered&&<aside><p>A separate water draft survived interruption. Saved terrain and materials are unchanged.</p><button type="button" className="st-button is-secondary" onClick={state.restore}>Restore water draft</button></aside>}
    {state.preview&&<div className={styles.tools}>
      <button type="button" className="st-button is-secondary" disabled={!state.canEdit||!state.preview.edges.length||state.running} onClick={()=>state.accept()}>Accept all suggested waterways</button>
      <button type="button" className="st-button is-secondary" disabled={state.running} onClick={state.clearPreview}>Discard river suggestions</button>
      {state.preview.analyses[0]?.focus.x===0&&state.preview.analyses[0]?.focus.y===0&&state.preview.analyses[0]?.focus.width===state.sources?.world.width&&state.preview.analyses[0]?.focus.height===state.sources?.world.height&&state.layer.edges.length>0&&<button type="button" className="st-button is-secondary" disabled={!state.canEdit||state.running} onClick={state.replaceUnprotected}>Replace unprotected derived network</button>}
    </div>}
    <p>Dashed light-blue lines are suggestions. Blue lines are accepted/draft terrain-derived routes; teal is creator-positioned and purple marks a described fictional exception. Line weight shows contributing area, not measured river width or climate-informed discharge.</p>
    <GuidedField label="Waterway list" help="Choose a temporary suggestion or a course in your authoring draft. Selecting never saves it." controlClassName="st-control"><select value={state.selectedPreview?"preview":"draft"} onChange={e=>{const preview=e.target.value==="preview";state.setSelection((preview?state.preview?.edges:state.layer.edges)?.[0]?.id??null,preview);}}><option value="preview">Suggestions ({state.preview?.edges.length??0})</option><option value="draft">Authored draft ({state.layer.edges.length})</option></select></GuidedField>
    <GuidedField label="Waterway" help="Channels share source and junction identities. Accepting a suggested course also retains its downstream connections." controlClassName="st-control"><select value={edge?.id??""} onChange={e=>state.setSelection(e.target.value||null,state.selectedPreview)}><option value="">Choose a waterway</option>{currentList.map((e,i)=><option key={e.id} value={e.id}>{e.name||`Waterway ${i+1}`} · {(e.drainageM2/1e6).toLocaleString(undefined,{maximumFractionDigits:3})} km² upstream</option>)}</select></GuidedField>
    {edge&&<>
      <p>{from?.kind.replaceAll("-"," ")} → {to?.kind.replaceAll("-"," ")}. {shown?.edges.filter(e=>e.to===edge.from).length??0} upstream connection(s), {shown?.edges.filter(e=>e.from===edge.to).length??0} downstream connection(s). Flow: {edge.flowKind==="derived"?"derived from the pinned numerical analysis":edge.flowKind==="exception"?"deliberate fictional exception":"creator-positioned; natural flow is not certified"}.</p>
      {to?.kind==="closed-sink"&&<p>Closed drainage basin.{to.spillM!==null?` A potential lake spill level is ${to.spillM.toFixed(1)} m. This diagnostic does not fill a lake or alter heights.`:" A lower external spill is not established by this coverage."}</p>}
      {state.selectedPreview?<div className={styles.tools}><button type="button" className="st-button is-primary" disabled={!state.canEdit||state.running} onClick={()=>state.accept(edge.id)}>Accept waterway</button><button type="button" className="st-button is-secondary" onClick={()=>state.reject(edge.id)}>Reject waterway</button></div>:<>
        <GuidedField label="Waterway name" help="Name this channel or leave the generated working name. This is map authoring, not a new lore or gameplay record." controlClassName="st-control"><input value={name} maxLength={120} disabled={!state.canEdit} onChange={e=>setDraft({...form,name:e.target.value})}/></GuidedField>
        <GuidedField label="Flow interpretation" help="A terrain-derived route retains its original analysis. Moving a point makes it creator-authored. Use a described exception for deliberately unusual water." controlClassName="st-control"><select value={kind} disabled={!state.canEdit} onChange={e=>setDraft({...form,kind:e.target.value as HydroEdge["flowKind"]})}>{edge.flowKind==="derived"&&<option value="derived">Terrain-derived route</option>}<option value="manual">Creator-positioned route</option><option value="exception">Fictional flow exception</option></select></GuidedField>
        {kind==="exception"&&<GuidedField label="Flow exception explanation" help="Explain the magic, constructed channel or other deliberate departure from natural drainage. No new rules are inferred." controlClassName="st-control"><textarea value={reason} maxLength={1000} disabled={!state.canEdit} onChange={e=>setDraft({...form,reason:e.target.value})}/></GuidedField>}
        <label><input type="checkbox" checked={protectedEdit} disabled={!state.canEdit} onChange={e=>setDraft({...form,protectedEdit:e.target.checked})}/> Preserve this authored route during suggestion acceptance</label>
        <div className={styles.tools}><button type="button" className="st-button is-secondary" disabled={!state.canEdit} onClick={()=>state.editEdge(edge.id,{name,flowKind:kind,exceptionReason:reason,protected:protectedEdit})}>Apply waterway details</button><button type="button" className="st-button is-secondary" disabled={!state.canEdit} onClick={()=>state.remove(edge.id)}>Remove waterway</button></div>
        <details className={styles.details}><summary>Adjust this waterway</summary>
          <GuidedField label="Waterway point to move" help="Choose a path point, then its new position on the map. Shared junction endpoints move together. This explicit adjustment is marked creator-authored and does not change elevations." controlClassName="st-control"><select value={vertex} disabled={!state.canEdit} onChange={e=>setVertex(Number(e.target.value))}>{edge.points.map((p,i)=><option key={i} value={i}>{i===0?"Source / upstream junction":i===edge.points.length-1?"Downstream junction / outlet":`Path point ${i+1}`}</option>)}</select></GuidedField>
          <button type="button" className="st-button is-secondary" disabled={!state.canEdit} onClick={()=>{onMap();state.movePoint(vertex);}}>Move point on map</button>
        </details>
      </>}
    </>}
    <div className={styles.tools}>
      {editable&&<><button type="button" className="st-button is-primary" disabled={!state.remote?.available||!state.dirty||state.saving||!!state.recovered} onClick={()=>void state.save()}>Save waterways</button><button type="button" className="st-button is-secondary" onClick={state.exportDraft}>Export water draft</button><button type="button" className="st-button is-secondary" disabled={state.saving} onClick={()=>void state.reload()}>Load saved waterways</button></>}
    </div>
    {!!state.remote?.history.length&&<details className={styles.details}><summary>Accepted water history</summary><GuidedField label="Saved water revision" help="Restoring retains the old network and creates a separate draft. Save that draft as a new revision before making further edits." controlClassName="st-control"><select value={version} onChange={e=>setVersion(Number(e.target.value))}><option value={0}>Choose a revision</option>{state.remote.history.map(v=><option key={v.revision} value={v.revision}>Revision {v.revision}{v.restoredFromRevision?` (restored from ${v.restoredFromRevision})`:""}</option>)}</select></GuidedField><button type="button" className="st-button is-secondary" disabled={!editable||!version||state.dirty||state.saving||!!state.recovered} onClick={()=>void state.restoreVersion(version)}>Restore water revision</button></details>}
    <details className={styles.details}><summary>Drainage detail & assumptions</summary>
      <GuidedField label="Minimum contributing area (km²)" help="Larger values suggest fewer, larger channels. The default adapts to the chosen geography. Channels below four analysis cells remain below this provisional analysis resolution." controlClassName="st-control"><input type="number" min={.000001} max={1e12} step="any" placeholder={(defaultArea/1e6).toPrecision(4)} value={areaText} disabled={state.running} onChange={e=>setAreaText(e.target.value)}/></GuidedField>
      {!validArea&&<p role="alert">Enter a positive contributing area within this World&#39;s scale.</p>}
      <p>Runoff is provisionally uniform: accumulation means upstream land area. Rainfall, river volume, erosion and climate are not simulated. Flat areas route deterministically to a lower exit; closed depressions remain sinks. Boundary exits are not assumed to be ocean outlets.</p>
      {state.preview?.analyses[0]&&<p>Accepted source analysis: {state.preview.analyses[0].pins.map(p=>`${p.spacingX.toLocaleString(undefined,{maximumFractionDigits:2})} × ${p.spacingY.toLocaleString(undefined,{maximumFractionDigits:2})} m`).join("; ")}. These are numerical analysis spacings, not photographic pixels.</p>}
      {state.metrics&&<p data-testid="water-performance">{state.metrics.nodes.toLocaleString()} connected analysis cells; calculation {state.metrics.analysisMs.toFixed(1)} ms, complete request {state.wallMs.toFixed(1)} ms; retained/working typed arrays {(state.metrics.workingBytes/1048576).toFixed(1)} MiB. {state.metrics.closedBasins} closed basin(s), {state.metrics.seaOutlets} coastal outlet(s), {state.metrics.boundaryOutlets} fixed-edge exit(s). JavaScript and browser overhead are additional.</p>}
      <p>Water undo retains up to 20 steps within a 262,144-point history budget. Suggestions and analysis never save themselves.</p>
    </details>
  </section>;
}
