"use client";
import {GuidedField} from "@/components/field-guidance";
import type {TerrainGeometry} from "./terrain";
import type {TerrainPolygonPoint} from "./terrain-polygon-selection";
import styles from "./terrain.module.css";
import {TerrainCoordinateList} from "./terrain-coordinate-list-controls";

export function TerrainPolygonControls({points,onChange,shape,limit=256,fieldPrefix="points"}:{limit?:number;fieldPrefix?:string;points:TerrainPolygonPoint[];onChange:(points:TerrainPolygonPoint[])=>void;shape:TerrainGeometry}){
 return <section aria-label="Polygon selection corners">
  <p>Click corners on the preview, or enter exact sample coordinates below. The last corner joins the first. Only samples whose centres lie inside the outline can change; inherited protected samples stay intact.</p>
  <p>{points.length} of {limit} available polygon corners. Zoom in before placing nearby corners. On a wrapping World, use a selection narrower than half the World.</p>
  <TerrainCoordinateList width={shape.width} height={shape.height} limit={limit} boundary onChange={onChange}/>
  <div className={styles.actions}>
   <button type="button" className="st-button is-secondary" disabled={points.length>=limit} onClick={()=>{const p=points.at(-1);onChange([...points,{x:p?Math.min(shape.width,p.x+1):shape.width/2,y:p?Math.min(shape.height,p.y+1):shape.height/2}]);}}>Add polygon corner</button>
   <button type="button" className="st-button is-secondary" disabled={!points.length} onClick={()=>onChange(points.slice(0,-1))}>Remove last polygon corner</button>
  </div>
  <details className={styles.details}><summary>Edit polygon corner coordinates</summary>
   {points.map((p,i)=><div className={styles.controls} key={i}>
    {(["x","y"] as const).map(axis=><GuidedField key={axis} label={`Polygon corner ${i+1} ${axis==="x"?"column":"row"}`} help="An exact position in the current source's sample grid, including its outer boundary. Enter decimals for an outline between sample centres." controlClassName="st-control"><input type="number" step="any" min={0} max={axis==="x"?shape.width:shape.height} value={p[axis]} data-operation-field={`${fieldPrefix}.${i}.${axis}`} onChange={e=>onChange(points.map((v,n)=>n===i?{...v,[axis]:Number(e.target.value)}:v))}/></GuidedField>)}
    <button type="button" className="st-button is-secondary" onClick={()=>onChange(points.filter((_,n)=>n!==i))}>Remove polygon corner {i+1}</button>
   </div>)}
  </details>
 </section>;
}
