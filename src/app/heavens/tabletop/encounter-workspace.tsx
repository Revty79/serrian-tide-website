"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  ENCOUNTER_TYPES,
  getNextEncounterSequence,
  type EncounterMetadataInput,
} from "@/features/tabletop-operations/encounter-foundation";
import type { InitiativeTrackerReadModel } from "@/features/tabletop-operations/initiative-tracker";
import type { CombatAidEncounterView } from "@/features/tabletop-operations/combat-aid-service";

import {
  addCampaignSessionEncounterParticipant,
  completeCampaignSessionEncounter,
  createCampaignSessionEncounter,
  deleteCampaignSessionEncounter,
  moveCampaignSessionEncounterParticipant,
  removeCampaignSessionEncounterParticipant,
  reopenCampaignSessionEncounter,
  startCampaignSessionEncounter,
  updateCampaignSessionEncounter,
  updateEncounterParticipantPrepNotes,
  type CampaignEncounterDetail,
  type EncounterParticipantView,
  type EncounterWorkspaceData,
} from "./encounter-actions";
import type { CampaignSceneDetail } from "./scene-actions";
import { InitiativeTracker } from "./initiative-tracker";
import { CombatAidWorkspace } from "./combat-aid-workspace";
import { CreatureCatalogSpawn } from "./creature-catalog-spawn";

type Feedback = { kind: "success" | "error"; message: string };

const encounterTypeLabels = {
  combat: "Combat",
  social: "Social",
  exploration: "Exploration",
  chase: "Chase",
  hazard: "Hazard",
  other: "Other",
} as const;

function metadataFromEncounter(encounter: CampaignEncounterDetail): EncounterMetadataInput {
  return {
    sequenceNumber: encounter.sequenceNumber,
    title: encounter.title,
    encounterType: encounter.encounterType,
    description: encounter.description,
    godNotes: encounter.godNotes,
  };
}

function emptyEncounterMetadata(data: EncounterWorkspaceData): EncounterMetadataInput {
  return {
    sequenceNumber: getNextEncounterSequence(data.encounters),
    title: "",
    encounterType: "other",
    description: "",
    godNotes: "",
  };
}

function displayTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function participantIdentity(entry: EncounterParticipantView): string {
  if (entry.playerName) return `Player: ${entry.playerName}`;
  if (entry.creatureTemplateName) return `Creature: ${entry.creatureTemplateName}`;
  return entry.kindLabel;
}

function EncounterParticipantCard({
  encounterId,
  entry,
  editable,
  first,
  last,
  onFeedback,
}: {
  encounterId: number;
  entry: EncounterParticipantView;
  editable: boolean;
  first: boolean;
  last: boolean;
  onFeedback: (feedback: Feedback) => void;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(entry.prepNotes);
  const [busy, setBusy] = useState(false);

  async function perform(work: () => Promise<void>, success: string): Promise<void> {
    setBusy(true);
    try {
      await work();
      onFeedback({ kind: "success", message: success });
      router.refresh();
    } catch (error) {
      onFeedback({ kind: "error", message: error instanceof Error ? error.message : "The participant action failed." });
    } finally {
      setBusy(false);
    }
  }

  return <article className="tabletop-encounter-participant">
    <header>
      <div>
        <span>{entry.kindLabel}</span>
        <strong>{entry.name}</strong>
        <small>{participantIdentity(entry)}</small>
      </div>
      {editable ? <div className="tabletop-encounter-participant-order">
        <button type="button" disabled={busy || first} aria-label={`Move ${entry.name} up`} onClick={() => void perform(
          () => moveCampaignSessionEncounterParticipant(encounterId, entry.characterId, "up"),
          `${entry.name} was moved up in the preparation order.`,
        )}>↑</button>
        <button type="button" disabled={busy || last} aria-label={`Move ${entry.name} down`} onClick={() => void perform(
          () => moveCampaignSessionEncounterParticipant(encounterId, entry.characterId, "down"),
          `${entry.name} was moved down in the preparation order.`,
        )}>↓</button>
      </div> : null}
    </header>
    <label>
      <span>Private participant prep notes</span>
      <textarea
        rows={3}
        value={notes}
        disabled={!editable || busy}
        placeholder="Role, motive, tactics, or reminders for this Encounter."
        onChange={(event) => setNotes(event.target.value)}
      />
    </label>
    {editable ? <footer>
      <button type="button" disabled={busy || notes === entry.prepNotes} onClick={() => void perform(
        () => updateEncounterParticipantPrepNotes(encounterId, entry.characterId, notes),
        `${entry.name}'s Encounter notes were saved.`,
      )}>Save Notes</button>
      <button type="button" className="is-danger" disabled={busy} onClick={() => void perform(
        () => removeCampaignSessionEncounterParticipant(encounterId, entry.characterId),
        `${entry.name} was removed from this Encounter.`,
      )}>Remove</button>
    </footer> : null}
  </article>;
}

export function EncounterWorkspace({
  initialData,
  initialInitiativeTracker,
  initialCombatAid,
  scene,
}: {
  initialData: EncounterWorkspaceData;
  initialInitiativeTracker: InitiativeTrackerReadModel | null;
  initialCombatAid: CombatAidEncounterView | null;
  scene: CampaignSceneDetail;
}) {
  const router = useRouter();
  const selectedEncounter = initialData.selectedEncounter;
  const [creating, setCreating] = useState(false);
  const [activeSection, setActiveSection] = useState<"prep" | "initiative" | "combat-aid">("prep");
  const [draft, setDraft] = useState<EncounterMetadataInput>(() => selectedEncounter
    ? metadataFromEncounter(selectedEncounter)
    : emptyEncounterMetadata(initialData));
  const [participantSearch, setParticipantSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function encounterHref(encounterId?: number): string {
    const base = `/heavens/tabletop?campaign=${initialData.campaignId}&session=${initialData.sessionId}&scene=${initialData.sceneId}`;
    return encounterId ? `${base}&encounter=${encounterId}` : base;
  }

  async function perform(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Encounter action failed." });
    } finally {
      setBusy(false);
    }
  }

  function beginCreate(): void {
    setDraft(emptyEncounterMetadata(initialData));
    setCreating(true);
    setActiveSection("prep");
    setFeedback(null);
  }

  function openEncounter(encounterId: number): void {
    setCreating(false);
    if (selectedEncounter?.id === encounterId) setDraft(metadataFromEncounter(selectedEncounter));
    setFeedback(null);
    setActiveSection("prep");
    router.push(encounterHref(encounterId));
  }

  async function saveEncounter(): Promise<void> {
    await perform(async () => {
      if (creating) {
        const created = await createCampaignSessionEncounter({ sceneId: initialData.sceneId, ...draft });
        setCreating(false);
        setFeedback({ kind: "success", message: `Encounter ${created.sequenceNumber} was created.` });
        router.push(encounterHref(created.id));
        return;
      }
      if (!selectedEncounter) return;
      const updated = await updateCampaignSessionEncounter({ id: selectedEncounter.id, ...draft });
      setDraft({
        sequenceNumber: updated.sequenceNumber,
        title: updated.title,
        encounterType: updated.encounterType,
        description: updated.description,
        godNotes: updated.godNotes,
      });
      setFeedback({ kind: "success", message: `Encounter ${updated.sequenceNumber} was saved.` });
      router.refresh();
    });
  }

  async function lifecycle(action: "start" | "complete" | "reopen"): Promise<void> {
    if (!selectedEncounter) return;
    await perform(async () => {
      const updated = action === "start"
        ? await startCampaignSessionEncounter(selectedEncounter.id)
        : action === "complete"
          ? await completeCampaignSessionEncounter(selectedEncounter.id)
          : await reopenCampaignSessionEncounter(selectedEncounter.id);
      setFeedback({ kind: "success", message: `Encounter ${updated.sequenceNumber} is now ${updated.status}.` });
      router.refresh();
    });
  }

  async function removeEncounter(): Promise<void> {
    if (!selectedEncounter || !window.confirm(`Delete planned Encounter ${selectedEncounter.sequenceNumber}? Its participant references will also be removed.`)) return;
    await perform(async () => {
      await deleteCampaignSessionEncounter(selectedEncounter.id);
      setFeedback({ kind: "success", message: `Encounter ${selectedEncounter.sequenceNumber} was deleted.` });
      router.push(encounterHref());
    });
  }

  async function addParticipant(characterId: number, name: string): Promise<void> {
    if (!selectedEncounter) return;
    await perform(async () => {
      await addCampaignSessionEncounterParticipant(selectedEncounter.id, characterId);
      setFeedback({ kind: "success", message: `${name} was added to this Encounter.` });
      router.refresh();
    });
  }

  const availableParticipants = selectedEncounter?.availableSceneMembers.filter((entry) => {
    const search = participantSearch.trim().toLocaleLowerCase();
    return !search || [entry.name, entry.kindLabel, entry.playerName, entry.creatureTemplateName]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(search));
  }) ?? [];
  const editorVisible = creating || selectedEncounter !== null;
  const editorEditable = creating || selectedEncounter?.editable === true;
  const parentsActive = initialData.sessionStatus === "active" && initialData.sceneStatus === "active";

  return <section className="tabletop-encounters-workspace">
    <header className="tabletop-encounters-heading">
      <div><span>ENCOUNTERS</span><h4 className="font-sans">Scene Encounters</h4></div>
      <p>Organize a focused span within Scene {scene.sequenceNumber}, {scene.title}. Encounter type is descriptive only.</p>
    </header>
    {feedback ? <p className={`tabletop-encounter-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

    <div className="tabletop-encounters-layout" data-workspace-flow="vertical">
      <section className="tabletop-encounter-library" aria-label="Encounter selector">
        <header>
          <div><span>ENCOUNTER LIBRARY</span><h5 className="font-sans">Prepared Encounters</h5></div>
          {initialData.canCreate ? <button type="button" disabled={busy} onClick={beginCreate}>New Encounter</button> : null}
        </header>
        <div>
          {initialData.encounters.map((encounter) => <button
            type="button"
            key={encounter.id}
            className={!creating && encounter.id === initialData.selectedEncounterId ? "is-selected" : ""}
            onClick={() => openEncounter(encounter.id)}
          >
            <span><b>Encounter {encounter.sequenceNumber}</b><em className={`is-${encounter.status}`}>{encounter.status}</em></span>
            <strong>{encounter.title}</strong>
            <small>{encounterTypeLabels[encounter.encounterType]} · {encounter.participantCount} {encounter.participantCount === 1 ? "participant" : "participants"}</small>
          </button>)}
          {!initialData.encounters.length ? <p className="tabletop-empty">No Encounters yet. Add one when this Scene needs a focused prepared span.</p> : null}
        </div>
      </section>

      <section className="tabletop-encounter-editor">
        <header>
          <div><span>{creating ? "NEW ENCOUNTER" : "ENCOUNTER RECORD"}</span><h5 className="font-sans">{creating ? "Plan an Encounter" : selectedEncounter?.title ?? "Select an Encounter"}</h5></div>
          {!creating && selectedEncounter ? <em className={`tabletop-status is-${selectedEncounter.status}`}>{selectedEncounter.status}</em> : null}
        </header>

        {!creating && selectedEncounter ? <nav className="tabletop-encounter-tabs" aria-label="Encounter workspace">
          <button type="button" className={activeSection === "prep" ? "is-selected" : ""} onClick={() => setActiveSection("prep")}>Encounter Prep</button>
          <button type="button" className={activeSection === "initiative" ? "is-selected" : ""} onClick={() => setActiveSection("initiative")}>Initiative Tracker {initialInitiativeTracker?.runtime?.runtime.status === "active" ? <span>Active</span> : null}</button>
          <button type="button" className={activeSection === "combat-aid" ? "is-selected" : ""} onClick={() => setActiveSection("combat-aid")}>Combat Aid <span>{initialCombatAid?.participants.length ?? 0}</span></button>
        </nav> : null}

        {editorVisible && (creating || activeSection === "prep") ? <>
          {!creating && !selectedEncounter?.editable ? <p className="tabletop-readonly-notice">This Encounter or one of its parents is historical and read-only. Reopen the parent records and then the Encounter to make corrections.</p> : null}
          {!parentsActive && selectedEncounter?.status === "planned" ? <p className="tabletop-encounter-guidance">Activate both the Session and this Scene before starting the Encounter. Preparation remains available while the parents are planned.</p> : null}
          <div className="tabletop-encounter-form">
            <label><span>Encounter Number</span><input disabled={!editorEditable || busy} type="number" min={1} step={1} value={draft.sequenceNumber} onChange={(event) => setDraft({ ...draft, sequenceNumber: Number(event.target.value) })} /></label>
            <label><span>Type</span><select disabled={!editorEditable || busy} value={draft.encounterType} onChange={(event) => setDraft({ ...draft, encounterType: event.target.value as EncounterMetadataInput["encounterType"] })}>{ENCOUNTER_TYPES.map((type) => <option key={type} value={type}>{encounterTypeLabels[type]}</option>)}</select></label>
            <label className="is-wide"><span>Title</span><input disabled={!editorEditable || busy} value={draft.title} placeholder="Roadside Ambush" onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label className="is-wide"><span>Description</span><textarea disabled={!editorEditable || busy} rows={5} value={draft.description} placeholder="What is happening during this Encounter?" onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <label className="is-wide"><span>Private G.O.D. Notes</span><textarea disabled={!editorEditable || busy} rows={5} value={draft.godNotes} placeholder="Preparation and table reminders for this Encounter." onChange={(event) => setDraft({ ...draft, godNotes: event.target.value })} /></label>
          </div>
          <p className="tabletop-encounter-type-note">Selecting Combat records the Encounter’s category. It does not roll Initiative, begin combat, or automate any action.</p>

          {!creating && selectedEncounter ? <div className="tabletop-timestamps">
            <div><span>Created</span><strong>{displayTimestamp(selectedEncounter.createdAt)}</strong></div>
            <div><span>Started</span><strong>{displayTimestamp(selectedEncounter.startedAt)}</strong></div>
            <div><span>Completed</span><strong>{displayTimestamp(selectedEncounter.completedAt)}</strong></div>
          </div> : null}

          <div className="tabletop-actions">
            {editorEditable ? <button type="button" className="is-primary" disabled={busy} onClick={() => void saveEncounter()}>{busy ? "Working…" : creating ? "Create Planned Encounter" : "Save Encounter"}</button> : null}
            {creating ? <button type="button" disabled={busy} onClick={() => {
              setCreating(false);
              if (selectedEncounter) setDraft(metadataFromEncounter(selectedEncounter));
              setFeedback(null);
            }}>Cancel</button> : null}
            {!creating && selectedEncounter?.status === "planned" && parentsActive ? <button type="button" disabled={busy} onClick={() => void lifecycle("start")}>Start Encounter</button> : null}
            {!creating && selectedEncounter?.status === "active" && parentsActive ? <button type="button" disabled={busy} onClick={() => void lifecycle("complete")}>Complete Encounter</button> : null}
            {!creating && selectedEncounter?.status === "completed" && parentsActive ? <button type="button" disabled={busy} onClick={() => void lifecycle("reopen")}>Reopen Encounter</button> : null}
            {!creating && selectedEncounter?.status === "planned" && initialData.canCreate ? <button type="button" className="is-danger" disabled={busy} onClick={() => void removeEncounter()}>Delete Planned Encounter</button> : null}
          </div>

          {!creating && selectedEncounter ? <section className="tabletop-encounter-participants">
            <header>
              <div><span>ENCOUNTER PARTICIPANTS</span><h6 className="font-sans">Prepared from Scene Members</h6></div>
              <strong>{selectedEncounter.participants.length} {selectedEncounter.participants.length === 1 ? "participant" : "participants"}</strong>
            </header>
            <p className="tabletop-encounter-order-note">Preparation/display order — not Initiative order.</p>
            <div className="tabletop-encounter-participant-list">
              {selectedEncounter.participants.map((entry, index) => <EncounterParticipantCard
                key={entry.characterId}
                encounterId={selectedEncounter.id}
                entry={entry}
                editable={selectedEncounter.editable}
                first={index === 0}
                last={index === selectedEncounter.participants.length - 1}
                onFeedback={setFeedback}
              />)}
              {!selectedEncounter.participants.length ? <p className="tabletop-empty">No Participants yet. Add existing Scene Members below.</p> : null}
            </div>

            {selectedEncounter.editable ? <div className="tabletop-encounter-available">
              <header><div><span>SCENE MEMBERS</span><h6 className="font-sans">Add to Encounter</h6></div><input type="search" value={participantSearch} placeholder="Find a Scene Member" onChange={(event) => setParticipantSearch(event.target.value)} /></header>
              <div>
                {availableParticipants.map((entry) => <article key={entry.characterId}>
                  <div><strong>{entry.name}</strong><small>{entry.playerName ? `Player: ${entry.playerName}` : entry.creatureTemplateName ? `Creature: ${entry.creatureTemplateName}` : entry.kindLabel}</small></div>
                  <button type="button" disabled={busy} onClick={() => void addParticipant(entry.characterId, entry.name)}>Add Participant</button>
                </article>)}
                {!availableParticipants.length ? <p className="tabletop-empty">{selectedEncounter.availableSceneMembers.length ? "No Scene Members match that search." : "Every Scene Member is already participating."}</p> : null}
              </div>
              <CreatureCatalogSpawn
                encounterId={selectedEncounter.id}
                initiativeActive={initialInitiativeTracker?.runtime?.runtime.status === "active"}
                onFeedback={setFeedback}
              />
            </div> : null}
          </section> : null}
        </> : !editorVisible ? <p className="tabletop-empty">Select an Encounter or create a new one.</p> : null}
        {!creating && selectedEncounter && activeSection === "initiative" ? initialInitiativeTracker
          ? <InitiativeTracker data={initialInitiativeTracker} />
          : <p className="tabletop-empty">Initiative data is unavailable for this Encounter.</p> : null}
        {!creating && selectedEncounter && activeSection === "combat-aid" ? initialCombatAid
          ? <CombatAidWorkspace data={initialCombatAid} onOpenInitiative={() => setActiveSection("initiative")} />
          : <p className="tabletop-empty">Combat Aid state is unavailable for this Encounter.</p> : null}
      </section>
    </div>
  </section>;
}
