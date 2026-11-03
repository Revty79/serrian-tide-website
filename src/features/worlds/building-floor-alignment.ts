import {floorRound,initialFloor,type FloorDesign,type FloorFeature,type FloorFrame} from "./building-floor";
import type {TownPoint} from "./town-map";

export type FloorAlignment={angle:number;offset:TownPoint;frame:FloorFrame};
const angle=(degrees:number)=>floorRound(((degrees+180)%360+360)%360-180)||0;
const rotate=(p:TownPoint,degrees:number)=>{const r=degrees*Math.PI/180;return {x:p.x*Math.cos(r)-p.y*Math.sin(r),y:p.x*Math.sin(r)+p.y*Math.cos(r)};};
/** A device-local working frame. The persisted building frame/footprint never change. */
export function buildingFloorAlignment(footprint:TownPoint[],frame:FloorFrame):FloorAlignment{
 const identity={angle:0,offset:{x:0,y:0},frame};if(footprint.length<3)return identity;
 const edges=footprint.map((a,i)=>{const b=footprint[(i+1)%footprint.length];return {length:Math.hypot(b.x-a.x,b.y-a.y),angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};}).sort((a,b)=>b.length-a.length),orientation=((edges[0].angle+45)%90+90)%90-45;
 if(Math.abs(orientation)<.05)return identity;
 // Freeform outlines retain their shape; only a clear shared wall axis defines an automatic grid.
 const total=edges.reduce((s,e)=>s+e.length,0),aligned=edges.filter(e=>Math.abs(Math.sin((e.angle-orientation)*Math.PI/90))<.035).reduce((s,e)=>s+e.length,0);if(aligned<total*.7)return identity;
 const corners=[{x:0,y:0},{x:frame.width,y:0},{x:frame.width,y:frame.height},{x:0,y:frame.height}].map(p=>rotate(p,-orientation)),min={x:Math.min(...corners.map(p=>p.x)),y:Math.min(...corners.map(p=>p.y))},anchor=rotate(footprint[0],-orientation),offset={x:Math.ceil(anchor.x-min.x)-anchor.x,y:Math.ceil(anchor.y-min.y)-anchor.y},width=Math.ceil(Math.max(...corners.map(p=>p.x))+offset.x),height=Math.ceil(Math.max(...corners.map(p=>p.y))+offset.y);
 // Preserve the existing 20km coordinate ceiling even for unusually large legacy interiors.
 if(width>20000||height>20000)return identity;
 return {angle:orientation,offset,frame:{...frame,x:0,y:0,width:Math.max(4,width),height:Math.max(4,height),rotation:0}};
}
export function alignedFloorPoint(p:TownPoint,a:FloorAlignment){if(!a.angle)return p;const q=rotate(p,-a.angle);return {x:floorRound(q.x+a.offset.x),y:floorRound(q.y+a.offset.y)};}
export function sourceFloorPoint(p:TownPoint,a:FloorAlignment){if(!a.angle)return p;const q=rotate({x:p.x-a.offset.x,y:p.y-a.offset.y},a.angle);return {x:floorRound(q.x),y:floorRound(q.y)};}
export const alignedFloorAngle=(value:number,a:FloorAlignment)=>a.angle?angle(value-a.angle):value;
export const sourceFloorAngle=(value:number,a:FloorAlignment)=>a.angle?angle(value+a.angle):value;
export function alignedFloorFeature(f:FloorFeature,a:FloorAlignment):FloorFeature{
 if(!a.angle||f.variant==="opening")return f;if(f.variant==="object")return {...f,point:alignedFloorPoint(f.point,a),rotation:alignedFloorAngle(f.rotation,a),destination:f.destination?{...f.destination,point:alignedFloorPoint(f.destination.point,a)}:null};return {...f,points:f.points.map(p=>({...p,...alignedFloorPoint(p,a)}))};
}
const samePoint=(a:TownPoint,b:TownPoint)=>a.x===b.x&&a.y===b.y;
/** Unchanged source coordinates/angles are restored byte-exactly, avoiding round-trip drift. */
export function sourceFloorFeature(f:FloorFeature,a:FloorAlignment,original?:FloorFeature):FloorFeature{
 if(!a.angle||f.variant==="opening")return f;
 if(f.variant==="object"){
  const previous=original?.variant==="object"?original:undefined,shown=previous?alignedFloorFeature(previous,a) as typeof f:undefined;
  return {...f,point:previous&&shown&&samePoint(f.point,shown.point)?previous.point:sourceFloorPoint(f.point,a),rotation:previous&&shown&&f.rotation===shown.rotation?previous.rotation:sourceFloorAngle(f.rotation,a),destination:f.destination?{...f.destination,point:previous?.destination&&shown?.destination&&samePoint(f.destination.point,shown.destination.point)?previous.destination.point:sourceFloorPoint(f.destination.point,a)}:null};
 }
 const previous=original&&"points" in original?new Map(original.points.map(p=>[p.id,p])):undefined;
 return {...f,points:f.points.map(p=>{const old=previous?.get(p.id);return {...p,...old&&samePoint(p,alignedFloorPoint(old,a))?old:sourceFloorPoint(p,a)};})};
}
export function alignedFloorDesign(d:FloorDesign,a:FloorAlignment):FloorDesign{return a.angle?{...d,features:d.features.map(f=>alignedFloorFeature(f,a))}:d;}
/** Generate with the same retained engine in building-aligned metres, then persist original coordinates. */
export function initialBuildingFloor(mode:"blank"|"outline"|"generate",footprint:TownPoint[],frame:FloorFrame,newId:()=>string,rooms=3){
 const a=buildingFloorAlignment(footprint,frame);if(!a.angle||mode!=="generate")return initialFloor(mode,footprint,frame,newId,rooms);
 const outline=footprint.map(p=>alignedFloorPoint(p,a)),d=initialFloor(mode,outline,a.frame,newId,rooms);return {...d,features:d.features.map(f=>{const source=sourceFloorFeature(f,a);return "points" in source&&"points" in f?{...source,points:source.points.map((p,i)=>{const index=outline.findIndex(q=>samePoint(q,f.points[i]));return index<0?p:{...p,...footprint[index]};})}:source;})};
}
