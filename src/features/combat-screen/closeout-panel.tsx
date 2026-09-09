"use client";
import { useEffect, useRef, useState } from "react";
import { allocateCreatureExperience, allocateEncounterExperience, type CreatureExperienceMode } from "@/features/tabletop-operations/combat-xp";
import type { CombatExperienceDecisionInput } from "@/features/tabletop-operations/combat-xp-service";
import { readCombatCloseout, endCombatWithAwards } from "./operation-actions";
import { combatMessage } from "./form-controls";
import styles from "./combat-screen.module.css";
type Selection = { included: boolean; mode: CreatureExperienceMode; recipients: number[]; killer: string; reason: string; value: string };
const blank: Selection = { included: false, mode: "full-to-each", recipients: [], killer: "", reason: "", value: "" };
export function CloseoutPanel({ encounterId, token, disabled, refresh }: { encounterId: number; token: string; disabled: boolean; refresh: () => Promise<void> }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof readCombatCloseout>> | null>(null), [choices, setChoices] = useState<Record<number, Selection>>({});
  const [amount, setAmount] = useState(""), [recipients, setRecipients] = useState<number[]>([]), [note, setNote] = useState("");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [opened, setOpened] = useState(false);
  const [preview, setPreview] = useState<{ fingerprint: string; token: string; decisions: CombatExperienceDecisionInput[]; totals: [number, number][] } | null>(null);
  const running = useRef(false), fingerprint = JSON.stringify({ choices, amount, recipients, note });
  useEffect(() => { let active = true; if (opened) void readCombatCloseout(encounterId).then((value) => { if (active) setData(value); }).catch((error: unknown) => { if (active) setMessage(combatMessage(error instanceof Error ? error.message : "Closeout is unavailable.")); }); return () => { active = false; }; }, [encounterId, token, opened]);
  function change(id: number, value: Partial<Selection>) { setChoices((prior) => ({ ...prior, [id]: { ...(prior[id] ?? blank), ...value } })); }
  function prepare() {
    if (!data) return;
    try {
      const decisions: CombatExperienceDecisionInput[] = [], totals = new Map<number, number>();
      const add = (awards: { characterId: number; amount: number }[]) => awards.forEach((award) => totals.set(award.characterId, (totals.get(award.characterId) ?? 0) + award.amount));
      for (const creature of data.creatures) {
        const choice = choices[creature.participantId] ?? blank; if (!choice.included || creature.awarded) continue;
        const killerId = choice.killer ? Number(choice.killer) : creature.killerId;
        const ids = choice.mode === "killer-only" && killerId !== null ? [killerId] : choice.recipients;
        const value = choice.value !== "" ? Number(choice.value) : creature.value;
        if (value === null) throw new Error(`${creature.name} needs a specific XP value ruling.`);
        if ((choice.killer || choice.value !== "") && !choice.reason.trim()) throw new Error(`${creature.name} needs the reason for the killer or XP value ruling.`);
        add(allocateCreatureExperience({ value, mode: choice.mode, recipientCharacterIds: ids, killerCharacterId: killerId }));
        decisions.push({ kind: "creature", defeatedParticipantId: creature.participantId, mode: choice.mode, recipientCharacterIds: ids, requestKey: crypto.randomUUID(), note,
          ...(choice.killer ? { killerRuling: { characterId: Number(choice.killer), reason: choice.reason } } : {}), ...(choice.value !== "" ? { valueRuling: { value, reason: choice.reason } } : {}) });
      }
      if (amount !== "" && !data.encounterAwarded) { add(allocateEncounterExperience(Number(amount), recipients)); decisions.push({ kind: "encounter", amountPerCharacter: Number(amount), recipientCharacterIds: recipients, requestKey: crypto.randomUUID(), note }); }
      setPreview({ fingerprint, token, decisions, totals: [...totals] }); setMessage("");
    } catch (error) { setPreview(null); setMessage(combatMessage(error instanceof Error ? error.message : "Review the selected XP awards.")); }
  }
  const blockers = data?.closeout.blockers.filter((entry) => entry.code !== "initiative-active") ?? [];
  return <details onToggle={(event) => setOpened(event.currentTarget.open)}><summary>End Combat &amp; XP</summary>
    {!data ? <p>{message || "Reading closeout…"}</p> : <><p className={styles.muted}>Select rewards explicitly. Each Creature is its exact defeated occurrence. Additional encounter XP gives every selected recipient the full entered amount.</p>
    {data.creatures.map((creature) => { const choice = choices[creature.participantId] ?? blank; return <fieldset key={creature.participantId}><legend>{creature.name} · {creature.value ?? "unruled"} XP{creature.awarded ? " · already awarded" : ""}</legend>
      {!creature.awarded ? <><label className={styles.check}><input type="checkbox" checked={choice.included} onChange={(event) => change(creature.participantId, { included: event.target.checked })} /> Include this Creature award</label>
      {choice.included ? <><div className={styles.fields}><label className="st-field">Creature award mode<select className="st-control" value={choice.mode} onChange={(event) => change(creature.participantId, { mode: event.target.value as CreatureExperienceMode })}><option value="full-to-each">Full Creature XP to each selected Character</option><option value="killer-only">Full Creature XP to the killer</option><option value="shared-split">Shared split; remainder to selected killer</option></select></label>
      <label className="st-field">Killer attribution<select className="st-control" value={choice.killer} onChange={(event) => change(creature.participantId, { killer: event.target.value })}><option value="">{creature.killerId ? `Recorded: ${data.closeout.recipients.find((entry) => entry.characterId === creature.killerId)?.name ?? "ineligible attribution"}` : "No unambiguous killer recorded"}</option>{data.closeout.recipients.map((entry) => <option key={entry.characterId} value={entry.characterId}>{entry.name}</option>)}</select></label>
      <label className="st-field">XP value ruling (optional)<input className="st-control" type="number" min="0" step="1" value={choice.value} onChange={(event) => change(creature.participantId, { value: event.target.value })} /></label><label className="st-field">Attribution/value ruling reason<input className="st-control" value={choice.reason} onChange={(event) => change(creature.participantId, { reason: event.target.value })} /></label></div>
      {choice.mode !== "killer-only" ? data.closeout.recipients.map((entry) => <label className={styles.check} key={entry.characterId}><input type="checkbox" checked={choice.recipients.includes(entry.characterId)} onChange={(event) => change(creature.participantId, { recipients: event.target.checked ? [...choice.recipients, entry.characterId] : choice.recipients.filter((id) => id !== entry.characterId) })} /> {entry.name}</label>) : null}</> : null}</> : null}
    </fieldset>; })}
    {!data.encounterAwarded ? <fieldset><legend>Additional encounter XP</legend><label className="st-field">XP per selected Character<input className="st-control" type="number" min="0" step="1" value={amount} placeholder="Leave blank for no additional award" onChange={(event) => setAmount(event.target.value)} /></label>{data.closeout.recipients.map((entry) => <label className={styles.check} key={entry.characterId}><input type="checkbox" checked={recipients.includes(entry.characterId)} onChange={(event) => setRecipients(event.target.checked ? [...recipients, entry.characterId] : recipients.filter((id) => id !== entry.characterId))} /> {entry.name}</label>)}</fieldset> : <p>Additional encounter XP was already awarded.</p>}
    <label className="st-field">Reward note<input className="st-control" value={note} onChange={(event) => setNote(event.target.value)} /></label>
    {blockers.map((entry, index) => <p key={index} className={styles.muted}>{combatMessage(entry.message)}</p>)}{data.closeout.warnings.map((warning) => <p key={warning}>{combatMessage(warning)}</p>)}
    <button className="st-button" disabled={busy || data.closeout.encounter.status === "completed"} onClick={prepare}>Preview closeout</button>
    {preview && preview.fingerprint === fingerprint ? <div className={styles.notice}><h4>Selected XP totals</h4>{preview.totals.length ? <ul>{preview.totals.map(([id, total]) => <li key={id}>{data.closeout.recipients.find((entry) => entry.characterId === id)?.name}: +{total} XP</li>)}</ul> : <p>End combat without new XP awards.</p>}
      {preview.token !== token ? <p>The fight changed. Preview closeout again before confirming.</p> : null}
      <button className="st-button is-primary" disabled={disabled || busy || blockers.length > 0 || preview.token !== token} onClick={async () => {
        if (running.current) return; running.current = true; setBusy(true);
        try { await endCombatWithAwards(encounterId, preview.token, { awards: [], combatXpDecisions: preview.decisions, rewardNote: note }); setMessage("Combat ended. Awards and final information are preserved."); await refresh(); }
        catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "Closeout was not confirmed. Retry preserves the selected decisions.")); await refresh(); }
        finally { running.current = false; setBusy(false); }
      }}>End Combat{preview.totals.length ? " & award XP" : " without XP"}</button></div> : null}
    {data.closeout.rewards.length ? <details><summary>Award history</summary><ul>{data.closeout.rewards.map((entry) => <li key={entry.id}>{entry.characterName}: +{entry.amount} XP · {entry.note}</li>)}</ul></details> : null}
    {message ? <p role="status">{message}</p> : null}</>}
  </details>;
}
