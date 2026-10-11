"use client";
import { useEffect, useRef, useState } from "react";
import type { HistoricalSnapshot } from "./branching-history";
import { worldApi } from "./client-api";
import { formatEra, formatTime } from "./chronology";
import { CalendarSourceDetails } from "./calendar-source-details";
import styles from "./peoples.module.css";

export function HistoricalSourceReader({worldId,timelineId,entityId,versionId,review,ordinary,onClose}:{worldId:string;timelineId:string;entityId:string;versionId:string;review:boolean;ordinary:boolean;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null),[record,setRecord]=useState<HistoricalSnapshot|null>(null),[error,setError]=useState("");
  useEffect(()=>{ref.current?.showModal();const query=new URLSearchParams({timeline:timelineId,record:entityId,source:versionId});if(review)query.set("review","1");if(ordinary)query.set("ordinary","1");let alive=true;worldApi<HistoricalSnapshot>(`/api/worlds/${worldId}/peoples?${query}`).then(r=>{if(alive)setRecord(r);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[worldId,timelineId,entityId,versionId,review,ordinary]);
  return <dialog ref={ref} className={styles.dialog} aria-label="Pinned historical source" onCancel={onClose}><header className={styles.heading}><h2>Original historical source</h2><button className="st-button is-secondary" onClick={onClose}>Close source</button></header><p className={styles.caption}>This immutable account is the version saved with the entity. Later History edits retain it.</p>{!record&&!error&&<p>Opening the original account…</p>}{error&&<p role="alert">{error}</p>}{record&&<><h3>{"time"in record?record.title:record.name}</h3><p>{"time"in record?formatTime(record.time,record.sourceDating):formatEra(record,record.sourceDating)}</p><p className={styles.prose}>{"time"in record?record.account:record.description}</p>{"time"in record&&record.notes&&<section><h4>Author notes</h4><p className={styles.prose}>{record.notes}</p></section>}{"time"in record&&record.calendarSource&&<CalendarSourceDetails worldId={worldId} source={record.calendarSource} review={review}/>}</>}</dialog>;
}
