"use client";
import { useState } from "react";
import { dateLabel, type CalendarBundle } from "./calendar";
import { convertDate, toElapsed } from "./calendar-dates";
import { CalendarDateFields, initialEndpoint } from "./calendar-date-fields";
import { Field } from "./world-field";
import styles from "./calendar.module.css";
export function CalendarConverter({bundle,versionId}:{bundle:CalendarBundle;versionId:string}){
  const [source,setSource]=useState(()=>initialEndpoint(bundle,versionId)),[target,setTarget]=useState(bundle.versions.find(item=>item.id!==versionId)?.id??versionId),[result,setResult]=useState(""),[error,setError]=useState("");
  return <section aria-label="Calendar conversion"><p className={styles.caption}>Convert a date notation using authored anchors. Retired definitions can be read. Choosing a different view never moves an event; approximate accounts remain approximate.</p><CalendarDateFields bundle={bundle} value={source} label="Conversion source" includeArchived onChange={value=>{setSource(value);setResult("");setError("");}}/><Field label="Conversion target version" help="An explicitly selected version is required. Missing anchors and out-of-range dates refuse conversion."><select value={target} onChange={e=>{setTarget(e.target.value);setResult("");setError("");}}>{bundle.versions.map(item=><option value={item.id} key={item.id}>{bundle.calendars.find(c=>c.id===item.calendarId)?.name} · {item.title} · {item.id.slice(0,8)}{item.archived?" (archived)":""}</option>)}</select></Field><button type="button" className="st-button" onClick={()=>{setResult("");setError("");try{const from=bundle.versions.find(item=>item.id===source.versionId)!,to=bundle.versions.find(item=>item.id===target)!;const a=bundle.evolution.anchors.find(item=>item.versionId===from.id),b=bundle.evolution.anchors.find(item=>item.versionId===to.id);const date=convertDate({rules:from.rules,anchor:a},{rules:to.rules,anchor:b},source.date);setResult(`${dateLabel(to.rules,date)} · ${to.title} · month ${date.month} · elapsed day ${toElapsed(from.rules,a,source.date)}`);}catch(failure){setError((failure as Error).message);}}}>Convert date</button>{error&&<p role="alert" className={styles.feedback}>{error}</p>}{result&&<p role="status" className={styles.dayDetail}>{result}</p>}
  </section>;
}
