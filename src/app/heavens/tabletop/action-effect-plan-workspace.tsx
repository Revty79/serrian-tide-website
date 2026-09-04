"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import type {
  ActionEffectPlanView,
  ActionEffectWorkspaceView,
} from "@/features/tabletop-operations/action-effect-plan-service";

import {
  addManualActionEffect,
  amendActionEffectAmount,
  applyActionEffectPlan,
  approveActionEffectPlan,
  declineActionEffect,
  declineActionEffectPlan,
  generateActionEffectPlan,
  resolveManualActionEffect,
  retryActionEffectPlan,
} from "./action-effect-plan-actions";

function json(value: unknown): string {
  return value === null || value === undefined ? "—" : JSON.stringify(value, null, 2);
}

function requested(promptText: string, initial = ""): string | null {
  const value = window.prompt(promptText, initial)?.trim() ?? "";
  return value || null;
}

export function ActionEffectPlanWorkspace({
  encounterId,
  view,
}: {
  encounterId: number;
  view: ActionEffectWorkspaceView;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function perform(operation: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await operation();
      setFeedback({ kind: "success", message: success });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The consequence operation failed." });
    } finally {
      setBusy(false);
    }
  }

  function correctAmount(planId: number, effectId: number, current: unknown): void {
    const entered = requested("Corrected numeric amount", typeof current === "number" ? String(current) : "");
    if (entered === null) return;
    const amount = Number(entered);
    const reason = requested("Required reason for changing the calculated amount");
    if (reason === null) return;
    void perform(() => amendActionEffectAmount(encounterId, planId, effectId, amount, reason), "Effect amount corrected with its audit reason.");
  }

  function addManual(plan: ActionEffectPlanView): void {
    const choices = plan.targetSnapshot.map(({ participantId, name }) => String(participantId) + ": " + (name ?? "Unnamed target")).join("\n");
    const target = requested("Exact locked target Participant ID\n" + choices, String(plan.targetSnapshot[0]?.participantId ?? ""));
    if (target === null) return;
    const instruction = requested("Manual effect or consequence to record");
    if (instruction === null) return;
    const reason = requested("Required G.O.D. ruling reason");
    if (reason === null) return;
    void perform(() => addManualActionEffect(encounterId, plan.id, Number(target), instruction, reason), "Manual consequence added for review.");
  }

  async function applyPlan(planId: number, retry = false): Promise<void> {
    const status = retry
      ? await retryActionEffectPlan(encounterId, planId)
      : await applyActionEffectPlan(encounterId, planId);
    if (status === "application-failed") {
      throw new Error("No supported mutation was committed. Review the application-failed audit entry, correct or decline the failing effect, then retry.");
    }
  }

  return <section className="action-effect-workspace" aria-labelledby="action-effect-heading">
    <header>
      <div><span>PASS 8 · CONSEQUENCE BRIDGE</span><h6 id="action-effect-heading" className="font-sans">Action Effect Plans</h6></div>
      <p>Frozen source → Roll and defense result → reviewable effects → explicit application.</p>
    </header>
    {feedback ? <p className={`tabletop-encounter-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

    {view.eligibleDeclarations.length ? <div className="action-effect-ready">
      {view.eligibleDeclarations.map((declaration) => <article key={declaration.id}>
        <div><strong>{declaration.label}</strong><small>{declaration.actorName} · {declaration.sourceKind} · Initiative {declaration.timingStatus}</small></div>
        <button type="button" disabled={busy} onClick={() => void perform(
          () => generateActionEffectPlan(encounterId, declaration.id),
          "Consequence plan generated from locked authoritative history. No gameplay state was changed.",
        )}>Generate Plan</button>
      </article>)}
    </div> : <p className="tabletop-empty">No completed declaration is waiting for consequence-plan generation.</p>}

    <div className="action-effect-plans">
      {view.plans.map((plan) => <article className="action-effect-plan" key={plan.id}>
        <header>
          <div><span>PLAN #{plan.id} · DECLARATION #{plan.declarationId}</span><strong>{plan.sourceSnapshot.displayName}</strong><small>Actor: {plan.actorName} · {plan.sourceKind} · {plan.sourceIdentity}</small></div>
          <em className={`tabletop-status is-${plan.status}`}>{plan.status}</em>
        </header>
        <p>{plan.explanation}</p>
        {plan.sourceSnapshot.authoringHref ? <p><Link href={plan.sourceSnapshot.authoringHref}>Review canonical source authoring</Link> <small>(global authoring remains outside Tabletop)</small></p> : null}
        {plan.sourceDivergence ? <aside className="action-effect-warning"><strong>Current source differs from the frozen action source.</strong><pre>{json(plan.sourceDivergence)}</pre></aside> : null}
        <details>
          <summary>Locked evidence</summary>
          <div className="action-effect-evidence">
            <section><strong>Targets</strong><pre>{json(plan.targetSnapshot)}</pre></section>
            <section><strong>Governing Roll</strong><pre>{json(plan.governingRollSnapshot)}</pre></section>
            <section><strong>Defense / Intervention</strong><pre>{json(plan.defenseResolution)}</pre></section>
            <section><strong>Initiative commitment</strong><pre>{json(plan.initiativeCommitment)}</pre></section>
            <section><strong>Resource costs</strong><pre>{json(plan.resourceCosts)}</pre></section>
          </div>
        </details>
        <div className="action-effect-list">
          {plan.effects.map((effect) => <article key={effect.id}>
            <header><div><strong>{effect.effectType}</strong><small>{effect.targetName} · effect #{effect.id}</small></div><em>{effect.status}</em></header>
            <div className="action-effect-values">
              <section><span>Authored</span><pre>{json(effect.authoredValue)}</pre></section>
              <section><span>Calculated</span><pre>{json(effect.calculatedValue)}</pre></section>
              <section><span>G.O.D. correction / final selection</span><pre>{effect.amendmentReason ? json(effect.finalValue) : "—"}</pre></section>
              <section><span>Final applied result</span><pre>{json(effect.appliedResult)}</pre></section>
            </div>
            {effect.amendmentReason ? <p><strong>Ruling:</strong> {effect.amendmentReason}</p> : null}
            <footer>
              {effect.applicationSupported && !["applied", "declined"].includes(effect.status) ? <button type="button" disabled={busy} onClick={() => correctAmount(plan.id, effect.id, effect.calculatedValue)}>Correct Amount</button> : null}
              {!['applied', 'declined', 'manual-resolved'].includes(effect.status) ? <button type="button" disabled={busy} onClick={() => { const reason = requested("Required reason for declining this effect"); if (reason) void perform(() => declineActionEffect(encounterId, plan.id, effect.id, reason), "Effect declined with its audit reason."); }}>Decline Effect</button> : null}
              {!effect.applicationSupported && !['manual-resolved', 'declined'].includes(effect.status) ? <button type="button" disabled={busy} onClick={() => { const outcome = requested("Manual outcome to preserve"); if (!outcome) return; const reason = requested("Required G.O.D. ruling reason"); if (reason) void perform(() => resolveManualActionEffect(encounterId, plan.id, effect.id, outcome, reason), "Manual consequence resolved and preserved."); }}>Record Manual Outcome</button> : null}
            </footer>
          </article>)}
          {!plan.effects.length ? <p className="tabletop-empty">The exact source produced no effects. Add a manual consequence only when the G.O.D. is making an explicit ruling.</p> : null}
        </div>
        <details>
          <summary>Audit history · {plan.events.length} {plan.events.length === 1 ? "event" : "events"}</summary>
          <ol className="action-effect-history">
            {plan.events.map((event) => <li key={event.id}><strong>{event.eventKind}</strong> · {event.toStatus} · {new Date(event.createdAt).toLocaleString()}<small>{event.reason || "No additional reason."} · {event.actorUserId}</small></li>)}
          </ol>
        </details>
        <footer>
          {["calculated", "requires-god-ruling"].includes(plan.status) ? <button type="button" disabled={busy} onClick={() => { const reason = requested("Approval note (optional)") ?? ""; void perform(() => approveActionEffectPlan(encounterId, plan.id, reason), "Effect plan approved for explicit application."); }}>Approve Plan</button> : null}
          {["calculated", "requires-god-ruling", "approved", "partially-applied"].includes(plan.status) ? <button type="button" disabled={busy} onClick={() => addManual(plan)}>Add Manual Effect</button> : null}
          {["approved", "partially-applied"].includes(plan.status) ? <button type="button" className="is-primary" disabled={busy} onClick={() => void perform(() => applyPlan(plan.id), "Approved supported effects applied transactionally.")}>Apply Approved Effects</button> : null}
          {plan.status === "application-failed" ? <button type="button" className="is-primary" disabled={busy} onClick={() => void perform(() => applyPlan(plan.id, true), "Failed application retried through the same idempotent executor.")}>Retry Application</button> : null}
          {["calculated", "requires-god-ruling", "approved", "application-failed"].includes(plan.status) ? <button type="button" className="is-danger" disabled={busy} onClick={() => { const reason = requested("Required reason for declining the entire plan"); if (reason) void perform(() => declineActionEffectPlan(encounterId, plan.id, reason), "Effect plan declined without applying gameplay changes."); }}>Decline Plan</button> : null}
        </footer>
      </article>)}
    </div>
  </section>;
}
