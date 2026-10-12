"use client";
import { Field } from "./world-field";
import { TimeFields } from "./lore-time-fields";
import type { LoreDraft } from "./peoples";
import styles from "./creator-workshop.module.css";

export function PilotPeriodFields({draft,patch,newId}:{draft:LoreDraft;patch:(value:Partial<LoreDraft>)=>void;newId:()=>string}) {
  const periods=draft.periods??[];
  const update=(index:number,change:Partial<typeof periods[number]>)=>patch({periods:periods.map((p,i)=>i===index?{...p,...change}:p)});
  return <section data-draft-path="periods"><h4>How has this rule worked through history?</h4><p>Use this section when the rule applied during a particular stretch of history, changed over time, or has conflicting accounts about when it applied. Dates can remain unknown. An unknown ending does not mean the rule is still active.</p>
    {periods.map((p,index)=><section key={p.id} className={styles.group} data-draft-path={`periods.${index}`} aria-label={`Historical period ${index+1}`}>
      <Field path={`periods.${index}.label`} label="Give this period a name" help="Choose a short name that helps you recognize this part of the rule's history. For example, Before the Second Moon Shattered or The Years of Fading Magic. Enter any known beginning and ending dates below."><input value={p.label} maxLength={160} onChange={e=>update(index,{label:e.target.value})}/></Field>
      <Field path={`periods.${index}.account`} label="How did the rule work during this time?" help="Describe what was true, or believed to be true, during this period. For example: Before the moon shattered, a spirit could return to its body for one final night."><textarea value={p.account} maxLength={50_000} onChange={e=>update(index,{account:e.target.value})}/></Field>
      <Field path={`periods.${index}.perspective`} label="Who describes it this way?" help="Explain whose account this is and what supports it. Perhaps an order teaches it, an explorer witnessed it, or cultures disagree. Overlapping and conflicting accounts are welcome."><textarea value={p.perspective} maxLength={50_000} onChange={e=>update(index,{perspective:e.target.value})}/></Field>
      <Field path={`periods.${index}.status`} label="What was the rule's state?" help="Use your own description, such as active, dormant, changed or unknown. This describes the rule's state in this account, rather than how certain the account is. Dates do not set the state automatically."><input value={p.status} maxLength={160} onChange={e=>update(index,{status:e.target.value})}/></Field>
      {(["beginning","ending"] as const).map(bound=><div key={bound}><label className="st-field"><span><input type="checkbox" checked={p[bound]!==null} onChange={e=>update(index,{[bound]:e.target.checked?{version:1,scale:"world-year",kind:"undated"}:null})}/> Describe this period&apos;s {bound}</span></label>{p[bound]&&<TimeFields path={`periods.${index}.${bound}`} value={p[bound]} prefix={bound==="beginning"?"Period beginning":"Period ending"} onChange={time=>update(index,{[bound]:time})}/>}</div>)}
      <label className="st-field"><span><input type="checkbox" checked={p.protected} onChange={e=>update(index,{protected:e.target.checked})}/> Keep this period out of ordinary knowledge</span></label><p className={styles.hint}>Private periods can withhold the connected rule and its revealing events from the ordinary preview.</p>
      <button type="button" className="st-button is-secondary" onClick={()=>patch({periods:periods.filter((_,i)=>i!==index)})}>Remove historical period {index+1}</button>
    </section>)}<button type="button" className="st-button is-secondary" disabled={periods.length>=40} onClick={()=>patch({periods:[...periods,{id:newId(),label:"",status:"unknown",account:"",perspective:"",beginning:null,ending:null,protected:false}]})}>Add historical period</button>
  </section>;
}
