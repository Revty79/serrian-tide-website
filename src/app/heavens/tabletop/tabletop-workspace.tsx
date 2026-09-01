"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getNextSessionSequence, type SessionMetadataInput } from "@/features/tabletop-operations/session-foundation";

import {
  completeCampaignSession,
  createCampaignSession,
  deleteCampaignSession,
  reopenCampaignSession,
  startCampaignSession,
  updateCampaignSession,
  type CampaignSessionSummary,
  type TabletopWorkspaceData,
} from "./actions";

type Feedback = { kind: "success" | "error"; message: string };

function metadataFromSession(session: CampaignSessionSummary): SessionMetadataInput {
  return {
    title: session.title,
    sequenceNumber: session.sequenceNumber,
    plannedFor: session.plannedFor,
    godNotes: session.godNotes,
  };
}

function emptyMetadata(sessions: CampaignSessionSummary[]): SessionMetadataInput {
  return {
    title: "",
    sequenceNumber: getNextSessionSequence(sessions),
    plannedFor: null,
    godNotes: "",
  };
}

function displayTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function TabletopWorkspace({
  initialData,
  requestedSessionId,
}: {
  initialData: TabletopWorkspaceData;
  requestedSessionId: number | null;
}) {
  const router = useRouter();
  const selectedCampaign = initialData.campaigns.find(({ id }) => id === initialData.selectedCampaignId) ?? null;
  const selectedSession = initialData.sessions.find(({ id }) => id === requestedSessionId)
    ?? initialData.sessions[0]
    ?? null;
  const [draft, setDraft] = useState<SessionMetadataInput>(() => selectedSession
    ? metadataFromSession(selectedSession)
    : emptyMetadata(initialData.sessions));
  const [creating, setCreating] = useState(initialData.sessions.length === 0 && selectedCampaign !== null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const statusCounts = useMemo(() => ({
    planned: initialData.sessions.filter(({ status }) => status === "planned").length,
    active: initialData.sessions.filter(({ status }) => status === "active").length,
    completed: initialData.sessions.filter(({ status }) => status === "completed").length,
  }), [initialData.sessions]);

  function campaignHref(campaignId: number): string {
    return `/heavens/tabletop?campaign=${campaignId}`;
  }

  function sessionHref(sessionId: number): string {
    return `/heavens/tabletop?campaign=${initialData.selectedCampaignId}&session=${sessionId}`;
  }

  function beginCreate(): void {
    setDraft(emptyMetadata(initialData.sessions));
    setCreating(true);
    setFeedback(null);
  }

  async function perform(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Session action failed." });
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    if (initialData.selectedCampaignId === null) return;
    await perform(async () => {
      if (creating) {
        const created = await createCampaignSession({ campaignId: initialData.selectedCampaignId!, ...draft });
        setFeedback({ kind: "success", message: `Session ${created.sequenceNumber} was created.` });
        setCreating(false);
        router.push(sessionHref(created.id));
      } else if (selectedSession) {
        const updated = await updateCampaignSession({ id: selectedSession.id, ...draft });
        setDraft(metadataFromSession(updated));
        setFeedback({ kind: "success", message: `Session ${updated.sequenceNumber} was saved.` });
        router.refresh();
      }
    });
  }

  async function lifecycle(action: "start" | "complete" | "reopen"): Promise<void> {
    if (!selectedSession) return;
    await perform(async () => {
      const updated = action === "start"
        ? await startCampaignSession(selectedSession.id)
        : action === "complete"
          ? await completeCampaignSession(selectedSession.id)
          : await reopenCampaignSession(selectedSession.id);
      setFeedback({ kind: "success", message: `Session ${updated.sequenceNumber} is now ${updated.status}.` });
      router.refresh();
    });
  }

  async function removeSelected(): Promise<void> {
    if (!selectedSession || !window.confirm(`Delete planned Session ${selectedSession.sequenceNumber}? This cannot be undone.`)) return;
    await perform(async () => {
      await deleteCampaignSession(selectedSession.id);
      setFeedback({ kind: "success", message: `Session ${selectedSession.sequenceNumber} was deleted.` });
      router.push(campaignHref(selectedSession.campaignId));
    });
  }

  return <main className="tabletop-page">
    <header className="tabletop-hero">
      <div>
        <p>THE HEAVENS / TABLETOP OPERATIONS</p>
        <h1 className="font-sans">Session Foundation</h1>
        <span>Organize the table. Preserve the living state of the world.</span>
      </div>
      <Link href="/heavens">Return to The Heavens</Link>
    </header>

    <section className="tabletop-campaigns" aria-label="Campaign selection">
      <div>
        <p>CAMPAIGN</p>
        <h2 className="font-sans">Choose the table</h2>
      </div>
      {initialData.campaigns.length ? <select
        value={initialData.selectedCampaignId ?? ""}
        onChange={(event) => router.push(campaignHref(Number(event.target.value)))}
      >
        {initialData.campaigns.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select> : <p className="tabletop-empty-inline">Create a Campaign before planning Sessions.</p>}
    </section>

    {selectedCampaign ? <>
      <section className="tabletop-campaign-context">
        <div><span>Selected Campaign</span><strong>{selectedCampaign.name}</strong></div>
        <p>{selectedCampaign.overview || "No Campaign overview has been written yet."}</p>
        <dl>
          <div><dt>Planned</dt><dd>{statusCounts.planned}</dd></div>
          <div><dt>Active</dt><dd>{statusCounts.active}</dd></div>
          <div><dt>Completed</dt><dd>{statusCounts.completed}</dd></div>
        </dl>
      </section>

      {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

      <div className="tabletop-workspace">
        <aside className="tabletop-session-library">
          <header><div><p>SESSION LIBRARY</p><h2 className="font-sans">Campaign Sessions</h2></div><button type="button" onClick={beginCreate}>New Session</button></header>
          <div className="tabletop-session-list">
            {initialData.sessions.map((entry) => <Link
              href={sessionHref(entry.id)}
              key={entry.id}
              className={selectedSession?.id === entry.id && !creating ? "is-selected" : ""}
            >
              <div><span>Session {entry.sequenceNumber}</span><em className={`is-${entry.status}`}>{entry.status}</em></div>
              <strong>{entry.title}</strong>
              <small>{entry.plannedFor ? `Planned ${entry.plannedFor}` : "No planned date"}</small>
            </Link>)}
            {!initialData.sessions.length ? <p className="tabletop-empty">No Sessions yet. Create Session 1 when you are ready.</p> : null}
          </div>
        </aside>

        <section className="tabletop-editor">
          <header>
            <div><p>{creating ? "NEW SESSION" : "SESSION RECORD"}</p><h2 className="font-sans">{creating ? "Plan a Session" : selectedSession?.title ?? "Select a Session"}</h2></div>
            {!creating && selectedSession ? <span className={`tabletop-status is-${selectedSession.status}`}>{selectedSession.status}</span> : null}
          </header>
          {(creating || selectedSession) ? <>
            <div className="tabletop-form-grid">
              <label><span>Session Number</span><input type="number" min={1} step={1} value={draft.sequenceNumber} onChange={(event) => setDraft({ ...draft, sequenceNumber: Number(event.target.value) })} /></label>
              <label><span>Planned Date</span><input type="date" value={draft.plannedFor ?? ""} onChange={(event) => setDraft({ ...draft, plannedFor: event.target.value || null })} /></label>
              <label className="is-wide"><span>Title</span><input value={draft.title} placeholder="The Session title" onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <label className="is-wide"><span>Private G.O.D. Notes</span><textarea rows={12} value={draft.godNotes} placeholder="What do I need to remember for this Session?" onChange={(event) => setDraft({ ...draft, godNotes: event.target.value })} /></label>
            </div>
            {!creating && selectedSession ? <div className="tabletop-timestamps">
              <div><span>Created</span><strong>{displayTimestamp(selectedSession.createdAt)}</strong></div>
              <div><span>Started</span><strong>{displayTimestamp(selectedSession.startedAt)}</strong></div>
              <div><span>Completed</span><strong>{displayTimestamp(selectedSession.completedAt)}</strong></div>
            </div> : null}
            <div className="tabletop-actions">
              <button type="button" className="is-primary" disabled={busy} onClick={() => void save()}>{busy ? "Working…" : creating ? "Create Planned Session" : "Save Session"}</button>
              {creating ? <button type="button" disabled={busy} onClick={() => {
                setCreating(false);
                if (selectedSession) setDraft(metadataFromSession(selectedSession));
                setFeedback(null);
              }}>Cancel</button> : null}
              {!creating && selectedSession?.status === "planned" ? <button type="button" disabled={busy} onClick={() => void lifecycle("start")}>Start Session</button> : null}
              {!creating && selectedSession?.status === "active" ? <button type="button" disabled={busy} onClick={() => void lifecycle("complete")}>Complete Session</button> : null}
              {!creating && selectedSession?.status === "completed" ? <button type="button" disabled={busy} onClick={() => void lifecycle("reopen")}>Reopen Session</button> : null}
              {!creating && selectedSession?.status === "planned" ? <button type="button" className="is-danger" disabled={busy} onClick={() => void removeSelected()}>Delete Planned Session</button> : null}
            </div>
          </> : <p className="tabletop-empty">Select or create a Session to begin.</p>}
        </section>
      </div>

      <aside className="tabletop-boundary">
        <strong>Persistent Character state remains authoritative.</strong>
        <span>Completing a Session never resets Health, Mana, Conditions, Injuries, Inventory, Charges, Equipment, spells, or Creature NPC snapshots.</span>
      </aside>
    </> : <section className="tabletop-no-campaign"><h2 className="font-sans">No Campaigns available</h2><p>Tabletop Operations begins with a Campaign owned by this G.O.D.</p><Link href="/heavens/campaigns/new">Create Campaign</Link></section>}
  </main>;
}
