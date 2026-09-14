"use client";

import { useState } from "react";
import type { CloseoutAwardInput, CloseoutAwardView } from "@/features/tabletop-operations/closeout-awards";
import { normalizeCloseoutAwards } from "@/features/tabletop-operations/closeout-awards";
import styles from "./closeout-awards.module.css";

const currencies = [{ key: "experience", label: "XP" }, { key: "fame", label: "Fame" }, { key: "quintessence", label: "Quintessence" }] as const;
type Amounts = Record<(typeof currencies)[number]["key"], string>;
type Draft = { amounts: Record<number, Amounts>; note: string };

export function useCloseoutAwardDraft(key: string, view: CloseoutAwardView) {
  const [saved, setSaved] = useState<{ key: string; value: Draft }>({ key, value: { amounts: {}, note: "" } });
  const draft = saved.key === key ? saved.value : { amounts: {}, note: "" };
  const setDraft = (value: Draft) => setSaved({ key, value });
  function input(): CloseoutAwardInput {
    if (view.decision) return { awards: [], note: "" };
    return normalizeCloseoutAwards({ note: draft.note, awards: Object.entries(draft.amounts).map(([id, values]) => ({
      characterId: Number(id), experience: Number(values.experience), fame: Number(values.fame), quintessence: Number(values.quintessence),
    })) });
  }
  return { draft, setDraft, input };
}

export function CloseoutAwardHistory({ view, label }: { view: CloseoutAwardView; label: string }) {
  const decision = view.decision;
  if (!decision) return null;
  return <section className={styles.history} aria-label={`${label} award history`}>
    <h4>{label} awards recorded</h4>
    <p>{decision.awardedBy} &middot; {new Date(decision.awardedAt).toLocaleString()}</p>
    {decision.awards.some((award) => award.experience || award.fame || award.quintessence) ? <ul>{decision.awards.map((award) => <li key={award.characterId}>
      <strong>{award.characterName}</strong><span>{award.experience} XP &middot; {award.fame} Fame &middot; {award.quintessence} Quintessence</span>
    </li>)}</ul> : <p>No rewards awarded.</p>}
    {decision.note ? <p className={styles.note}>{decision.note}</p> : null}
  </section>;
}

export function CloseoutAwardFields({ view, draft, onChange, disabled, label }: {
  view: CloseoutAwardView; draft: Draft; onChange: (draft: Draft) => void; disabled: boolean; label: string;
}) {
  if (view.decision) return <><CloseoutAwardHistory view={view} label={label} /><p className={styles.notice}>Previously recorded awards will not be issued again.</p></>;
  return <fieldset className={styles.fields} disabled={disabled} aria-label={`${label} awards`}>
    <legend>{label} awards</legend>
    {view.recipients.length ? view.recipients.map(({ characterId, characterName }) => <div className={styles.recipient} key={characterId}>
      <strong>{characterName}</strong>
      <div className={styles.amounts}>{currencies.map(({ key, label: currency }) => <label className="st-field" key={key}>
        {currency}<input className="st-control" type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="any" inputMode="decimal" aria-label={`${characterName} ${currency}`}
          value={draft.amounts[characterId]?.[key] ?? ""} onChange={(event) => onChange({ ...draft, amounts: { ...draft.amounts,
            [characterId]: { ...(draft.amounts[characterId] ?? { experience: "", fame: "", quintessence: "" }), [key]: event.target.value },
          } })} />
      </label>)}</div>
    </div>) : <p>No eligible Character profiles.</p>}
    <label className="st-field">Award note<textarea className="st-control" rows={2} maxLength={2000} value={draft.note} onChange={(event) => onChange({ ...draft, note: event.target.value })} /></label>
  </fieldset>;
}
