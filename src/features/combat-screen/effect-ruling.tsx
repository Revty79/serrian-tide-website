"use client";
import { useEffect, useRef, useState } from "react";
import { amendActionEffectAmount, declineActionEffect, resolveManualActionEffect } from "@/app/heavens/tabletop/action-effect-plan-actions";
import { completeRetainedCombatEffectPlan, settleCombatEffectRemainder } from "@/app/heavens/tabletop/combat-recovery-actions";
import { resolveCombatSpellRecovery } from "@/app/heavens/tabletop/combat-participation-actions";
import type { ActionEffectPlanView } from "@/features/tabletop-operations/action-effect-plan-service";
import { combatRecoverySpellAuthority } from "@/features/tabletop-operations/combat-recovery-spells";
import { applyCombatAttackRuling, confirmCombatEffectRuling, readCombatRecoveryConditions } from "./operation-actions";
import { readCombatTargetAnatomy } from "./command-actions";
import { combatMessage } from "./form-controls";
import { combatEffectSummary } from "./result-summary";
import styles from "./combat-screen.module.css";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function EffectEvidence({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (typeof value === "number" || typeof value === "string") return <p>{String(value)}</p>;
  const data = object(value), fields = ["amount", "baseDamage", "extraSuccesses", "grossDamage", "armor", "soak", "netDamage", "hitLocationName", "locationName", "reason", "explanation", "message", "instruction"];
  return <>{fields.filter((key) => ["string", "number"].includes(typeof data[key])).map((key) => <p key={key}>{key.replace(/([A-Z])/g, " $1")}: {combatMessage(String(data[key]))}</p>)}{Array.isArray(data.rulingReasons) ? data.rulingReasons.map((reason, index) => <p key={index}>{combatMessage(String(reason))}</p>) : null}{depth < 4 ? ["effect", "application", "ordinaryAttack", "calculated"].filter((key) => data[key]).map((key) => <EffectEvidence key={key} value={data[key]} depth={depth + 1} />) : null}</>;
}
export function EffectRuling({ encounterId, plan, focusSequence, disabled, closed, refresh }: { encounterId: number; plan: ActionEffectPlanView; focusSequence?: number; disabled: boolean; closed: boolean; refresh: () => Promise<void> }) {
  const [reason, setReason] = useState(""), [location, setLocation] = useState(""), [target, setTarget] = useState(""), [damage, setDamage] = useState("");
  const [amounts, setAmounts] = useState<Record<number, string>>({}), [outcomes, setOutcomes] = useState<Record<number, string>>({});
  const [pools, setPools] = useState<string[]>([]), [duration, setDuration] = useState("");
  const [conditions, setConditions] = useState<Record<number, "poison" | "disease" | "">>({});
  const [conditionOptions, setConditionOptions] = useState<Awaited<ReturnType<typeof readCombatRecoveryConditions>>>([]);
  const [anatomy, setAnatomy] = useState<Awaited<ReturnType<typeof readCombatTargetAnatomy>>>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const request = useRef<Record<string, string>>({}), running = useRef(false);
  const detail = useRef<HTMLDetailsElement>(null), attackRuling = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (focusSequence && detail.current) { detail.current.open = true; if (attackRuling.current) attackRuling.current.open = true; detail.current.scrollIntoView({ block: "center", behavior: "smooth" }); } }, [focusSequence]);
  const selectedTarget = Number(target) || (plan.targetSnapshot.length === 1 ? plan.targetSnapshot[0].participantId : 0);
  const authority = combatRecoverySpellAuthority(plan.sourceSnapshot.authoredData);
  useEffect(() => { let active = true; if (selectedTarget) void readCombatTargetAnatomy({ role: "god", encounterId }, selectedTarget).then((value) => { if (active) setAnatomy(value); }).catch(() => { if (active) setAnatomy([]); }); return () => { active = false; }; }, [encounterId, selectedTarget]);
  useEffect(() => { let active = true; if (selectedTarget) void readCombatRecoveryConditions(encounterId, selectedTarget).then((value) => { if (active) setConditionOptions(value); }).catch(() => { if (active) setConditionOptions([]); }); return () => { active = false; }; }, [encounterId, selectedTarget]);
  async function run(action: () => Promise<unknown>, success = "Ruling recorded. Inspect the updated result.") {
    if (running.current) return; running.current = true; setBusy(true);
    try { await action(); setMessage(success); await refresh(); }
    catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "The ruling was not confirmed.")); await refresh(); }
    finally { running.current = false; setBusy(false); }
  }
  return <details ref={detail}><summary>{plan.sourceSnapshot.displayName} · {plan.actorName} · {plan.status.replaceAll("-", " ")}</summary><p>{combatMessage(plan.explanation)}</p>
    <label className="st-field">Result target<select className="st-control" value={selectedTarget || ""} onChange={(event) => setTarget(event.target.value)}><option value="">Choose a target</option>{plan.targetSnapshot.map((entry) => <option key={entry.participantId} value={entry.participantId}>{entry.name}</option>)}</select></label>
    {plan.effects.map((effect) => <fieldset key={effect.id}><legend>{effect.targetName}</legend><p>{combatEffectSummary(effect, true)}</p><EffectEvidence value={effect.finalValue} />
      {!["applied", "manual-resolved", "declined"].includes(effect.status) ? <><details><summary>Specific effect decision</summary><div className={styles.fields}><label className="st-field">Amended amount<input className="st-control" type="number" step="any" value={amounts[effect.id] ?? ""} onChange={(event) => setAmounts({ ...amounts, [effect.id]: event.target.value })} /></label><label className="st-field">Narrated manual outcome<input className="st-control" value={outcomes[effect.id] ?? ""} onChange={(event) => setOutcomes({ ...outcomes, [effect.id]: event.target.value })} /></label></div>
      <div className={styles.actions}><button className="st-button" disabled={disabled || closed || busy || !reason.trim() || !amounts[effect.id]} onClick={() => void run(() => amendActionEffectAmount(encounterId, plan.id, effect.id, Number(amounts[effect.id]), reason))}>Rule on amount</button><button className="st-button" disabled={disabled || closed || busy || !reason.trim()} onClick={() => void run(() => declineActionEffect(encounterId, plan.id, effect.id, reason))}>Decline this effect</button>
      {!effect.applicationSupported && !authority ? <button className="st-button" disabled={disabled || closed || busy || !reason.trim() || !outcomes[effect.id]?.trim()} onClick={() => void run(() => resolveManualActionEffect(encounterId, plan.id, effect.id, outcomes[effect.id], reason))}>Record manual outcome</button> : null}</div></details></> : null}
    </fieldset>)}
    {!["applied", "cancelled", "declined", "superseded"].includes(plan.status) ? <>
      <label className="st-field">Specific ruling / recovery reason<textarea className="st-control" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {["weapon", "creature-attack"].includes(plan.sourceKind) && !plan.sourceSnapshot.identity.startsWith("firearm-attack:") ? <details ref={attackRuling}><summary>Hit location or damage ruling</summary><div className={styles.fields}><label className="st-field">Authored hit location<select className="st-control" value={location} onChange={(event) => setLocation(event.target.value)}><option value="">Choose a location</option>{anatomy.map((entry) => <option key={entry.number} value={entry.number}>{entry.name}</option>)}</select></label><label className="st-field">Damage override (only if required)<input className="st-control" type="number" min="0" value={damage} onChange={(event) => setDamage(event.target.value)} /></label></div><button className="st-button" disabled={disabled || closed || busy || !reason.trim() || location === "" || !selectedTarget} onClick={() => void run(() => applyCombatAttackRuling(encounterId, plan.id, plan.declarationId, { targetParticipantId: selectedTarget, hitLocationNumber: Number(location), reason, ...(damage === "" ? {} : { finalDamage: Number(damage) }) }))}>Confirm attack ruling &amp; apply</button></details> : null}
      <button className="st-button" disabled={disabled || closed || busy || !reason.trim()} onClick={() => void run(() => confirmCombatEffectRuling(encounterId, plan.id, reason))}>Confirm ruling &amp; apply supported effects</button>
      {authority ? <details><summary>{authority.name}: source-linked recovery</summary><p>{authority.explanation}</p><div className={styles.fields}>{conditionOptions.map((condition) => <label className="st-field" key={condition.id}>{condition.name}<select className="st-control" value={conditions[condition.id] ?? ""} onChange={(event) => setConditions({ ...conditions, [condition.id]: event.target.value as "poison" | "disease" | "" })}><option value="">Leave this condition</option><option value="poison">Remove: identified as poison</option><option value="disease">Remove: identified as disease</option></select><span>{condition.description}</span></label>)}{authority.temporary ? <label className="st-field">Authored duration ruling in Combat Rounds<input className="st-control" type="number" min="1" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} /></label> : null}</div>
      <p className={styles.muted}>Select exact anatomy repaired by the ruling, if the spell supports restoring the fatal injury.</p>{[...new Map(anatomy.filter((entry) => entry.poolKey).map((entry) => [entry.poolKey!, entry])).values()].map((entry) => <label className={styles.check} key={entry.poolKey}><input type="checkbox" checked={pools.includes(entry.poolKey!)} onChange={(event) => setPools(event.target.checked ? [...pools, entry.poolKey!] : pools.filter((key) => key !== entry.poolKey))} /> {entry.name}</label>)}
      {plan.effects.filter((effect) => effect.effectKey.startsWith("spell-combat-recovery:") && effect.targetParticipantId === selectedTarget && effect.status !== "manual-resolved").map((effect) => <div className={styles.actions} key={effect.id}>{(["revive", "remove-conditions"] as const).map((operation) => <button className="st-button" key={operation} disabled={disabled || closed || busy || !reason.trim()} onClick={() => void run(() => {
        const fingerprint = JSON.stringify({ effect: effect.id, operation, pools, duration, conditions, reason }); request.current[fingerprint] ||= crypto.randomUUID();
        return resolveCombatSpellRecovery(encounterId, { planId: plan.id, effectId: effect.id, operation, reason, requestKey: request.current[fingerprint], restoredPoolKeys: pools,
          removeConditions: conditionOptions.flatMap((condition) => { const category = conditions[condition.id]; return category ? [{ conditionId: condition.id, category }] : []; }),
          ...(authority.temporary ? { temporaryDuration: { kind: "combat-rounds" as const, value: Number(duration), label: reason } } : {}) });
      })}>{operation === "revive" ? "Resolve authored revival" : "Resolve authored condition removal"}</button>)}</div>)}
      </details> : null}
      <details><summary>Retained unfinished work</summary><p className={styles.muted}>Complete supported remaining consequences, or explicitly cancel only the unapplied remainder. Spent resources and applied outcomes stay recorded.</p><div className={styles.actions}><button className="st-button" disabled={disabled || busy || !reason.trim()} onClick={() => void run(() => completeRetainedCombatEffectPlan(encounterId, { planId: plan.id, reason }))}>Complete remaining consequences</button><button className="st-button" disabled={disabled || busy || !reason.trim()} onClick={() => void run(() => settleCombatEffectRemainder(encounterId, { planId: plan.id, reason }))}>Cancel unapplied remainder</button></div></details>
    </> : null}
    {message ? <p role="status">{message}</p> : null}
  </details>;
}
