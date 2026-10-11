"use client";
import type { ReactNode } from "react";
import { Field } from "./world-field";
import type { LoreDraft } from "./peoples";
import type { HistoricalTime } from "./history";
import { individualFieldGroups, relationshipStatusLabels } from "./individuals";
import styles from "./peoples.module.css";

type Props = { draft: LoreDraft; patch: (value: Partial<LoreDraft>) => void; newId: () => string; timeField: (time: HistoricalTime, prefix: string, onChange: (value: HistoricalTime) => void) => ReactNode };
const undated: HistoricalTime = {version:1,scale:"world-year",kind:"undated"};
export function IndividualCharacteristics({draft,patch}:Pick<Props,"draft"|"patch">) {
  return <>{Object.entries(individualFieldGroups).map(([group,fields])=><details className={styles.section} key={group}><summary>{group}</summary>{Object.entries(fields).map(([key,label])=><div key={key}><Field label={label} help="Optional narrative information about this individual. Leave irrelevant details blank. Saved references to species, cultures, languages and other records are added under related records."><textarea rows={3} value={draft.fields[key]??""} onChange={e=>patch({fields:{...draft.fields,[key]:e.target.value}})}/></Field><label className="st-field"><span><input type="checkbox" checked={draft.protectedFields?.includes(key)??false} onChange={e=>patch({protectedFields:e.target.checked?[...draft.protectedFields??[],key]:(draft.protectedFields??[]).filter(k=>k!==key)})}/> Protect {label.toLowerCase()}</span></label></div>)}</details>)}</>;
}
export function PersonalAccountFields({draft,patch,newId,timeField}:Props) {
  const names=draft.nameAccounts??[],periods=draft.relationshipPeriods??[];
  return <>
    {draft.family==="individual"&&<details className={styles.section} open={names.length>0}><summary>Historical names and titles</summary><p>One individual can have many names, titles and disputed attributions. Dates and perspectives describe the account; they never create another individual or a History event automatically.</p>{names.map((n,index)=><section className={styles.section} key={n.id}>
      <Field label={`Name account ${index+1} name`} help="An earlier name, title, assumed identity or cultural name."><input maxLength={160} value={n.name} onChange={e=>patch({nameAccounts:names.map((n,i)=>i===index?{...n,name:e.target.value}:n)})}/></Field>
      <Field label={`Name account ${index+1} kind`} help="Describe the use, such as childhood name, honorific or disputed attribution."><input maxLength={80} value={n.kind} onChange={e=>patch({nameAccounts:names.map((n,i)=>i===index?{...n,kind:e.target.value}:n)})}/></Field>
      <Field label={`Name account ${index+1} meaning`} help="Optional meaning, origin or circumstances of the name."><textarea value={n.meaning} onChange={e=>patch({nameAccounts:names.map((n,i)=>i===index?{...n,meaning:e.target.value}:n)})}/></Field>
      <Field label={`Name account ${index+1} perspective`} help="Who uses or attributes this name? Conflicting accounts can coexist."><textarea value={n.perspective} onChange={e=>patch({nameAccounts:names.map((n,i)=>i===index?{...n,perspective:e.target.value}:n)})}/></Field>
      {timeField(n.time,`Name account ${index+1}`,time=>patch({nameAccounts:names.map((n,i)=>i===index?{...n,time}:n)}))}
      <label className="st-field"><span><input type="checkbox" checked={n.protected} onChange={e=>patch({nameAccounts:names.map((n,i)=>i===index?{...n,protected:e.target.checked}:n)})}/> Protect name account {index+1}</span></label>
      <button type="button" className="st-button is-secondary" onClick={()=>patch({nameAccounts:names.filter((_,i)=>i!==index)})}>Remove name account {index+1}</button>
    </section>)}<button type="button" className="st-button is-secondary" disabled={names.length>=40} onClick={()=>patch({nameAccounts:[...names,{id:newId(),name:"",kind:"name",meaning:"",perspective:"",time:undated,protected:false}]})}>Add historical name</button></details>}
    {draft.family==="relationship"&&<details className={styles.section} open={periods.length>0}><summary>Relationship periods and perspectives</summary><p>Author several periods or contradictory accounts. Beginnings and endings are independently optional. Protecting a participant or period also protects milestones authored from this relationship. Add an explicit historical milestone below for a meeting, betrayal or other event that belongs in World History.</p>{periods.map((p,index)=><section className={styles.section} key={p.id}>
      <Field label={`Period ${index+1} label`} help="Describe the relationship during this account, such as allies or rivals."><input maxLength={160} value={p.label} onChange={e=>patch({relationshipPeriods:periods.map((p,i)=>i===index?{...p,label:e.target.value}:p)})}/></Field>
      <Field label={`Period ${index+1} status`} help="An authored status in this timeline. The software does not decide which disputed account is true."><select value={p.status} onChange={e=>patch({relationshipPeriods:periods.map((p,i)=>i===index?{...p,status:e.target.value as typeof p.status}:p)})}>{Object.entries(relationshipStatusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
      <Field label={`Period ${index+1} account`} help="Describe the relationship and its development during this period."><textarea value={p.account} onChange={e=>patch({relationshipPeriods:periods.map((p,i)=>i===index?{...p,account:e.target.value}:p)})}/></Field>
      <Field label={`Period ${index+1} perspective`} help="Attribute this account to a source or perspective without resolving it as objective truth."><textarea value={p.perspective} onChange={e=>patch({relationshipPeriods:periods.map((p,i)=>i===index?{...p,perspective:e.target.value}:p)})}/></Field>
      {(["beginning","ending"] as const).map(bound=><div key={bound}><label className="st-field"><span><input type="checkbox" checked={p[bound]!==null} onChange={e=>patch({relationshipPeriods:periods.map((p,i)=>i===index?{...p,[bound]:e.target.checked?undated:null}:p)})}/> Record period {index+1} {bound}</span></label>{p[bound]&&timeField(p[bound],`Period ${index+1} ${bound}`,time=>patch({relationshipPeriods:periods.map((p,i)=>i===index?{...p,[bound]:time}:p)}))}</div>)}
      <label className="st-field"><span><input type="checkbox" checked={p.protected} onChange={e=>patch({relationshipPeriods:periods.map((p,i)=>i===index?{...p,protected:e.target.checked}:p)})}/> Protect period {index+1}</span></label>
      <button type="button" className="st-button is-secondary" onClick={()=>patch({relationshipPeriods:periods.filter((_,i)=>i!==index)})}>Remove period {index+1}</button>
    </section>)}<button type="button" className="st-button is-secondary" disabled={periods.length>=40} onClick={()=>patch({relationshipPeriods:[...periods,{id:newId(),label:"",status:"unknown",account:"",perspective:"",beginning:null,ending:null,protected:false}]})}>Add relationship period</button></details>}
  </>;
}
