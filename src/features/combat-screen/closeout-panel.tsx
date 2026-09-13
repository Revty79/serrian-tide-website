"use client";
import { useEffect, useRef, useState } from "react";
import { allocateCreatureExperience, allocateEncounterExperience, type CreatureExperienceMode } from "@/features/tabletop-operations/combat-xp";
import type { CombatExperienceDecisionInput } from "@/features/tabletop-operations/combat-xp-service";
import { readCombatCloseout, endCombatWithAwards } from "./operation-actions";
import { EffectEvidence } from "./effect-ruling";
import type { CombatOperations } from "./next-input";
import { combatEffectSummary } from "./result-summary";
import { combatMessage } from "./form-controls";
import styles from "./combat-screen.module.css";
type Selection = { included: boolean; mode: CreatureExperienceMode; recipients: number[]; killer: string; reason: string; value: string; fame: string };
const blank: Selection = { included: false, mode: "full-to-each", recipients: [], killer: "", reason: "", value: "", fame: "" };
export function CloseoutPanel({ encounterId, token, encounterEnded, resultRevision, disabled, operations, onInspect, refresh }: { encounterId: number; token: string; encounterEnded: boolean; resultRevision: string; disabled: boolean; operations: CombatOperations | null; onInspect: (participantId: number, planId?: number) => void; refresh: () => Promise<void> }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof readCombatCloseout>> | null>(null), [choices, setChoices] = useState<Record<number, Selection>>({});
  const [killChoices, setKillChoices] = useState<Record<number, { included: boolean; killer: string; reason: string }>>({});
  const [amount, setAmount] = useState(""), [recipients, setRecipients] = useState<number[]>([]), [note, setNote] = useState("");
  const readKey = JSON.stringify([token, encounterEnded, resultRevision, operations?.plans.map((plan) => [plan.id, plan.status, plan.effects.map((effect) => [effect.id, effect.status])])]);
  const [readToken, setReadToken] = useState<string | null>(null), [readError, setReadError] = useState("");
  const [readGeneration, setReadGeneration] = useState(0);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [opened, setOpened] = useState(false);
  const [preview, setPreview] = useState<{ fingerprint: string; token: string; decisions: CombatExperienceDecisionInput[]; totals: [number, number][]; fameTotals: [number, number][] } | null>(null);
  const running = useRef(false), fingerprint = JSON.stringify({ choices, killChoices, amount, recipients, note });
  useEffect(() => { let active = true; if (opened) void readCombatCloseout(encounterId).then((value) => { if (active) { setData(value); setReadToken(readKey); setReadError(""); } }).catch((error: unknown) => { if (active) setReadError(combatMessage(error instanceof Error ? error.message : "Closeout is unavailable.")); }); return () => { active = false; }; }, [encounterId, readKey, opened, readGeneration]);
  function change(id: number, value: Partial<Selection>) { setChoices((prior) => ({ ...prior, [id]: { ...(prior[id] ?? blank), ...value } })); }
  function prepare() {
    if (!data || readToken !== readKey || readError || disabled) return;
    try {
      const decisions: CombatExperienceDecisionInput[] = [], totals = new Map<number, number>(), fameTotals = new Map<number, number>();
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
      for (const npc of data.npcs) {
        const choice = choices[npc.participantId] ?? blank;
        if (!choice.included || npc.awarded) continue;
        if (choice.value === "") throw new Error("Enter the G.O.D. XP award for " + npc.name + "; enter 0 for Fame only.");
        const xp = Number(choice.value), fame = choice.fame === "" ? 0 : Number(choice.fame);
        if (!Number.isFinite(fame) || fame < 0 || fame > Number.MAX_SAFE_INTEGER) throw new Error("Enter a finite, nonnegative Fame award.");
        add(allocateEncounterExperience(xp, choice.recipients));
        for (const id of choice.recipients) if (fame > 0) fameTotals.set(id, (fameTotals.get(id) ?? 0) + fame);
        decisions.push({ kind: "npc", defeatedParticipantId: npc.participantId, amountPerCharacter: xp, famePerCharacter: fame,
          recipientCharacterIds: choice.recipients, reason: choice.reason.trim() || "G.O.D. selected the NPC outcome awards.", note, requestKey: crypto.randomUUID() });
      }
      for (const kill of data.kills) {
        const choice = killChoices[kill.participantId];
        if (!choice?.included || kill.awarded) continue;
        const killerId = Number(choice.killer) || kill.killerId;
        if (!killerId || !data.playerIds.includes(killerId)) throw new Error("Credit a Player Character for " + kill.name + "'s kill Fame.");
        if (kill.challengeRating === null) throw new Error(kill.name + " needs an authored CR before kill Fame can be awarded.");
        if (!choice.reason.trim()) throw new Error("Record the reason for this kill attribution.");
        fameTotals.set(killerId, (fameTotals.get(killerId) ?? 0) + kill.challengeRating);
        decisions.push({ kind: "creature-kill-fame", defeatedParticipantId: kill.participantId, killerCharacterId: killerId,
          recipientCharacterIds: [killerId], reason: choice.reason, note, requestKey: crypto.randomUUID() });
      }
      if (amount !== "" && !data.encounterAwarded) { add(allocateEncounterExperience(Number(amount), recipients)); decisions.push({ kind: "encounter", amountPerCharacter: Number(amount), recipientCharacterIds: recipients, requestKey: crypto.randomUUID(), note }); }
      setPreview({ fingerprint, token, decisions, totals: [...totals], fameTotals: [...fameTotals] }); setMessage("");
    } catch (error) { setPreview(null); setMessage(combatMessage(error instanceof Error ? error.message : "Review the selected XP awards.")); }
  }
  const ended = encounterEnded;
  const blockers = data?.closeout.blockers.filter((entry) => entry.code !== "initiative-active") ?? [];
  const reading = readToken !== readKey || !!readError;
  return <details id="combat-closeout" className={styles.window} onToggle={(event) => setOpened(event.currentTarget.open)}><summary>{ended ? "Combat ended: XP & award history" : "End Combat & XP"}</summary>
    {!data ? <p>{readError || message || "Reading closeout…"}</p> : <><p className={styles.muted}>Defeated or incapacitated Creatures can receive an XP award. Select each exact occurrence and its recipients. Awarding XP preserves the Creature&apos;s condition and can happen only once per occurrence. Additional encounter XP gives every selected recipient the full entered amount.</p>
    {data.creatures.map((creature) => { const choice = choices[creature.participantId] ?? blank; return <fieldset key={creature.participantId}><legend>{creature.name} · {creature.condition} · {creature.value ?? "unruled"} XP{creature.awarded ? " · already awarded" : ""}</legend>
      {!creature.awarded ? <><label className={styles.check}><input type="checkbox" checked={choice.included} onChange={(event) => change(creature.participantId, { included: event.target.checked })} /> Include this Creature award</label>
      {choice.included ? <><div className={styles.fields}><label className="st-field">Creature award mode<select className="st-control" value={choice.mode} onChange={(event) => change(creature.participantId, { mode: event.target.value as CreatureExperienceMode })}><option value="full-to-each">Full Creature XP to each selected Character</option><option value="killer-only">Full Creature XP to the killer</option><option value="shared-split">Shared split; remainder to selected killer</option></select></label>
      <label className="st-field">Killer attribution<select className="st-control" value={choice.killer} onChange={(event) => change(creature.participantId, { killer: event.target.value })}><option value="">{creature.killerId ? `Recorded: ${data.closeout.recipients.find((entry) => entry.characterId === creature.killerId)?.name ?? "ineligible attribution"}` : "No unambiguous killer recorded"}</option>{data.closeout.recipients.map((entry) => <option key={entry.characterId} value={entry.characterId}>{entry.name}</option>)}</select></label>
      <label className="st-field">XP value ruling (optional)<input className="st-control" type="number" min="0" step="1" value={choice.value} onChange={(event) => change(creature.participantId, { value: event.target.value })} /></label><label className="st-field">Attribution/value ruling reason<input className="st-control" value={choice.reason} onChange={(event) => change(creature.participantId, { reason: event.target.value })} /></label></div>
      {choice.mode !== "killer-only" ? data.closeout.recipients.map((entry) => <label className={styles.check} key={entry.characterId}><input type="checkbox" checked={choice.recipients.includes(entry.characterId)} onChange={(event) => change(creature.participantId, { recipients: event.target.checked ? [...choice.recipients, entry.characterId] : choice.recipients.filter((id) => id !== entry.characterId) })} /> {entry.name}</label>) : null}</> : null}</> : null}
    </fieldset>; })}
    {data.npcs.map((npc) => { const choice = choices[npc.participantId] ?? blank; return <fieldset key={npc.participantId}><legend>{npc.name} / {npc.condition}{npc.awarded ? " / already awarded" : ""}</legend>
      {!npc.awarded ? <><label className={styles.check}><input type="checkbox" checked={choice.included} onChange={(event) => change(npc.participantId, { included: event.target.checked })} /> Include this NPC award</label>
        {choice.included ? <><p>G.O.D. chooses the amounts below for each selected Character. Creature kill CR Fame is recorded separately.</p><div className={styles.fields}>
          <label className="st-field">NPC XP per selected Character<input className="st-control" type="number" min="0" step="1" value={choice.value} onChange={(event) => change(npc.participantId, { value: event.target.value })} /></label>
          <label className="st-field">NPC Fame per selected Character<input className="st-control" type="number" min="0" step="any" value={choice.fame} placeholder="0" onChange={(event) => change(npc.participantId, { fame: event.target.value })} /></label>
          <label className="st-field">NPC award note<input className="st-control" value={choice.reason} onChange={(event) => change(npc.participantId, { reason: event.target.value })} /></label>
        </div>{data.closeout.recipients.map((entry) => <label className={styles.check} key={entry.characterId}><input type="checkbox" checked={choice.recipients.includes(entry.characterId)} onChange={(event) => change(npc.participantId, { recipients: event.target.checked ? [...choice.recipients, entry.characterId] : choice.recipients.filter((id) => id !== entry.characterId) })} /> {entry.name}</label>)}</> : null}
      </> : null}</fieldset>; })}
    {data.kills.length ? <fieldset><legend>Creature kill Fame</legend><p>A Player Character earns the killed Creature&apos;s CR once. Incapacitation and surrender do not award kill Fame. Missing kill credit requires a G.O.D. attribution.</p>
      {data.kills.map((kill) => { const choice = killChoices[kill.participantId] ?? { included: false, killer: "", reason: "" };
        const changeKill = (update: Partial<typeof choice>) => setKillChoices((prior) => ({ ...prior, [kill.participantId]: { ...choice, ...update } }));
        return <div key={kill.participantId}><p>{kill.name}: {kill.challengeRating ?? "CR missing"} Fame{kill.awarded ? " / already awarded" : ""}</p>
          {!kill.awarded ? <><label className={styles.check}><input type="checkbox" checked={choice.included} onChange={(event) => changeKill({ included: event.target.checked })} /> Credit this kill and award Fame</label>
            {choice.included ? <div className={styles.fields}><label className="st-field">Player who made the kill<select className="st-control" value={choice.killer || (kill.killerId ?? "")} onChange={(event) => changeKill({ killer: event.target.value })}><option value="">Choose the Player Character</option>{data.closeout.recipients.filter((entry) => data.playerIds.includes(entry.characterId)).map((entry) => <option value={entry.characterId} key={entry.characterId}>{entry.name}</option>)}</select></label>
            <label className="st-field">Kill attribution reason<input className="st-control" value={choice.reason} onChange={(event) => changeKill({ reason: event.target.value })} /></label></div> : null}</> : null}
        </div>;
      })}</fieldset> : null}
    {!data.encounterAwarded ? <fieldset><legend>Additional encounter XP</legend><label className="st-field">XP per selected Character<input className="st-control" type="number" min="0" step="1" value={amount} placeholder="Leave blank for no additional award" onChange={(event) => setAmount(event.target.value)} /></label>{data.closeout.recipients.map((entry) => <label className={styles.check} key={entry.characterId}><input type="checkbox" checked={recipients.includes(entry.characterId)} onChange={(event) => setRecipients(event.target.checked ? [...recipients, entry.characterId] : recipients.filter((id) => id !== entry.characterId))} /> {entry.name}</label>)}</fieldset> : <p>Additional encounter XP was already awarded.</p>}
    <label className="st-field">Reward note<input className="st-control" value={note} onChange={(event) => setNote(event.target.value)} /></label>
    {!ended && blockers.length ? <div className={styles.notice} role="status"><h4>Before ending combat</h4><p>Settle these remaining actions or decisions. Damage already applied stays recorded.</p>{blockers.map((entry, index) => {
      const plan = operations?.plans.find((candidate) => candidate.id === entry.planId);
      const remaining = plan?.effects.filter((effect) => !["applied", "manual-resolved", "declined"].includes(effect.status));
      return <div key={index}><p>{plan ? plan.actorName + ": " + plan.sourceSnapshot.displayName : combatMessage(entry.message)}</p>
        {remaining?.map((effect) => <div key={effect.id}><p>{combatEffectSummary(effect, true)}</p><EffectEvidence value={effect.finalValue} /></div>)}
        {plan && !remaining?.length ? <p>All individual effects are settled. Finish recording this result.</p> : null}
        {entry.characterId !== null ? <button className="st-button" onClick={() => onInspect(entry.characterId!, entry.planId)}>{plan ? "Open remaining result" : "Open combatant controls"}</button> : null}
      </div>;
    })}</div> : null}{data.closeout.warnings.map((warning) => <p key={warning}>{combatMessage(warning)}</p>)}
    <button className="st-button" disabled={disabled || busy || reading} onClick={prepare}>{ended ? "Preview XP awards" : "Preview closeout"}</button>
    {preview && preview.fingerprint === fingerprint ? <div className={styles.notice}><h4>Selected award totals</h4>{preview.totals.length ? <ul>{preview.totals.map(([id, total]) => <li key={id}>{data.closeout.recipients.find((entry) => entry.characterId === id)?.name}: +{total} XP</li>)}</ul> : <p>{ended ? "No new XP awards selected." : "End combat without new XP awards."}</p>}
      {preview.fameTotals.length ? <ul>{preview.fameTotals.map(([id, total]) => <li key={id}>{data.closeout.recipients.find((entry) => entry.characterId === id)?.name}: +{total} Fame</li>)}</ul> : null}
      {preview.token !== token ? <p>The fight changed. Preview closeout again before confirming.</p> : null}
      <button className="st-button is-primary" disabled={disabled || busy || reading || !ended && blockers.length > 0 || preview.token !== token || ended && preview.decisions.length === 0} onClick={async () => {
        if (running.current) return; running.current = true; setBusy(true);
        try { await endCombatWithAwards(encounterId, preview.token, { awards: [], combatXpDecisions: preview.decisions, rewardNote: note }); setMessage(ended ? "XP awards recorded. Combat remains ended." : "Combat ended. Awards and final information are preserved."); setReadToken(null); setReadGeneration((value) => value + 1); setPreview(null); await refresh(); }
        catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "Closeout was not confirmed. Retry preserves the selected decisions.")); await refresh(); }
        finally { running.current = false; setBusy(false); }
      }}>{ended ? preview.fameTotals.length ? "Award selected XP & Fame" : "Award selected XP" : "End Combat" + (preview.fameTotals.length ? " & award XP / Fame" : preview.totals.length ? " & award XP" : " without XP")}</button></div> : null}
    {data.fameHistory.length ? <details><summary>Fame award history</summary><ul>{data.fameHistory.map((entry) => <li key={entry.decisionId + ":" + entry.characterId}>{data.closeout.recipients.find((recipient) => recipient.characterId === entry.characterId)?.name ?? "Character"}: +{entry.amount} Fame / {entry.source}</li>)}</ul></details> : null}
    {data.closeout.rewards.length ? <details><summary>Award history</summary><ul>{data.closeout.rewards.map((entry) => <li key={entry.id}>{entry.characterName}: +{entry.amount} XP · {entry.note}</li>)}</ul></details> : null}
    {readError ? <p role="alert">{readError}</p> : reading ? <p role="status">Refreshing closeout details...</p> : null}{message ? <p role="status">{message}</p> : null}</>}
  </details>;
}
