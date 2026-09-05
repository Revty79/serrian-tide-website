"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { CalledCheckWorkspaceView } from "@/features/tabletop-operations/called-check-service";
import type { CharacterAttributeKey } from "@/features/characters/models";
import type { RollMethod, RollVisibility } from "@/features/tabletop-operations/roll-runtime";

import {
  answerGodCalledCheck,
  answerGodHighLow,
  cancelCalledCheck,
  cancelHighLow,
  issueCalledCheck,
  issueHighLow,
  rerollCalledCheck,
  rerollHighLow,
  revealCalledCheck,
  ruleCalledCheck,
  ruleHighLow,
} from "./called-check-actions";

function idempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function statusLabel(value: string): string {
  return value.replaceAll("-", " ").toUpperCase();
}

function displayTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function CalledCheckWorkspace({
  view,
  sceneId,
  encounterId,
}: {
  view: CalledCheckWorkspaceView;
  sceneId: number | null;
  encounterId: number | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [sourceKind, setSourceKind] = useState<"attribute" | "skill">("attribute");
  const [attributeKey, setAttributeKey] = useState<CharacterAttributeKey>("WIS");
  const validSkillPaths = useMemo(() => view.skillPaths.filter(({ valid }) => valid), [view.skillPaths]);
  const [skillPathKey, setSkillPathKey] = useState(() => validSkillPaths[0]?.rootToEndpointSkillIds.join(":") ?? "");
  const [recipientScope, setRecipientScope] = useState<"one" | "selected" | "all-pcs">("one");
  const [recipientIds, setRecipientIds] = useState<number[]>(view.recipients[0] ? [view.recipients[0].characterId] : []);
  const [purpose, setPurpose] = useState("");
  const [instructions, setInstructions] = useState("");
  const [visibility, setVisibility] = useState<RollVisibility>("table");
  const [rollMethod, setRollMethod] = useState<RollMethod>("random");
  const [bonusLabel, setBonusLabel] = useState("");
  const [bonusMagnitude, setBonusMagnitude] = useState("");
  const [penaltyLabel, setPenaltyLabel] = useState("");
  const [penaltyMagnitude, setPenaltyMagnitude] = useState("");
  const [highLowMode, setHighLowMode] = useState<"neutral" | "player-calls-rolls" | "player-calls-god-rolls">("neutral");
  const [highLowCharacterId, setHighLowCharacterId] = useState<number | null>(view.recipients.find(({ kind }) => kind === "pc")?.characterId ?? null);
  const [highLowPurpose, setHighLowPurpose] = useState("");
  const [highLowVisibility, setHighLowVisibility] = useState<RollVisibility>("table");
  const [highLowMethod, setHighLowMethod] = useState<RollMethod>("random");

  function run(success: string, operation: () => Promise<unknown>): void {
    setFeedback(null);
    startTransition(() => {
      void operation().then(() => {
        setFeedback({ kind: "success", message: success });
        router.refresh();
      }).catch((error) => setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The request failed." }));
    });
  }

  function toggleRecipient(characterId: number): void {
    if (recipientScope === "one") {
      setRecipientIds([characterId]);
      return;
    }
    setRecipientIds((current) => current.includes(characterId)
      ? current.filter((id) => id !== characterId)
      : [...current, characterId]);
  }

  function issue(): void {
    const selectedPath = validSkillPaths.find(({ rootToEndpointSkillIds }) => rootToEndpointSkillIds.join(":") === skillPathKey);
    const modifiers = [
      ...(bonusLabel.trim() && bonusMagnitude ? [{ kind: "bonus" as const, label: bonusLabel, magnitude: Number(bonusMagnitude) }] : []),
      ...(penaltyLabel.trim() && penaltyMagnitude ? [{ kind: "penalty" as const, label: penaltyLabel, magnitude: Number(penaltyMagnitude) }] : []),
    ];
    run("Called Check issued with frozen per-recipient mechanics.", () => issueCalledCheck({
      sessionId: view.session.id,
      sceneId,
      encounterId,
      source: sourceKind === "attribute"
        ? { kind: "attribute", attributeKey }
        : {
            kind: "skill",
            endpointSkillId: selectedPath?.endpointSkillId ?? 0,
            rootToEndpointSkillIds: selectedPath?.rootToEndpointSkillIds ?? [],
          },
      purpose,
      instructions,
      recipientScope,
      recipientCharacterIds: recipientScope === "all-pcs" ? [] : recipientIds,
      visibility,
      rollMethod,
      modifiers,
      idempotencyKey: idempotencyKey(),
    }));
  }

  function godRollCalled(requestId: number, method: RollMethod): void {
    const entered = method === "entered" ? window.prompt("Enter the physical percentile result (1-100).") : null;
    if (method === "entered" && entered === null) return;
    run("Called Check Roll recorded.", () => answerGodCalledCheck(view.session.id, {
      requestId,
      enteredTotal: method === "entered" ? Number(entered) : null,
      idempotencyKey: idempotencyKey(),
    }));
  }

  function reasoned(label: string, operation: (reason: string) => Promise<unknown>): void {
    const reason = window.prompt(`${label} reason (required):`)?.trim();
    if (!reason) return;
    run(`${label} recorded.`, () => operation(reason));
  }

  return <section className="called-check-workspace">
    <header className="called-check-heading">
      <div><span>LIVE TABLE SERVICE</span><h3 className="font-sans">Called Checks &amp; High/Low</h3><p>Issue exact, persistent requests. Objective results are recorded; fictional consequences remain a G.O.D. ruling.</p></div>
      <strong className="called-check-pending-count"><span>{view.batches.reduce((count, batch) => count + batch.summary.pending, 0)}</span> pending</strong>
    </header>
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`} role="status">{feedback.message}</p> : null}

    <div className="called-check-compose-grid">
      <section className="called-check-compose called-check-compose--check">
        <header><span>CALLED CHECK</span><strong>Issue to the Session roster</strong></header>
        <div className="called-check-form-grid">
          <label><span>Source type</span><select value={sourceKind} onChange={(event) => setSourceKind(event.target.value as typeof sourceKind)}><option value="attribute">Attribute</option><option value="skill">Exact Skill path</option></select></label>
          {sourceKind === "attribute" ? <label><span>Attribute</span><select value={attributeKey} onChange={(event) => setAttributeKey(event.target.value as CharacterAttributeKey)}>{["STR", "DEX", "CON", "INT", "WIS", "CHR"].map((key) => <option key={key}>{key}</option>)}</select></label> : <label className="is-wide"><span>Canonical Skill endpoint and exact ancestry</span><select value={skillPathKey} onChange={(event) => setSkillPathKey(event.target.value)}>{validSkillPaths.map((path) => <option key={`${path.endpointSkillId}:${path.rootToEndpointSkillIds.join(":")}`} value={path.rootToEndpointSkillIds.join(":")}>{path.endpointName} — {path.pathLabel}</option>)}</select><small>Duplicate names remain separate because IDs and the complete route are preserved.</small></label>}
          <label><span>Recipient scope</span><select value={recipientScope} onChange={(event) => { const scope = event.target.value as typeof recipientScope; setRecipientScope(scope); if (scope === "one") setRecipientIds((ids) => ids.slice(0, 1)); }}><option value="one">One recipient</option><option value="selected">Selected recipients</option><option value="all-pcs">Every Player Character</option></select></label>
          <label><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as RollVisibility)}><option value="table">Table-visible</option><option value="private">Private Player / G.O.D.</option><option value="god-only">Secret / G.O.D.-only</option></select></label>
          <label><span>Roll method</span><select value={rollMethod} onChange={(event) => setRollMethod(event.target.value as RollMethod)}><option value="random">Website Roll</option><option value="entered">Entered physical Roll</option></select></label>
          <label className="is-wide"><span>Purpose</span><input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="What is being checked?" /></label>
          <label className="is-wide"><span>Instructions</span><textarea rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
          <label><span>Bonus label</span><input value={bonusLabel} onChange={(event) => setBonusLabel(event.target.value)} /></label>
          <label><span>Bonus</span><input type="number" min="0" value={bonusMagnitude} onChange={(event) => setBonusMagnitude(event.target.value)} /></label>
          <label><span>Penalty label</span><input value={penaltyLabel} onChange={(event) => setPenaltyLabel(event.target.value)} /></label>
          <label><span>Penalty</span><input type="number" min="0" value={penaltyMagnitude} onChange={(event) => setPenaltyMagnitude(event.target.value)} /></label>
        </div>
        {recipientScope !== "all-pcs" ? <fieldset className="called-check-recipients"><legend>Exact recipients</legend>{view.recipients.map((recipient) => <label key={recipient.characterId}><input type={recipientScope === "one" ? "radio" : "checkbox"} checked={recipientIds.includes(recipient.characterId)} onChange={() => toggleRecipient(recipient.characterId)} /><span>{recipient.name}</span><small>{recipient.kind === "pc" ? "Player Character" : "Persistent NPC — G.O.D. controlled"}</small></label>)}</fieldset> : <p className="tabletop-readonly-notice">Every eligible Player Character currently on this Session roster will receive an independent request.</p>}
        <button type="button" className="is-primary called-check-submit" disabled={busy || !purpose.trim() || (recipientScope !== "all-pcs" && recipientIds.length === 0) || (sourceKind === "skill" && !skillPathKey)} onClick={issue}>{busy ? "Issuing…" : "Issue Called Check"}</button>
      </section>

      <section className="called-check-compose called-check-compose--high-low">
        <header><span>HIGH / LOW</span><strong>One percentile result</strong></header>
        <div className="called-check-form-grid">
          <label><span>Mode</span><select value={highLowMode} onChange={(event) => {
            const mode = event.target.value as typeof highLowMode;
            setHighLowMode(mode);
            setHighLowVisibility((current) => mode === "neutral"
              ? current === "private" ? "table" : current
              : current === "god-only" ? "table" : current);
          }}><option value="neutral">Neutral</option><option value="player-calls-rolls">Player calls and rolls</option><option value="player-calls-god-rolls">Player calls; G.O.D. rolls</option></select></label>
          {highLowMode !== "neutral" ? <label><span>Player Character</span><select value={highLowCharacterId ?? ""} onChange={(event) => setHighLowCharacterId(Number(event.target.value))}>{view.recipients.filter(({ kind }) => kind === "pc").map((recipient) => <option key={recipient.characterId} value={recipient.characterId}>{recipient.name}</option>)}</select></label> : null}
          <label><span>Visibility</span><select value={highLowVisibility} onChange={(event) => setHighLowVisibility(event.target.value as RollVisibility)}><option value="table">Table-visible</option>{highLowMode !== "neutral" ? <option value="private">Private</option> : null}<option value="god-only" disabled={highLowMode !== "neutral"}>G.O.D.-only</option></select></label>
          <label><span>Roll method</span><select value={highLowMethod} onChange={(event) => setHighLowMethod(event.target.value as RollMethod)}><option value="random">Website Roll</option><option value="entered">Entered physical Roll</option></select></label>
          <label className="is-wide"><span>Purpose</span><input value={highLowPurpose} onChange={(event) => setHighLowPurpose(event.target.value)} /></label>
        </div>
        <p className="tabletop-readonly-notice">01–50 is Low; 51–100 is High. High/Low has no target or normal success count.</p>
        <button type="button" className="is-primary called-check-submit" disabled={busy || !highLowPurpose.trim() || (highLowMode !== "neutral" && highLowCharacterId === null)} onClick={() => run("High/Low request issued.", () => issueHighLow({ sessionId: view.session.id, sceneId, encounterId, mode: highLowMode, participantCharacterId: highLowCharacterId, visibility: highLowVisibility, rollMethod: highLowMethod, purpose: highLowPurpose, idempotencyKey: idempotencyKey() }))}>{busy ? "Issuing…" : "Issue High / Low"}</button>
      </section>
    </div>

    <section className="called-check-history">
      <header><span>CALLED CHECK HISTORY</span><strong>{view.batches.length} batches</strong></header>
      {view.batches.map((batch) => <article key={batch.id} className="called-check-batch">
        <header><div><span>Batch #{batch.id} · {statusLabel(batch.visibility)} · {batch.rollMethod === "random" ? "WEBSITE" : "PHYSICAL"}</span><strong>{batch.purpose}</strong><small>{batch.sourceLabel} · {displayTime(batch.createdAt)}</small></div><dl><div><dt>Pending</dt><dd>{batch.summary.pending}</dd></div><div><dt>Resolved</dt><dd>{batch.summary.resolved}</dd></div><div><dt>Ruling</dt><dd>{batch.summary.requiresGodRuling}</dd></div><div><dt>Cancelled</dt><dd>{batch.summary.cancelled}</dd></div></dl></header>
        {batch.instructions ? <p>{batch.instructions}</p> : null}
        <div className="called-check-attempts">{batch.requests.map((request) => <article key={request.id} className={`called-check-attempt is-${request.status}`}>
          <header><div><strong>{request.recipientName}</strong><span>{request.recipientKind === "npc" ? "Persistent NPC" : "Player Character"} · Attempt #{request.id}{request.parentRequestId ? ` after #${request.parentRequestId}` : ""}</span></div><em>{statusLabel(request.status)}</em></header>
          <dl><div><dt>Frozen source</dt><dd>{request.sourceLabel}</dd></div><div><dt>Target</dt><dd>{request.originalTarget ?? "—"} → {request.finalTarget ?? "—"}</dd></div>{request.rollId ? <div><dt>Roll</dt><dd>#{request.rollId}: {request.resolution?.resultTotal}</dd></div> : null}{request.resolution ? <div><dt>Result</dt><dd>{request.resolution.succeeded ? "Successful" : "Failed"} · {request.resolution.totalSuccesses} successes</dd></div> : null}</dl>
          {request.rulingText ? <p className="tabletop-readonly-notice">{request.rulingText}</p> : null}
          <div className="called-check-controls">
            {request.status === "pending" && (batch.visibility === "god-only" || request.recipientKind === "npc") ? <button disabled={busy} onClick={() => godRollCalled(request.id, batch.rollMethod)}>Record {batch.rollMethod === "random" ? "Secret / NPC Roll" : "Physical Result"}</button> : null}
            {(request.status === "pending" || request.status === "requires-god-ruling" && request.rollId === null) ? <button className="is-danger" disabled={busy} onClick={() => reasoned("Cancellation", (reason) => cancelCalledCheck(view.session.id, request.id, reason))}>Cancel</button> : null}
            {request.status === "resolved" || request.status === "requires-god-ruling" && request.rollId !== null ? <button disabled={busy} onClick={() => reasoned("Reroll", (reason) => rerollCalledCheck(view.session.id, request.id, reason))}>Order Reroll</button> : null}
            {request.status === "requires-god-ruling" ? <button className="is-ruling" disabled={busy} onClick={() => reasoned("G.O.D. ruling", (ruling) => ruleCalledCheck(view.session.id, request.id, ruling))}>Record Ruling</button> : null}
            {batch.visibility === "god-only" && request.rollId && !request.revealedVisibility ? <><button disabled={busy} onClick={() => run("Secret Called Check revealed privately.", () => revealCalledCheck(view.session.id, request.id, "private"))}>Reveal to Recipient</button><button disabled={busy} onClick={() => run("Secret Called Check revealed to the table.", () => revealCalledCheck(view.session.id, request.id, "table"))}>Reveal to Table</button></> : null}
          </div>
          <details><summary>Complete audit history ({request.events.length})</summary><ol>{request.events.map((event) => <li key={event.id}>{displayTime(event.createdAt)} · {event.eventKind} · {event.fromStatus ?? "created"} → {event.toStatus}{event.reason ? ` · ${event.reason}` : ""}</li>)}</ol></details>
        </article>)}</div>
      </article>)}
      {!view.batches.length ? <p className="tabletop-empty">No Called Checks have been issued in this Session.</p> : null}
    </section>

    <section className="called-check-history">
      <header><span>HIGH / LOW HISTORY</span><strong>{view.highLow.length} attempts</strong></header>
      <div className="called-check-attempts">{view.highLow.map((request) => <article key={request.id} className={`called-check-attempt is-${request.status}`}>
        <header><div><strong>{request.purpose}</strong><span>#{request.id} · {statusLabel(request.mode)} · {request.participantName ?? "G.O.D."}</span></div><em>{statusLabel(request.status)}</em></header>
        <dl><div><dt>Locked call</dt><dd>{request.calledSide ? statusLabel(request.calledSide) : request.mode === "neutral" ? "Neutral — no call" : "Awaiting Player"}</dd></div>{request.result ? <><div><dt>Raw Roll</dt><dd>{request.result.resultTotal}</dd></div><div><dt>Side</dt><dd>{statusLabel(request.result.rolledSide)}</dd></div><div><dt>Match</dt><dd>{request.result.matchedCall === null ? "Not applicable" : request.result.matchedCall ? "Match" : "Mismatch"}</dd></div><div><dt>Critical</dt><dd>{request.result.criticalFailure ? "Critical failure" : request.result.doubleOtt ? "Double ott critical success" : "None"}</dd></div></> : null}</dl>
        <div className="called-check-controls">
          {request.status === "pending" && (request.mode === "neutral" || request.mode === "player-calls-god-rolls" && request.calledSide) ? <button disabled={busy} onClick={() => {
            const entered = request.rollMethod === "entered" ? window.prompt("Enter physical percentile result (1-100).") : null;
            if (request.rollMethod === "entered" && entered === null) return;
            run("High/Low Roll recorded.", () => answerGodHighLow(view.session.id, { requestId: request.id, enteredTotal: request.rollMethod === "entered" ? Number(entered) : null, idempotencyKey: idempotencyKey() }));
          }}>G.O.D. {request.rollMethod === "random" ? "Roll" : "Enter Result"}</button> : null}
          {request.status === "pending" ? <button className="is-danger" disabled={busy} onClick={() => reasoned("Cancellation", (reason) => cancelHighLow(view.session.id, request.id, reason))}>Cancel</button> : null}
          {request.status === "resolved" || request.status === "requires-god-ruling" ? <button disabled={busy} onClick={() => reasoned("Reroll", (reason) => rerollHighLow(view.session.id, request.id, reason))}>Order Reroll</button> : null}
          {request.status === "requires-god-ruling" ? <button className="is-ruling" disabled={busy} onClick={() => reasoned("G.O.D. ruling", (ruling) => ruleHighLow(view.session.id, request.id, ruling))}>Record Ruling</button> : null}
        </div>
        <details><summary>Audit history ({request.events.length})</summary><ol>{request.events.map((event) => <li key={event.id}>{displayTime(event.createdAt)} · {event.eventKind} · {event.fromStatus ?? "created"} → {event.toStatus}</li>)}</ol></details>
      </article>)}</div>
    </section>
  </section>;
}
