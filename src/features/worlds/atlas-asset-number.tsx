"use client";
import {useState} from "react";
/** Match the established interior number controls: preserve incomplete keyboard text while retaining valid physical values. */
export function AssetNumber({label,value,min,max,onChange}:{label:string;value:number;min?:number;max?:number;onChange:(n:number)=>void}){
 const [text,setText]=useState<string>();
 return <label>{label}<input className="st-control" aria-label={label} type="number" step="any" min={min} max={max} value={text??String(value)} onChange={e=>{const raw=e.target.value;setText(raw);const n=Number(raw);if(raw.trim()&&Number.isFinite(n)&&(min===undefined||n>=min)&&(max===undefined||n<=max))onChange(n);}} onBlur={()=>setText(undefined)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape"){e.preventDefault();e.currentTarget.blur();}}}/></label>;
}
