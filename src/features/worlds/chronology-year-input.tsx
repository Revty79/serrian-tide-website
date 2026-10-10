"use client";
import { useState } from "react";
import { Field } from "./world-field";
import { DISPLAY_YEAR_LIMIT, fromReckoning, toReckoning, type DatingSystem } from "./chronology";
export function ChronologyYearInput({label,value,system,optional=false,onChange}:{label:string;value:number|null;system?:DatingSystem|null;optional?:boolean;onChange:(value:number|null)=>void}) {
  const [raw,setRaw] = useState(()=>value === null || !Number.isFinite(value) ? "" : String(toReckoning(value,system)));
  const [error,setError] = useState("");
  return <Field label={label} help={`${optional ? "Leave blank for an unknown boundary. " : ""}Enter a whole year in ${system?.name ?? "canonical world years"}. Negative numbers mean Before; positive numbers mean After. ${system?.numbering === "no-year-zero" ? "Year 0 does not exist in this convention." : "Year 0 is supported."} The resulting canonical year must remain within minus one trillion through one trillion.`}>
    <input type="number" step={1} required={!optional} min={-DISPLAY_YEAR_LIMIT} max={DISPLAY_YEAR_LIMIT} value={raw} onChange={(event)=>{
      const text=event.target.value;setRaw(text);let message="";
      try {onChange(text === "" ? optional ? null : NaN : fromReckoning(Number(text),system));}
      catch(failure){message=failure instanceof Error ? failure.message : "Enter a valid year.";onChange(NaN);}
      event.target.setCustomValidity(message);setError(message);
    }}/>{error && <span role="alert">{error}</span>}
  </Field>;
}
