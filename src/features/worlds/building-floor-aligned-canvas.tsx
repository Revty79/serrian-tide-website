"use client";
import {useImperativeHandle,useMemo,useRef,type ComponentProps} from "react";
import {FloorCanvas,type FloorCanvasHandle} from "./building-floor-canvas";
import {alignedFloorDesign,alignedFloorPoint,buildingFloorAlignment,sourceFloorAngle,sourceFloorFeature,sourceFloorPoint} from "./building-floor-alignment";
import type {TownPoint} from "./town-map";
import styles from "./building-floor.module.css";
type Props=Omit<ComponentProps<typeof FloorCanvas>,"onPlace">&{footprint:TownPoint[];onPlace:(point:TownPoint,rotation?:number)=>void};
/** Adapt only the working view; all accepted editing, locks, undo/recovery and saves use canonical geometry. */
export function AlignedFloorCanvas(p:Props){
 const a=buildingFloorAlignment(p.footprint,p.frame),design=useMemo(()=>alignedFloorDesign(p.design,a),[p.design,a]),reference=useMemo(()=>p.reference?alignedFloorDesign(p.reference,a):undefined,[p.reference,a]),drawing=useMemo(()=>p.drawing.map(q=>alignedFloorPoint(q,a)),[p.drawing,a]),handle=useRef<FloorCanvasHandle>(null);
 useImperativeHandle(p.handleRef,()=>({fit:()=>handle.current?.fit(),zoom:n=>handle.current?.zoom(n),center:q=>handle.current?.center(alignedFloorPoint(q,a))}),[a]);
 return <div className={styles.alignedCanvas} data-floor-alignment={JSON.stringify(a)}><FloorCanvas {...p} handleRef={handle} design={design} reference={reference} frame={a.frame} drawing={drawing} onDrawing={points=>p.onDrawing(points.map((q,i)=>p.drawing[i]&&q.x===drawing[i]?.x&&q.y===drawing[i]?.y?p.drawing[i]:sourceFloorPoint(q,a)))} onChange={f=>p.onChange(sourceFloorFeature(f,a,p.design.features.find(old=>old.id===f.id)))} onPlace={q=>p.onPlace(sourceFloorPoint(q,a),sourceFloorAngle(p.brush.rotation,a))}/></div>;
}
