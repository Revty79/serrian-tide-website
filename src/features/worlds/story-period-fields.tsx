"use client";
import { Field } from "./world-field";
import { TimeFields } from "./lore-time-fields";
import type { LoreDraft } from "./peoples";
import styles from "./creator-workshop.module.css";

export function StoryPeriodFields({draft,patch,newId}:{draft:LoreDraft;patch:(value:Partial<LoreDraft>)=>void;newId:()=>string}) {
  const periods=draft.periods??[];
  const update=(index:number,change:Partial<typeof periods[number]>)=>patch({periods:periods.map((p,i)=>i===index?{...p,...change}:p)});
  return <section data-draft-path="periods"><h4>How has this story been transmitted or retold?</h4><p>Describe periods of circulation, oral transmission or later retellings. Overlapping and contradictory accounts remain separate. Dates can remain unknown. An unknown ending does not establish continuing transmission.</p>
    {periods.map((p,index)=><section key={p.id} className={styles.group} data-draft-path={`periods.${index}`} aria-label={`Historical period ${index+1}`}>
      <Field path={`periods.${index}.label`} label="Give this period a name" help="Choose a short name that helps you recognize this part of the story's history. For example, An oral tradition or The first written retelling. Enter any known beginning and ending dates below."><input value={p.label} maxLength={160} onChange={e=>update(index,{label:e.target.value})}/></Field>
      <Field path={`periods.${index}.account`} label="How was the story told during this time?" help="Describe circulation, changes in wording or a retelling's audience. Preserve contradictory accounts without deciding which is true. Optional; up to 50,000 characters."><textarea value={p.account} maxLength={50_000} onChange={e=>update(index,{account:e.target.value})}/></Field>
      <Field path={`periods.${index}.perspective`} label="Who describes it this way?" help="Explain whose account this is and what supports it. Perhaps an order teaches it, an explorer witnessed it, or cultures disagree. Overlapping and conflicting accounts are welcome."><textarea value={p.perspective} maxLength={50_000} onChange={e=>update(index,{perspective:e.target.value})}/></Field>
      <Field path={`periods.${index}.status`} label="How would you describe this transmission?" help="Use your own description, such as circulated orally, recorded in writing, disputed or unknown. This describes transmission, independently of reliability. Dates never set this description automatically. Up to 160 characters."><input value={p.status} maxLength={160} onChange={e=>update(index,{status:e.target.value})}/></Field>
      {(["beginning","ending"] as const).map(bound=><div key={bound}><label className="st-field"><span><input type="checkbox" checked={p[bound]!==null} onChange={e=>update(index,{[bound]:e.target.checked?{version:1,scale:"world-year",kind:"undated"}:null})}/> Describe this period&apos;s {bound}</span></label>{p[bound]&&<TimeFields path={`periods.${index}.${bound}`} value={p[bound]} prefix={bound==="beginning"?"Period beginning":"Period ending"} onChange={time=>update(index,{[bound]:time})}/>}</div>)}
      <label className="st-field"><span><input type="checkbox" checked={p.protected} onChange={e=>update(index,{protected:e.target.checked})}/> Keep this period out of ordinary knowledge</span></label><p className={styles.hint}>Private periods can withhold the connected story and its revealing events from the ordinary preview.</p>
      <button type="button" className="st-button is-secondary" onClick={()=>patch({periods:periods.filter((_,i)=>i!==index)})}>Remove historical period {index+1}</button>
    </section>)}<button type="button" className="st-button is-secondary" disabled={periods.length>=40} onClick={()=>patch({periods:[...periods,{id:newId(),label:"",status:"unknown",account:"",perspective:"",beginning:null,ending:null,protected:false}]})}>Add historical period</button>
  </section>;
}
