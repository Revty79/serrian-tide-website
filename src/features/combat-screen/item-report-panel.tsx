"use client";
import { useRef, useState } from "react";
import type { ActionEffectPlanView } from "@/features/tabletop-operations/action-effect-plan-service";
import { reviewCombatItemReport } from "./operation-actions";
import { attackReportSignature } from "./attack-report";
import { itemEffectReview } from "./item-report";
import { combatEffectSummary } from "./result-summary";
import { combatMessage } from "./form-controls";
import { EffectRuling } from "./effect-ruling";
import styles from "./combat-screen.module.css";

export function ItemReport({ encounterId, plan, disabled, refresh }: { encounterId: number; plan: ActionEffectPlanView; disabled: boolean; refresh: () => Promise<void> }) {
  const [locations, setLocations] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const running = useRef(false);
  const rows = plan.effects.map((effect) => ({ effect, review: itemEffectReview(effect) }));
  const missing = rows.filter(({ review }) => review.needsLocation);
  const otherDecisions = rows.some(({ review }) => review.blocked && !review.needsLocation);
  const blocked = rows.some(({ review }) => review.blocked);
  const roll = plan.governingRollSnapshot?.resolution;
  function effectSummary(effect: ActionEffectPlanView["effects"][number], review: ReturnType<typeof itemEffectReview>) {
    if (effect.status === "declined") return combatEffectSummary(effect, true);
    const location = review.locations.find((entry) => entry.number === review.application.hitLocationNumber)?.name;
    const suffix = location ? ` (${location})` : "";
    const timing = review.definition.timing as { mode?: string; applications?: number; frequency?: string } | undefined;
    if (timing?.mode === "over-time") return `${review.amount ?? "Authored"} ${review.definition.kind === "health.heal" ? "healing" : "damage"}${suffix} per application, ${timing.applications} times. See details for when it starts and repeats.`;
    if (review.definition.kind === "health.heal") return `${effect.status === "applied" ? "Healing applied" : "Restore up to"}: ${review.amount} HP${suffix}.`;
    if (review.definition.kind === "condition.apply") return `${effect.status === "applied" ? "Applied" : "Apply"}: ${String(review.definition.name)}.`;
    if (review.definition.kind === "modifier.apply") return `${String(review.definition.label)}: ${Number(review.amount) > 0 ? "+" : ""}${review.amount}.`;
    return `${combatEffectSummary(effect, true)}${location ? ` Location: ${location}.` : ""}`;
  }
  async function submit(kind: "locations" | "apply") {
    if (running.current) return; running.current = true; setBusy(true); setMessage("");
    try {
      const result = await reviewCombatItemReport(encounterId, plan.id, attackReportSignature(plan), kind === "locations" ? { kind, locations } : { kind });
      if (result.status !== "applied" && result.status !== "locations-recorded") setMessage("This Item still has unfinished effects. Review the message below.");
      await refresh();
    } catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "The Item result was not confirmed.")); await refresh(); }
    finally { running.current = false; setBusy(false); }
  }
  return <section className={`${styles.window} ${styles.attackReport}`} aria-label="Item result report">
    <h2>{plan.actorName}: {plan.sourceSnapshot.displayName}</h2>
    <p>{missing.length ? "This ability does not have a recorded hit location for every target. Choose the missing locations, then calculate the damage." : blocked ? "A target needs a decision below before this Item can finish." : "Review who receives each effect, then apply the Item once."}</p>
    {roll ? <p>Roll {roll.resultTotal} against {roll.finalTarget}: {roll.succeeded ? "success" : "failure"}.</p> : <p>This Item ability does not require a roll.</p>}
    {rows.map(({ effect, review }) => <div key={effect.id} className={styles.notice}>
      <strong>{effect.targetName}{effect.effectType.startsWith("resource.") ? " · Item cost" : ""}</strong>
      {effect.effectType.startsWith("resource.") ? effect.status === "declined" ? <p>No additional cost to pay. Nothing further will be spent.</p> : <p>{effect.status === "applied" ? "Already paid" : "Cost to pay"}: {String((effect.finalValue as { amount?: number } | null)?.amount ?? "recorded amount")} {effect.effectType === "resource.item-charges" ? "Charges" : effect.effectType === "resource.item-quantity" ? "items" : effect.unit || "resources"}. {effect.status === "applied" ? "This will not be charged again." : "Paid once when the Item effects are applied."}</p>
        : effect.status === "manual-resolved" ? <p>Previously recorded as a manual outcome. The app did not apply this effect to HP.</p>
        : review.needsLocation ? <>
          <p>{review.amount ?? "Authored"} incoming damage. Protection is calculated after you choose the location.</p>
          <label className="st-field">{effect.targetName}: damage location<select className="st-control" value={locations[effect.id] ?? ""} disabled={disabled || busy} onChange={(event) => setLocations((current) => { const next = { ...current }; if (event.target.value === "") delete next[effect.id]; else next[effect.id] = Number(event.target.value); return next; })}>
            <option value="">Choose where this effect hits</option>{review.locations.map((location) => <option key={location.number} value={location.number}>{location.name}</option>)}
          </select></label>
        </> : <p>{effectSummary(effect, review)}</p>}
      {review.blocked && !review.needsLocation ? <p>{review.issues.join(" ") || effect.amendmentReason || "Review the specific decision below."}</p> : null}
    </div>)}
    {plan.status === "application-failed" ? <p role="alert">{combatMessage(plan.events.findLast((event) => event.eventKind === "effect-plan-application-failed")?.reason ?? "The remaining effects could not be applied. Retry after resolving the problem.")}</p> : null}
    {missing.length ? <button className="st-button is-primary" disabled={disabled || busy || missing.some(({ effect }) => locations[effect.id] === undefined)} onClick={() => void submit("locations")}>{busy ? "Calculating…" : "Calculate damage"}</button>
      : <button className="st-button is-primary" disabled={disabled || busy || blocked} onClick={() => void submit("apply")}>{busy ? "Applying…" : "Apply item effects"}</button>}
    <details open={otherDecisions}><summary>{otherDecisions ? "Resolve the remaining decisions" : "Adjust a result or inspect details"}</summary><EffectRuling encounterId={encounterId} plan={plan} disabled={disabled || busy} closed={false} refresh={refresh} expanded /></details>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
