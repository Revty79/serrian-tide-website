"use client";
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from "react";
import {z} from "zod";
import {GuidedField} from "@/components/field-guidance";
import {StudioPanel,useMapStudio} from "./map-studio";
import {islandLessonChecks,islandReference,lessonSteps,type IslandLessonFacts} from "./island-learning-content";
import styles from "./island-learning.module.css";

const progressSchema=z.object({started:z.boolean(),visible:z.boolean(),step:z.number().int().min(0).max(8),branch:z.enum(["generate","manual"]).nullable(),coastBase:z.record(z.string(),z.number().int().positive()).nullable(),saved:z.object({revision:z.number().int().positive(),visit:z.string().uuid(),drawings:z.array(z.string().uuid()).max(512),land:z.array(z.string().uuid()).min(1).max(5000)}).nullable(),reopened:z.boolean()}).strict();
type Progress=z.infer<typeof progressSchema>;
const emptyProgress=():Progress=>({started:false,visible:false,step:0,branch:null,coastBase:null,saved:null,reopened:false});
type LessonSnapshot={progress:Progress;ready:boolean;error:string};
const serverSnapshot:LessonSnapshot={progress:emptyProgress(),ready:false,error:""},snapshots=new Map<string,LessonSnapshot>(),listeners=new Map<string,Set<()=>void>>();
function lessonSnapshot(key:string):LessonSnapshot{
 const cached=snapshots.get(key);if(cached)return cached;
 let snapshot:LessonSnapshot;
 try{const text=sessionStorage.getItem(key);if(text&&text.length>512000)throw new Error("Lesson metadata exceeds its bounded size.");snapshot={progress:text?progressSchema.parse(JSON.parse(text)):emptyProgress(),ready:true,error:""};}
 catch{snapshot={progress:emptyProgress(),ready:true,error:"Lesson progress could not be read on this device. Your map is unchanged; this lesson can still run while the editor stays open."};}
 snapshots.set(key,snapshot);return snapshot;
}
function updateLesson(key:string,change:(old:Progress)=>Progress){
 const current=lessonSnapshot(key),progress=change(current.progress);if(progress===current.progress)return;
 let error=current.error;try{sessionStorage.setItem(key,JSON.stringify(progress));}catch{error="This browser cannot retain lesson progress between visits. Map drafts are unchanged; use Save and recovery to keep your content.";}
 snapshots.set(key,{progress,ready:true,error});listeners.get(key)?.forEach(notify=>notify());
}
export function IslandLearning({identity,allowed,facts,onDraw,onRiver}:{identity:string;allowed:boolean;facts:IslandLessonFacts;onDraw:()=>void;onRiver:()=>void}){
 const studio=useMapStudio(),[search,setSearch]=useState("");
 const visit=useRef(crypto.randomUUID()),key=`serrian-atlas-island-lesson:v1:${identity}`,factsToken=JSON.stringify(facts);
 const subscribe=useCallback((notify:()=>void)=>{if(!allowed)return()=>{};const set=listeners.get(key)??new Set<()=>void>();set.add(notify);listeners.set(key,set);return()=>{set.delete(notify);if(!set.size){listeners.delete(key);snapshots.delete(key);}};},[allowed,key]);
 const getSnapshot=useCallback(()=>allowed?lessonSnapshot(key):serverSnapshot,[allowed,key]);
 const {progress,ready,error:storageError}=useSyncExternalStore(subscribe,getSnapshot,()=>serverSnapshot);
 const setProgress=useCallback((change:(old:Progress)=>Progress)=>updateLesson(key,change),[key]);
 useEffect(()=>{
  if(!allowed||!ready)return;
  const current=JSON.parse(factsToken) as IslandLessonFacts;
  setProgress(old=>{
   if(!old.started)return old;
   const coastBase=old.coastBase??(current.land.length?Object.fromEntries(current.land.map(s=>[s.id,s.revision])):null);
   const reopened=old.reopened||!!old.saved&&old.saved.visit!==visit.current&&current.mapRevision>=old.saved.revision&&old.saved.drawings.every(id=>current.savedDrawingIds.includes(id))&&old.saved.land.every(id=>current.land.some(s=>s.id===id));
   const saved=current.surface&&current.land.length>0&&current.terrain&&current.river&&current.city&&!current.dirty&&(!old.saved||current.mapRevision>old.saved.revision)?{revision:current.mapRevision,visit:visit.current,drawings:current.savedDrawingIds,land:current.land.map(s=>s.id)}:old.saved;
   return coastBase===old.coastBase&&reopened===old.reopened&&saved===old.saved?old:{...old,coastBase,reopened,saved};
  });
 },[allowed,ready,factsToken,progress.started,setProgress]);
 const checks=islandLessonChecks(facts,progress.coastBase,progress.reopened),step=lessonSteps[progress.step],query=search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),entries=islandReference.filter(e=>query.every(q=>[e.title,e.terms,...e.paragraphs,e.example].join(" ").toLocaleLowerCase().includes(q)));
 function branch(value:"generate"|"manual"){setProgress(p=>({...p,branch:value}));if(value==="manual")onDraw();else studio?.show(facts.surface?"generation":"geography");}
 return <StudioPanel section="help"><section className={styles.help} aria-label="Studio help"><h3>Create your first island</h3><p>Use the real map, sources and artwork you are editing. The optional lesson checks actual drafts and saved records. Opening or closing it keeps your work and each editor&apos;s undo history.</p>
  {allowed?<>
   {!progress.visible?<button className="st-button" disabled={!ready} onClick={()=>setProgress(p=>({...p,started:true,visible:true}))}>{progress.started?"Resume island lesson":"Start island lesson"}</button>:<section className={styles.lesson} aria-label="Create Your First Island lesson"><div className={styles.actions}><strong>Step {progress.step+1} of {lessonSteps.length}</strong><button className="st-button is-secondary" onClick={()=>setProgress(p=>({...p,visible:false}))}>Close lesson and keep working</button></div><h4>{step.title}</h4><p>{step.instruction}</p>
    <p role="status">{checks[progress.step]?progress.step===8?"The visible PNG was downloaded after reopening. Inspect it at the intended size; this lesson does not establish owner acceptance.":"This step is verified in the current map.":progress.step===7?"Waiting for this saved map to be opened in a new editor visit with its retained source and drawing identities.":"Waiting for the corresponding real draft or saved record."}</p>
    {progress.step===1?<div className={styles.actions}><button className="st-button" onClick={()=>branch("generate")}>Use generated-island lesson route</button><button className="st-button is-secondary" onClick={()=>branch("manual")}>Use drawn-island lesson route</button></div>:<button className="st-button is-secondary" onClick={()=>progress.step===4?onRiver():studio?.show(step.section)}>Open this step&apos;s tools</button>}
    {progress.branch&&<p>Chosen route: {progress.branch==="generate"?"generated geographic island":"manually drawn geographic island"}. Both routes use the same saved source editor afterward.</p>}
    <div className={styles.actions}><button className="st-button is-secondary" disabled={progress.step===0} onClick={()=>setProgress(p=>({...p,step:Math.max(0,p.step-1)}))}>Previous lesson step</button><button className="st-button" disabled={!checks[progress.step]||progress.step===lessonSteps.length-1} onClick={()=>setProgress(p=>({...p,step:Math.min(lessonSteps.length-1,p.step+1)}))}>Next lesson step</button></div>
    <details><summary>Review lesson steps</summary>{lessonSteps.map((s,i)=><button key={s.title} className="st-button is-secondary" aria-current={progress.step===i?"step":undefined} onClick={()=>setProgress(p=>({...p,step:i}))}>{i+1}. {s.title} · {checks[i]?"verified":"pending"}</button>)}</details>
   </section>}
  </>:<p>The reference remains available here. The guided lesson needs a live owned generic map on the shared baseline.</p>}
  {storageError&&<p role="status">{storageError}</p>}
  <h3>Map-making reference</h3><GuidedField label="Search Studio help" help="Search tasks, tool names and plain-language terms, such as first world, coastline, city, backup or height."><input type="search" className="st-control" value={search} onChange={e=>setSearch(e.target.value)}/></GuidedField>
  <p>{entries.length} reference {entries.length===1?"topic":"topics"}. Opening a topic changes no map content.</p>
  {entries.map(e=><details className={styles.reference} key={e.id}><summary>{e.title}</summary>{e.paragraphs.map(p=><p key={p}>{p}</p>)}<h4>Worked example</h4><p>{e.example}</p><h4>Why this works</h4><p>{e.why}</p><button className="st-button is-secondary" onClick={()=>e.id==="river"?onRiver():studio?.show(e.section)}>{e.action}</button></details>)}
  {!entries.length&&<p>No matching topic. Try coast, brush, city, save, recovery or coordinates.</p>}
 </section></StudioPanel>;
}
