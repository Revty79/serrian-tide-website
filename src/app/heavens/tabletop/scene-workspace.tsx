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
import type { DefenseInterventionWorkspaceView } from "@/features/tabletop-operations/defense-intervention-service";
import type { ActionEffectWorkspaceView } from "@/features/tabletop-operations/action-effect-plan-service";
import type { FirearmWorkspaceView } from "@/features/tabletop-operations/firearm-readiness-service";
import type { FirearmAttackWorkspaceView } from "@/features/tabletop-operations/firearm-attack-service";
import type { PlayerCombatRulingRequestView } from "@/features/tabletop-operations/player-combat-ruling-service";
import type { TabletopLifecyclePreview } from "@/features/lifecycle/tabletop-lifecycle-types";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import { startCampaignSession, type CampaignSessionSummary } from "./actions";
import type { EncounterWorkspaceData } from "./encounter-actions";
import { EncounterWorkspace } from "./encounter-workspace";
import { LifecycleConfirmationDialog } from "./lifecycle-confirmation-dialog";
import { previewTabletopLifecycleEntity } from "./lifecycle-actions";
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
type TransitionMode = "start" | "complete" | "reopen" | "start-parent";

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
  initialDefenseInterventions,
  initialActionEffects,
  initialFirearmReadiness,
  initialFirearmAttacks,
  initialPlayerCombatRulings,
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
  initialDefenseInterventions: DefenseInterventionWorkspaceView | null;
  initialActionEffects: ActionEffectWorkspaceView | null;
  initialFirearmReadiness: FirearmWorkspaceView | null;
  initialFirearmAttacks: FirearmAttackWorkspaceView | null;
  initialPlayerCombatRulings: readonly PlayerCombatRulingRequestView[];
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
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deletePreview, setDeletePreview] = useState<TabletopLifecyclePreview | null>(null);
  const [transitionMode, setTransitionMode] = useState<TransitionMode | null>(null);
  const [transitionPreview, setTransitionPreview] = useState<TabletopLifecyclePreview | null>(null);
  const preserveScroll = useInPlaceScrollPreservation();

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
    router.push(sceneHref(sceneId), { scroll: false });
  }

  async function saveScene(): Promise<void> {
    await perform(async () => {
      if (creating) {
        const created = await createCampaignSessionScene({ sessionId: initialData.sessionId, ...draft });
        setCreating(false);
        setFeedback({ kind: "success", message: `Scene ${created.sequenceNumber} was created.` });
        router.push(sceneHref(created.id), { scroll: false });
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
    if (!initialData.canOperate) return;
    if (!selectedScene) return;
    await perform(async () => {
      const updated = action === "start"
        ? await startCampaignSessionScene(selectedScene.id)
        : action === "complete"
          ? await completeCampaignSessionScene(selectedScene.id)
          : await reopenCampaignSessionScene(selectedScene.id);
      setFeedback({ kind: "success", message: `Scene ${updated.sequenceNumber} is now ${updated.status}.` });
      setTransitionMode(null);
      setTransitionPreview(null);
      router.refresh();
    });
  }

  async function startParentSession(): Promise<void> {
    if (!initialData.canOperate) return;
    await perform(async () => {
      await startCampaignSession(initialData.sessionId);
      setFeedback({ kind: "success", message: "The Session is active. Planned Scenes may now be started." });
      setTransitionMode(null);
      setTransitionPreview(null);
      router.refresh();
    });
  }

  async function openTransitionConfirmation(action: TransitionMode): Promise<void> {
    if (!initialData.canOperate || !selectedScene) return;
    await preserveScroll(() => perform(async () => {
      const preview = await previewTabletopLifecycleEntity(action === "start-parent"
        ? { entityKind: "campaign-session", entityId: initialData.sessionId }
        : { entityKind: "scene", entityId: selectedScene.id });
      setTransitionPreview(preview);
      setTransitionMode(action);
    }));
  }

  async function confirmTransition(): Promise<void> {
    if (!transitionMode) return;
    if (transitionMode === "start-parent") {
      await startParentSession();
      return;
    }
    await lifecycle(transitionMode);
  }

  async function removeScene(): Promise<void> {
    if (!selectedScene) return;
    await perform(async () => {
      await deleteCampaignSessionScene(selectedScene.id);
      setDeleteConfirmationOpen(false);
      setDeletePreview(null);
      setFeedback({ kind: "success", message: `Scene ${selectedScene.sequenceNumber} was deleted.` });
      router.push(sceneHref(), { scroll: false });
    });
  }

  async function openDeleteConfirmation(): Promise<void> {
    if (!selectedScene) return;
    await preserveScroll(() => perform(async () => {
      const preview = await previewTabletopLifecycleEntity({
        entityKind: "scene",
        entityId: selectedScene.id,
      });
      setDeletePreview(preview);
      setDeleteConfirmationOpen(true);
    }));
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
          {!creating && !selectedScene?.editable ? <p className="tabletop-readonly-notice">{initialData.canOperate
            ? "This Scene or its parent Session is historical and read-only. Reopen the parent Session and then the Scene to make corrections."
            : "Administrative read-only live view. Starting, completing, reopening, and operating this Scene remain with the Campaign-owning G.O.D."}</p> : null}
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
            {initialData.canOperate && !creating && selectedScene?.status === "planned" && initialData.sessionStatus === "active" ? <button type="button" disabled={busy} onClick={() => void openTransitionConfirmation("start")}>Start Scene</button> : null}
            {initialData.canOperate && !creating && selectedScene?.status === "planned" && initialData.sessionStatus === "planned" ? <button type="button" disabled={busy} onClick={() => void openTransitionConfirmation("start-parent")}>Start Session</button> : null}
            {initialData.canOperate && !creating && selectedScene?.status === "active" ? <button type="button" disabled={busy} onClick={() => void openTransitionConfirmation("complete")}>Complete Scene</button> : null}
            {initialData.canOperate && !creating && selectedScene?.status === "completed" && initialData.sessionStatus === "active" ? <button type="button" disabled={busy} onClick={() => void openTransitionConfirmation("reopen")}>Reopen Scene</button> : null}
            {!creating && selectedScene?.status === "planned" && initialData.sessionStatus !== "completed" ? <button type="button" className="is-danger" disabled={busy} onClick={() => void openDeleteConfirmation()}>Delete Planned Scene</button> : null}
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
            initialDefenseInterventions={initialDefenseInterventions}
            initialActionEffects={initialActionEffects}
            initialFirearmReadiness={initialFirearmReadiness}
            initialFirearmAttacks={initialFirearmAttacks}
            initialPlayerCombatRulings={initialPlayerCombatRulings}
            initialCloseout={initialCloseout}
            initialRollWorkspace={initialRollWorkspace}
            scene={selectedScene}
          /> : null}
        </> : <p className="tabletop-empty">Select a Scene or create a new one.</p>}
      </section>
    </div>
    {selectedScene ? <LifecycleConfirmationDialog
      open={initialData.canOperate && transitionMode !== null}
      titleId="transition-tabletop-scene-title"
      eyebrow={transitionMode === "start-parent" ? "Session Lifecycle" : "Scene Lifecycle"}
      title={transitionMode === "start-parent"
        ? `Start Session ${session.sequenceNumber}?`
        : transitionMode === "start"
          ? `Start Scene ${selectedScene.sequenceNumber}?`
          : transitionMode === "complete"
            ? `Complete Scene ${selectedScene.sequenceNumber}?`
            : `Reopen Scene ${selectedScene.sequenceNumber}?`}
      entityType={transitionMode === "start-parent" ? "Campaign Session" : "Scene"}
      preview={transitionPreview}
      consequence={transitionMode === "start-parent"
        ? "This activates the planned Session so its Scenes can begin. Existing Campaign and Character state is preserved."
        : transitionMode === "start"
          ? "This activates the planned Scene inside its active Session. Existing members and Campaign state are preserved."
          : transitionMode === "complete"
            ? "This makes the Scene organizationally historical. Its members, Encounters, and deeper history remain preserved."
            : "This returns the completed Scene to active for corrections without erasing its deeper history."}
      dependencies={(transitionPreview?.dependencies ?? [])
        .filter(({ count }) => count > 0)
        .map(({ label, count }) => `${label}: ${count}`)}
      notice={transitionPreview && (
        (transitionMode === "complete" && !transitionPreview.canComplete)
        || (transitionMode === "reopen" && !transitionPreview.canReopen)
      )
        ? "The current server state does not allow this transition. Reopen the parent lifecycle first or resolve the active context."
        : "Cancel makes no changes. The server locks and rechecks the entity and its Campaign before applying this transition."}
      confirmLabel={transitionMode === "start-parent"
        ? "Start Session"
        : transitionMode === "start"
          ? "Start Scene"
          : transitionMode === "complete"
            ? "Complete Scene"
            : "Reopen Scene"}
      confirmDisabled={!transitionPreview || (transitionMode === "complete"
        ? !transitionPreview.canComplete
        : transitionMode === "reopen"
          ? !transitionPreview.canReopen
          : transitionPreview.status !== "planned")}
      busy={busy}
      error={feedback?.kind === "error" ? feedback.message : undefined}
      onCancel={() => { setTransitionMode(null); setTransitionPreview(null); setFeedback(null); }}
      onConfirm={confirmTransition}
    /> : null}
    {selectedScene ? <LifecycleConfirmationDialog
      open={deleteConfirmationOpen}
      titleId="delete-tabletop-scene-title"
      eyebrow="Permanent Scene Deletion"
      title={`Delete planned Scene ${selectedScene.sequenceNumber}?`}
      entityType="Scene"
      preview={deletePreview}
      consequence="The planned Scene and its preparation-only member and Encounter records will be permanently removed. Roll or runtime history blocks this operation."
      dependencies={(deletePreview?.dependencies ?? [])
        .filter(({ count }) => count > 0)
        .map(({ label, count, blocking }) => `${label}: ${count}${blocking ? " (blocks deletion)" : ""}`)}
      notice={deletePreview?.blockers.length
        ? deletePreview.blockers.join(" ")
        : "Cancel makes no changes. The server locks and rechecks the complete dependency graph before deletion."}
      confirmLabel="Permanently Delete Scene"
      confirmDisabled={!deletePreview?.canDelete}
      busy={busy}
      error={feedback?.kind === "error" ? feedback.message : undefined}
      onCancel={() => { setDeleteConfirmationOpen(false); setDeletePreview(null); setFeedback(null); }}
      onConfirm={removeScene}
    /> : null}
  </div>;
}
