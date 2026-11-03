"use client";
import {useState} from "react";
import {transformFloorFeature,type FloorFeature} from "./building-floor";
import styles from "./building-floor.module.css";
function ObjectNumber({name,value,min,max,onCommit,disabled}:{name:string;value:number;min:number;max:number;onCommit:(value:number)=>void;disabled:boolean}){
 const [text,setText]=useState<string>();
 function input(raw:string){setText(raw);const n=Number(raw);if(raw.trim()&&Number.isFinite(n)&&n>=min&&n<=max&&n!==value)onCommit(n);}
 return <label>{name}<input className="st-control" aria-label={`Object ${name.toLowerCase()}`} type="number" min={min} max={max} step={name==="Rotation"?1:.1} value={text??String(value)} disabled={disabled} onChange={e=>input(e.target.value)} onBlur={()=>setText(undefined)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape"){e.preventDefault();e.currentTarget.blur();}}}/>{name==="Rotation"?"°":"m"}</label>;
}
export function FloorObjectControls({feature,features,disabled,onChange}:{feature:Extract<FloorFeature,{variant:"object"}>;features:FloorFeature[];disabled:boolean;onChange:(f:FloorFeature)=>void}){
 return <div className={styles.manipulation} aria-label="Arrange object"><button className="st-button" aria-label="Rotate left 15 degrees" title="Rotate left 15°" disabled={disabled} onClick={()=>onChange(transformFloorFeature(feature,features,0,0,-15))}>↶ 15°</button><button className="st-button" aria-label="Rotate right 15 degrees" title="Rotate right 15°" disabled={disabled} onClick={()=>onChange(transformFloorFeature(feature,features,0,0,15))}>↷ 15°</button><button className="st-button" aria-label="Rotate 90 degrees" disabled={disabled} onClick={()=>onChange(transformFloorFeature(feature,features,0,0,90))}>Rotate 90°</button><ObjectNumber key="rotation" name="Rotation" value={feature.rotation} min={-180} max={180} disabled={disabled} onCommit={rotation=>onChange({...feature,rotation})}/><ObjectNumber key="width" name="Width" value={feature.width} min={.1} max={100} disabled={disabled} onCommit={width=>onChange({...feature,width})}/><ObjectNumber key="depth" name="Depth" value={feature.height} min={.1} max={100} disabled={disabled} onCommit={height=>onChange({...feature,height})}/></div>;
}
