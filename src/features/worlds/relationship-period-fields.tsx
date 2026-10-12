"use client";
import { Field } from "./world-field";
import { TimeFields } from "./lore-time-fields";
import { relationshipStatusLabels } from "./individuals";
import type { LoreDraft } from "./peoples";
import styles from "./creator-workshop.module.css";

export function RelationshipPeriodFields({draft,patch,newId}:{draft:LoreDraft;patch:(value:Partial<LoreDraft>)=>void;newId:()=>string}) {
  const periods=draft.relationshipPeriods??[];
  function update(index:number,value:Partial<typeof periods[number]>){patch({relationshipPeriods:periods.map((p,i)=>i===index?{...p,...value}:p)});}
  return <section data-draft-path="relationshipPeriods"><p>A period describes a stretch of this relationship. Different accounts can overlap or disagree. Its status is what this account says; an unknown ending does not make it ongoing. A meeting or betrayal belongs in History as an event.</p>
    {periods.map((period,index)=><section key={period.id} className={styles.group} data-draft-path={`relationshipPeriods.${index}`} aria-label={`Relationship period ${index+1}`}>
      <h4>{period.label||`Relationship period ${index+1}`}</h4>
      <Field path={`relationshipPeriods.${index}.label`} label="Give this period a name" help="For example, Before the Broken Oath or The Years of Uneasy Friendship. Only the name you enter is saved."><input maxLength={160} value={period.label} onChange={e=>update(index,{label:e.target.value})}/></Field>
      <Field path={`relationshipPeriods.${index}.status`} label="What is the relationship's status in this account?" help="Ongoing, ended, unknown and disputed keep different meanings. Missing dates do not decide the status."><select value={period.status} onChange={e=>update(index,{status:e.target.value as typeof period.status})}>{Object.entries(relationshipStatusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
      <Field path={`relationshipPeriods.${index}.account`} label="How was the relationship during this time?" help="Describe its meaning or changes, including conflicting accounts. This does not create a historical event."><textarea rows={3} maxLength={50_000} value={period.account} onChange={e=>update(index,{account:e.target.value})}/></Field>
      <Field path={`relationshipPeriods.${index}.perspective`} label="Who describes it this way?" help="Optional: attribute this account to a person, group or source without deciding that other accounts are false."><textarea rows={2} maxLength={50_000} value={period.perspective} onChange={e=>update(index,{perspective:e.target.value})}/></Field>
      <details><summary>Dates, if known</summary><p>Beginning and ending are independently optional. Leave either unknown without guessing the other.</p>{(["beginning","ending"] as const).map(bound=><div key={bound} data-draft-path={`relationshipPeriods.${index}.${bound}`}><label className="st-field"><span><input type="checkbox" checked={period[bound]!==null} onChange={e=>update(index,{[bound]:e.target.checked?{version:1,scale:"world-year",kind:"undated"}:null})}/> Describe this period&apos;s {bound}</span></label>{period[bound]&&<TimeFields path={`relationshipPeriods.${index}.${bound}`} prefix={`Period ${bound}`} value={period[bound]} onChange={time=>update(index,{[bound]:time})}/>}</div>)}</details>
      <label className="st-field"><span><input type="checkbox" checked={period.protected} onChange={e=>update(index,{protected:e.target.checked})}/> Keep this period out of ordinary knowledge</span></label><p className={styles.hint}>A private period can withhold the revealing relationship and its events from ordinary knowledge. This World is not published.</p>
      <button type="button" className="st-button is-secondary" onClick={()=>patch({relationshipPeriods:periods.filter((_,i)=>i!==index)})}>Remove relationship period {index+1}</button>
    </section>)}<button type="button" className="st-button is-secondary" disabled={periods.length>=40} onClick={()=>patch({relationshipPeriods:[...periods,{id:newId(),label:"",status:"unknown",account:"",perspective:"",beginning:null,ending:null,protected:false}]})}>Add relationship period</button>
  </section>;
}
