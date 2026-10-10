import { memo, useMemo } from "react";
import type { MapDraft } from "./atlas";
import { curvedPath } from "./cartography";
import { defaultSettlementState, settlementLayer, shapePoints, type SettlementShape, type SettlementEntity } from "./settlement";
import styles from "./settlement.module.css";
const ShapeArt=memo(function ShapeArt({shape:s,kind,selected,units}:{shape:SettlementShape;kind:SettlementEntity["kind"];selected:boolean;units:number}){
 const cls=kind==="building"?styles.building:kind==="district"?styles.district:kind==="space"?styles.space:kind==="waterway"?styles.water:kind==="wall"?styles.wall:styles.road;
 return <g data-settlement={s.id} data-geography={s.geographyId} data-selected={selected} className={styles.object}>
 {s.type==="area"?<g className={cls} data-variant={s.variant}><polygon points={s.points.map(p=>`${p.x},${p.y}`).join(" ")}/>{kind==="building"&&<path d={`M ${s.points[0].x} ${s.points[0].y} L ${s.points[Math.floor(s.points.length/2)].x} ${s.points[Math.floor(s.points.length/2)].y}`} className={styles.roof}/>}</g>:s.type==="line"?<g className={cls} data-variant={s.variant}><path d={curvedPath(s.points,s.curve)} strokeWidth={s.width+4} className={styles.under}/><path d={curvedPath(s.points,s.curve)} strokeWidth={s.width}/><path d={curvedPath(s.points,s.curve)} strokeWidth={Math.max(s.width+6,14*units)} className={styles.hit}/></g>:<g className={styles.landmark} data-variant={s.variant} transform={`translate(${s.point.x} ${s.point.y}) rotate(${s.rotation})`}><circle r={s.size}/>{s.variant==="gate"?<path d={`M ${-s.size} ${s.size} L ${-s.size} ${-s.size} L ${s.size} ${-s.size} L ${s.size} ${s.size}`}/>:s.variant==="tower"?<rect x={-s.size*.5} y={-s.size*.7} width={s.size} height={s.size*1.4}/>:<path d={`M 0 ${-s.size*.7} L ${s.size*.7} 0 L 0 ${s.size*.7} L ${-s.size*.7} 0 Z`}/>}</g>}
 </g>;
});
export const SettlementScene=memo(function SettlementScene({draft,selectedId,units=1,editable=false,explorable=false}:{draft:MapDraft;selectedId?:string|null;units?:number;editable?:boolean;explorable?:boolean}){
 const entities=useMemo(()=>new Map((draft.settlementEntities??[]).map(e=>[e.geographyId,e])),[draft.settlementEntities]);
 const names=useMemo(()=>new Map(draft.geographies.map(g=>[g.id,g.name])),[draft.geographies]);
 const state=draft.settlementState??defaultSettlementState();
 const ordered=useMemo(()=>[...(draft.settlementShapes??[])].filter(s=>!s.archived).sort((a,b)=>{const order={district:0,space:1,waterway:2,street:3,wall:4,building:5,landmark:6};return order[entities.get(a.geographyId)!.kind]-order[entities.get(b.geographyId)!.kind];}),[draft.settlementShapes,entities]);
 return <g className={styles.scene} data-style={draft.presentation?.style??"parchment"}>{ordered.map(s=>{const e=entities.get(s.geographyId);if(!e)return null;const layer=state.layers[settlementLayer(e.kind)];if(!layer.visible)return null;return <ShapeArt key={s.id} shape={s} kind={e.kind} selected={s.id===selectedId} units={units}/>;}).map((art,i)=>art&&<g key={ordered[i].id} pointerEvents={explorable||editable&&!state.layers[settlementLayer(entities.get(ordered[i].geographyId)!.kind)].locked?undefined:"none"}>{art}</g>)}
 {state.layers.labels.visible&&ordered.map(s=>{const e=entities.get(s.geographyId);if(!e||!state.layers[settlementLayer(e.kind)].visible)return null;const p=shapePoints(s),x=p.reduce((n,q)=>n+q.x,0)/p.length,y=p.reduce((n,q)=>n+q.y,0)/p.length;const width=Math.max(...p.map(q=>q.x))-Math.min(...p.map(q=>q.x));if(e.kind==="building"&&width<70*units&&selectedId!==s.id)return null;return <text key={s.id} className={styles.label} x={x} y={y+(e.kind==="landmark"?30*units:0)} fontSize={Math.max(11,11*units)} textAnchor="middle" data-settlement-label>{names.get(s.geographyId)}</text>;})}</g>;
});
