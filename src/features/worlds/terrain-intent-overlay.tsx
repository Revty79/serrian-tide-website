"use client";
import {intentPoint,type IntentPlan} from "./terrain-intent";
import type {TerrainViewport} from "./terrain-refinement";
export function TerrainIntentOverlay({plan,view,selected,move}:{plan:IntentPlan;view:TerrainViewport|undefined;selected:string;move:boolean}){
 if(!view)return null;
 return <svg aria-label="Temporary geographic plan" viewBox={`0 0 ${view.width} ${view.height}`} style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",overflow:"hidden"}}>
  {plan.features.map(f=>{const point=intentPoint(f,plan);return (plan.space.periodX?[-plan.space.periodX,0,plan.space.periodX]:[0]).map(offset=>{const x=(point.x+offset-view.left)*view.scale,y=(point.y-view.top)*view.scale,rx=f.width/2*view.scale,ry=f.height/2*view.scale;return <g key={f.id+"/"+offset} transform={`translate(${x},${y}) rotate(${f.angle})`}>{move&&<circle r={6} fill="var(--st-primary-bright)" stroke="var(--st-surface-deep)" strokeWidth={2}/>}<ellipse aria-label={`Move ${f.name}`} data-feature={f.id} rx={rx} ry={ry} fill="var(--st-primary-soft)" fillOpacity={.08} stroke={f.id===selected?"var(--st-primary-bright)":"var(--st-text-strong)"} strokeWidth={f.id===selected?3:1} strokeDasharray="6 4"/><text x={0} y={-ry-5} textAnchor="middle" fontSize={12} fill="var(--st-text-strong)" stroke="var(--st-surface-deep)" strokeWidth={3} paintOrder="stroke">{f.name}</text></g>;});})}
 </svg>;
}
