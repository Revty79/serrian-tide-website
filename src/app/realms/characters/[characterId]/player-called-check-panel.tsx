"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { PlayerCalledCheckWorkspaceView } from "@/features/tabletop-operations/called-check-service";

import {
  answerPlayerCalledCheck,
  answerPlayerHighLow,
  lockPlayerHighLowCall,
} from "./called-check-actions";
import styles from "./player-called-check-panel.module.css";

function idempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function label(value: string): string {
  return value.replaceAll("-", " ").toUpperCase();
}

export function PlayerCalledCheckPanel({ view }: { view: PlayerCalledCheckWorkspaceView }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const pendingOwnChecks = view.calledChecks.filter(({ recipientCharacterId, status }) => recipientCharacterId === view.characterId && status === "pending");
  const pendingOwnHighLow = view.highLow.filter(({ participantCharacterId, status }) => participantCharacterId === view.characterId && status === "pending");

  function run(success: string, operation: () => Promise<unknown>): void {
    setFeedback(null);
    startTransition(() => {
      void operation().then(() => {
        setFeedback({ error: false, message: success });
        router.refresh();
      }).catch((error) => setFeedback({ error: true, message: error instanceof Error ? error.message : "The table request failed." }));
    });
  }

  function answerCalled(request: PlayerCalledCheckWorkspaceView["calledChecks"][number]): void {
    const entered = request.rollMethod === "entered" ? window.prompt("Enter your physical percentile result (1-100).") : null;
    if (request.rollMethod === "entered" && entered === null) return;
    run("Your Called Check Roll was recorded.", () => answerPlayerCalledCheck(view.characterId, {
      requestId: request.id,
      enteredTotal: request.rollMethod === "entered" ? Number(entered) : null,
      idempotencyKey: idempotencyKey(),
    }));
  }

  function answerHighLow(request: PlayerCalledCheckWorkspaceView["highLow"][number]): void {
    const entered = request.rollMethod === "entered" ? window.prompt("Enter your physical percentile result (1-100).") : null;
    if (request.rollMethod === "entered" && entered === null) return;
    run("Your High/Low Roll was recorded.", () => answerPlayerHighLow(view.characterId, {
      requestId: request.id,
      enteredTotal: request.rollMethod === "entered" ? Number(entered) : null,
      idempotencyKey: idempotencyKey(),
    }));
  }

  function renderCalledCheck(request: PlayerCalledCheckWorkspaceView["calledChecks"][number]) {
    return <article key={`check:${request.id}`} className={request.status === "pending" && request.recipientCharacterId === view.characterId ? styles.pending : ""}>
      <header><span>CALLED CHECK · {label(request.visibility)}</span><em>{label(request.status)}</em></header>
      <h3>{request.purpose}</h3>
      {request.instructions ? <p>{request.instructions}</p> : null}
      <dl><div><dt>Recipient</dt><dd>{request.recipientName}</dd></div><div><dt>Frozen source</dt><dd>{request.sourceLabel}</dd></div><div><dt>Final target</dt><dd>{request.finalTarget ?? "G.O.D. ruling"}</dd></div><div><dt>Method</dt><dd>{request.rollMethod === "random" ? "Website Roll" : "Physical result"}</dd></div>{request.resolution ? <><div><dt>Raw Roll</dt><dd>{request.resolution.resultTotal}</dd></div><div><dt>Outcome</dt><dd>{request.resolution.succeeded ? "Success" : "Failure"} · {request.resolution.totalSuccesses} total successes</dd></div></> : null}</dl>
      {request.status === "pending" && request.recipientCharacterId === view.characterId ? <button disabled={busy} onClick={() => answerCalled(request)}>{busy ? "Recording…" : request.rollMethod === "random" ? "Roll Percentile" : "Enter Physical Result"}</button> : null}
      {request.rulingText && request.status === "resolved" ? <p className={styles.ruling}>G.O.D. ruling: {request.rulingText}</p> : null}
    </article>;
  }

  function renderHighLow(request: PlayerCalledCheckWorkspaceView["highLow"][number]) {
    return <article key={`highlow:${request.id}`} className={request.status === "pending" && request.participantCharacterId === view.characterId ? styles.pending : ""}>
      <header><span>HIGH / LOW · {label(request.visibility)}</span><em>{label(request.status)}</em></header>
      <h3>{request.purpose}</h3>
      <dl><div><dt>Mode</dt><dd>{label(request.mode)}</dd></div><div><dt>Player</dt><dd>{request.participantName ?? "Neutral"}</dd></div><div><dt>Locked call</dt><dd>{request.calledSide ? label(request.calledSide) : request.mode === "neutral" ? "No call" : "Not called yet"}</dd></div>{request.result ? <><div><dt>Raw Roll</dt><dd>{request.result.resultTotal}</dd></div><div><dt>Rolled side</dt><dd>{label(request.result.rolledSide)}</dd></div><div><dt>Match</dt><dd>{request.result.matchedCall === null ? "Not applicable" : request.result.matchedCall ? "Match" : "Mismatch"}</dd></div><div><dt>Critical</dt><dd>{request.result.criticalFailure ? "Critical failure" : request.result.doubleOtt ? "Double ott critical success" : "None"}</dd></div></> : null}</dl>
      {request.status === "pending" && request.participantCharacterId === view.characterId && request.calledSide === null ? <div className={styles.actions}><button disabled={busy} onClick={() => run("Low was locked before the Roll.", () => lockPlayerHighLowCall(view.characterId, { requestId: request.id, side: "low", idempotencyKey: idempotencyKey() }))}>Call Low</button><button disabled={busy} onClick={() => run("High was locked before the Roll.", () => lockPlayerHighLowCall(view.characterId, { requestId: request.id, side: "high", idempotencyKey: idempotencyKey() }))}>Call High</button></div> : null}
      {request.status === "pending" && request.participantCharacterId === view.characterId && request.calledSide !== null && request.mode === "player-calls-rolls" ? <button disabled={busy} onClick={() => answerHighLow(request)}>{request.rollMethod === "random" ? "Roll High / Low" : "Enter Physical Result"}</button> : null}
      {request.status === "pending" && request.mode === "player-calls-god-rolls" && request.calledSide !== null ? <p className={styles.waiting}>Your call is locked. Waiting for the G.O.D. Roll.</p> : null}
    </article>;
  }

  if (!view.calledChecks.length && !view.highLow.length) return null;
  const immediateChecks = view.calledChecks.filter(({ recipientCharacterId, status }) => recipientCharacterId === view.characterId && status === "pending");
  const immediateHighLow = view.highLow.filter(({ participantCharacterId, status }) => participantCharacterId === view.characterId && status === "pending");
  const historicalChecks = view.calledChecks.filter((request) => !immediateChecks.includes(request));
  const historicalHighLow = view.highLow.filter((request) => !immediateHighLow.includes(request));
  const immediateCount = immediateChecks.length + immediateHighLow.length;
  return <aside className={styles.panel} aria-labelledby="player-called-check-heading">
    <header>
      <div><p>LIVE TABLE REQUESTS</p><h2 id="player-called-check-heading">Called Checks &amp; High/Low</h2><span>{view.session.title}</span></div>
      <strong>{pendingOwnChecks.length + pendingOwnHighLow.length} waiting for you</strong>
    </header>
    {feedback ? <p className={feedback.error ? styles.error : styles.notice} role={feedback.error ? "alert" : "status"}>{feedback.message}</p> : null}
    <section aria-labelledby="player-immediate-requests">
      <h3 id="player-immediate-requests">Immediate requests</h3>
      {immediateCount ? <div className={styles.grid}>{immediateChecks.map(renderCalledCheck)}{immediateHighLow.map(renderHighLow)}</div> : <p className={styles.waiting}>No requests are waiting for you.</p>}
    </section>
    {historicalChecks.length + historicalHighLow.length ? <details open={immediateCount === 0}>
      <summary>Recent request and attempt history</summary>
      <div className={styles.grid}>{historicalChecks.map(renderCalledCheck)}{historicalHighLow.map(renderHighLow)}</div>
    </details> : null}
  </aside>;
}
