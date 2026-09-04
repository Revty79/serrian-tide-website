"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { SessionCloseoutView } from "@/features/tabletop-operations/session-closeout-service";

import { reopenCampaignSession } from "./actions";
import { finalizeSessionCloseout } from "./session-closeout-actions";

function timestamp(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function SessionCloseout({
  data,
  onOpenScenes,
  onOpenRolls,
  onOpenCalledChecks,
}: {
  data: SessionCloseoutView;
  onOpenScenes: () => void;
  onOpenRolls: () => void;
  onOpenCalledChecks: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const historical = data.session.status === "completed";

  async function finalize(): Promise<void> {
    if (!window.confirm("Finalize this Session? This is organizational only and will not reset any living Character state or history.")) return;
    setBusy(true);
    setFeedback(null);
    try {
      await finalizeSessionCloseout(data.session.id);
      setFeedback({ kind: "success", message: "Session finalized. Character state, rewards, durations, and Rolls were preserved." });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Session closeout failed." });
    } finally {
      setBusy(false);
    }
  }

  async function reopen(): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await reopenCampaignSession(data.session.id);
      setFeedback({ kind: "success", message: "Session reopened organizationally. Deeper history and Character state were not altered." });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Session could not be reopened." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="session-closeout">
    <header>
      <div><span>G.O.D. SESSION AUTHORITY</span><h3 className="font-sans">Session Closeout</h3><p>Review the whole table before making the Session organizationally historical.</p></div>
      <em className={`tabletop-status is-${data.session.status}`}>{data.session.status}</em>
    </header>
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`} role="status">{feedback.message}</p> : null}
    {historical ? <p className="session-closeout-history"><strong>Historical Session:</strong> completed {timestamp(data.session.completedAt)}. Closeout summaries derive from preserved records and living Character state remains separate.</p> : null}

    <section className="session-closeout-status">
      <article><span>Scenes</span><strong>{data.scenes.completed} completed</strong><small>{data.scenes.planned} planned · {data.scenes.active} active · {data.scenes.total} total</small></article>
      <article><span>Encounters</span><strong>{data.encounters.completed} completed</strong><small>{data.encounters.planned} planned · {data.encounters.active} active · {data.encounters.total} total</small></article>
      <article><span>XP history</span><strong>{data.rewards.totalExperience} XP</strong><small>{data.rewards.rewardRows} Encounter reward records</small></article>
      <article><span>Roll Ledger</span><strong>{data.rolls.total} Rolls</strong><small>{data.rolls.random} random · {data.rolls.entered} entered · {data.rolls.voided} voided</small></article>
    </section>

    <div className="session-closeout-grid">
      <article>
        <header><span>OBJECTIVE RUNTIME</span><strong>{data.blockers.length ? "Closeout blocked" : "Ready for review"}</strong></header>
        {data.blockers.length ? <div className="session-closeout-blockers">{data.blockers.map((blocker, index) => <p key={`${blocker.code}:${blocker.encounterId ?? blocker.sceneId ?? index}`}>{blocker.message}</p>)}</div> : <p className="session-closeout-clear">No active Scene, Encounter, Initiative, pending action, authored resolution, or Reaction remains.</p>}
        <footer><button type="button" onClick={onOpenScenes}>Review Scenes &amp; Encounters</button>{data.blockers.some(({ code }) => code === "called-check-pending" || code === "high-low-pending") ? <button type="button" onClick={onOpenCalledChecks}>Open Called Checks</button> : null}</footer>
      </article>
      <article>
        <header><span>WARNINGS</span><strong>{data.warnings.length}</strong></header>
        {data.warnings.length ? <ul>{data.warnings.map((warning, index) => <li key={`${warning.code}:${index}`}>{warning.message}</li>)}</ul> : <p className="session-closeout-clear">No unused preparation or unbound duration warnings.</p>}
        <small>Warnings are informational. Build 10 does not guess duration context or require deletion of unused preparation.</small>
      </article>
      <article>
        <header><span>ENCOUNTER XP HISTORY</span><strong>{data.rewards.totalExperience} total</strong></header>
        {data.rewards.recipients.length ? <div className="session-closeout-rewards">{data.rewards.recipients.map((reward) => <div key={reward.characterId}><span>{reward.characterName}</span><strong>+{reward.amount} XP</strong></div>)}</div> : <p className="session-closeout-clear">No Encounter XP was awarded in this Session.</p>}
        <small>Derived from immutable Encounter rewards. No second Session reward ledger exists.</small>
      </article>
      <article>
        <header><span>ROLL HISTORY</span><strong>{data.rolls.total}</strong></header>
        <dl><div><dt>Website Rolls</dt><dd>{data.rolls.random}</dd></div><div><dt>Physical Rolls</dt><dd>{data.rolls.entered}</dd></div><div><dt>Table-visible</dt><dd>{data.rolls.tableVisible}</dd></div><div><dt>Private</dt><dd>{data.rolls.private}</dd></div><div><dt>G.O.D.-only</dt><dd>{data.rolls.godOnly}</dd></div><div><dt>Voided</dt><dd>{data.rolls.voided}</dd></div></dl>
        <footer><button type="button" onClick={onOpenRolls}>Open Roll Ledger</button></footer>
      </article>
    </div>

    <footer className="session-closeout-finalize">
      <div><strong>{historical ? "Session history preserved" : data.canFinalize ? "Ready to finalize" : "Resolve every blocker first"}</strong><span>Finalization never heals, restores, clears, deletes, awards, or resets Character state.</span></div>
      {historical ? <button type="button" disabled={busy} onClick={() => void reopen()}>{busy ? "Reopening…" : "Reopen Session"}</button> : <button type="button" className="is-primary" disabled={busy || !data.canFinalize} onClick={() => void finalize()}>{busy ? "Finalizing…" : "Finalize Session"}</button>}
    </footer>
  </section>;
}
