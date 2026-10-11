"use client";
import {useState,type ReactNode} from "react";
import {Field} from "./world-field";
import type {LoreDraft,LoreRecord,LoreReferences} from "./peoples";
import type {HistoricalTime} from "./history";
import styles from "./peoples.module.css";

export function LoreGeographyEditor({value,places,retained,onChange,newId,timeField}:{value:LoreDraft["geographies"];places:LoreReferences["places"];retained?:LoreRecord["geographies"];onChange:(value:LoreDraft["geographies"])=>void;newId:()=>string;timeField:(value:HistoricalTime,label:string,onChange:(time:HistoricalTime)=>void)=>ReactNode}) {
  const [query,setQuery]=useState("");
  const matches=places.filter(p=>p.name.toLowerCase().includes(query.toLowerCase())),shown=matches.slice(0,60);
  const names=new Map(places.map(p=>[p.id,p.name]));for(const g of retained??[]){names.set(g.geographyId,g.name);if(g.destinationId)names.set(g.destinationId,g.destinationName??"Retained place");}
  function patch(index:number,change:Partial<LoreDraft["geographies"][number]>){onChange(value.map((g,i)=>i===index?{...g,...change}:g));}
  function options(selected:string|null){return <><option value="">Choose a place</option>{shown.map(p=><option key={p.id} value={p.id} disabled={p.archived&&p.id!==selected}>{p.name}{p.archived?" · archived":""}</option>)}{selected&&!shown.some(p=>p.id===selected)&&<option value={selected}>{names.get(selected)??"Retained place"}</option>}</>;}
  return <details className={styles.section} open={value.length>0}><summary>Places and migration</summary><p>Connect saved Atlas identities. Several groups may share a place, and each group may have several places. A destination describes an authored movement; it does not invent a route or move Campaign actors.</p><Field label="Find geographic places" help="Search saved place names. Only the first 60 matching choices are shown; existing selections remain available."><input value={query} onChange={e=>setQuery(e.target.value)} maxLength={160}/></Field>
    {value.map((g,index)=><section key={g.id} className={styles.section}>
      <Field label={`Place association ${index+1} place`} help="Choose the existing place this account concerns. Renaming or redrawing its map does not change this relationship."><select value={g.geographyId} onChange={e=>patch(index,{geographyId:e.target.value})}>{options(g.geographyId)}</select></Field>
      <Field label={`Place association ${index+1} destination`} help="Optional: choose another place when this account describes movement between them. Leave blank for presence, language use or other relationships."><select value={g.destinationId??""} onChange={e=>patch(index,{destinationId:e.target.value||null})}><option value="">No authored destination</option>{shown.map(p=><option key={p.id} value={p.id} disabled={p.archived&&p.id!==g.destinationId}>{p.name}{p.archived?" · archived":""}</option>)}{g.destinationId&&!shown.some(p=>p.id===g.destinationId)&&<option value={g.destinationId}>{names.get(g.destinationId)??"Retained place"}</option>}</select></Field>
      <Field label={`Place association ${index+1} relationship`} help="Describe the relationship, such as inhabited by, language used here, pilgrimage or migration. Original types are welcome."><input value={g.relationshipType} maxLength={160} onChange={e=>patch(index,{relationshipType:e.target.value})}/></Field>
      <Field label={`Place association ${index+1} account`} help="Optional context, uncertainty or competing interpretation. This relationship is stored with the entity's immutable source version."><textarea value={g.account} onChange={e=>patch(index,{account:e.target.value})}/></Field>
      {timeField(g.time,`Place association ${index+1}`,time=>patch(index,{time}))}
      <p>This period describes the place relationship. To record a specific migration or founding event, author its date once under Historical milestones; this relationship can stay undated.</p>
      <label><input type="checkbox" checked={g.protected} onChange={e=>patch(index,{protected:e.target.checked})}/> Protected place association {index+1}</label>
      <button type="button" className="st-button is-secondary" onClick={()=>onChange(value.filter((_,i)=>i!==index))}>Remove place association {index+1}</button>
    </section>)}
    {matches.length>60&&<p>Refine the place search to see additional matching choices.</p>}
    <button type="button" className="st-button is-secondary" disabled={value.length>=100} onClick={()=>onChange([...value,{id:newId(),geographyId:"",destinationId:null,relationshipType:"",account:"",time:{version:1,scale:"world-year",kind:"undated"},protected:false}])}>Add place association</button>
  </details>;
}
