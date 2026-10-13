"use client";
import { useEffect,useRef,useState } from "react";
import { worldApi } from "./client-api";
import { PilotProfile } from "./pilot-profile";
import type { LoreRecord } from "./peoples";
import type { HistoricalSnapshot } from "./branching-history";
import { formatEra,formatTime } from "./chronology";
import { CalendarSourceDetails } from "./calendar-source-details";
import styles from "./peoples.module.css";
export function TerritoryReading({url,worldId,timelineId,review,ordinary,onClose}:{url:string;worldId:string;timelineId:string;review:boolean;ordinary:boolean;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null),[record,setRecord]=useState<LoreRecord|HistoricalSnapshot|null>(null),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  useEffect(()=>{ref.current?.showModal();let alive=true;worldApi<LoreRecord|HistoricalSnapshot>(url).then(r=>{if(alive){setRecord(r);setError("");}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[url,retry]);
  return <dialog ref={ref} className={styles.dialog} aria-label="Retained territorial source" onCancel={onClose}><header className={styles.heading}><h2>Exact retained source</h2><button className="st-button is-secondary" onClick={onClose}>Close source</button></header><p>Read the original saved political or historical source. Its date is separate from the territory relationship period and the date this account was authored.</p>{error&&<div role="alert">{error}<button className="st-button" onClick={()=>setRetry(n=>n+1)}>Retry source</button></div>}{!record&&!error&&<p role="status">Opening the saved source…</p>}{record&&("draft"in record?<PilotProfile draft={record.draft} record={record} mode={ordinary?"ordinary":"saved"} worldId={worldId} timelineId={timelineId} review={review}/>:<><h3>{"time"in record?record.title:record.name}</h3><p>{"time"in record?formatTime(record.time,record.sourceDating):formatEra(record,record.sourceDating)}</p><p>{"time"in record?record.account:record.description}</p>{!ordinary&&"notes"in record&&record.notes&&<details><summary>Private author notes</summary><p>{record.notes}</p></details>}{"time"in record&&record.calendarSource&&<CalendarSourceDetails worldId={worldId} timelineId={timelineId} source={record.calendarSource} review={review} ordinary={ordinary}/>}</>)}</dialog>;
}
