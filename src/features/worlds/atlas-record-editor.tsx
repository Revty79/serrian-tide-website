"use client";
import { useEffect, useRef, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import type { GeographyRecord, MapDraft } from "./atlas";
import styles from "./atlas.module.css";
export type AtlasRecordTarget = {kind:"map"} | {kind:"geography";record?:GeographyRecord};
export function AtlasRecordEditor({target,geographies,onClose,onSave}:{target:AtlasRecordTarget;geographies:GeographyRecord[];onClose:()=>void;onSave:(body:unknown)=>Promise<void>}) {
  const dialog=useRef<HTMLDialogElement>(null),[name,setName]=useState(target.kind==="geography"?target.record?.name??"":""),[description,setDescription]=useState(target.kind==="geography"?target.record?.description??"":""),[kind,setKind]=useState<GeographyRecord["kind"]>(target.kind==="geography"?target.record?.kind??"continent":"continent"),[scope,setScope]=useState<MapDraft["scope"]>("world"),[parentId,setParentId]=useState(target.kind==="geography"?target.record?.parentId??"":""),[pending,setPending]=useState(false),[error,setError]=useState("");
  const touched=useRef(false);
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(touched.current){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[]);
  function close(){if(!pending&&(!touched.current||window.confirm("Discard this unsaved record?")))onClose();}
  return <dialog ref={dialog} className={styles.dialog} onCancel={e=>{e.preventDefault();close();}} aria-labelledby="atlas-record-title"><form onChange={()=>{touched.current=true;}} onSubmit={async e=>{e.preventDefault();setPending(true);setError("");try{await onSave(target.kind==="map"?{action:"create",name,description,scope}:{action:"geography",draft:{id:target.record?.id??crypto.randomUUID(),revision:target.record?.revision??null,name,description,kind,parentId:parentId||null}});touched.current=false;}catch(failure){setError(failure instanceof Error?failure.message:"Could not save. Your draft is retained.");}finally{setPending(false);}}}>
    <h2 id="atlas-record-title">{target.kind==="map"?"Create a blank map":target.record?"Edit geography":"New geography"}</h2><fieldset disabled={pending}>
      <GuidedField label={target.kind==="map"?"Map name":"Geography name"} help="Choose a name you will recognize in your World's Atlas."><input className="st-control" required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></GuidedField>
      <GuidedField label="Description" help="Describe the map's purpose, or this geography's climate, terrain and story. This is narrative context."><textarea className="st-control" rows={4} maxLength={12000} value={description} onChange={e=>setDescription(e.target.value)}/></GuidedField>
      {target.kind==="map"?<GuidedField label="Map scale" help="Organize the map as world, continent, regional or local. This label does not establish distances or nested map navigation."><select className="st-control" value={scope} onChange={e=>setScope(e.target.value as MapDraft["scope"])}>{["world","continent","regional","local"].map(value=><option key={value}>{value}</option>)}</select></GuidedField>:<>
        <GuidedField label="Geography kind" help="Continents and islands use editable outlines. Locations use named markers. A saved record keeps its kind."><select className="st-control" disabled={!!target.record} value={kind} onChange={e=>setKind(e.target.value as GeographyRecord["kind"])}><option value="continent">Continent</option><option value="island">Island</option><option value="location">Location</option></select></GuidedField>
        <GuidedField label="Parent geography" help="Optionally place this record within another geography in this World. Circular relationships are refused."><select className="st-control" value={parentId} onChange={e=>setParentId(e.target.value)}><option value="">No parent</option>{geographies.filter(g=>g.id!==target.record?.id&&(!g.archived||g.id===parentId)).map(g=><option value={g.id} key={g.id}>{g.name}</option>)}</select></GuidedField>
      </>}
    </fieldset>{error&&<p role="alert" className={styles.feedback}>{error}</p>}<footer className={styles.actions}><button type="button" className="st-button is-secondary" disabled={pending} onClick={close}>Cancel</button><button className="st-button" disabled={pending}>{pending?"Saving…":target.kind==="map"?"Create map":"Save geography"}</button></footer>
  </form></dialog>;
}
