"use client";
import {useId,useState} from "react";
import type {TerrainKeyboardSettings,TerrainKeyboardStatus,PrecisionPoint} from "./terrain-keyboard";
import {keyboardIncrement} from "./terrain-keyboard";
import styles from "./terrain.module.css";

export function TerrainKeyboardControls({settings,onSettings,status,onFocus,onPosition,brushSummary,saveStatus}:{settings:TerrainKeyboardSettings;onSettings:(value:TerrainKeyboardSettings)=>void;status:TerrainKeyboardStatus|null;onFocus:()=>void;onPosition:(point:PrecisionPoint,units:"samples"|"world")=>void;brushSummary:string;saveStatus?:string}){
 const help=useId(),[units,setUnits]=useState<"samples"|"world">("samples"),[x,setX]=useState(""),[y,setY]=useState("");
 const value=(n:number)=>Number(n.toPrecision(12)).toLocaleString(undefined,{maximumFractionDigits:8});
 return <section className={styles.keyboardDock} aria-label="Keyboard Sculpting Mode" data-active={settings.enabled?"1":"0"}>
  <button type="button" className="st-button is-secondary" aria-pressed={settings.enabled} aria-describedby={help} onClick={()=>{onSettings({...settings,enabled:!settings.enabled});if(!settings.enabled)requestAnimationFrame(onFocus);}}>{settings.enabled?"Exit Keyboard Sculpting Mode":"Keyboard Sculpting Mode"}</button>
  {settings.enabled&&<>
   <p className={styles.keyboardStatus} role="status">{status?.stroking?"Stroke active — Shift+Enter to finish; Esc to cancel.":status?.focused?"Keyboard mode active — map focused.":"Keyboard mode paused — focus the map to edit."} {status&&!status.editable&&status.target==="terrain"&&"Terrain editing unavailable; resolve permission, preview or source restrictions first."}</p>
   {status&&<output aria-label="Precision cursor position">Column {value(status.point.x)}, row {value(status.point.y)}<br/>World east {value(status.world.x)} m, south {value(status.world.y)} m<br/>Source step: {value(status.spacing.x)} m east/west × {value(status.spacing.y)} m north/south{status.vertex>=0&&<><br/>{status.target} point {status.vertex+1} of {status.vertices}</>}</output>}
   <p>{brushSummary}</p>{saveStatus&&<p role="status">{saveStatus}</p>}
   <label>Arrow movement<select aria-label="Keyboard movement increment" value={settings.movement} onChange={e=>onSettings({...settings,movement:e.target.value as TerrainKeyboardSettings["movement"]})}><option value="single">Single source sample</option><option value="fine">Fine ({settings.fine} samples)</option><option value="coarse">Coarse ({settings.coarse} samples)</option></select></label>
   <button type="button" className="st-button is-secondary" onClick={onFocus}>Focus map for keyboard editing</button>
   <details><summary>Instructions & precision controls</summary>
    <p id={help}>Choose a sculpt tool and its brush settings first. While the map has focus, arrows move the visible cursor by source samples. Hold Shift for coarse steps. Enter stamps once. Shift+Enter starts a stroke; move with arrows, then Shift+Enter finishes it as one Undo step. Esc cancels an unfinished stroke, or exits keyboard mode. Completed terrain edits autosave. Use Review changes to recover interrupted work and retry its original save.</p>
    <p>Click the map to position the cursor. V selects the next supported polygon/path point; Shift+V selects the previous point. Arrows move that point through its normal preview controls. Enter adds a point when drawing a path or regional outline. C brings the cursor into view. Space-drag pans; +/− zoom and F fits the map. Typing in these controls never sculpts. Moving focus away cancels an unfinished keyboard stroke.</p>
    <p>World coordinates use metres east and south from the top-left origin of the World frame. No latitude/longitude is inferred for an unreferenced World. Zooming changes the view, not sample spacing. Region edges, inherited protection and editing permissions still apply.</p>
    <div className={styles.keyboardFields}>{(["fine","coarse"] as const).map(key=><label key={key}>{key==="fine"?"Fine step (samples)":"Coarse step (samples)"}<input aria-label={key==="fine"?"Keyboard fine step":"Keyboard coarse step"} type="number" min={1} max={256} step={1} value={settings[key]} onChange={e=>{const n=Number(e.target.value);if(keyboardIncrement(n))onSettings({...settings,[key]:n});}}/></label>)}</div>
    <form onSubmit={e=>{e.preventDefault();if(x.trim()&&y.trim())onPosition({x:Number(x),y:Number(y)},units);}}>
     <label>Position units<select aria-label="Precision position units" value={units} onChange={e=>setUnits(e.target.value as typeof units)}><option value="samples">Source column / row</option><option value="world">World east / south (m)</option></select></label>
     <div className={styles.keyboardFields}><label>{units==="samples"?"Column":"World east (m)"}<input aria-label="Precision position X" type="number" step="any" value={x} required onChange={e=>setX(e.target.value)}/></label><label>{units==="samples"?"Row":"World south (m)"}<input aria-label="Precision position Y" type="number" step="any" value={y} required onChange={e=>setY(e.target.value)}/></label></div>
     <button type="submit" className="st-button is-secondary">Position precision cursor</button>
    </form>
   </details>
   {status?.message&&<p role="status">{status.message}</p>}
  </>}
  {!settings.enabled&&<span id={help} className="sr-only">Move and stamp with source-resolution precision. Enable to see instructions.</span>}
 </section>;
}
