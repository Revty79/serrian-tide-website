import { memo, useId, useMemo } from "react";
import type { MapDraft } from "./atlas";
import { interiorCenter, openingAnchor, wallSegments, type InteriorEntity, type InteriorShape } from "./interior";
import styles from "./interior.module.css";

function ObjectMark({symbol}:{symbol:string}) {
 const frame=<rect x="-48" y="-48" width="96" height="96" rx="5"/>;
 if(symbol==="trap")return <><path d="M 0 -44 L 44 38 H -44 Z"/><path d="M 0 -22 V 12 M -3 23 H 3"/></>;
 if(symbol==="hazard")return <><path d="M -40 -20 L -15 -40 L 12 -28 L 40 -5 L 28 28 L 0 42 L -35 22 Z"/><path d="M -20 -12 L 10 24 M 18 -18 L -15 25"/></>;
 if(symbol==="annotation")return <><path d="M -36 -44 H 36 V 44 H -36 Z M -24 -20 H 22 M -24 0 H 22 M -24 20 H 12"/></>;
 if(symbol==="stairs"||symbol==="ramp"||symbol==="ladder")return <>{frame}{Array.from({length:7},(_,i)=><path key={i} d={`M -44 ${-36+i*12} H 44`}/>)}<path d="M 0 33 V -29 m -10 12 l 10 -12 l 10 12"/></>;
 if(symbol==="portal")return <><ellipse rx="35" ry="45"/><ellipse rx="24" ry="34"/><path d="M -9 0 Q 20 -20 14 6 Q -10 22 -9 0"/></>;
 if(symbol==="lift"||symbol==="shaft"||symbol==="hatch")return <>{frame}<path d="M -22 16 V -23 m -10 10 l 10 -10 l 10 10 M 22 -16 V 23 m -10 -10 l 10 10 l 10 -10"/></>;
 if(symbol==="table")return <><rect x="-46" y="-40" width="92" height="80" rx="14"/><path d="M -34 -28 H 34 V 28 H -34 Z"/></>;
 if(symbol==="chair")return <><path d="M -34 -35 H 34 V -15 H -34 Z M -34 -12 H 34 V 34 H -34 Z M -43 -8 V 26 M 43 -8 V 26"/></>;
 if(symbol==="bed")return <>{frame}<path d="M -44 -12 H 44 M 0 -42 V -17 M -42 -42 H 42 V -17 H -42 Z M -38 -4 V 36 H 38"/></>;
 if(symbol==="shelf"||symbol==="cabinet")return <>{frame}<path d="M -42 -16 H 42 M -42 16 H 42 M -32 -42 V -17 M -17 -42 V -17 M 8 -42 V -17 M 25 -42 V -17 M -24 20 V 42 M 12 20 V 42"/></>;
 if(symbol==="desk"||symbol==="counter")return <>{frame}<path d="M -44 -12 H 44 M 12 -44 V -13 M 28 4 V 37 M 10 22 H 44"/></>;
 if(symbol==="chest")return <><rect x="-46" y="-32" width="92" height="64" rx="8"/><path d="M -30 -32 V 32 M 30 -32 V 32 M -8 -8 H 8 V 8 H -8 Z"/></>;
 if(symbol==="fireplace")return <><path d="M -48 -46 H 48 V 45 H 32 V -18 H -32 V 45 H -48 Z"/><path d="M -18 36 Q -35 8 -9 0 Q -9 19 4 7 Q 32 30 12 39 Z"/></>;
 if(symbol==="column")return <><circle r="42"/><circle r="28"/><path d="M -19 -19 L 19 19 M 19 -19 L -19 19"/></>;
 if(symbol==="machinery")return <>{frame}<circle r="26"/><circle r="10"/><path d="M -35 0 H -26 M 26 0 H 35 M 0 -35 V -26 M 0 26 V 35"/></>;
 if(symbol==="decoration")return <><circle r="35"/><path d="M 0 -28 L 8 -7 L 28 0 L 8 7 L 0 28 L -8 7 L -28 0 L -8 -7 Z"/></>;
 return <><path d="M 0 -44 L 44 0 L 0 44 L -44 0 Z"/><circle r="18"/></>;
}
export const ShapeArt=memo(function ShapeArt({shape,entity,shapes,selected,units}:{shape:InteriorShape;entity:InteriorEntity;shapes:InteriorShape[];selected:boolean;units:number}) {
 const attrs={"data-interior":shape.id,"data-entity":entity.id,"data-geography":entity.geographyId??undefined,className:`${styles.shape} ${selected?styles.selected:""}`};
 if(shape.variant==="area")return <g {...attrs}><polygon className={styles.room} points={shape.points.map(p=>`${p.x},${p.y}`).join(" ")}/></g>;
 if(shape.variant==="wall")return <g {...attrs}>{wallSegments(shape,shapes).map((s,i)=><g key={i}><path className={styles.wallHit} strokeWidth={Math.max(shape.width,12*units)} d={`M ${s.a.x} ${s.a.y} L ${s.b.x} ${s.b.y}`}/><path className={styles.wall} strokeWidth={shape.width} d={`M ${s.a.x} ${s.a.y} L ${s.b.x} ${s.b.y}`}/></g>)}</g>;
 if(shape.variant==="opening"){let a;try{a=openingAnchor(shape,shapes);}catch{return null;}const w=shape.width;return <g {...attrs} transform={`translate(${a.x} ${a.y}) rotate(${a.angle})`}><rect className={styles.hit} x={-w/2} y={-12*units} width={w} height={24*units}/><g className={styles.opening}>
  {shape.style==="window"?<><path d={`M ${-w/2} -4 H ${w/2} M ${-w/2} 0 H ${w/2} M ${-w/2} 4 H ${w/2}`}/><path d={`M ${-w/2} -8 V 8 M ${w/2} -8 V 8`}/></>:shape.style==="door"?<><path d={`M ${-w/2} 0 V ${-w}`}/><path className={styles.swing} d={`M ${w/2} 0 A ${w} ${w} 0 0 0 ${-w/2} ${-w}`}/></>:shape.style==="double door"?<><path d={`M ${-w/2} 0 V ${-w/2} M ${w/2} 0 V ${-w/2}`}/><path className={styles.swing} d={`M 0 0 A ${w/2} ${w/2} 0 0 0 ${-w/2} ${-w/2} M 0 0 A ${w/2} ${w/2} 0 0 1 ${w/2} ${-w/2}`}/></>:<path d={`M ${-w/2} -10 V 10 M ${w/2} -10 V 10`}/>}</g></g>;}
 return <g {...attrs} transform={`translate(${shape.point.x} ${shape.point.y}) rotate(${shape.rotation})`}><rect className={styles.hit} x={-Math.max(shape.width/2,8*units)} y={-Math.max(shape.height/2,8*units)} width={Math.max(shape.width,16*units)} height={Math.max(shape.height,16*units)}/><g className={`${styles.object} ${entity.kind==="transition"?styles.transition:""}`} transform={`scale(${shape.width/100} ${shape.height/100})`}><ObjectMark symbol={shape.symbol}/></g></g>;
});
export const InteriorScene=memo(function InteriorScene({draft,selectedId,unitsPerPixel=1}:{draft:MapDraft;selectedId?:string|null;unitsPerPixel?:number}) {
 const pattern=useId().replaceAll(":",""),shapes=useMemo(()=>draft.interiorShapes??[],[draft.interiorShapes]),state=draft.interiorState;
 const entities=useMemo(()=>new Map((draft.interiorEntities??[]).map(e=>[e.id,e])),[draft.interiorEntities]);
 const sorted=useMemo(()=>[...shapes].sort((a,b)=>["area","wall","opening","object"].indexOf(a.variant)-["area","wall","opening","object"].indexOf(b.variant)),[shapes]);
 const labels=useMemo(()=>{if(!state||!state.layers.labels.visible)return [];const occupied:{x:number;y:number;width:number;height:number}[]=[];return shapes.filter(s=>!s.archived).sort((a,b)=>Number(b.id===selectedId)-Number(a.id===selectedId)).flatMap(s=>{const e=entities.get(s.entityId),selected=s.id===selectedId||e?.id===selectedId;if(!e||!state.layers[e.kind].visible||!e.name||(!["room","transition","landmark"].includes(e.kind)&&!selected)||unitsPerPixel>4&&e.kind!=="room"&&!selected)return [];if(s.variant==="area"&&Math.max(...s.points.map(p=>p.x))-Math.min(...s.points.map(p=>p.x))<e.name.length*7*unitsPerPixel&&!selected)return [];const c=interiorCenter(s,shapes),x=c.x,y=c.y+(s.variant==="area"?0:35*unitsPerPixel),width=Math.min(e.name.length,42)*7*unitsPerPixel,height=18*unitsPerPixel,box={x:x-width/2,y:y-height,width,height};if(!selected&&occupied.some(b=>box.x<b.x+b.width&&box.x+box.width>b.x&&box.y<b.y+b.height&&box.y+box.height>b.y))return [];occupied.push(box);return [{id:s.id,x,y,text:e.name.slice(0,42)}];});},[state,shapes,entities,unitsPerPixel,selectedId]);
 if(!state)return null;
 return <g className={styles.scene}><defs><pattern id={pattern} width={state.flooring==="boards"?90:60} height="60" patternUnits="userSpaceOnUse"><path d={state.flooring==="boards"?"M 0 0 H 90 M 45 0 V 60":"M 0 0 H 60 V 60"} className={styles.floorLine}/></pattern></defs><rect className={styles.paper} width="2000" height="1200"/>{state.layers.flooring.visible&&state.flooring!=="plain"&&<rect width="2000" height="1200" fill={`url(#${pattern})`}/>}
 {sorted.filter(s=>!s.archived).map(s=>{const e=entities.get(s.entityId);return e&&state.layers[e.kind].visible?<ShapeArt key={s.id} shape={s} entity={e} shapes={shapes} selected={selectedId===s.id||selectedId===e.id} units={unitsPerPixel}/>:null;})}
 {labels.map(l=><text key={l.id} className={styles.label} x={l.x} y={l.y} fontSize={13*unitsPerPixel} textAnchor="middle" pointerEvents="none">{l.text}</text>)}</g>;
});
