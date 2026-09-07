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
  ruleOrdinaryAttackDamage,
} from "./action-effect-plan-actions";

function json(value: unknown): string {
  return value === null || value === undefined ? "—" : JSON.stringify(value, null, 2);
}

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function requested(promptText: string, initial = ""): string | null {
  const value = window.prompt(promptText, initial)?.trim() ?? "";
  return value || null;
}

function effectSummary(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const instruction = (value as Record<string, unknown>).instruction;
  if (!instruction || typeof instruction !== "object" || Array.isArray(instruction)) return null;
  const summary = (instruction as Record<string, unknown>).summary;
  return typeof summary === "string" && summary.trim() ? summary : null;
}

function effectCalculation(value: unknown): { line: string | null; reasons: readonly string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { line: null, reasons: [] };
  const instruction = (value as Record<string, unknown>).instruction;
  if (!instruction || typeof instruction !== "object" || Array.isArray(instruction)) return { line: null, reasons: [] };
  const calculation = (instruction as Record<string, unknown>).calculation;
  if (!calculation || typeof calculation !== "object" || Array.isArray(calculation)) return { line: null, reasons: [] };
  const record = calculation as Record<string, unknown>;
  const gross = typeof record.grossDamage === "number" ? record.grossDamage : null;
  const armor = typeof record.armor === "number" ? record.armor : null;
  const soak = typeof record.soak === "number" ? record.soak : null;
  const net = typeof record.netDamage === "number" ? record.netDamage : null;
  const reasons = Array.isArray(record.rulingReasons)
    ? record.rulingReasons.filter((reason): reason is string => typeof reason === "string" && Boolean(reason.trim()))
    : [];
  return {
    line: gross !== null && armor !== null && soak !== null && net !== null
      ? `${gross} gross - ${armor} armor - ${soak} soak = ${net} damage`
      : null,
    reasons,
  };
}

function effectResult(value: unknown): string | null {
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.amount === "number") return String(record.amount);
  if (typeof record.outcome === "string") return record.outcome;
  if (typeof record.summary === "string") return record.summary;
  return null;
}

function AttackDamageRuling({
  encounterId,
  planId,
  effect,
  view,
  busy,
  perform,
}: {
  encounterId: number;
  planId: number;
  effect: ActionEffectPlanView["effects"][number];
  view: ActionEffectWorkspaceView;
  busy: boolean;
  perform: (operation: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const participant = view.participants.find(({ id }) => id === effect.targetParticipantId);
  const [amount, setAmount] = useState("");
  const [location, setLocation] = useState(String(participant?.hitLocations[0]?.result ?? ""));
  const [reason, setReason] = useState("");
  if (!participant?.hitLocations.length) return <p className="action-effect-warning">This target has no available authored Hit Location. Record a manual outcome with the missing anatomy fact.</p>;
  return <div className="action-effect-ruling">
    <strong>Specific G.O.D. damage ruling</strong>
    <label className="st-field"><span>Final damage after protection</span><input className="st-control" type="number" min={0.000001} step="any" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
    <label className="st-field"><span>Authored Hit Location</span><select className="st-control" value={location} onChange={(event) => setLocation(event.target.value)}>{participant.hitLocations.map((entry) => <option key={entry.result} value={entry.result}>{entry.name}</option>)}</select></label>
    <label className="st-field"><span>Why this ruling is authoritative</span><input className="st-control" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <button className="st-button is-secondary" type="button" disabled={busy || !amount || location === "" || !reason.trim()} onClick={() => void perform(
      () => ruleOrdinaryAttackDamage(encounterId, planId, effect.id, {
        amount: Number(amount),
        hitLocationNumber: Number(location),
        reason,
      }),
      "The explicit G.O.D. damage ruling is now bound to this exact action, target, and Hit Location.",
    )}>Use ruled damage</button>
  </div>;
}

export function ActionEffectPlanWorkspace({
  encounterId,
  view,
  compact = false,
  selectedDeclarationId = null,
}: {
  encounterId: number;
  view: ActionEffectWorkspaceView;
  compact?: boolean;
  selectedDeclarationId?: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const eligibleDeclarations = selectedDeclarationId === null
    ? view.eligibleDeclarations
    : view.eligibleDeclarations.filter(({ id }) => id === selectedDeclarationId);
  const plans = selectedDeclarationId === null
    ? view.plans
    : view.plans.filter(({ declarationId }) => declarationId === selectedDeclarationId);

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
      <div><span>{compact ? "CURRENT RESULTS" : "CONSEQUENCE REVIEW"}</span><h6 id="action-effect-heading" className="font-sans">{compact ? "Review and apply consequences" : "Action Effect Plans"}</h6></div>
      <p>{compact ? "Review the readable result, make any explicit ruling, then apply it to live state." : "Frozen source → Roll and defense result → reviewable effects → explicit application."}</p>
    </header>
    {feedback ? <p className={`tabletop-encounter-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

    {eligibleDeclarations.length ? <div className="action-effect-ready">
      {eligibleDeclarations.map((declaration) => <article key={declaration.id}>
        <div><strong>{declaration.label}</strong><small>{declaration.actorName} · {declaration.sourceKind} · Initiative {declaration.timingStatus}</small></div>
        <button type="button" className="st-button is-primary" disabled={busy} onClick={() => void perform(
          () => generateActionEffectPlan(encounterId, declaration.id),
          compact ? "Consequences prepared from the locked action and Roll. No gameplay state was changed." : "Consequence plan generated from locked authoritative history. No gameplay state was changed.",
        )}>{compact ? "Review Consequences" : "Generate Plan"}</button>
      </article>)}
    </div> : <p className="tabletop-empty">{compact ? "No completed action is waiting for consequence review." : "No completed declaration is waiting for consequence-plan generation."}</p>}

    <div className="action-effect-plans">
      {plans.map((plan) => <article className="action-effect-plan" key={plan.id}>
        <header>
          <div>{compact ? <span>{plan.actorName}</span> : <span>PLAN #{plan.id} · DECLARATION #{plan.declarationId}</span>}<strong>{plan.sourceSnapshot.displayName}</strong>{compact ? null : <small>Actor: {plan.actorName} · {plan.sourceKind} · {plan.sourceIdentity}</small>}</div>
          <em className={`tabletop-status is-${plan.status}`}>{compact ? titleCase(plan.status) : plan.status}</em>
        </header>
        <p>{plan.explanation}</p>
        {plan.sourceSnapshot.authoringHref ? <p><Link href={plan.sourceSnapshot.authoringHref}>Review canonical source authoring</Link> <small>(global authoring remains outside Tabletop)</small></p> : null}
        {plan.sourceDivergence ? <aside className="action-effect-warning"><strong>Current source differs from the frozen action source.</strong>{compact ? <p>The result continues to use the source that was locked when this action was declared.</p> : <pre>{json(plan.sourceDivergence)}</pre>}</aside> : null}
        {!compact ? <details>
          <summary>Locked evidence</summary>
          <div className="action-effect-evidence">
            <section><strong>Targets</strong><pre>{json(plan.targetSnapshot)}</pre></section>
            <section><strong>Governing Roll</strong><pre>{json(plan.governingRollSnapshot)}</pre></section>
            <section><strong>Defense / Intervention</strong><pre>{json(plan.defenseResolution)}</pre></section>
            <section><strong>Initiative commitment</strong><pre>{json(plan.initiativeCommitment)}</pre></section>
            <section><strong>Resource costs</strong><pre>{json(plan.resourceCosts)}</pre></section>
          </div>
        </details> : null}
        <div className="action-effect-list">
          {plan.effects.map((effect) => {
            const calculation = effectCalculation(effect.authoredValue);
            return <article key={effect.id}>
            <header><div><strong>{compact ? effect.targetName : effect.effectType}</strong><small>{compact ? titleCase(effect.effectType) : `${effect.targetName} · effect #${effect.id}`}</small></div><em>{compact ? titleCase(effect.status) : effect.status}</em></header>
            {effectSummary(effect.authoredValue) ? <p className="action-effect-summary">{effectSummary(effect.authoredValue)}</p> : null}
            {compact && (calculation.line || calculation.reasons.length) ? <details><summary>Calculation and ruling notes</summary>{calculation.line ? <p>{calculation.line}</p> : null}{calculation.reasons.map((reason) => <p key={reason}>{reason}</p>)}</details> : null}
            {compact && (effectResult(effect.finalValue) || effectResult(effect.appliedResult)) ? <p><strong>{effect.appliedResult ? "Applied result" : "Current result"}:</strong> {effectResult(effect.appliedResult) ?? effectResult(effect.finalValue)}</p> : null}
            {!compact ? <div className="action-effect-values">
              <section><span>Authored</span><pre>{json(effect.authoredValue)}</pre></section>
              <section><span>Calculated</span><pre>{json(effect.calculatedValue)}</pre></section>
              <section><span>G.O.D. correction / final selection</span><pre>{effect.amendmentReason ? json(effect.finalValue) : "—"}</pre></section>
              <section><span>Final applied result</span><pre>{json(effect.appliedResult)}</pre></section>
            </div> : null}
            {effect.amendmentReason ? <p><strong>Ruling:</strong> {effect.amendmentReason}</p> : null}
            {effect.effectKey.startsWith("ordinary-attack-damage:target:") && !effect.applicationSupported && !["manual-resolved", "declined"].includes(effect.status)
              ? <AttackDamageRuling encounterId={encounterId} planId={plan.id} effect={effect} view={view} busy={busy} perform={perform} />
              : null}
            <footer>
              {effect.applicationSupported && !["applied", "declined"].includes(effect.status) ? <button type="button" className="st-button" disabled={busy} onClick={() => correctAmount(plan.id, effect.id, effect.calculatedValue)}>Correct amount</button> : null}
              {!['applied', 'declined', 'manual-resolved'].includes(effect.status) ? <button type="button" className="st-button is-danger" disabled={busy} onClick={() => { const reason = requested("Required reason for declining this effect"); if (reason) void perform(() => declineActionEffect(encounterId, plan.id, effect.id, reason), "Effect declined with its audit reason."); }}>Decline effect</button> : null}
              {!effect.applicationSupported && !['manual-resolved', 'declined'].includes(effect.status) ? <button type="button" className="st-button is-secondary" disabled={busy} onClick={() => { const outcome = requested("Manual outcome to preserve"); if (!outcome) return; const reason = requested("Required G.O.D. ruling reason"); if (reason) void perform(() => resolveManualActionEffect(encounterId, plan.id, effect.id, outcome, reason), "Manual consequence resolved and preserved."); }}>Record outcome</button> : null}
            </footer>
          </article>})}
          {!plan.effects.length ? <p className="tabletop-empty">The exact source produced no effects. Add a manual consequence only when the G.O.D. is making an explicit ruling.</p> : null}
        </div>
        {!compact ? <details>
          <summary>Audit history · {plan.events.length} {plan.events.length === 1 ? "event" : "events"}</summary>
          <ol className="action-effect-history">
            {plan.events.map((event) => <li key={event.id}><strong>{event.eventKind}</strong> · {event.toStatus} · {new Date(event.createdAt).toLocaleString()}<small>{event.reason || "No additional reason."} · {event.actorUserId}</small></li>)}
          </ol>
        </details> : null}
        <footer>
          {["calculated", "requires-god-ruling"].includes(plan.status) ? <button type="button" className="st-button" disabled={busy} onClick={() => { const reason = requested("Approval note (optional)") ?? ""; void perform(() => approveActionEffectPlan(encounterId, plan.id, reason), compact ? "Results approved. Apply consequences when ready." : "Effect plan approved for explicit application."); }}>{compact ? "Approve results" : "Approve plan"}</button> : null}
          {["calculated", "requires-god-ruling", "approved", "partially-applied"].includes(plan.status) ? <button type="button" className="st-button is-secondary" disabled={busy} onClick={() => addManual(plan)}>{compact ? "Add G.O.D. ruling" : "Add manual effect"}</button> : null}
          {["approved", "partially-applied"].includes(plan.status) ? <button type="button" className="st-button is-primary" disabled={busy} onClick={() => void perform(() => applyPlan(plan.id), compact ? "Approved consequences were applied to live Character state." : "Approved supported effects applied transactionally.")}>{compact ? "Apply consequences" : "Apply effects"}</button> : null}
          {plan.status === "application-failed" ? <button type="button" className="st-button is-primary" disabled={busy} onClick={() => void perform(() => applyPlan(plan.id, true), compact ? "Consequences were retried without duplicating prior work." : "Failed application retried through the same idempotent executor.")}>{compact ? "Retry consequences" : "Retry application"}</button> : null}
          {["calculated", "requires-god-ruling", "approved", "application-failed"].includes(plan.status) ? <button type="button" className="st-button is-danger" disabled={busy} onClick={() => { const reason = requested("Required reason for declining the entire plan"); if (reason) void perform(() => declineActionEffectPlan(encounterId, plan.id, reason), compact ? "Results declined without changing gameplay state." : "Effect plan declined without applying gameplay changes."); }}>{compact ? "Decline results" : "Decline plan"}</button> : null}
        </footer>
      </article>)}
      {!plans.length ? <p className="tabletop-empty">No consequence plan is attached to this selected exchange.</p> : null}
    </div>
  </section>;
}
