"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import type {
  FirearmAttackCommand,
  FirearmAttackPreview,
  FirearmAttackView,
  FirearmAttackWorkspaceView,
} from "@/features/tabletop-operations/firearm-attack-service";
import type { FirearmWorkspaceView } from "@/features/tabletop-operations/firearm-readiness-service";

import {
  cancelFirearmAttack,
  commitFirearmAttackTrigger,
  declareFirearmAttack,
  finalizeFirearmAttackConsequences,
  fireFirearmAttack,
  previewFirearmAttack,
} from "./firearm-attack-actions";

type Feedback = { kind: "success" | "error"; message: string };

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Enter a finite number.");
  return parsed;
}

function whole(value: string, label: string, minimum = 0): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new Error(`${label} must be a whole number of at least ${minimum}.`);
  return parsed;
}

function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function modifiersFromText(value: string): readonly { label: string; value: number }[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.lastIndexOf("=");
    if (separator <= 0) throw new Error("Enter each additional modifier as Label = signed value.");
    const label = line.slice(0, separator).trim();
    const amount = Number(line.slice(separator + 1).trim());
    if (!label || !Number.isFinite(amount)) throw new Error("Every additional modifier needs a label and finite signed value.");
    return { label, value: amount };
  });
}

function PreviewCard({ preview }: { preview: FirearmAttackPreview }) {
  return <article className={`firearm-attack-preview${preview.rulingReasons.length ? " requires-ruling" : ""}`}>
    <header><div><span>FROZEN DECLARATION PREVIEW</span><h4>{preview.firearm.itemName} - {preview.firearm.firingModeName}</h4></div><strong>Roll over {preview.finalTarget}</strong></header>
    <dl>
      <div><dt>Exact path</dt><dd>{preview.governing.label} ({preview.governing.originalTarget})</dd></div>
      <div><dt>Target</dt><dd>{preview.target.name}</dd></div>
      <div><dt>Delivery</dt><dd>{preview.delivery.kind} - {preview.delivery.declaredRounds} round{preview.delivery.declaredRounds === 1 ? "" : "s"}</dd></div>
      <div><dt>Aim</dt><dd>{preview.aim.initiative} Initiative / -{preview.aim.targetOffset} target</dd></div>
      <div><dt>Damage source</dt><dd>{preview.authoredDamage.sourceName ?? "Unresolved"}: {preview.authoredDamage.value ?? "review required"}</dd></div>
      <div><dt>After firing</dt><dd>{preview.firearm.effectiveCyclingInitiativeCost > 0 ? "cycle required" : "cycled"}; {preview.firearm.effectiveRecoilResetInitiativeCost > 0 ? "recoil recovery required" : "recovered"}</dd></div>
    </dl>
    <p>{preview.governing.explanation}</p>
    {preview.modifiers.length ? <ul>{preview.modifiers.map((modifier, index) => <li key={`${modifier.label}:${index}`}>{modifier.label}: {modifier.kind === "bonus" ? "+" : "-"}{modifier.magnitude}</li>)}</ul> : null}
    {preview.rulingReasons.length ? <ul className="firearm-attack-rulings">{preview.rulingReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
  </article>;
}

function AttackCard({ encounterId, attack }: { encounterId: number; attack: FirearmAttackView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [method, setMethod] = useState<"random" | "entered">("random");
  const [enteredTotal, setEnteredTotal] = useState("");
  const [notes, setNotes] = useState("");

  async function perform(work: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      setFeedback({ kind: "success", message: success });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The firearm attack operation failed." });
    } finally {
      setBusy(false);
    }
  }

  const canFire = attack.status === "committed" && attack.triggerTimingStatus === "completed";
  return <article className={`firearm-attack-card is-${attack.status}`}>
    <header>
      <div><span>ATTACK #{attack.id} - {attack.effectiveStatus.replaceAll("-", " ")}</span><h4>{attack.actorName}: {attack.itemName} at {attack.targetName}</h4><small>{attack.firingModeName} - {attack.ammunitionName}</small></div>
      <Link href="/heavens/equipment">Global Equipment record</Link>
    </header>
    <dl>
      <div><dt>Trigger</dt><dd>Declaration #{attack.triggerDeclarationId} - 1 Initiative - {attack.triggerTimingStatus ?? "not committed"}</dd></div>
      <div><dt>Aim</dt><dd>{attack.aimInitiative ? `${attack.aimInitiative} Initiative / -${attack.aimTargetOffset} target - ${attack.aimTimingStatus ?? "pending"}` : "None"}</dd></div>
      <div><dt>Called Shot</dt><dd>{attack.calledShotDeclared ? `${attack.calledShotObjective} - location ${attack.calledShotLocationNumber ?? "ruling"} - penalty ${attack.calledShotPenalty} (${attack.calledShotReason})` : "No"}</dd></div>
      <div><dt>Rounds</dt><dd>{attack.roundsConsumed || 0} consumed / {attack.roundsDeclared} declared; before {attack.roundsLoadedBefore}, after {attack.roundsLoadedAfter ?? "not fired"}</dd></div>
      <div><dt>Governing target</dt><dd>{attack.governingLabel}: {attack.originalTarget} - final roll-over target {attack.finalTarget}</dd></div>
      <div><dt>Roll / Plan</dt><dd>{attack.attackRollId ? `Roll #${attack.attackRollId}` : "No Roll"} / {attack.effectPlanId ? `Plan #${attack.effectPlanId} (${attack.effectPlanStatus})` : "No plan"}</dd></div>
    </dl>
    <details><summary>Responder opportunities - {attack.responderOpportunities.length}</summary>{attack.responderOpportunities.length ? <ol>{attack.responderOpportunities.map((opportunity) => <li key={opportunity.id}>#{opportunity.id}: {opportunity.phase} / participant {opportunity.responderParticipantId} - {opportunity.status}{opportunity.responseLabel ? ` (${opportunity.responseLabel})` : ""}</li>)}</ol> : <p>No responder opportunities were generated.</p>}</details>

    {attack.status === "aiming" ? <button type="button" disabled={busy || attack.effectiveStatus !== "trigger-ready"} onClick={() => void perform(
      () => commitFirearmAttackTrigger(encounterId, attack.id, attack.actorParticipantId),
      "Aim completed and the separate one-Initiative trigger pull was committed.",
    )}>Commit trigger after Aim</button> : null}

    {attack.status === "committed" ? <section className="firearm-attack-roll">
      <p>Use the Defense &amp; Intervention workspace to reconcile every responder opportunity and record required response Rolls. Firing then records the one immutable attack Roll and resolves the defense group atomically.</p>
      <label><span>Roll method</span><select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="random">Server d100</option><option value="entered">Enter physical d100</option></select></label>
      {method === "entered" ? <label><span>Physical result</span><input type="number" min={1} max={100} step={1} value={enteredTotal} onChange={(event) => setEnteredTotal(event.target.value)} /></label> : null}
      <label className="is-wide"><span>Roll notes</span><input value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} /></label>
      <button type="button" className="is-primary" disabled={busy || !canFire || (method === "entered" && !enteredTotal)} onClick={() => void perform(
        () => fireFirearmAttack(encounterId, attack.id, [attack.actorParticipantId, attack.targetParticipantId], {
          method,
          enteredTotal: method === "entered" ? whole(enteredTotal, "Physical d100 result", 1) : null,
          visibility: "table",
          notes,
        }),
        "The trigger was pulled; Roll, ammunition, bullet allocation, and proposed consequences were recorded once.",
      )}>Fire and record attack Roll</button>
      {!canFire ? <small>The trigger action and all response opportunities must finish first.</small> : null}
    </section> : null}

    {attack.status === "fired-awaiting-timing" ? <button type="button" disabled={busy || attack.triggerTimingStatus !== "completed"} onClick={() => void perform(
      () => finalizeFirearmAttackConsequences(encounterId, attack.id, [attack.actorParticipantId, attack.targetParticipantId]),
      "The defense-added Initiative cost completed and the Action Effect Plan was generated.",
    )}>Generate consequences after timing</button> : null}

    {attack.firedAt === null && attack.status !== "cancelled" ? <button type="button" className="is-danger" disabled={busy} onClick={() => {
      const reason = window.prompt("Why is this unfired attack being cancelled?")?.trim();
      if (reason) void perform(() => cancelFirearmAttack(encounterId, attack.id, attack.actorParticipantId, reason), "The unfired declaration was cancelled; no ammunition was consumed.");
    }}>Cancel before firing</button> : null}

    {attack.attackRoll ? <section className="firearm-attack-result"><h5>Immutable attack result</h5><p><strong>{attack.attackRoll.resolution.resultTotal}</strong> vs {attack.attackRoll.resolution.finalTarget}: {attack.attackRoll.resolution.outcome}; {attack.attackRoll.resolution.totalSuccesses} total success{attack.attackRoll.resolution.totalSuccesses === 1 ? "" : "es"}.</p>{attack.bulletAllocation ? <p>{attack.bulletAllocation.initialBulletHits} initial bullet hit{attack.bulletAllocation.initialBulletHits === 1 ? "" : "s"}; {attack.bulletAllocation.bulletsCancelled} cancelled by successful defenses; {attack.bulletAllocation.survivingBulletHits} survive; {attack.bulletAllocation.overflowDamage} overflow damage.</p> : null}</section> : null}
    {attack.bulletAllocation?.defenseContributions?.length ? <details><summary>Defense allocation - {attack.bulletAllocation.defenseContributions.length} Reaction{attack.bulletAllocation.defenseContributions.length === 1 ? "" : "s"}</summary><ol>{attack.bulletAllocation.defenseContributions.map((contribution) => <li key={contribution.reactionId}><strong>Reaction #{contribution.reactionId}</strong> - defender {contribution.defenderParticipantId}; Roll {contribution.defenseRollId === null ? "none" : `#${contribution.defenseRollId}`}; {contribution.defenseTotalSuccesses ?? "unresolved"} defense success{contribution.defenseTotalSuccesses === 1 ? "" : "es"}; {contribution.applicable === null ? "ruling required" : contribution.applicable ? "applicable" : "not applicable"}; {contribution.bulletsBefore} before, {contribution.bulletsCancelled} cancelled, {contribution.bulletsAfter} after{contribution.rulingReasons.map((reason) => <small key={reason}>{reason}</small>)}</li>)}</ol></details> : null}
    {attack.defenseResolution ? <details><summary>Defense and intervention result</summary><pre>{JSON.stringify(attack.defenseResolution, null, 2)}</pre></details> : null}
    {attack.damageResolution || attack.postShotState ? <details><summary>Frozen damage and post-shot state</summary><pre>{JSON.stringify({ damage: attack.damageResolution, postShot: attack.postShotState }, null, 2)}</pre></details> : null}
    {attack.bullets.length ? <div className="firearm-attack-bullets">{attack.bullets.map((bullet) => <article key={bullet.id}><strong>Bullet {bullet.bulletIndex}: {bullet.status.replaceAll("-", " ")}</strong><span>Location {bullet.hitLocationNumber ?? "?"} {bullet.hitLocationName}</span>{bullet.cancelledByReactionId ? <span>Cancelled by Reaction #{bullet.cancelledByReactionId}</span> : <span>{bullet.grossDamage ?? "?"} gross - {bullet.armor ?? "?"} armor - {bullet.soak ?? "?"} soak = {bullet.proposedNetDamage ?? "ruling"} proposed Health</span>}{bullet.rulingReasons.map((reason) => <small key={reason}>{reason}</small>)}</article>)}</div> : null}
    {attack.rulingReasons.length ? <ul className="firearm-attack-rulings">{attack.rulingReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
    <details><summary>Audit history - {attack.events.length}</summary><ol>{attack.events.map((event) => <li key={event.id}><strong>{event.eventKind}</strong> <span>{new Date(event.createdAt).toLocaleString()}</span>{event.reason ? <small>{event.reason}</small> : null}</li>)}</ol></details>
    {feedback ? <p className={`firearm-attack-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
  </article>;
}

export function FirearmAttackWorkspace({ attackView, readiness }: {
  attackView: FirearmAttackWorkspaceView;
  readiness: FirearmWorkspaceView;
}) {
  const router = useRouter();
  const firearm = readiness.firearms.find(({ itemInstanceId }) => itemInstanceId === readiness.selectedItemInstanceId) ?? null;
  const actor = readiness.characters.find(({ id }) => id === readiness.selectedCharacterId) ?? null;
  const mode = firearm?.modes.find(({ id }) => id === firearm.state?.selectedFiringModeId) ?? null;
  const availableTargets = attackView.participants.filter(({ id }) => id !== actor?.id);
  const [targetId, setTargetId] = useState(String(availableTargets[0]?.id ?? ""));
  const target = attackView.participants.find(({ id }) => id === Number(targetId)) ?? null;
  const [aim, setAim] = useState("0");
  const [duration, setDuration] = useState("1");
  const [called, setCalled] = useState(false);
  const [objective, setObjective] = useState("");
  const [location, setLocation] = useState("");
  const [penalty, setPenalty] = useState("");
  const [calledReason, setCalledReason] = useState("");
  const [otherModifiers, setOtherModifiers] = useState("");
  const [manual, setManual] = useState(false);
  const [manualLabel, setManualLabel] = useState("");
  const [manualTarget, setManualTarget] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [preview, setPreview] = useState<FirearmAttackPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const sustained = mode?.deliveryCadence === "sustained-per-initiative";
  const canCompose = actor !== null && actor.id > 0 && firearm?.state !== null && mode?.id !== null && target !== null;

  function buildCommand(): FirearmAttackCommand {
    if (!canCompose || !actor || !firearm?.state || !mode?.id || !target) throw new Error("Select an exact attacker, firearm, mode, and target.");
    return {
      actorParticipantId: actor.id,
      targetParticipantId: target.id,
      itemInstanceId: firearm.itemInstanceId,
      firingModeId: mode.id,
      aimInitiative: whole(aim, "Aim Initiative"),
      firingDurationInitiative: sustained ? whole(duration, "Sustained duration", 1) : 1,
      calledShot: {
        declared: called,
        objective: called ? objective : "",
        locationNumber: called ? numberOrNull(location) : null,
        penalty: called ? numberOrNull(penalty) : null,
        reason: called ? calledReason : "",
      },
      otherModifiers: modifiersFromText(otherModifiers),
      manualGovernance: manual ? { label: manualLabel, originalTarget: Number(manualTarget), reason: manualReason } : null,
    };
  }

  async function perform(work: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      setFeedback({ kind: "success", message: success });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The firearm attack could not be prepared." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="firearm-attack-workspace" aria-label="Firearm attacks, Aim, Called Shots, and damage">
    <header><div><span>PASS 10 - FIREARM ATTACKS</span><h3 className="font-sans">Aim, Trigger &amp; Damage</h3></div><small>Exact identities - one Roll - one ammunition mutation - review-before-apply</small></header>
    <p className="firearm-attack-boundary">The global Equipment mapping remains read-only here. Select an exact owned copy in Firearm Readiness above. Damage is proposed through the existing Action Effect Plan review; this console never applies Health directly.</p>
    {firearm && actor && firearm.state && mode ? <div className="firearm-attack-compose">
      <header><div><span>NEW DECLARATION</span><h4>{actor.name}: {firearm.itemName} - {mode.name}</h4></div><Link href="/heavens/equipment">Review global Equipment</Link></header>
      <div className="firearm-attack-fields">
        <label><span>Exact Encounter target</span><select value={targetId} onChange={(event) => { setTargetId(event.target.value); setLocation(""); setPreview(null); }}><option value="">Select target</option>{availableTargets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({entry.participantKind})</option>)}</select></label>
        <label><span>Aim Initiative</span><input type="number" min={0} step={1} value={aim} onChange={(event) => { setAim(event.target.value); setPreview(null); }} /></label>
        {sustained ? <label><span>Sustained duration (Initiative)</span><input type="number" min={1} step={1} value={duration} onChange={(event) => { setDuration(event.target.value); setPreview(null); }} /></label> : <p className="firearm-attack-authored">Authored delivery: {mode?.roundsPerCadence ?? "?"} round{mode?.roundsPerCadence === 1 ? "" : "s"} per trigger.</p>}
        <label className="firearm-attack-check"><input type="checkbox" checked={called} onChange={(event) => { setCalled(event.target.checked); setPreview(null); }} /><span>Declare a Called Shot</span></label>
        {called ? <>
          <label><span>Exact objective</span><input value={objective} maxLength={240} onChange={(event) => { setObjective(event.target.value); setPreview(null); }} /></label>
          <label><span>Authored Hit Location</span><select value={location} onChange={(event) => { setLocation(event.target.value); setPreview(null); }}><option value="">Objective has no exact location</option>{target?.hitLocations.map((entry) => <option key={entry.result} value={entry.result}>{entry.result}: {entry.name}{entry.poolKey ? ` - ${entry.poolKey}` : ""}</option>)}</select></label>
          <label><span>G.O.D.-assigned penalty</span><input type="number" min={0} value={penalty} onChange={(event) => { setPenalty(event.target.value); setPreview(null); }} /></label>
          <label className="is-wide"><span>Required penalty reason</span><input value={calledReason} onChange={(event) => { setCalledReason(event.target.value); setPreview(null); }} /></label>
        </> : null}
        <label className="is-wide"><span>Other explicit modifiers (one per line: Label = signed value)</span><textarea rows={3} value={otherModifiers} onChange={(event) => { setOtherModifiers(event.target.value); setPreview(null); }} /></label>
      </div>
      <details className="firearm-attack-governance"><summary>One-action G.O.D. governing-source ruling</summary><label className="firearm-attack-check"><input type="checkbox" checked={manual} onChange={(event) => { setManual(event.target.checked); setPreview(null); }} /><span>Use an explicit manual target for this action only</span></label>{manual ? <div className="firearm-attack-fields"><label><span>Target label</span><input value={manualLabel} onChange={(event) => { setManualLabel(event.target.value); setPreview(null); }} /></label><label><span>Original target</span><input type="number" value={manualTarget} onChange={(event) => { setManualTarget(event.target.value); setPreview(null); }} /></label><label className="is-wide"><span>Required ruling reason</span><input value={manualReason} onChange={(event) => { setManualReason(event.target.value); setPreview(null); }} /></label></div> : null}</details>
      <div className="firearm-attack-actions"><button type="button" disabled={busy || !canCompose} onClick={() => void perform(async () => { setPreview(await previewFirearmAttack(attackView.context.encounterId, buildCommand())); }, "The exact declaration, target, path, modifiers, delivery, and state were previewed.")}>Preview locked mechanics</button><button type="button" className="is-primary" disabled={busy || !canCompose || !preview} onClick={() => void perform(async () => { await declareFirearmAttack(attackView.context.encounterId, { ...buildCommand(), idempotencyKey: requestId() }); setPreview(null); router.refresh(); }, "The firearm attack was declared through Initiative and response timing.")}>Declare from preview</button></div>
      {preview ? <PreviewCard preview={preview} /> : null}
      {feedback ? <p className={`firearm-attack-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    </div> : <p className="tabletop-empty">Select and initialize an exact persistent Character firearm above. Direct Creatures do not gain manufactured firearm inventory implicitly.</p>}
    <div className="firearm-attack-history">{attackView.attacks.map((attack) => <AttackCard key={`${attack.id}:${attack.status}:${attack.triggerTimingStatus ?? "none"}`} encounterId={attackView.context.encounterId} attack={attack} />)}{!attackView.attacks.length ? <p className="tabletop-empty">No firearm attacks have been declared in this Encounter.</p> : null}</div>
  </section>;
}
