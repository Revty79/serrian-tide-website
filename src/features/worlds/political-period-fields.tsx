"use client";
import { Field } from "./world-field";
import { TimeFields } from "./lore-time-fields";
import type { LoreDraft } from "./peoples";
import { politicalPeriodCopy, isPoliticalFamily } from "./politics-composition";
import styles from "./creator-workshop.module.css";

export function PoliticalPeriodFields({ draft, patch, newId }: { draft: LoreDraft; patch: (value: Partial<LoreDraft>) => void; newId: () => string }) {
  if (!isPoliticalFamily(draft.family)) return null;
  const periods = draft.periods ?? [], copy = politicalPeriodCopy[draft.family];
  const update = (index: number, change: Partial<typeof periods[number]>) => patch({ periods: periods.map((p, i) => i === index ? { ...p, ...change } : p) });
  return <section data-draft-path="periods"><p>{copy.introduction}</p><p>Beginning and ending dates are independently optional. Unknown endings do not mean a period continues. These dates describe the period, rather than this account or a historical event.</p>
    {periods.map((p, index) => <section key={p.id} className={styles.group} data-draft-path={`periods.${index}`} aria-label={`Political period ${index + 1}`}>
      <Field path={`periods.${index}.label`} label="Give this period a name" help="Choose your own short name, such as The Shared Seat or Before the River Compact. These examples are not saved facts. Up to 160 characters."><input value={p.label} maxLength={160} onChange={e => update(index, { label: e.target.value })} /></Field>
      <Field path={`periods.${index}.account`} label={copy.account} help="Describe this stretch of political history in your own words, including conflicting accounts. This narrative does not create another event. Optional; up to 50,000 characters."><textarea value={p.account} maxLength={50_000} onChange={e => update(index, { account: e.target.value })} /></Field>
      <Field path={`periods.${index}.perspective`} label="Who describes it this way?" help="Attribute the account to witnesses, traditions or other sources. Several overlapping accounts can disagree. Optional; up to 50,000 characters."><textarea value={p.perspective} maxLength={50_000} onChange={e => update(index, { perspective: e.target.value })} /></Field>
      <Field path={`periods.${index}.status`} label={copy.state} help={`Use your own wording, such as ${copy.examples}. A status is required when keeping a period; write unknown if undecided. Status differs from certainty, and dates do not set it. Up to 160 characters.`}><input value={p.status} maxLength={160} onChange={e => update(index, { status: e.target.value })} /></Field>
      <details><summary>Dates, if known</summary>{(["beginning", "ending"] as const).map(bound => <div key={bound} data-draft-path={`periods.${index}.${bound}`}><label className="st-field"><span><input type="checkbox" checked={p[bound] !== null} onChange={e => update(index, { [bound]: e.target.checked ? { version: 1, scale: "world-year", kind: "undated" } : null })} /> Describe this period&apos;s {bound}</span></label>{p[bound] && <TimeFields path={`periods.${index}.${bound}`} value={p[bound]} prefix={bound === "beginning" ? "Period beginning" : "Period ending"} onChange={time => update(index, { [bound]: time })} />}</div>)}</details>
      <label className="st-field"><span><input type="checkbox" checked={p.protected} onChange={e => update(index, { protected: e.target.checked })} /> Keep this period out of ordinary knowledge</span></label><p className={styles.hint}>The server withholds private periods from ordinary reading. A revealing political relationship and its events may also be withheld.</p>
      <button type="button" className="st-button is-secondary" onClick={() => patch({ periods: periods.filter((_, i) => i !== index) })}>Remove political period {index + 1}</button>
    </section>)}<button type="button" className="st-button is-secondary" disabled={periods.length >= 40} onClick={() => patch({ periods: [...periods, { id: newId(), label: "", status: "unknown", account: "", perspective: "", beginning: null, ending: null, protected: false }] })}>Add political period</button>
  </section>;
}
