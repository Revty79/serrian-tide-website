"use client";
import { useEffect, useRef, useState } from "react";
import type { ActionEffectPlanView } from "@/features/tabletop-operations/action-effect-plan-service";
import { readCombatTargetAnatomy } from "./command-actions";
import { confirmCombatAttackReport } from "./operation-actions";
import { attackReportSignature, attackReportTarget } from "./attack-report";
import { combatMessage } from "./form-controls";
import styles from "./combat-screen.module.css";

export function AttackReport({ encounterId, plan, disabled, refresh }: {
  encounterId: number; plan: ActionEffectPlanView; disabled: boolean; refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false), [location, setLocation] = useState<string | null>(null);
  const [damage, setDamage] = useState<string | null>(null), [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [anatomy, setAnatomy] = useState<Awaited<ReturnType<typeof readCombatTargetAnatomy>>>([]);
  const running = useRef(false);
  const effect = plan.effects[0], target = effect ? attackReportTarget(effect) : null;
  const needsRuling = plan.status === "requires-god-ruling", revise = editing || needsRuling;
  const retry = ["approved", "application-failed"].includes(plan.status);
  const selectedLocation = location ?? String(target?.locationNumber ?? "");
  const selectedDamage = damage ?? String(target?.damage ?? target?.suggestedDamage ?? "");
  const missingDamage = revise && target?.damage === null && selectedDamage === "";
  const roll = plan.governingRollSnapshot?.resolution;
  useEffect(() => {
    let active = true;
    if (revise && effect) void readCombatTargetAnatomy({ role: "god", encounterId }, effect.targetParticipantId)
      .then((value) => { if (active) setAnatomy(value); }).catch(() => { if (active) setAnatomy([]); });
    return () => { active = false; };
  }, [encounterId, effect, revise]);
  async function approve() {
    if (running.current) return;
    running.current = true; setBusy(true); setMessage("");
    try {
      const result = await confirmCombatAttackReport(encounterId, plan.id, attackReportSignature(plan), revise && effect ? {
        targetParticipantId: effect.targetParticipantId, hitLocationNumber: Number(selectedLocation), reason,
        ...(selectedDamage === "" ? {} : { finalDamage: Number(selectedDamage) }),
      } : undefined);
      setMessage(result.status === "applied" ? "Attack approved and applied." : "The attack has not been fully applied. Check the report below.");
      await refresh();
    } catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "The attack was not confirmed.")); await refresh(); }
    finally { running.current = false; setBusy(false); }
  }
  return <section className={`${styles.window} ${styles.attackReport}`} aria-label="Attack result report">
    <div className={styles.bar}><h2>{plan.actorName} → {plan.targetSnapshot.map((entry) => entry.name).join(", ")}</h2><span className={styles.muted}>{plan.sourceSnapshot.displayName} · {retry ? "Approved; application incomplete" : "Ready for approval"}</span></div>
    {plan.status === "application-failed" ? <p className={styles.notice}>{combatMessage(plan.events.findLast((event) => event.eventKind === "effect-plan-application-failed")?.reason ?? "Damage was not applied. Retry after resolving the application problem.")}</p> : null}
    {roll ? <p className={styles.muted}>Roll {roll.resultTotal} against {roll.finalTarget} · {roll.additionalSuccesses} extra successes</p> : null}
    {plan.effects.map((entry) => { const result = attackReportTarget(entry); return <div key={entry.id}>
      <dl className={styles.attackFacts}><div><dt>Result</dt><dd>{result.outcome}</dd></div><div><dt>Hit location</dt><dd>{result.outcome === "Miss" ? "—" : result.location}</dd></div><div><dt>Damage to apply</dt><dd>{result.damage ?? "Needs ruling"}</dd></div></dl>
      {result.explanation ? <p>{combatMessage(result.explanation)}</p> : null}
      {result.calculation ? <p className={styles.muted}>{result.calculation}</p> : null}
      {needsRuling ? <div className={styles.notice}><strong>Decision needed</strong>{result.questions.map((question) => <p key={question}>{combatMessage(question)}</p>)}{!result.questions.length ? <p>Record the specific critical or defense ruling below.</p> : null}</div> : null}
    </div>; })}
    {plan.effects.length === 1 ? <>
      {!needsRuling && !retry ? <label className={styles.check}><input type="checkbox" checked={editing} onChange={(event) => setEditing(event.target.checked)} disabled={busy} /> Adjust location or damage</label> : null}
      {revise ? <div className={styles.fields}>
        <label className="st-field">Hit location<select className="st-control" value={selectedLocation} onChange={(event) => setLocation(event.target.value)} disabled={busy}><option value="">Choose a location</option>{anatomy.map((entry) => <option key={entry.number} value={entry.number}>{entry.name}</option>)}</select></label>
        <label className="st-field">Final damage<input className="st-control" type="number" min="0" step="any" value={selectedDamage} onChange={(event) => setDamage(event.target.value)} disabled={busy} /></label>
        <label className="st-field">Reason for this ruling<textarea className="st-control" value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} /></label>
      </div> : null}
    </> : needsRuling ? <p>Resolve each target through the specific effect controls below.</p> : null}
    {missingDamage ? <p className={styles.notice}>Damage could not be calculated from the available source and protection. Enter the final damage and the reason for your ruling before applying this hit.</p> : null}
    <div className={styles.actions}><button className="st-button is-primary" disabled={disabled || busy || missingDamage || needsRuling && plan.effects.length !== 1 || revise && (!reason.trim() || !anatomy.some((entry) => String(entry.number) === selectedLocation) || selectedDamage !== "" && (!Number.isFinite(Number(selectedDamage)) || Number(selectedDamage) < 0))} onClick={() => void approve()}>{busy ? "Applying…" : retry ? "Retry applying approved attack" : "Approve & apply attack"}</button><span className={styles.muted}>HP and automatic conditions update together. Combat then continues.</span></div>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
