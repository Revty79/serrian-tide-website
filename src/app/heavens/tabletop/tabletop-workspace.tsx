"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getNextSessionSequence, type SessionMetadataInput } from "@/features/tabletop-operations/session-foundation";
import type { SessionRosterEntityKind } from "@/features/tabletop-operations/session-roster";
import type { InitiativeTrackerReadModel } from "@/features/tabletop-operations/initiative-tracker";
import type { CombatAidEncounterView } from "@/features/tabletop-operations/combat-aid-service";
import type { EncounterCloseoutView } from "@/features/tabletop-operations/encounter-closeout-service";
import type { RollWorkspaceView } from "@/features/tabletop-operations/roll-runtime-service";
import type { SessionCloseoutView } from "@/features/tabletop-operations/session-closeout-service";

import {
  addSessionRosterMember,
  createCampaignSession,
  deleteCampaignSession,
  moveSessionRosterMember,
  removeSessionRosterMember,
  reopenCampaignSession,
  startCampaignSession,
  updateCampaignSession,
  updateSessionRosterPrepNotes,
  type CampaignSessionSummary,
  type SessionPrepWorkspaceData,
  type SessionRosterEntryView,
  type TabletopWorkspaceData,
} from "./actions";
import type { SceneWorkspaceData } from "./scene-actions";
import type { EncounterWorkspaceData } from "./encounter-actions";
import { SceneWorkspace } from "./scene-workspace";
import { SessionRollWorkspace } from "./roll-ledger";
import { SessionCloseout } from "./session-closeout";

type Feedback = { kind: "success" | "error"; message: string };
type WorkspaceTab = "record" | "prep" | "scenes" | "rolls" | "closeout";

const rosterGroups: { kind: SessionRosterEntityKind; title: string }[] = [
  { kind: "pc", title: "Player Characters" },
  { kind: "race-npc", title: "Race NPCs" },
  { kind: "creature-npc", title: "Creature NPCs" },
];

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

function SessionRosterCard({
  sessionId,
  entry,
  editable,
  first,
  last,
  onChanged,
}: {
  sessionId: number;
  entry: SessionRosterEntryView;
  editable: boolean;
  first: boolean;
  last: boolean;
  onChanged: (feedback: Feedback) => void;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(entry.prepNotes);
  const [busy, setBusy] = useState(false);

  async function perform(work: () => Promise<void>, success: string): Promise<void> {
    setBusy(true);
    try {
      await work();
      onChanged({ kind: "success", message: success });
      router.refresh();
    } catch (error) {
      onChanged({ kind: "error", message: error instanceof Error ? error.message : "The roster action failed." });
    } finally {
      setBusy(false);
    }
  }

  const identityDetail = entry.kind === "pc"
    ? entry.playerName ? `Player: ${entry.playerName}` : "Player Character"
    : entry.kind === "creature-npc" && entry.creatureTemplateName
      ? `Creature: ${entry.creatureTemplateName}`
      : entry.kindLabel;

  return <article className="tabletop-roster-card">
    <header>
      <div>
        <span>{entry.kindLabel}</span>
        <strong>{entry.name}</strong>
        <small>{identityDetail}</small>
      </div>
      {editable ? <div className="tabletop-roster-order" aria-label={`Reorder ${entry.name}`}>
        <button
          type="button"
          disabled={busy || first}
          aria-label={`Move ${entry.name} up`}
          onClick={() => void perform(
            () => moveSessionRosterMember(sessionId, entry.characterId, "up"),
            `${entry.name} was moved up.`,
          )}
        >↑</button>
        <button
          type="button"
          disabled={busy || last}
          aria-label={`Move ${entry.name} down`}
          onClick={() => void perform(
            () => moveSessionRosterMember(sessionId, entry.characterId, "down"),
            `${entry.name} was moved down.`,
          )}
        >↓</button>
      </div> : null}
    </header>
    <label>
      <span>Private prep notes</span>
      <textarea
        rows={4}
        value={notes}
        disabled={!editable || busy}
        placeholder="Role, motive, reminders, or table notes for this Session."
        onChange={(event) => setNotes(event.target.value)}
      />
    </label>
    {editable ? <footer>
      <button
        type="button"
        disabled={busy || notes === entry.prepNotes}
        onClick={() => void perform(
          () => updateSessionRosterPrepNotes(sessionId, entry.characterId, notes),
          `${entry.name}'s prep notes were saved.`,
        )}
      >Save Notes</button>
      <button
        type="button"
        className="is-danger"
        disabled={busy}
        onClick={() => void perform(
          () => removeSessionRosterMember(sessionId, entry.characterId),
          `${entry.name} was removed from this Session roster.`,
        )}
      >Remove</button>
    </footer> : null}
  </article>;
}

export function TabletopWorkspace({
  initialData,
  initialPrepData,
  initialSceneData,
  initialEncounterData,
  initialInitiativeTracker,
  initialCombatAid,
  initialCloseout,
  initialRollWorkspace,
  initialSessionCloseout,
  requestedSessionId,
}: {
  initialData: TabletopWorkspaceData;
  initialPrepData: SessionPrepWorkspaceData | null;
  initialSceneData: SceneWorkspaceData | null;
  initialEncounterData: EncounterWorkspaceData | null;
  initialInitiativeTracker: InitiativeTrackerReadModel | null;
  initialCombatAid: CombatAidEncounterView | null;
  initialCloseout: EncounterCloseoutView | null;
  initialRollWorkspace: RollWorkspaceView | null;
  initialSessionCloseout: SessionCloseoutView | null;
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
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("record");
  const [rosterSearch, setRosterSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const statusCounts = useMemo(() => ({
    planned: initialData.sessions.filter(({ status }) => status === "planned").length,
    active: initialData.sessions.filter(({ status }) => status === "active").length,
    completed: initialData.sessions.filter(({ status }) => status === "completed").length,
  }), [initialData.sessions]);
  const filteredAvailable = initialPrepData?.available.filter((entry) => {
    const search = rosterSearch.trim().toLocaleLowerCase();
    return !search || [entry.name, entry.kindLabel, entry.playerName, entry.creatureTemplateName]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(search));
  }) ?? [];
  const sessionEditable = creating || selectedSession?.status !== "completed";

  function campaignHref(campaignId: number): string {
    return `/heavens/tabletop?campaign=${campaignId}`;
  }

  function sessionHref(sessionId: number): string {
    return `/heavens/tabletop?campaign=${initialData.selectedCampaignId}&session=${sessionId}`;
  }

  function beginCreate(): void {
    setDraft(emptyMetadata(initialData.sessions));
    setCreating(true);
    setActiveTab("record");
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

  async function lifecycle(action: "start" | "reopen"): Promise<void> {
    if (!selectedSession) return;
    await perform(async () => {
      const updated = action === "start"
        ? await startCampaignSession(selectedSession.id)
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

  async function addRosterMember(characterId: number, name: string): Promise<void> {
    if (!selectedSession) return;
    await perform(async () => {
      await addSessionRosterMember(selectedSession.id, characterId);
      setFeedback({ kind: "success", message: `${name} was added to this Session roster.` });
      router.refresh();
    });
  }

  function recordRosterFeedback(nextFeedback: Feedback): void {
    setFeedback(nextFeedback);
  }

  return <main className="tabletop-page">
    <header className="tabletop-hero">
      <div>
        <p>THE HEAVENS / TABLETOP OPERATIONS</p>
        <h1 className="font-sans">Tabletop Operations</h1>
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

      {!creating && selectedSession && initialSessionCloseout ? <section className="tabletop-active-table">
        <div><span>ACTIVE TABLE</span><strong>Session {selectedSession.sequenceNumber} · {selectedSession.title}</strong><small>{selectedSession.status}</small></div>
        <div><span>Scene</span><strong>{initialSessionCloseout.activeContext.sceneTitle ?? "No active Scene"}</strong></div>
        <div><span>Encounter</span><strong>{initialSessionCloseout.activeContext.encounterTitle ?? "No active Encounter"}</strong></div>
        <div><span>Initiative</span><strong>{initialSessionCloseout.activeContext.initiative ? `Round ${initialSessionCloseout.activeContext.initiative.roundNumber} / Step ${initialSessionCloseout.activeContext.initiative.stepNumber}` : "Not active"}</strong></div>
        <footer>{initialSessionCloseout.activeContext.encounterId && initialSessionCloseout.activeContext.sceneId ? <button type="button" onClick={() => {
          setActiveTab("scenes");
          router.push(`/heavens/tabletop?campaign=${selectedSession.campaignId}&session=${selectedSession.id}&scene=${initialSessionCloseout.activeContext.sceneId}&encounter=${initialSessionCloseout.activeContext.encounterId}`);
        }}>Go to Active Encounter</button> : null}<button type="button" onClick={() => setActiveTab("rolls")}>Roll</button><button type="button" onClick={() => setActiveTab("closeout")}>Session Closeout</button></footer>
      </section> : null}

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
            <div><p>{creating ? "NEW SESSION" : activeTab === "record" ? "SESSION RECORD" : activeTab === "prep" ? "ROSTER & PREP" : activeTab === "scenes" ? "SCENES" : activeTab === "rolls" ? "ROLLS" : "CLOSEOUT"}</p><h2 className="font-sans">{creating ? "Plan a Session" : selectedSession?.title ?? "Select a Session"}</h2></div>
            {!creating && selectedSession ? <span className={`tabletop-status is-${selectedSession.status}`}>{selectedSession.status}</span> : null}
          </header>

          {!creating && selectedSession ? <nav className="tabletop-editor-tabs" aria-label="Session workspace">
            <button type="button" className={activeTab === "record" ? "is-selected" : ""} onClick={() => setActiveTab("record")}>Session Record</button>
            <button type="button" className={activeTab === "prep" ? "is-selected" : ""} onClick={() => setActiveTab("prep")}>Roster &amp; Prep <span>{initialPrepData?.roster.length ?? 0}</span></button>
            <button type="button" className={activeTab === "scenes" ? "is-selected" : ""} onClick={() => setActiveTab("scenes")}>Scenes <span>{initialSceneData?.scenes.length ?? 0}</span></button>
            <button type="button" className={activeTab === "rolls" ? "is-selected" : ""} onClick={() => setActiveTab("rolls")}>Rolls <span>{initialSessionCloseout?.rolls.total ?? 0}</span></button>
            <button type="button" className={activeTab === "closeout" ? "is-selected" : ""} onClick={() => setActiveTab("closeout")}>Closeout {initialSessionCloseout?.blockers.length ? <span>{initialSessionCloseout.blockers.length}</span> : null}</button>
          </nav> : null}

          {(creating || selectedSession) && (creating || activeTab === "record") ? <>
            {!sessionEditable ? <p className="tabletop-readonly-notice">This completed Session is historical and read-only. Reopen it to edit the record or roster.</p> : null}
            <div className="tabletop-form-grid">
              <label><span>Session Number</span><input disabled={!sessionEditable || busy} type="number" min={1} step={1} value={draft.sequenceNumber} onChange={(event) => setDraft({ ...draft, sequenceNumber: Number(event.target.value) })} /></label>
              <label><span>Planned Date</span><input disabled={!sessionEditable || busy} type="date" value={draft.plannedFor ?? ""} onChange={(event) => setDraft({ ...draft, plannedFor: event.target.value || null })} /></label>
              <label className="is-wide"><span>Title</span><input disabled={!sessionEditable || busy} value={draft.title} placeholder="The Session title" onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <label className="is-wide"><span>Private G.O.D. Notes</span><textarea disabled={!sessionEditable || busy} rows={12} value={draft.godNotes} placeholder="What do I need to remember for this Session?" onChange={(event) => setDraft({ ...draft, godNotes: event.target.value })} /></label>
            </div>
            {!creating && selectedSession ? <div className="tabletop-timestamps">
              <div><span>Created</span><strong>{displayTimestamp(selectedSession.createdAt)}</strong></div>
              <div><span>Started</span><strong>{displayTimestamp(selectedSession.startedAt)}</strong></div>
              <div><span>Completed</span><strong>{displayTimestamp(selectedSession.completedAt)}</strong></div>
            </div> : null}
            <div className="tabletop-actions">
              {sessionEditable ? <button type="button" className="is-primary" disabled={busy} onClick={() => void save()}>{busy ? "Working…" : creating ? "Create Planned Session" : "Save Session"}</button> : null}
              {creating ? <button type="button" disabled={busy} onClick={() => {
                setCreating(false);
                if (selectedSession) setDraft(metadataFromSession(selectedSession));
                setFeedback(null);
              }}>Cancel</button> : null}
              {!creating && selectedSession?.status === "planned" ? <button type="button" disabled={busy} onClick={() => void lifecycle("start")}>Start Session</button> : null}
              {!creating && selectedSession?.status === "active" ? <button type="button" disabled={busy} onClick={() => setActiveTab("closeout")}>Review Session Closeout</button> : null}
              {!creating && selectedSession?.status === "completed" ? <button type="button" disabled={busy} onClick={() => void lifecycle("reopen")}>Reopen Session</button> : null}
              {!creating && selectedSession?.status === "planned" ? <button type="button" className="is-danger" disabled={busy} onClick={() => void removeSelected()}>Delete Planned Session</button> : null}
            </div>
          </> : null}

          {!creating && selectedSession && activeTab === "prep" && initialPrepData ? <div className="tabletop-prep-workspace">
            <section className="tabletop-prep-context">
              <div><span>Campaign</span><strong>{selectedCampaign.name}</strong></div>
              <div><span>Session</span><strong>#{selectedSession.sequenceNumber} · {selectedSession.title}</strong></div>
              <div><span>Planned</span><strong>{selectedSession.plannedFor ?? "No date"}</strong></div>
            </section>

            {!initialPrepData.editable ? <p className="tabletop-readonly-notice">This is the preserved historical roster. Reopen the Session before changing members, order, or prep notes.</p> : null}

            <section className="tabletop-prep-notes">
              <header><div><span>SESSION PREP</span><h3 className="font-sans">Private G.O.D. Notes</h3></div>{initialPrepData.editable ? <button type="button" disabled={busy} onClick={() => void save()}>Save Session Notes</button> : null}</header>
              <textarea
                rows={7}
                value={draft.godNotes}
                disabled={!initialPrepData.editable || busy}
                placeholder="Session-wide reminders, likely beats, and preparation notes."
                onChange={(event) => setDraft({ ...draft, godNotes: event.target.value })}
              />
            </section>

            <section className="tabletop-roster-section">
              <header>
                <div><span>SESSION ROSTER</span><h3 className="font-sans">At this table</h3></div>
                <strong>{initialPrepData.roster.length} {initialPrepData.roster.length === 1 ? "member" : "members"}</strong>
              </header>
              <div className="tabletop-roster-list">
                {initialPrepData.roster.map((entry, index) => <SessionRosterCard
                  key={entry.characterId}
                  sessionId={selectedSession.id}
                  entry={entry}
                  editable={initialPrepData.editable}
                  first={index === 0}
                  last={index === initialPrepData.roster.length - 1}
                  onChanged={recordRosterFeedback}
                />)}
                {!initialPrepData.roster.length ? <p className="tabletop-empty">No one is on this Session roster yet. Add existing Campaign Characters and NPCs below.</p> : null}
              </div>
            </section>

            {initialPrepData.editable ? <section className="tabletop-available-section">
              <header><div><span>CAMPAIGN CHARACTERS</span><h3 className="font-sans">Add to this Session</h3></div><input type="search" value={rosterSearch} placeholder="Find a Character or NPC" onChange={(event) => setRosterSearch(event.target.value)} /></header>
              {rosterGroups.map((group) => {
                const entries = filteredAvailable.filter(({ kind }) => kind === group.kind);
                if (!entries.length) return null;
                return <div className="tabletop-available-group" key={group.kind}>
                  <h4>{group.title}</h4>
                  <div>{entries.map((entry) => <article key={entry.characterId}>
                    <div><strong>{entry.name}</strong><small>{entry.playerName ? `Player: ${entry.playerName}` : entry.creatureTemplateName ? `Creature: ${entry.creatureTemplateName}` : entry.kindLabel}</small></div>
                    <button type="button" disabled={busy} onClick={() => void addRosterMember(entry.characterId, entry.name)}>Add</button>
                  </article>)}</div>
                </div>;
              })}
              {!filteredAvailable.length ? <p className="tabletop-empty">{initialPrepData.available.length ? "No available Characters match that search." : "Every Campaign Character and NPC is already on this roster."}</p> : null}
            </section> : null}
          </div> : null}

          {!creating && selectedSession && activeTab === "scenes" && initialSceneData ? <SceneWorkspace
            key={initialSceneData.selectedSceneId ?? "no-scene"}
            initialData={initialSceneData}
            initialEncounterData={initialEncounterData}
            initialInitiativeTracker={initialInitiativeTracker}
            initialCombatAid={initialCombatAid}
            initialCloseout={initialCloseout}
            initialRollWorkspace={initialRollWorkspace}
            session={selectedSession}
            campaignName={selectedCampaign.name}
          /> : null}

          {!creating && selectedSession && activeTab === "rolls" && initialRollWorkspace ? <SessionRollWorkspace key={`${initialRollWorkspace.initialHistory.rolls[0]?.id ?? "empty"}:${initialRollWorkspace.initialHistory.rolls.length}`} workspace={initialRollWorkspace} /> : null}

          {!creating && selectedSession && activeTab === "closeout" && initialSessionCloseout ? <SessionCloseout data={initialSessionCloseout} onOpenScenes={() => setActiveTab("scenes")} onOpenRolls={() => setActiveTab("rolls")} /> : null}

          {!creating && !selectedSession ? <p className="tabletop-empty">Select or create a Session to begin.</p> : null}
        </section>
      </div>

      <aside className="tabletop-boundary">
        <strong>The roster references living Campaign Characters.</strong>
        <span>Completing a Session preserves its roster and never resets Health, Mana, Conditions, Injuries, Inventory, Charges, Equipment, spells, or Creature NPC snapshots.</span>
      </aside>
    </> : <section className="tabletop-no-campaign"><h2 className="font-sans">No Campaigns available</h2><p>Tabletop Operations begins with a Campaign owned by this G.O.D.</p><Link href="/heavens/campaigns/new">Create Campaign</Link></section>}
  </main>;
}
