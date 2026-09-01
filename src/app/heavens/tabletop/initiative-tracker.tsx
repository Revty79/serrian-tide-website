"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getMaximumMovementDistance } from "@/features/tabletop-operations/initiative-runtime";
import type {
  InitiativeTrackerParticipant,
  InitiativeTrackerReadModel,
} from "@/features/tabletop-operations/initiative-tracker";

import {
  abandonEncounterPendingAction,
  addEncounterDeferredInitiativeCost,
  adjustEncounterPendingActionRemainingCost,
  advanceEncounterInitiativeRound,
  advanceEncounterInitiativeTimeline,
  applyEncounterInitiativeDelta,
  beginGenericInitiativeAction,
  closeEncounterInitiative,
  completeEncounterPendingActionManually,
  correctEncounterInitiativeRuntime,
  endEncounterPendingAction,
  enrollLateEncounterInitiativeParticipant,
  holdEncounterInitiative,
  initializeEncounterInitiative,
  interruptEncounterPendingAction,
  overrideCurrentEncounterInitiative,
  overrideNormalEncounterInitiative,
  passEncounterInitiative,
  refreshEncounterInitiativeCapacity,
  restartEncounterPendingAction,
  resumeEncounterPendingAction,
  resumeEncounterPendingActionWithAdjustedCost,
  resumeSuspendedEncounterInitiative,
  setEncounterInitiativeParticipationStatus,
  settleEncounterDeferredInitiativeCost,
  type InitiativeRuntimeView,
} from "./initiative-actions";

type Feedback = { kind: "success" | "error"; message: string };
type ActionDraft = {
  characterId: number;
  heldIntervention: boolean;
  label: string;
  initiativeCost: string;
  allowsMultiRound: boolean;
};

function identityDetail(participant: {
  kindLabel: string;
  playerName: string | null;
  creatureTemplateName: string | null;
}): string {
  if (participant.playerName) return `Player: ${participant.playerName}`;
  if (participant.creatureTemplateName) return `Creature: ${participant.creatureTemplateName}`;
  return participant.kindLabel;
}

function displayTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function currentMovement(participant: InitiativeTrackerParticipant) {
  return participant.movementModes.find(({ movementMode }) => movementMode === participant.movementMode) ?? null;
}

function latestAction(view: InitiativeRuntimeView, characterId: number) {
  return [...view.pendingActions].reverse().find(({ actorCharacterId }) => actorCharacterId === characterId) ?? null;
}

export function InitiativeTracker({ data }: { data: InitiativeTrackerReadModel }) {
  const router = useRouter();
  const encounterId = data.encounter.id;
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const [movementModes, setMovementModes] = useState<Record<number, string>>(() => Object.fromEntries(
    data.availableToJoin.map((participant) => [participant.characterId, participant.movementModes[0]?.movementMode ?? ""]),
  ));
  const [adjustedCosts, setAdjustedCosts] = useState<Record<number, string>>({});
  const [correctionCharacterId, setCorrectionCharacterId] = useState<number | null>(
    data.participants[0]?.characterId ?? null,
  );
  const [currentOverride, setCurrentOverride] = useState("");
  const [initiativeDelta, setInitiativeDelta] = useState("");
  const [normalOverride, setNormalOverride] = useState("");
  const [capacityMode, setCapacityMode] = useState<"ordinary" | "penalty-recovery">("ordinary");
  const [deferredAmount, setDeferredAmount] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  const [runtimeRound, setRuntimeRound] = useState(String(data.runtime?.runtime.roundNumber ?? 1));
  const [runtimeStep, setRuntimeStep] = useState(String(data.runtime?.runtime.stepNumber ?? 1));
  const [runtimeTimeline, setRuntimeTimeline] = useState(String(data.runtime?.runtime.timelineInitiative ?? 0));

  const selectedParticipant = data.participants.find(({ characterId }) => characterId === correctionCharacterId) ?? null;
  const selectedMode = selectedParticipant
    ? movementModes[selectedParticipant.characterId] || selectedParticipant.movementMode
    : "";
  const actionParticipant = actionDraft
    ? data.participants.find(({ characterId }) => characterId === actionDraft.characterId) ?? null
    : null;
  const movementPreview = useMemo(() => {
    if (!actionDraft || !actionParticipant) return null;
    const cost = Number(actionDraft.initiativeCost);
    const movement = currentMovement(actionParticipant);
    if (!movement || !Number.isFinite(cost) || cost < 0) return null;
    return {
      movementMode: movement.movementMode,
      baseMovement: movement.baseMovement,
      distance: getMaximumMovementDistance(movement.baseMovement, cost),
    };
  }, [actionDraft, actionParticipant]);

  async function mutate(
    work: () => Promise<InitiativeRuntimeView>,
    success: string | ((view: InitiativeRuntimeView) => string),
  ): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      const view = await work();
      setFeedback({ kind: "success", message: typeof success === "function" ? success(view) : success });
      router.refresh();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "The Initiative operation failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function initialize(): Promise<void> {
    await mutate(
      () => initializeEncounterInitiative(encounterId, data.availableToJoin.map((participant) => ({
        characterId: participant.characterId,
        movementMode: movementModes[participant.characterId] ?? "",
      }))),
      "Initiative initialized from authoritative Dexterity and Movement values.",
    );
  }

  async function submitAction(): Promise<void> {
    if (!actionDraft || !actionParticipant) return;
    await mutate(
      () => beginGenericInitiativeAction(encounterId, {
        actorCharacterId: actionDraft.characterId,
        label: actionDraft.label,
        initiativeCost: Number(actionDraft.initiativeCost),
        allowsMultiRound: actionDraft.allowsMultiRound,
        heldIntervention: actionDraft.heldIntervention,
      }),
      (view) => {
        const action = latestAction(view, actionDraft.characterId);
        return action
          ? `${actionParticipant.name} began ${action.label}. Completion: ${action.expectedCompletionInitiative}.`
          : `${actionParticipant.name}'s action began.`;
      },
    );
    setActionDraft(null);
  }

  function openAction(participant: InitiativeTrackerParticipant, heldIntervention: boolean): void {
    setActionDraft({
      characterId: participant.characterId,
      heldIntervention,
      label: "",
      initiativeCost: "",
      allowsMultiRound: false,
    });
  }

  async function decidePending(
    question: string,
    work: () => Promise<InitiativeRuntimeView>,
    success: string,
  ): Promise<void> {
    if (!window.confirm(question)) return;
    await mutate(work, success);
  }

  if (!data.runtime) {
    return <section className="initiative-tracker is-setup" aria-label="Initiative Tracker">
      <header className="initiative-tracker-title">
        <div><span>INITIATIVE TRACKER</span><h6 className="font-sans">Not initialized</h6></div>
        <strong>{data.availableToJoin.length} Encounter {data.availableToJoin.length === 1 ? "Participant" : "Participants"}</strong>
      </header>
      <p className="initiative-tracker-intro">Starting Initiative is calculated by the server from each Character&apos;s authoritative Dexterity and selected Movement mode.</p>
      <div className="initiative-setup-list">
        {data.availableToJoin.map((participant) => <article key={participant.characterId}>
          <div><strong>{participant.name}</strong><small>{identityDetail(participant)}</small></div>
          {participant.capacityError ? <p className="initiative-inline-error">{participant.capacityError}</p> : participant.movementModes.length > 1 ? <label>
            <span>Starting Movement</span>
            <select value={movementModes[participant.characterId] ?? ""} onChange={(event) => setMovementModes({ ...movementModes, [participant.characterId]: event.target.value })}>
              {participant.movementModes.map((mode) => <option key={mode.movementMode} value={mode.movementMode}>{mode.movementMode} · Base {mode.baseMovement} · Initiative {mode.normalTotalInitiative}</option>)}
            </select>
          </label> : <span className="initiative-mode-readout">{participant.movementModes[0] ? `${participant.movementModes[0].movementMode} · Initiative ${participant.movementModes[0].normalTotalInitiative}` : "No capacity available"}</span>}
        </article>)}
      </div>
      {feedback ? <p className={`initiative-feedback is-${feedback.kind}`} role="status">{feedback.message}</p> : null}
      {data.initializationBlockReason ? <p className="initiative-guidance">{data.initializationBlockReason}</p> : null}
      <button type="button" className="initiative-primary" disabled={busy || !data.canInitialize} onClick={() => void initialize()}>{busy ? "Initializing…" : "Initialize Initiative"}</button>
    </section>;
  }

  const runtime = data.runtime.runtime;
  const closed = runtime.status === "closed";

  return <section className={`initiative-tracker ${closed ? "is-closed" : "is-live"}`} aria-label="Initiative Tracker">
    <header className="initiative-live-header">
      <div>
        <span>{data.encounter.title.toLocaleUpperCase()} — INITIATIVE</span>
        <h6 className="font-sans">{closed ? "Initiative Closed" : "Initiative Active"}</h6>
      </div>
      <dl>
        <div><dt>Round</dt><dd>{runtime.roundNumber}</dd></div>
        <div><dt>Combat Step</dt><dd>{runtime.stepNumber}</dd></div>
        <div><dt>Shared Timeline</dt><dd>{runtime.timelineInitiative}</dd></div>
        <div><dt>Participants</dt><dd>{data.participants.length}</dd></div>
      </dl>
    </header>

    {feedback ? <p className={`initiative-feedback is-${feedback.kind}`} role="status">{feedback.message}</p> : null}

    {closed ? <section className="initiative-closed-summary">
      <p>This Initiative Runtime is historical and read-only. It did not complete the Encounter or reset Character state.</p>
      <dl>
        <div><dt>Started</dt><dd>{displayTimestamp(runtime.startedAt)}</dd></div>
        <div><dt>Closed</dt><dd>{displayTimestamp(runtime.closedAt)}</dd></div>
      </dl>
    </section> : data.nextEvent ? <section className={`initiative-next-event is-${data.nextEvent.kind}`}>
      <div><span>{data.nextEvent.eyebrow}</span><h6 className="font-sans">{data.nextEvent.summary}</h6><p>{data.nextEvent.detail}</p></div>
      <button
        type="button"
        className="initiative-primary"
        disabled={busy || !data.nextEvent.canAdvance}
        onClick={() => void mutate(
          () => advanceEncounterInitiativeTimeline(encounterId),
          `Advanced to the next authoritative Initiative event at ${data.nextEvent?.initiative}.`,
        )}
      >Advance to Next Event</button>
    </section> : null}

    <section className="initiative-participant-section">
      <header><div><span>LIVE PARTICIPANTS</span><h6 className="font-sans">Dynamic Initiative State</h6></div><small>Current Initiative may exceed Normal or remain negative.</small></header>
      <div className="initiative-participant-grid">
        {data.participants.map((participant) => {
          const pending = participant.activeActionId === null
            ? null
            : data.pendingActions.find(({ id }) => id === participant.activeActionId) ?? null;
          return <article className={`initiative-participant is-${participant.participationStatus} ${participant.isCurrentOpportunity ? "is-opportunity" : ""}`} key={participant.characterId}>
            <header>
              <div><span>{participant.kindLabel}</span><strong>{participant.name}</strong><small>{identityDetail(participant)}</small></div>
              <em className={`initiative-status is-${participant.participationStatus}`}>{participant.participationStatus}</em>
            </header>
            <dl className="initiative-values">
              <div><dt>Current</dt><dd>{participant.currentInitiative}</dd></div>
              <div><dt>Normal</dt><dd>{participant.normalTotalInitiative}</dd></div>
              <div><dt>Movement</dt><dd>{participant.movementMode || "—"}</dd></div>
              <div><dt>Deferred</dt><dd>{participant.deferredInitiativeCost}</dd></div>
            </dl>
            {participant.isAboveTimeline ? <p className="initiative-retained-note">Current {participant.currentInitiative} is retained above shared timeline {runtime.timelineInitiative}.</p> : null}
            {participant.participationStatus === "passed" ? <p className="initiative-state-note">Passed this Round · {participant.currentInitiative} Initiative banked.</p> : null}
            {participant.participationStatus === "suspended" ? <p className="initiative-state-note">Suspended · Current Initiative preserved at {participant.currentInitiative}.</p> : null}
            {participant.canIntervene ? <p className="initiative-state-note">Eligible to intervene at retained Initiative {participant.currentInitiative}.</p> : null}
            {pending ? <div className="initiative-participant-pending"><span>PENDING</span><strong>{pending.label}</strong><small>{pending.initiativeSpent} spent · {pending.remainingInitiativeCost} remaining · completion {pending.expectedCompletionInitiative}</small></div> : null}
            {!closed ? <footer>
              {participant.canAct ? <button type="button" disabled={busy} onClick={() => openAction(participant, false)}>Action</button> : null}
              {participant.canHold ? <button type="button" disabled={busy} onClick={() => void mutate(
                () => holdEncounterInitiative(encounterId, participant.characterId),
                `${participant.name} is Holding at Initiative ${participant.currentInitiative}.`,
              )}>Hold</button> : null}
              {participant.canPass ? <button type="button" disabled={busy} onClick={() => void mutate(
                () => passEncounterInitiative(encounterId, participant.characterId),
                `${participant.name} Passed with ${participant.currentInitiative} Initiative banked.`,
              )}>Pass</button> : null}
              {participant.canIntervene ? <button type="button" className="initiative-intervene" disabled={busy} onClick={() => openAction(participant, true)}>Intervene</button> : null}
              {pending ? <span>Pending…</span> : null}
            </footer> : null}
          </article>;
        })}
      </div>
    </section>

    <section className="initiative-pending-section">
      <header><div><span>PENDING ACTIONS</span><h6 className="font-sans">Progress and Decision Points</h6></div><strong>{data.pendingActions.filter(({ status }) => status === "active" || status === "interrupted").length} unresolved</strong></header>
      <div className="initiative-pending-list">
        {data.pendingActions.map((action) => <details key={action.id} open={action.status === "active" || action.status === "interrupted"}>
          <summary>
            <div><span>{action.status.toLocaleUpperCase()}</span><strong>{action.label}</strong><small>{action.actorName} · completion {action.expectedCompletionInitiative}</small></div>
            <b>{action.remainingInitiativeCost} remaining</b>
          </summary>
          <dl>
            <div><dt>Action kind</dt><dd>{action.actionKind}</dd></div>
            <div><dt>Original cost</dt><dd>{action.originalInitiativeCost}</dd></div>
            <div><dt>Initiative spent</dt><dd>{action.initiativeSpent}</dd></div>
            <div><dt>Remaining cost</dt><dd>{action.remainingInitiativeCost}</dd></div>
            <div><dt>Start Initiative</dt><dd>{action.startInitiative}</dd></div>
            <div><dt>Start timeline</dt><dd>{action.startTimelineInitiative}</dd></div>
            <div><dt>Expected completion</dt><dd>{action.expectedCompletionInitiative}</dd></div>
            <div><dt>Started Round</dt><dd>{action.startedRound}</dd></div>
            <div><dt>Multi-Round</dt><dd>{action.allowsMultiRound ? "Yes" : "No"}</dd></div>
          </dl>
          {action.reactionNames.length ? <p className="initiative-reaction-hint"><strong>Reaction window:</strong> {action.reactionNames.join(", ")} may have timing to react. No reaction is chosen automatically.</p> : null}
          {!closed && action.status === "active" ? <div className="initiative-pending-controls">
            <button type="button" disabled={busy} onClick={() => void mutate(
              () => interruptEncounterPendingAction(encounterId, action.id),
              `${action.label} was interrupted with ${action.remainingInitiativeCost} Initiative remaining.`,
            )}>Interrupt</button>
          </div> : null}
          {!closed && action.status === "interrupted" ? <div className="initiative-interrupted-controls">
            <strong>G.O.D. decision required</strong>
            <div>
              <button type="button" disabled={busy} onClick={() => void decidePending(
                `Resume ${action.label} with ${action.remainingInitiativeCost} Initiative remaining?`,
                () => resumeEncounterPendingAction(encounterId, action.id),
                `${action.label} resumed from existing progress.`,
              )}>Resume Progress</button>
              <button type="button" disabled={busy} onClick={() => void decidePending(
                `Restart ${action.label} at its full ${action.originalInitiativeCost} Initiative cost?`,
                () => restartEncounterPendingAction(encounterId, action.id),
                `${action.label} restarted at full cost.`,
              )}>Restart Full Cost</button>
            </div>
            <label><span>Adjusted remaining cost</span><input type="number" value={adjustedCosts[action.id] ?? ""} onChange={(event) => setAdjustedCosts({ ...adjustedCosts, [action.id]: event.target.value })} /></label>
            <div>
              <button type="button" disabled={busy} onClick={() => void mutate(
                () => adjustEncounterPendingActionRemainingCost(encounterId, action.id, Number(adjustedCosts[action.id])),
                `${action.label}'s remaining cost was adjusted.`,
              )}>Adjust Only</button>
              <button type="button" disabled={busy} onClick={() => void decidePending(
                `Resume ${action.label} with an adjusted remaining cost of ${adjustedCosts[action.id]}?`,
                () => resumeEncounterPendingActionWithAdjustedCost(encounterId, action.id, Number(adjustedCosts[action.id])),
                `${action.label} resumed with adjusted cost.`,
              )}>Resume with Adjusted Cost</button>
            </div>
            <div>
              <button type="button" disabled={busy} onClick={() => void decidePending(`End ${action.label}?`, () => endEncounterPendingAction(encounterId, action.id), `${action.label} ended.`)}>End</button>
              <button type="button" disabled={busy} onClick={() => void decidePending(`Abandon ${action.label}?`, () => abandonEncounterPendingAction(encounterId, action.id), `${action.label} was abandoned.`)}>Abandon</button>
              <button type="button" disabled={busy} onClick={() => void decidePending(`Mark ${action.label} complete manually?`, () => completeEncounterPendingActionManually(encounterId, action.id), `${action.label} was completed manually.`)}>Complete Manually</button>
            </div>
          </div> : null}
        </details>)}
        {!data.pendingActions.length ? <p className="tabletop-empty">No Initiative actions have been recorded yet.</p> : null}
      </div>
    </section>

    {!closed && data.availableToJoin.length ? <section className="initiative-late-entry">
      <header><div><span>LATE ENTRY</span><h6 className="font-sans">Available to Join Initiative</h6></div><strong>{data.availableToJoin.length}</strong></header>
      <div>{data.availableToJoin.map((participant) => <article key={participant.characterId}>
        <div><strong>{participant.name}</strong><small>{identityDetail(participant)}</small></div>
        {participant.capacityError ? <p className="initiative-inline-error">{participant.capacityError}</p> : <select value={movementModes[participant.characterId] ?? participant.movementModes[0]?.movementMode ?? ""} onChange={(event) => setMovementModes({ ...movementModes, [participant.characterId]: event.target.value })}>
          {participant.movementModes.map((mode) => <option key={mode.movementMode} value={mode.movementMode}>{mode.movementMode} · Initiative {mode.normalTotalInitiative}</option>)}
        </select>}
        <button type="button" disabled={busy || Boolean(participant.capacityError)} onClick={() => void mutate(
          () => enrollLateEncounterInitiativeParticipant(encounterId, participant.characterId, movementModes[participant.characterId] || participant.movementModes[0]?.movementMode),
          (view) => {
            const enrolled = view.participants.find(({ characterId }) => characterId === participant.characterId);
            return enrolled
              ? `${participant.name} joined Initiative at full Current ${enrolled.currentInitiative} / Normal ${enrolled.normalTotalInitiative}; shared timeline remains ${view.runtime.timelineInitiative}.`
              : `${participant.name} joined Initiative.`;
          },
        )}>Enroll</button>
      </article>)}</div>
    </section> : null}

    {!closed ? <section className="initiative-round-controls">
      <div><span>ROUND CONTROL</span><h6 className="font-sans">Round {runtime.roundNumber}</h6><p>{data.canAdvanceRound ? "The engine permits normal Round advancement." : "The Round cannot advance mechanically while opportunities remain unresolved."}</p></div>
      <button type="button" className="initiative-primary" disabled={busy || !data.canAdvanceRound} onClick={() => void mutate(
        () => advanceEncounterInitiativeRound(encounterId),
        `Advanced to Round ${runtime.roundNumber + 1}; carryover and debt were applied by the engine.`,
      )}>Advance Round</button>
    </section> : null}

    {!closed ? <details className="initiative-advanced">
      <summary>Advanced / G.O.D. Corrections</summary>
      <p>These controls directly correct persisted Initiative state. They do not change Health, Mana, Conditions, Inventory, or Equipment.</p>
      <label><span>Participant</span><select value={correctionCharacterId ?? ""} onChange={(event) => setCorrectionCharacterId(Number(event.target.value))}>{data.participants.map((participant) => <option key={participant.characterId} value={participant.characterId}>{participant.name} · Current {participant.currentInitiative}</option>)}</select></label>
      {selectedParticipant ? <div className="initiative-correction-grid">
        <form onSubmit={(event) => { event.preventDefault(); void mutate(() => overrideCurrentEncounterInitiative(encounterId, selectedParticipant.characterId, Number(currentOverride)), `${selectedParticipant.name}'s Current Initiative was set to ${currentOverride}.`); }}>
          <strong>Set Current Initiative</strong><small>Signed and uncapped values are valid.</small><input type="number" step="any" value={currentOverride} onChange={(event) => setCurrentOverride(event.target.value)} placeholder={String(selectedParticipant.currentInitiative)} /><button disabled={busy}>Set Current</button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); void mutate(() => applyEncounterInitiativeDelta(encounterId, selectedParticipant.characterId, Number(initiativeDelta)), `${selectedParticipant.name}'s Current Initiative changed by ${initiativeDelta}.`); }}>
          <strong>Direct Initiative Change</strong><small>Changes Current Initiative only.</small><input type="number" step="any" value={initiativeDelta} onChange={(event) => setInitiativeDelta(event.target.value)} placeholder="+5 or -5" /><button disabled={busy}>Apply Delta</button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); void mutate(() => overrideNormalEncounterInitiative(encounterId, selectedParticipant.characterId, Number(normalOverride), capacityMode), `${selectedParticipant.name}'s Normal Initiative was corrected.`); }}>
          <strong>Override Normal Initiative</strong><input type="number" step="any" value={normalOverride} onChange={(event) => setNormalOverride(event.target.value)} placeholder={String(selectedParticipant.normalTotalInitiative)} /><select value={capacityMode} onChange={(event) => setCapacityMode(event.target.value as "ordinary" | "penalty-recovery")}><option value="ordinary">Apply change normally</option><option value="penalty-recovery">Penalty ending while actor is negative</option></select><button disabled={busy}>Override Normal</button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); void mutate(() => refreshEncounterInitiativeCapacity(encounterId, selectedParticipant.characterId, capacityMode, selectedMode || undefined), `${selectedParticipant.name}'s authoritative Initiative capacity was refreshed.`); }}>
          <strong>Refresh from Character</strong><small>Uses authoritative Dexterity and Movement.</small><select value={selectedMode} onChange={(event) => setMovementModes({ ...movementModes, [selectedParticipant.characterId]: event.target.value })}>{selectedParticipant.movementModes.map((mode) => <option key={mode.movementMode} value={mode.movementMode}>{mode.movementMode} · Base {mode.baseMovement} · Initiative {mode.normalTotalInitiative}</option>)}</select><select value={capacityMode} onChange={(event) => setCapacityMode(event.target.value as "ordinary" | "penalty-recovery")}><option value="ordinary">Apply change normally</option><option value="penalty-recovery">Penalty recovery while negative</option></select><button disabled={busy || Boolean(selectedParticipant.capacityError)}>Apply Mode / Refresh</button>{selectedParticipant.capacityError ? <small className="initiative-inline-error">{selectedParticipant.capacityError}</small> : null}
        </form>
        <div className="initiative-correction-card">
          <strong>Participation Status</strong><small>Suspending preserves Current Initiative.</small><select value={selectedParticipant.participationStatus} onChange={(event) => void mutate(
            () => event.target.value === "active" && selectedParticipant.participationStatus === "suspended"
              ? resumeSuspendedEncounterInitiative(encounterId, selectedParticipant.characterId)
              : setEncounterInitiativeParticipationStatus(encounterId, selectedParticipant.characterId, event.target.value as "active" | "holding" | "passed" | "suspended"),
            `${selectedParticipant.name}'s participation status was changed to ${event.target.value}.`,
          )}><option value="active">Active</option><option value="holding">Holding</option><option value="passed">Passed</option><option value="suspended">Suspended</option></select>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void mutate(() => addEncounterDeferredInitiativeCost(encounterId, selectedParticipant.characterId, Number(deferredAmount)), `Added ${deferredAmount} deferred Initiative Cost to ${selectedParticipant.name}.`); }}>
          <strong>Add Deferred Cost</strong><input type="number" step="any" value={deferredAmount} onChange={(event) => setDeferredAmount(event.target.value)} /><button disabled={busy}>Add Deferred</button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); void mutate(() => settleEncounterDeferredInitiativeCost(encounterId, selectedParticipant.characterId, settleAmount === "" ? undefined : Number(settleAmount)), `Settled deferred Initiative Cost for ${selectedParticipant.name}.`); }}>
          <strong>Settle Deferred Cost</strong><small>Leave blank to settle all {selectedParticipant.deferredInitiativeCost}.</small><input type="number" step="any" value={settleAmount} onChange={(event) => setSettleAmount(event.target.value)} /><button disabled={busy}>Settle</button>
        </form>
      </div> : null}
      <form className="initiative-runtime-correction" onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm("Correct Round, Combat Step, and shared timeline? This is an invasive G.O.D. correction.")) return;
        void mutate(() => correctEncounterInitiativeRuntime(encounterId, {
          roundNumber: Number(runtimeRound),
          stepNumber: Number(runtimeStep),
          timelineInitiative: Number(runtimeTimeline),
        }), "Initiative runtime position was corrected.");
      }}>
        <strong>Correct Runtime Position</strong><label><span>Round</span><input type="number" min="1" value={runtimeRound} onChange={(event) => setRuntimeRound(event.target.value)} /></label><label><span>Combat Step</span><input type="number" min="1" value={runtimeStep} onChange={(event) => setRuntimeStep(event.target.value)} /></label><label><span>Shared Timeline</span><input type="number" min="0" step="any" value={runtimeTimeline} onChange={(event) => setRuntimeTimeline(event.target.value)} /></label><button disabled={busy}>Apply Runtime Correction</button>
      </form>
      <div className="initiative-danger-controls">
        <button type="button" disabled={busy} onClick={() => void decidePending(
          "Force advance the Initiative Round? Carryover and debt will still be applied by the engine.",
          () => advanceEncounterInitiativeRound(encounterId, true),
          `Forced advancement to Round ${runtime.roundNumber + 1} completed.`,
        )}>Force Advance Round</button>
        <button type="button" disabled={busy} onClick={() => void decidePending(
          "Close Initiative? This preserves Initiative history and does not complete the Encounter or reset Character state.",
          () => closeEncounterInitiative(encounterId),
          "Initiative closed. Historical state remains available.",
        )}>Close Initiative</button>
      </div>
    </details> : null}

    {actionDraft && actionParticipant ? <div className="initiative-dialog-backdrop" role="presentation">
      <form className="initiative-action-dialog" role="dialog" aria-modal="true" aria-labelledby="initiative-action-title" onSubmit={(event) => { event.preventDefault(); void submitAction(); }}>
        <header><div><span>{actionDraft.heldIntervention ? "HELD INTERVENTION" : "GENERIC INITIATIVE ACTION"}</span><h6 id="initiative-action-title" className="font-sans">{actionParticipant.name}</h6></div><button type="button" aria-label="Close action dialog" onClick={() => setActionDraft(null)}>×</button></header>
        <p>Current {actionParticipant.currentInitiative} · Shared timeline {runtime.timelineInitiative}. The server validates whether this action is affordable.</p>
        <label><span>Action Label</span><input required value={actionDraft.label} onChange={(event) => setActionDraft({ ...actionDraft, label: event.target.value })} placeholder="Sword Attack, Move, Open Door…" /></label>
        <label><span>Initiative Cost</span><input required type="number" min="0.000001" step="any" value={actionDraft.initiativeCost} onChange={(event) => setActionDraft({ ...actionDraft, initiativeCost: event.target.value })} /></label>
        <label className="initiative-checkbox"><input type="checkbox" checked={actionDraft.allowsMultiRound} onChange={(event) => setActionDraft({ ...actionDraft, allowsMultiRound: event.target.checked })} /><span>Long / Multi-Round Action</span></label>
        {movementPreview ? <p className="initiative-movement-preview"><strong>Optional movement helper</strong>{movementPreview.movementMode} · Base {movementPreview.baseMovement} × {actionDraft.initiativeCost || 0} Initiative = up to {movementPreview.distance} ft.</p> : null}
        <footer><button type="button" disabled={busy} onClick={() => setActionDraft(null)}>Cancel</button><button type="submit" className="initiative-primary" disabled={busy}>{busy ? "Starting…" : actionDraft.heldIntervention ? "Begin Intervention" : "Begin Action"}</button></footer>
      </form>
    </div> : null}
  </section>;
}
