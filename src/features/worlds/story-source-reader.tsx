"use client";
import { useEffect, useRef, useState } from "react";
import { worldApi } from "./client-api";
import { PilotProfile } from "./pilot-profile";
import type { LoreRecord } from "./peoples";
import styles from "./peoples.module.css";
export function StorySourceReader({worldId,timelineId,ownerId,versionId,review,ordinary,onClose}:{worldId:string;timelineId:string;ownerId:string;versionId:string;review:boolean;ordinary:boolean;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),[record,setRecord]=useState<LoreRecord|null>(null),[error,setError]=useState("");
  useEffect(()=>{dialog.current?.showModal();let alive=true;const q=new URLSearchParams({timeline:timelineId,record:ownerId,storySource:versionId});if(review)q.set("review","1");if(ordinary)q.set("ordinary","1");worldApi<LoreRecord>(`/api/worlds/${worldId}/peoples?${q}`).then(r=>{if(alive)setRecord(r);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[worldId,timelineId,ownerId,versionId,review,ordinary]);
  return <dialog ref={dialog} className={styles.dialog} aria-label="Retained earlier story" onCancel={onClose}><header className={styles.heading}><h2>Retained earlier account</h2><button type="button" className="st-button is-secondary" onClick={onClose}>Close earlier account</button></header><p>This is the original saved wording, not the current retelling. Later edits preserve it.</p>{error&&<p role="alert">{error}</p>}{!record&&!error&&<p>Opening the retained story…</p>}{record&&<><p>Source revision {record.revision} · {record.createdAt}</p><PilotProfile draft={record.draft} record={record} mode={ordinary?"ordinary":"saved"}/></>}</dialog>;
}
