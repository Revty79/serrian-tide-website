"use client";
import { Field } from "./world-field";
import { TimeFields } from "./lore-time-fields";
import type { LoreDraft } from "./peoples";
import { organizationPeriodCopy, isOrganizationFamily } from "./organizations-composition";
import styles from "./creator-workshop.module.css";

export function OrganizationPeriodFields({ draft, patch, newId }: { draft: LoreDraft; patch: (value: Partial<LoreDraft>) => void; newId: () => string }) {
  if (!isOrganizationFamily(draft.family)) return null;
  const periods = draft.periods ?? [], copy = organizationPeriodCopy[draft.family];
  const update = (index: number, change: Partial<typeof periods[number]>) => patch({ periods: periods.map((p, i) => i === index ? { ...p, ...change } : p) });
  return <section data-draft-path="periods"><p>Beginning and ending dates are independently optional. Unknown endings do not mean a membership, assignment or relationship continues. These dates describe the period, rather than this account or an actual historical event.</p>
    {periods.map((p, index) => <section key={p.id} className={styles.group} data-draft-path={`periods.${index}`} aria-label={`Organization period ${index + 1}`}>
      <Field path={`periods.${index}.label`} label="Give this period a name" help="Choose your own name, such as The Shared Watch or Before the Guild Returned. These examples are ideas, not saved facts. Up to 160 characters."><input value={p.label} maxLength={160} onChange={e => update(index, { label: e.target.value })} /></Field>
      <Field path={`periods.${index}.account`} label={copy.account} help="Describe this stretch of history in your own words, keeping conflicting or uncertain accounts. This does not create another historical event. Optional; up to 50,000 characters."><textarea value={p.account} maxLength={50_000} onChange={e => update(index, { account: e.target.value })} /></Field>
      <Field path={`periods.${index}.perspective`} label="Who describes it this way?" help="Attribute the account to witnesses, traditions or other sources. Overlapping accounts can disagree. Optional; up to 50,000 characters."><textarea value={p.perspective} maxLength={50_000} onChange={e => update(index, { perspective: e.target.value })} /></Field>
      <Field path={`periods.${index}.status`} label={copy.state} help={`Keep your own wording, such as ${copy.examples}. A status is required for a saved period; write unknown if undecided. Status differs from certainty, and dates do not decide it. Up to 160 characters.`}><input value={p.status} maxLength={160} onChange={e => update(index, { status: e.target.value })} /></Field>
      <details><summary>Dates, if known</summary>{(["beginning", "ending"] as const).map(bound => <div key={bound} data-draft-path={`periods.${index}.${bound}`}><label className="st-field"><span><input type="checkbox" checked={p[bound] !== null} onChange={e => update(index, { [bound]: e.target.checked ? { version: 1, scale: "world-year", kind: "undated" } : null })} /> Describe this period&apos;s {bound}</span></label>{p[bound] && <TimeFields path={`periods.${index}.${bound}`} value={p[bound]} prefix={bound === "beginning" ? "Period beginning" : "Period ending"} onChange={time => update(index, { [bound]: time })} />}</div>)}</details>
      <label className="st-field"><span><input type="checkbox" checked={p.protected} onChange={e => update(index, { protected: e.target.checked })} /> Keep this period out of ordinary knowledge</span></label><p className={styles.hint}>The server withholds private periods. Protect the membership, assignment or whole identity too when its existence would reveal a secret.</p>
      <button type="button" className="st-button is-secondary" onClick={() => patch({ periods: periods.filter((_, i) => i !== index) })}>Remove organization period {index + 1}</button>
    </section>)}<button type="button" className="st-button is-secondary" disabled={periods.length >= 40} onClick={() => patch({ periods: [...periods, { id: newId(), label: "", status: "unknown", account: "", perspective: "", beginning: null, ending: null, protected: false }] })}>Add organization period</button>
  </section>;
}
