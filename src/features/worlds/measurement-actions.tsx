"use client";
import {useEffect,useRef} from "react";

/** Remember the actual editing/navigation tool without changing any saved geometry. */
export function usePreviousMeasurementTool<T extends string>(tool:T,fallback:T){
 const previous=useRef<T>(fallback);
 useEffect(()=>{if(tool!=="measure")previous.current=tool;},[tool]);
 return previous;
}
export function MeasurementActions({onNew,onKeep,onClear,onStop,canKeep=true,kept=false}:{onNew:()=>void;onKeep:()=>void;onClear:()=>void;onStop:()=>void;canKeep?:boolean;kept?:boolean}){
 return <div role="group" aria-label="Ruler actions" style={{position:"absolute",top:8,left:8,right:8,zIndex:5,display:"flex",gap:4,flexWrap:"wrap",pointerEvents:"none"}}>
  {[["New Measurement",onNew,false],["Stop Measuring",onStop,false],[kept?"Measurement Kept":"Keep Measurement",onKeep,!canKeep||kept],["Clear Ruler",onClear,false]].map(([label,action,disabled])=><button key={String(label)} type="button" className="st-button is-secondary" disabled={!!disabled} onClick={action as ()=>void} style={{pointerEvents:"auto",fontSize:12,padding:"6px 8px",minHeight:36,whiteSpace:"nowrap"}}>{label as string}</button>)}
 </div>;
}
