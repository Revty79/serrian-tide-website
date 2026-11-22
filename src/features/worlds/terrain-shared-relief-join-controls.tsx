"use client";
import {useState} from "react";
import type {TerrainFrame} from "./terrain-refinement";
import type {SharedReliefJoinReview} from "./terrain-shared-relief-join-review";
import styles from "./terrain-advanced-workshop.module.css";

type Source=SharedReliefJoinReview["sources"][number];
function SourceReview({source,name,onFocus}:{source:Source;name:string;onFocus:(frame:TerrainFrame)=>void}){
 const [index,setIndex]=useState(0),supports=source.supports,current=Math.min(index,supports.length-1),selected=supports[current],
  distance=(s:Source["supports"][number])=>s.edge==="east"?s.index/source.rows*source.frame.height:source.frame.height+s.index/source.columns*source.frame.width,
  distances=supports.map(distance),left=Math.min(...distances),right=Math.max(...distances),
  low=Math.min(...supports.map(s=>Math.min(s.before,s.after))),high=Math.max(...supports.map(s=>Math.max(s.before,s.after))),
  x=(n:number)=>30+(n-left)/Math.max(1,right-left)*580,y=(n:number)=>130-(n-low)/Math.max(1,high-low)*105,
  line=(side:"before"|"after")=>supports.map((s,i)=>{const px=x(distances[i]),py=y(s[side]),last=supports[i-1],joined=last&&last.edge===s.edge&&last.index+1===s.index;return joined?`L${px},${py}`:`M${px-.7},${py}h1.4M${px},${py}`;}).join(""),
  outside=supports.filter(s=>s.outsideWorkArea).length,reconstruction=supports.filter(s=>s.reconstruction).length,maxChange=Math.max(...supports.map(s=>Math.abs(s.after-s.before)));
 return <details className={styles.joinSource} open><summary>{name}: {supports.length.toLocaleString()} changed border supports</summary>
  <p>{outside.toLocaleString()} {reconstruction?"are outside the selected editable window":"are beyond the terrain window"}. Largest change: {maxChange.toFixed(2)} m. Saved parent context {source.oldParentRevision}; proposed {source.newParentRevision}.</p>
  {!!reconstruction&&<p>{reconstruction.toLocaleString()} lie beyond the outline and are derived only from selected native height supports. Their complete contributing heights are included in this review.</p>}
  <button type="button" className="st-button is-secondary" onClick={()=>onFocus(source.frame)}>Show source border on map</button>
  <p>Height range: {low.toFixed(1)} to {high.toFixed(1)} m. Span along the reviewed border: {right-left<1000?`${(right-left).toFixed(1)} m`:`${((right-left)/1000).toFixed(2)} km`}.</p>
  <svg className={styles.joinPlot} viewBox="0 0 640 160" preserveAspectRatio="none" role="img" aria-label={`${name}: saved and proposed border elevations`}>
   <title>Every changed border support; gaps separate non-adjacent supports.</title>
   <path d="M30,20V130H610" className={styles.joinAxis}/>
   <path d={line("before")} className={styles.joinBefore}/><path d={line("after")} className={styles.joinAfter}/>
  </svg>
  <p className={styles.joinLegend}><span>Dashed: saved</span><span>Solid: proposed</span></p>
  <label>Inspect reviewed support<input aria-label={`Reviewed support number for ${name}`} type="number" min={1} max={supports.length} value={current+1} onChange={e=>setIndex(Math.max(0,Math.min(supports.length-1,Math.trunc(Number(e.target.value)||1)-1)))}/></label>
  <output className={styles.status}>{selected.edge==="east"?"East":"South"} border support {selected.index}: saved {selected.before.toString()} m; proposed {selected.after.toString()} m. {selected.reconstruction?"Beyond the drawn outline; derived from selected native heights.":selected.outsideWorkArea?"Beyond the terrain window.":"Inside the terrain window."}</output>
  {selected.reconstruction&&<details className={styles.joinSource} open><summary>Selected contributing heights</summary><ul>{selected.reconstruction.map((node,i)=><li key={i}>East {node.x.toString()} m, south {node.y.toString()} m: saved {node.before} m; proposed {node.after} m. Contribution {(node.weight*100).toPrecision(6)}%.</li>)}</ul></details>}
 </details>;
}
export function SharedReliefJoinControls({review,names,reviewed,onReviewed,onFocus}:{review:SharedReliefJoinReview;names:Map<string,string>;reviewed:boolean;onReviewed:(value:boolean)=>void;onFocus:(frame:TerrainFrame)=>void}){
 return <section className={styles.joinReview} aria-label="Complete dry border review"><h4>Review additional dry border joins</h4>
  <p>The terrain map previews the edited native windows. These graphs show the complete inherited border change, including supports beyond those windows. Map outlines identify each source border.</p>
  {review.sources.map(source=><SourceReview key={source.sourceId+review.reviewHash} source={source} name={names.get(source.sourceId)??"Native terrain source"} onFocus={onFocus}/>)}
  <label className={styles.check}><input type="checkbox" aria-label="I reviewed the complete dry border joins" checked={reviewed} onChange={e=>onReviewed(e.target.checked)}/> I reviewed the complete dry border joins, including changes beyond the terrain window.</label>
 </section>;
}
