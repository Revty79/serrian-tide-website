import {useEffect,useRef,useState,type PointerEvent,type RefObject} from "react";
import type {AtlasGeography} from "./atlas-geographic-workspace";
import {moveGeographicExtent} from "./atlas-geographic-frame";
import type {GeographicBounds} from "./geographic";
type Position={x:number;y:number};
/** Native touch pointers; a two-finger view gesture never commits an artwork edit. */
export function useAtlasGeographicTouch(geo:AtlasGeography,svg:RefObject<SVGSVGElement|null>,enabled:boolean,onBegin:()=>void,onPreview?:(transform:string|undefined)=>void){
 const pointers=useRef(new Map<number,Position>()),pinch=useRef<{distance:number;center:Position;bounds:GeographicBounds;next:GeographicBounds;a:number;d:number}|null>(null),ending=useRef(false),[preview,setStatePreview]=useState<string>();
 const setPreview=onPreview??setStatePreview;
 useEffect(()=>{const node=svg.current;if(!node)return;const refresh=()=>{const matrix=node.getScreenCTM();if(pinch.current&&matrix?.a&&matrix.d){pinch.current.a=matrix.a;pinch.current.d=matrix.d;}};const observer=new ResizeObserver(refresh);observer.observe(node);window.addEventListener("scroll",refresh,true);return()=>{observer.disconnect();window.removeEventListener("scroll",refresh,true);};},[svg]);
 const pair=()=>{const [a,b]=[...pointers.current.values()];return {distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};};
 function down(e:PointerEvent<SVGSVGElement>){
  if(!geo.frame||!enabled||e.pointerType!=="touch")return false;
  pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});e.currentTarget.setPointerCapture(e.pointerId);
  if(pointers.current.size===2&&!ending.current){const matrix=svg.current?.getScreenCTM();if(!matrix||!matrix.a||!matrix.d)return false;const p=pair();pinch.current={...p,bounds:geo.frame.bounds,next:geo.frame.bounds,a:matrix.a,d:matrix.d};onBegin();e.preventDefault();return true;}
  return ending.current||pointers.current.size>1;
 }
 function move(e:PointerEvent<SVGSVGElement>){
  if(pointers.current.has(e.pointerId))pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const base=pinch.current;if(!base||!geo.frame)return ending.current;
  // Explorer mounts its SVG after loading and keeps React preview state. Preserve its
  // live layout lookup; the editor's mounted canvas uses the observed gesture matrix.
  const matrix=onPreview?null:svg.current?.getScreenCTM();
  e.preventDefault();const p=pair(),ratio=Math.max(.1,Math.min(10,p.distance/base.distance)),dx=(p.center.x-base.center.x)/(matrix?.a??base.a),dy=(p.center.y-base.center.y)/(matrix?.d??base.d);
  base.next=moveGeographicExtent(geo.frame.reference,base.bounds,-dx/2000,(geo.frame.reference.kind==="plane"?-dy:dy)/1200,1/ratio);
  setPreview(`translate(${dx} ${dy}) translate(1000 600) scale(${ratio}) translate(-1000 -600)`);return true;
 }
 function up(e:PointerEvent<SVGSVGElement>,cancel=false){
  pointers.current.delete(e.pointerId);const base=pinch.current,handled=!!base||ending.current;
  if(base){if(!cancel)geo.setExtent(base.next);pinch.current=null;setPreview(undefined);ending.current=true;}
  if(!pointers.current.size)ending.current=false;
  if(handled&&e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  return handled;
 }
 return {down,move,up,preview};
}
