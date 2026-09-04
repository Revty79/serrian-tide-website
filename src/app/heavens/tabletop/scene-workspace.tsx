"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  getNextSceneSequence,
  type SceneMetadataInput,
} from "@/features/tabletop-operations/scene-foundation";
import type { InitiativeTrackerReadModel } from "@/features/tabletop-operations/initiative-tracker";
import type { CombatAidEncounterView } from "@/features/tabletop-operations/combat-aid-service";
import type { EncounterCloseoutView } from "@/features/tabletop-operations/encounter-closeout-service";
import type { RollWorkspaceView } from "@/features/tabletop-operations/roll-runtime-service";
import type { ActionDeclarationWorkspaceView } from "@/features/tabletop-operations/action-declaration-service";

import { startCampaignSession, type CampaignSessionSummary } from "./actions";
import type { EncounterWorkspaceData } from "./encounter-actions";
import { EncounterWorkspace } from "./encounter-workspace";
import {
  addCampaignSessionSceneMember,
  completeCampaignSessionScene,
  createCampaignSessionScene,
  deleteCampaignSessionScene,
  moveCampaignSessionSceneMember,
  removeCampaignSessionSceneMember,
  reopenCampaignSessionScene,
  startCampaignSessionScene,
  updateCampaignSessionScene,
  type CampaignSceneDetail,
  type SceneMemberView,
  type SceneWorkspaceData,
} from "./scene-actions";

type Feedback = { kind: "success" | "error"; message: string };

function metadataFromScene(scene: CampaignSceneDetail): SceneMetadataInput {
  return {
    sequenceNumber: scene.sequenceNumber,
    title: scene.title,
    locationLabel: scene.locationLabel,
    description: scene.description,
    godNotes: scene.godNotes,
  };
}

function emptySceneMetadata(data: SceneWorkspaceData): SceneMetadataInput {
  return {
    sequenceNumber: getNextSceneSequence(data.scenes),
    title: "",
    locationLabel: "",
    description: "",
    godNotes: "",
  };
}

function displayTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function SceneMemberCard({
  sceneId,
  entry,
  editable,
  first,
  last,
  onFeedback,
}: {
  sceneId: number;
  entry: SceneMemberView;
  editable: boolean;
  first: boolean;
  last: boolean;
  onFeedback: (feedback: Feedback) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function perform(work: () => Promise<void>, success: string): Promise<void> {
    setBusy(true);
    try {
      await work();
      onFeedback({ kind: "success", message: success });
      router.refresh();
    } catch (error) {
      onFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Scene member action failed." });
    } finally {
      setBusy(false);
    }
  }

  const identity = entry.playerName
    ? `Player: ${entry.playerName}`
    : entry.creatureTemplateName
      ? `Creature: ${entry.creatureTemplateName}`
      : entry.kindLabel;

  return <article className="tabletop-scene-member">
    <div>
      <span>{entry.kindLabel}</span>
      <strong>{entry.name}</strong>
      <small>{identity}</small>
    </div>
    {editable ? <div className="tabletop-scene-member-actions">
      <button
        type="button"
        disabled={busy || first}
        aria-label={`Move ${entry.name} up`}
        onClick={() => void perform(
          () => moveCampaignSessionSceneMember(sceneId, entry.characterId, "up"),
          `${entry.name} was moved up.`,
        )}
      >↑</button>
      <button
        type="button"
        disabled={busy || last}
        aria-label={`Move ${entry.name} down`}
        onClick={() => void perform(
          () => moveCampaignSessionSceneMember(sceneId, entry.characterId, "down"),
          `${entry.name} was moved down.`,
        )}
      >↓</button>
      <button
        type="button"
        className="is-danger"
        disabled={busy}
        onClick={() => void perform(
          () => removeCampaignSessionSceneMember(sceneId, entry.characterId),
          `${entry.name} was removed from this Scene.`,
        )}
      >Remove</button>
    </div> : null}
  </article>;
}

export function SceneWorkspace({
  initialData,
  initialEncounterData,
  initialInitiativeTracker,
  initialCombatAid,
  initialActionDeclarations,
  initialCloseout,
  initialRollWorkspace,
  session,
  campaignName,
}: {
  initialData: SceneWorkspaceData;
  initialEncounterData: EncounterWorkspaceData | null;
  initialInitiativeTracker: InitiativeTrackerReadModel | null;
  initialCombatAid: CombatAidEncounterView | null;
  initialActionDeclarations: ActionDeclarationWorkspaceView | null;
  initialCloseout: EncounterCloseoutView | null;
  initialRollWorkspace: RollWorkspaceView | null;
  session: CampaignSessionSummary;
  campaignName: string;
}) {
  const router = useRouter();
  const selectedScene = initialData.selectedScene;
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<SceneMetadataInput>(() => selectedScene
    ? metadataFromScene(selectedScene)
    : emptySceneMetadata(initialData));
  const [memberSearch, setMemberSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function sceneHref(sceneId?: number): string {
    const base = `/heavens/tabletop?campaign=${initialData.campaignId}&session=${initialData.sessionId}`;
    return sceneId ? `${base}&scene=${sceneId}` : base;
  }

  async function perform(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Scene action failed." });
    } finally {
      setBusy(false);
    }
  }

  function beginCreate(): void {
    setDraft(emptySceneMetadata(initialData));
    setCreating(true);
    setFeedback(null);
  }

  function openScene(sceneId: number): void {
    setCreating(false);
    if (selectedScene?.id === sceneId) setDraft(metadataFromScene(selectedScene));
    setFeedback(null);
    router.push(sceneHref(sceneId));
  }

  async function saveScene(): Promise<void> {
    await perform(async () => {
      if (creating) {
        const created = await createCampaignSessionScene({ sessionId: initialData.sessionId, ...draft });
        setCreating(false);
        setFeedback({ kind: "success", message: `Scene ${created.sequenceNumber} was created.` });
        router.push(sceneHref(created.id));
        return;
      }
      if (!selectedScene) return;
      const updated = await updateCampaignSessionScene({ id: selectedScene.id, ...draft });
      setDraft({
        sequenceNumber: updated.sequenceNumber,
        title: updated.title,
        locationLabel: updated.locationLabel,
        description: updated.description,
        godNotes: updated.godNotes,
      });
      setFeedback({ kind: "success", message: `Scene ${updated.sequenceNumber} was saved.` });
      router.refresh();
    });
  }

  async function lifecycle(action: "start" | "complete" | "reopen"): Promise<void> {
    if (!selectedScene) return;
    await perform(async () => {
      const updated = action === "start"
        ? await startCampaignSessionScene(selectedScene.id)
        : action === "complete"
          ? await completeCampaignSessionScene(selectedScene.id)
          : await reopenCampaignSessionScene(selectedScene.id);
      setFeedback({ kind: "success", message: `Scene ${updated.sequenceNumber} is now ${updated.status}.` });
      router.refresh();
    });
  }

  async function startParentSession(): Promise<void> {
    await perform(async () => {
      await startCampaignSession(initialData.sessionId);
      setFeedback({ kind: "success", message: "The Session is active. Planned Scenes may now be started." });
      router.refresh();
    });
  }

  async function removeScene(): Promise<void> {
    if (!selectedScene || !window.confirm(`Delete planned Scene ${selectedScene.sequenceNumber}? Its Scene-member references will also be removed.`)) return;
    await perform(async () => {
      await deleteCampaignSessionScene(selectedScene.id);
      setFeedback({ kind: "success", message: `Scene ${selectedScene.sequenceNumber} was deleted.` });
      router.push(sceneHref());
    });
  }

  async function addMember(characterId: number, name: string): Promise<void> {
    if (!selectedScene) return;
    await perform(async () => {
      await addCampaignSessionSceneMember(selectedScene.id, characterId);
      setFeedback({ kind: "success", message: `${name} was added to this Scene.` });
      router.refresh();
    });
  }

  const availableMembers = selectedScene?.availableRosterMembers.filter((entry) => {
    const search = memberSearch.trim().toLocaleLowerCase();
    return !search || [entry.name, entry.kindLabel, entry.playerName, entry.creatureTemplateName]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(search));
  }) ?? [];
  const editorVisible = creating || selectedScene !== null;
  const editorEditable = creating || selectedScene?.editable === true;

  return <div className="tabletop-scenes-workspace">
    {feedback ? <p className={`tabletop-scene-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    <section className="tabletop-scene-context">
      <div><span>Campaign</span><strong>{campaignName}</strong></div>
      <div><span>Session</span><strong>#{session.sequenceNumber} · {session.title}</strong></div>
      <div><span>Session Status</span><strong>{initialData.sessionStatus}</strong></div>
    </section>

    <div className="tabletop-scenes-layout" data-workspace-flow="vertical">
      <section className="tabletop-scene-library" aria-label="Scene selector">
        <header>
          <div><span>SCENE LIBRARY</span><h3 className="font-sans">Session Scenes</h3></div>
          {initialData.canCreate ? <button type="button" disabled={busy} onClick={beginCreate}>New Scene</button> : null}
        </header>
        <div>
          {initialData.scenes.map((scene) => <button
            type="button"
            key={scene.id}
            className={!creating && scene.id === initialData.selectedSceneId ? "is-selected" : ""}
            onClick={() => openScene(scene.id)}
          >
            <span><b>Scene {scene.sequenceNumber}</b><em className={`is-${scene.status}`}>{scene.status}</em></span>
            <strong>{scene.title}</strong>
            <small>{scene.locationLabel || "No location"} · {scene.memberCount} {scene.memberCount === 1 ? "member" : "members"}</small>
          </button>)}
          {!initialData.scenes.length ? <p className="tabletop-empty">No Scenes yet. Create the first organizational span for this Session.</p> : null}
        </div>
      </section>

      <section className="tabletop-scene-editor">
        <header>
          <div><span>{creating ? "NEW SCENE" : "SCENE RECORD"}</span><h3 className="font-sans">{creating ? "Plan a Scene" : selectedScene?.title ?? "Select a Scene"}</h3></div>
          {!creating && selectedScene ? <em className={`tabletop-status is-${selectedScene.status}`}>{selectedScene.status}</em> : null}
        </header>

        {editorVisible ? <>
          {!creating && !selectedScene?.editable ? <p className="tabletop-readonly-notice">This Scene or its parent Session is historical and read-only. Reopen the parent Session and then the Scene to make corrections.</p> : null}
          <div className="tabletop-scene-form">
            <label><span>Scene Number</span><input disabled={!editorEditable || busy} type="number" min={1} step={1} value={draft.sequenceNumber} onChange={(event) => setDraft({ ...draft, sequenceNumber: Number(event.target.value) })} /></label>
            <label><span>Location / Setting</span><input disabled={!editorEditable || busy} value={draft.locationLabel} placeholder="Abandoned Highway Bridge" onChange={(event) => setDraft({ ...draft, locationLabel: event.target.value })} /></label>
            <label className="is-wide"><span>Title</span><input disabled={!editorEditable || busy} value={draft.title} placeholder="The Bridge" onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label className="is-wide"><span>Description</span><textarea disabled={!editorEditable || busy} rows={6} value={draft.description} placeholder="What is happening in this Scene?" onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <label className="is-wide"><span>Private G.O.D. Notes</span><textarea disabled={!editorEditable || busy} rows={6} value={draft.godNotes} placeholder="What do I need to remember while running this Scene?" onChange={(event) => setDraft({ ...draft, godNotes: event.target.value })} /></label>
          </div>

          {!creating && selectedScene ? <div className="tabletop-timestamps">
            <div><span>Created</span><strong>{displayTimestamp(selectedScene.createdAt)}</strong></div>
            <div><span>Started</span><strong>{displayTimestamp(selectedScene.startedAt)}</strong></div>
            <div><span>Completed</span><strong>{displayTimestamp(selectedScene.completedAt)}</strong></div>
          </div> : null}

          <div className="tabletop-actions">
            {editorEditable ? <button type="button" className="is-primary" disabled={busy} onClick={() => void saveScene()}>{busy ? "Working…" : creating ? "Create Planned Scene" : "Save Scene"}</button> : null}
            {creating ? <button type="button" disabled={busy} onClick={() => {
              setCreating(false);
              if (selectedScene) setDraft(metadataFromScene(selectedScene));
              setFeedback(null);
            }}>Cancel</button> : null}
            {!creating && selectedScene?.status === "planned" && initialData.sessionStatus === "active" ? <button type="button" disabled={busy} onClick={() => void lifecycle("start")}>Start Scene</button> : null}
            {!creating && selectedScene?.status === "planned" && initialData.sessionStatus === "planned" ? <button type="button" disabled={busy} onClick={() => void startParentSession()}>Start Session</button> : null}
            {!creating && selectedScene?.status === "active" ? <button type="button" disabled={busy} onClick={() => void lifecycle("complete")}>Complete Scene</button> : null}
            {!creating && selectedScene?.status === "completed" && initialData.sessionStatus === "active" ? <button type="button" disabled={busy} onClick={() => void lifecycle("reopen")}>Reopen Scene</button> : null}
            {!creating && selectedScene?.status === "planned" && initialData.sessionStatus !== "completed" ? <button type="button" className="is-danger" disabled={busy} onClick={() => void removeScene()}>Delete Planned Scene</button> : null}
          </div>

          {!creating && selectedScene ? <section className="tabletop-scene-members">
            <header><div><span>SCENE MEMBERS</span><h4 className="font-sans">Present in this Scene</h4></div><strong>{selectedScene.members.length} {selectedScene.members.length === 1 ? "member" : "members"}</strong></header>
            <div className="tabletop-scene-member-list">
              {selectedScene.members.map((entry, index) => <SceneMemberCard
                key={entry.characterId}
                sceneId={selectedScene.id}
                entry={entry}
                editable={selectedScene.editable}
                first={index === 0}
                last={index === selectedScene.members.length - 1}
                onFeedback={setFeedback}
              />)}
              {!selectedScene.members.length ? <p className="tabletop-empty">No one has been associated with this Scene. Members are selected from the Session Roster.</p> : null}
            </div>

            {selectedScene.editable ? <div className="tabletop-scene-available">
              <header><div><span>SESSION ROSTER</span><h4 className="font-sans">Add to Scene</h4></div><input type="search" value={memberSearch} placeholder="Find a roster member" onChange={(event) => setMemberSearch(event.target.value)} /></header>
              <div>
                {availableMembers.map((entry) => <article key={entry.characterId}>
                  <div><strong>{entry.name}</strong><small>{entry.playerName ? `Player: ${entry.playerName}` : entry.creatureTemplateName ? `Creature: ${entry.creatureTemplateName}` : entry.kindLabel}</small></div>
                  <button type="button" disabled={busy} onClick={() => void addMember(entry.characterId, entry.name)}>Add to Scene</button>
                </article>)}
                {!availableMembers.length ? <p className="tabletop-empty">{selectedScene.availableRosterMembers.length ? "No roster members match that search." : "Every Session Roster member is already in this Scene."}</p> : null}
              </div>
            </div> : null}
          </section> : null}

          {!creating && selectedScene && initialEncounterData ? <EncounterWorkspace
            key={initialEncounterData.selectedEncounterId ?? "no-encounter"}
            initialData={initialEncounterData}
            initialInitiativeTracker={initialInitiativeTracker}
            initialCombatAid={initialCombatAid}
            initialActionDeclarations={initialActionDeclarations}
            initialCloseout={initialCloseout}
            initialRollWorkspace={initialRollWorkspace}
            scene={selectedScene}
          /> : null}
        </> : <p className="tabletop-empty">Select a Scene or create a new one.</p>}
      </section>
    </div>
  </div>;
}
