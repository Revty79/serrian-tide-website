"use client";
import { useRef, useState } from "react";
import type { ActionEffectPlanView } from "@/features/tabletop-operations/action-effect-plan-service";
import { confirmCombatSpellReport } from "./operation-actions";
import { attackReportSignature } from "./attack-report";
import { combatEffectSummary } from "./result-summary";
import { combatMessage } from "./form-controls";
import { EffectRuling } from "./effect-ruling";
import styles from "./combat-screen.module.css";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function SpellReport({ encounterId, plan, disabled, refresh }: {
  encounterId: number; plan: ActionEffectPlanView; disabled: boolean; refresh: () => Promise<void>;
}) {
  const running = useRef(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const roll = plan.governingRollSnapshot?.resolution;
  return <section className={`${styles.window} ${styles.attackReport}`} aria-label="Spell result report">
    <h2>{plan.actorName}: {plan.sourceSnapshot.displayName}</h2>
    {roll ? <p>Roll {roll.resultTotal} against {roll.finalTarget}: {roll.succeeded ? `${roll.totalSuccesses} ${roll.totalSuccesses === 1 ? "success" : "successes"}` : "failed"}.</p> : null}
    {plan.effects.map((effect) => {
      const final = object(effect.finalValue), authored = object(effect.authoredValue);
      const original = plan.sourceSnapshot.effects.find((entry) => `${entry.key}:target:${effect.targetParticipantId}` === effect.effectKey);
      const base = object(authored.effect).amount, amount = object(final.effect).amount;
      return <div key={effect.id}><strong>{effect.effectType === "spell.area-report" ? "Area result" : effect.targetName}</strong>
        <p>{combatEffectSummary(effect, true)}</p>
        {typeof base === "number" && typeof amount === "number" && original ? <p className={styles.muted}>{original.scaling === "per-success"
          ? `${base} per success × ${roll?.totalSuccesses ?? 0} = ${amount}`
          : original.effect?.kind === "health.damage" ? `${base} spell damage + ${amount - base} additional-success damage = ${amount}`
          : `${amount} fixed by the spell.`}</p> : null}
      </div>;
    })}
    <p className={styles.muted}>Casting time is complete. Mana was already spent when casting began.</p>
    {plan.status === "application-failed" ? <p role="alert">{combatMessage(plan.events.findLast((event) => event.eventKind === "effect-plan-application-failed")?.reason ?? "The result could not be fully applied. Resolve the reported problem and retry.")}</p> : null}
    <button className="st-button is-primary" disabled={disabled || busy} onClick={async () => {
      if (running.current) return; running.current = true; setBusy(true);
      try { await confirmCombatSpellReport(encounterId, plan.id, attackReportSignature(plan)); await refresh(); }
      catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "The spell result was not confirmed.")); await refresh(); }
      finally { running.current = false; setBusy(false); }
    }}>{busy ? "Applying…" : ["approved", "application-failed"].includes(plan.status) ? "Retry applying approved spell" : "Approve & apply spell"}</button>
    <details><summary>Adjust a spell result</summary><EffectRuling encounterId={encounterId} plan={plan} disabled={disabled || busy} closed={false} refresh={refresh} /></details>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
