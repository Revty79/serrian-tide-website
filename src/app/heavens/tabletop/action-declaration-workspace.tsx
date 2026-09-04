"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ActionDeclarationDraft, ActionWindowKind } from "@/features/tabletop-operations/action-declaration";
import type { ActionDeclarationWorkspaceView } from "@/features/tabletop-operations/action-declaration-service";

import {
  abandonActionDeclaration,
  addExceptionalResponder,
  cancelActionDeclaration,
  commitActionDeclaration,
  completeActionDeclarationTiming,
  continueActionDeclarationAfterRuling,
  correctActionDeclarationRemainingCost,
  createActionDeclarationDraft,
  editActionDeclarationDraft,
  interruptActionDeclaration,
  lockActionDeclaration,
  markActionDeclarationAwaitingRuling,
  reconcileResponderOpportunity,
  resolveActionDeclaration,
  restartInterruptedActionDeclaration,
  resumeInterruptedActionDeclaration,
  reviseLockedActionDeclaration,
} from "./action-declaration-actions";

type Feedback = { kind: "success" | "error"; message: string };

type EditorState = {
  declarationId: number | null;
  actorCharacterId: number;
  targetCharacterId: number | null;
  label: string;
  actionKind: string;
  sourceKind: "generic" | "weapon";
  weaponKey: string;
  firingModeId: number | null;
  attackMode: string;
  initiativeCost: string;
  allowsMultiRound: boolean;
  heldIntervention: boolean;
  windowKind: ActionWindowKind;
  aimDeclared: boolean;
  calledShotDeclared: boolean;
  calledShotLabel: string;
  calledShotPenalty: string;
  explicitModifiers: string;
  preparesForDeclarationId: number | null;
  godNotes: string;
};

function initialEditor(view: ActionDeclarationWorkspaceView): EditorState {
  const actor = view.participants.find((participant) => (
    !participant.hasActiveAction && participant.participationStatus === "active"
  )) ?? view.participants[0];
  return {
    declarationId: null,
    actorCharacterId: actor?.characterId ?? 0,
    targetCharacterId: null,
    label: "",
    actionKind: "generic",
    sourceKind: "generic",
    weaponKey: "",
    firingModeId: null,
    attackMode: "",
    initiativeCost: "1",
    allowsMultiRound: false,
    heldIntervention: false,
    windowKind: "ordinary",
    aimDeclared: false,
    calledShotDeclared: false,
    calledShotLabel: "",
    calledShotPenalty: "",
    explicitModifiers: "",
    preparesForDeclarationId: null,
    godNotes: "",
  };
}

function modifiersFromText(value: string): Array<{ label: string; value: number }> {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.lastIndexOf(":");
    if (separator <= 0) throw new Error("Write each explicit modifier as Label: number.");
    const label = line.slice(0, separator).trim();
    const number = Number(line.slice(separator + 1).trim());
    if (!label || !Number.isFinite(number)) throw new Error("Write each explicit modifier as Label: number.");
    return { label, value: number };
  });
}

function draftFromEditor(editor: EditorState, view: ActionDeclarationWorkspaceView): ActionDeclarationDraft {
  const actor = view.participants.find(({ characterId }) => characterId === editor.actorCharacterId);
  const weapon = actor?.weapons.find(({ ownershipKey }) => ownershipKey === editor.weaponKey) ?? null;
  return {
    actorCharacterId: editor.actorCharacterId,
    targetCharacterIds: editor.targetCharacterId === null ? [] : [editor.targetCharacterId],
    label: editor.label,
    actionKind: editor.actionKind,
    sourceKind: editor.sourceKind,
    sourceRef: editor.sourceKind === "weapon" ? weapon?.ownershipKey ?? null : null,
    sourceInstanceId: editor.sourceKind === "weapon" ? weapon?.instanceId ?? null : null,
    weaponItemId: editor.sourceKind === "weapon" ? weapon?.itemId ?? null : null,
    firingModeId: editor.sourceKind === "weapon" ? editor.firingModeId : null,
    attackMode: editor.attackMode,
    initiativeCost: Number(editor.initiativeCost),
    allowsMultiRound: editor.allowsMultiRound,
    heldIntervention: editor.heldIntervention,
    windowKind: editor.windowKind,
    aimDeclared: editor.aimDeclared,
    calledShot: {
      declared: editor.calledShotDeclared,
      label: editor.calledShotLabel,
      assignedPenalty: editor.calledShotDeclared ? Number(editor.calledShotPenalty) : null,
    },
    explicitModifiers: modifiersFromText(editor.explicitModifiers),
    preparesForDeclarationId: editor.windowKind === "preparation" ? editor.preparesForDeclarationId : null,
    godNotes: editor.godNotes,
  };
}

function editorFromDraft(declarationId: number, draft: ActionDeclarationDraft): EditorState {
  return {
    declarationId,
    actorCharacterId: draft.actorCharacterId,
    targetCharacterId: draft.targetCharacterIds[0] ?? null,
    label: draft.label,
    actionKind: draft.actionKind,
    sourceKind: draft.sourceKind === "weapon" ? "weapon" : "generic",
    weaponKey: draft.sourceRef ?? "",
    firingModeId: draft.firingModeId,
    attackMode: draft.attackMode,
    initiativeCost: String(draft.initiativeCost),
    allowsMultiRound: draft.allowsMultiRound,
    heldIntervention: draft.heldIntervention,
    windowKind: draft.windowKind,
    aimDeclared: draft.aimDeclared,
    calledShotDeclared: draft.calledShot.declared,
    calledShotLabel: draft.calledShot.label,
    calledShotPenalty: draft.calledShot.assignedPenalty === null ? "" : String(draft.calledShot.assignedPenalty),
    explicitModifiers: draft.explicitModifiers.map((modifier) => `${modifier.label}: ${modifier.value}`).join("\n"),
    preparesForDeclarationId: draft.preparesForDeclarationId,
    godNotes: draft.godNotes,
  };
}

function displayTime(value: string | null): string {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

export function ActionDeclarationWorkspace({ view }: { view: ActionDeclarationWorkspaceView }) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorState>(() => initialEditor(view));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [exceptionalResponder, setExceptionalResponder] = useState<Record<number, number>>({});
  const actor = view.participants.find(({ characterId }) => characterId === editor.actorCharacterId) ?? null;
  const selectedWeapon = actor?.weapons.find(({ ownershipKey }) => ownershipKey === editor.weaponKey) ?? null;
  const unresolvedDeclarations = useMemo(() => view.declarations.filter(({ status }) => ![
    "resolved", "cancelled", "abandoned",
  ].includes(status)), [view.declarations]);

  async function perform(work: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      setFeedback({ kind: "success", message: success });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The declaration operation failed." });
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(): Promise<void> {
    let draft: ActionDeclarationDraft;
    try {
      draft = draftFromEditor(editor, view);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The declaration draft is invalid." });
      return;
    }
    await perform(async () => {
      if (editor.declarationId === null) {
        await createActionDeclarationDraft(view.context.encounterId, draft);
      } else {
        await editActionDeclarationDraft(view.context.encounterId, editor.declarationId, draft);
      }
      setEditor(initialEditor(view));
    }, editor.declarationId === null ? "Draft declaration created. No Initiative was spent." : "Draft declaration updated. No Initiative was spent.");
  }

  function promptReason(label: string): string | null {
    const reason = window.prompt(label)?.trim() ?? "";
    return reason || null;
  }

  function promptTimingCorrection(declarationId: number, currentRemaining: number): void {
    const supplied = window.prompt("Correct remaining Initiative Cost.", String(currentRemaining));
    if (supplied === null) return;
    const remaining = Number(supplied);
    if (!Number.isFinite(remaining) || remaining <= 0) {
      setFeedback({ kind: "error", message: "Remaining Initiative Cost must be greater than zero." });
      return;
    }
    const reason = promptReason("Why is this timing/progress correction required?");
    if (reason) void perform(
      () => correctActionDeclarationRemainingCost(view.context.encounterId, declarationId, remaining, reason),
      "Initiative progress corrected with an audit reason; the current window was recalculated.",
    );
  }

  return <section className="action-declaration-workspace" aria-labelledby="action-declaration-heading">
    <header className="action-declaration-heading">
      <div><span>ACTION DECLARATIONS</span><h6 id="action-declaration-heading" className="font-sans">Lock intent before the Roll</h6></div>
      <strong>{unresolvedDeclarations.length} open</strong>
    </header>
    <p className="action-declaration-boundary">Drafts spend nothing. Commitment uses the shared Initiative runtime and creates responder opportunities from the exact inclusive Initiative window. Fictional eligibility stays with the G.O.D.</p>
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

    <form className="action-declaration-editor" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
      <header><strong>{editor.declarationId === null ? "New draft" : `Edit draft #${editor.declarationId}`}</strong><small>Only draft mechanics are editable.</small></header>
      <label><span>Acting Character</span><select disabled={busy || editor.declarationId !== null} value={editor.actorCharacterId} onChange={(event) => setEditor({ ...editor, actorCharacterId: Number(event.target.value), weaponKey: "", firingModeId: null })}>{view.participants.map((participant) => <option key={participant.characterId} value={participant.characterId}>{participant.name} · {participant.currentInitiative} · {participant.participationStatus}</option>)}</select></label>
      <label><span>Target</span><select disabled={busy} value={editor.targetCharacterId ?? ""} onChange={(event) => setEditor({ ...editor, targetCharacterId: event.target.value ? Number(event.target.value) : null })}><option value="">No target</option>{view.participants.filter(({ characterId }) => characterId !== editor.actorCharacterId).map((participant) => <option key={participant.characterId} value={participant.characterId}>{participant.name}</option>)}</select></label>
      <label className="is-wide"><span>Action Label</span><input required disabled={busy} value={editor.label} onChange={(event) => setEditor({ ...editor, label: event.target.value })} placeholder="Measured strike, open the gate, prepare aim…" /></label>
      <label><span>Action Kind</span><input required disabled={busy} value={editor.actionKind} onChange={(event) => setEditor({ ...editor, actionKind: event.target.value })} /></label>
      <label><span>Window Kind</span><select disabled={busy} value={editor.windowKind} onChange={(event) => {
        const windowKind = event.target.value as ActionWindowKind;
        setEditor({ ...editor, windowKind, initiativeCost: windowKind === "firearm-trigger" ? "1" : editor.initiativeCost });
      }}><option value="ordinary">Ordinary</option><option value="melee-overlap">Melee overlap</option><option value="firearm-trigger">Firearm trigger · 1 Initiative</option><option value="preparation">Preparation</option></select></label>
      <label><span>Initiative Cost</span><input required type="number" min="0.000001" step="any" disabled={busy || editor.windowKind === "firearm-trigger"} value={editor.initiativeCost} onChange={(event) => setEditor({ ...editor, initiativeCost: event.target.value })} /></label>
      <label><span>Source</span><select disabled={busy} value={editor.sourceKind} onChange={(event) => setEditor({ ...editor, sourceKind: event.target.value as "generic" | "weapon", weaponKey: "", firingModeId: null })}><option value="generic">Generic / descriptive</option><option value="weapon">Wielded Weapon</option></select></label>
      {editor.sourceKind === "weapon" ? <>
        <label><span>Exact Wielded Weapon</span><select required disabled={busy} value={editor.weaponKey} onChange={(event) => {
          const weapon = actor?.weapons.find(({ ownershipKey }) => ownershipKey === event.target.value);
          setEditor({ ...editor, weaponKey: event.target.value, firingModeId: null, initiativeCost: editor.windowKind === "firearm-trigger" ? "1" : String(weapon?.initiativeCost ?? editor.initiativeCost) });
        }}><option value="">Choose weapon</option>{actor?.weapons.map((weapon) => <option key={weapon.ownershipKey} value={weapon.ownershipKey}>{weapon.name}{weapon.initiativeCost === null ? " · G.O.D. cost required" : ` · cost ${weapon.initiativeCost}`}</option>)}</select></label>
        <label><span>Firing Mode</span><select disabled={busy || !selectedWeapon?.firingModes.length} value={editor.firingModeId ?? ""} onChange={(event) => setEditor({ ...editor, firingModeId: event.target.value ? Number(event.target.value) : null, attackMode: event.target.selectedOptions[0]?.textContent ?? "" })}><option value="">Default / none</option>{selectedWeapon?.firingModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</select></label>
      </> : null}
      {editor.windowKind === "preparation" ? <label><span>Later Intended Declaration</span><select disabled={busy} value={editor.preparesForDeclarationId ?? ""} onChange={(event) => setEditor({ ...editor, preparesForDeclarationId: event.target.value ? Number(event.target.value) : null })}><option value="">Not linked yet</option>{view.declarations.filter(({ id }) => id !== editor.declarationId).map((declaration) => <option key={declaration.id} value={declaration.id}>#{declaration.id} · {declaration.draft.label}</option>)}</select></label> : null}
      <label className="action-declaration-check"><input type="checkbox" disabled={busy} checked={editor.allowsMultiRound} onChange={(event) => setEditor({ ...editor, allowsMultiRound: event.target.checked })} /><span>Explicitly permits multi-Round continuation</span></label>
      <label className="action-declaration-check"><input type="checkbox" disabled={busy} checked={editor.heldIntervention} onChange={(event) => setEditor({ ...editor, heldIntervention: event.target.checked })} /><span>Held intervention</span></label>
      <label className="action-declaration-check"><input type="checkbox" disabled={busy} checked={editor.aimDeclared} onChange={(event) => setEditor({ ...editor, aimDeclared: event.target.checked })} /><span>Aim already declared · placeholder only</span></label>
      <label className="action-declaration-check"><input type="checkbox" disabled={busy} checked={editor.calledShotDeclared} onChange={(event) => setEditor({ ...editor, calledShotDeclared: event.target.checked })} /><span>Called Shot declared · no calculation</span></label>
      {editor.calledShotDeclared ? <><label><span>Called Shot</span><input disabled={busy} value={editor.calledShotLabel} onChange={(event) => setEditor({ ...editor, calledShotLabel: event.target.value })} /></label><label><span>Assigned Penalty</span><input required type="number" step="any" disabled={busy} value={editor.calledShotPenalty} onChange={(event) => setEditor({ ...editor, calledShotPenalty: event.target.value })} /></label></> : null}
      <label className="is-wide"><span>Explicit Modifiers</span><textarea disabled={busy} rows={3} value={editor.explicitModifiers} onChange={(event) => setEditor({ ...editor, explicitModifiers: event.target.value })} placeholder={"One per line, Label: number\nCover: 10"} /></label>
      <label className="is-wide"><span>G.O.D. Notes / Ruling Context</span><textarea disabled={busy} rows={3} value={editor.godNotes} onChange={(event) => setEditor({ ...editor, godNotes: event.target.value })} /></label>
      <footer><button disabled={busy}>{editor.declarationId === null ? "Create Draft" : "Save Draft"}</button>{editor.declarationId !== null ? <button type="button" disabled={busy} onClick={() => setEditor(initialEditor(view))}>Stop Editing</button> : null}</footer>
    </form>

    <section className="action-run-grid">
      <header><div><span>THE RUN</span><strong>Who remains ahead</strong></div><small>Boundary equality opens an opportunity.</small></header>
      <div>{view.run.map((run) => {
        const participant = view.participants.find(({ characterId }) => characterId === run.actorCharacterId)!;
        const next = run.nextReachedParticipantId === null ? null : view.participants.find(({ characterId }) => characterId === run.nextReachedParticipantId);
        return <article key={run.actorCharacterId} className={run.hasTheRun ? "has-run" : ""}><span>{run.hasTheRun ? "HAS THE RUN" : "NO RUN"}</span><strong>{participant.name}</strong><small>{run.reason}</small><b>{run.maximumWindowBeforeInterference === null ? "No mechanical interferer" : `Window must stay below ${run.maximumWindowBeforeInterference}${next ? ` before ${next.name}` : ""}`}</b></article>;
      })}</div>
    </section>

    <div className="action-declaration-list">
      {[...view.declarations].reverse().map((declaration) => <details key={declaration.id} open={unresolvedDeclarations.some(({ id }) => id === declaration.id)}>
        <summary><div><span>{declaration.status.toLocaleUpperCase()}</span><strong>#{declaration.id} · {declaration.draft.label}</strong><small>{declaration.actorName} · created {displayTime(declaration.createdAt)}</small></div><b>{declaration.timing ? `${declaration.timing.initiativeSpent} spent · ${declaration.timing.remainingInitiativeCost} remaining` : "No Initiative committed"}</b></summary>
        <div className="action-declaration-detail">
          <dl>
            <div><dt>Source</dt><dd>{declaration.lockedSnapshot?.source.kind ?? declaration.draft.sourceKind}{declaration.lockedSnapshot?.source.ref ? ` · ${declaration.lockedSnapshot.source.ref}` : ""}</dd></div>
            <div><dt>Window</dt><dd>{declaration.lockedSnapshot?.windowKind ?? declaration.draft.windowKind}</dd></div>
            <div><dt>Cost</dt><dd>{declaration.lockedSnapshot?.initiativeCost ?? declaration.draft.initiativeCost}</dd></div>
            <div><dt>Multi-Round</dt><dd>{(declaration.lockedSnapshot?.allowsMultiRound ?? declaration.draft.allowsMultiRound) ? "Yes" : "No"}</dd></div>
            <div><dt>Locked</dt><dd>{displayTime(declaration.lockedAt)}</dd></div>
            <div><dt>Committed</dt><dd>{displayTime(declaration.committedAt)}</dd></div>
          </dl>
          {declaration.window ? <p className="action-window-math"><strong>{declaration.window.startInitiative} → {declaration.window.nominalCompletionInitiative}</strong><span>{declaration.window.kind} · boundaries count · no wrap{declaration.window.overlapMayExtendBeyondCompletion ? " · admitted responses may overlap beyond completion" : ""}</span></p> : null}
          {declaration.lockedSnapshot?.governing ? <p><b>Governing source:</b> {declaration.lockedSnapshot.governing.status}{declaration.lockedSnapshot.governing.rollOverTarget === null ? "" : ` · roll-over ${declaration.lockedSnapshot.governing.rollOverTarget}`} · {declaration.lockedSnapshot.governing.explanation}</p> : null}
          {declaration.lockedSnapshot ? <p><b>Frozen context:</b> Campaign {declaration.lockedSnapshot.context.campaignId} · Session {declaration.lockedSnapshot.context.sessionId} · Scene {declaration.lockedSnapshot.context.sceneId} · Encounter {declaration.lockedSnapshot.context.encounterId} · Round {declaration.lockedSnapshot.context.roundNumber} · Step {declaration.lockedSnapshot.context.stepNumber}</p> : null}
          {declaration.opportunities.length ? <section className="action-opportunities"><strong>Responder opportunities</strong>{declaration.opportunities.map((opportunity) => <article key={opportunity.id}><div><span>{opportunity.source === "god-exception" ? "G.O.D. EXCEPTION" : `REACHED AT ${opportunity.reachedAtInitiative}`}</span><b>{opportunity.responderName} · {opportunity.status}</b><small>{opportunity.reason}</small>{opportunity.rulingReason ? <small>Ruling: {opportunity.rulingReason}</small> : null}</div>{opportunity.status === "pending" ? <div><button disabled={busy} onClick={() => void perform(() => reconcileResponderOpportunity(view.context.encounterId, opportunity.id, { status: "declined" }), `${opportunity.responderName} declined.`)}>Decline</button><button disabled={busy} onClick={() => { const responseLabel = promptReason("Describe the reserved response declaration."); if (responseLabel) void perform(() => reconcileResponderOpportunity(view.context.encounterId, opportunity.id, { status: "response-declared", responseLabel }), `${opportunity.responderName}'s response was declared.`); }}>Declare Response</button><button disabled={busy} onClick={() => { const reason = promptReason("Why is this mechanically reached participant ineligible in the fiction?"); if (reason) void perform(() => reconcileResponderOpportunity(view.context.encounterId, opportunity.id, { status: "ineligible", reason }), `${opportunity.responderName} was ruled ineligible.`); }}>Rule Ineligible</button></div> : null}</article>)}</section> : <p>No normal responder position was reached by this window.</p>}
          {declaration.status === "committed" && declaration.pendingActionId !== null ? <div className="action-exception"><select value={exceptionalResponder[declaration.id] ?? ""} onChange={(event) => setExceptionalResponder({ ...exceptionalResponder, [declaration.id]: Number(event.target.value) })}><option value="">Exceptional responder…</option>{view.participants.filter(({ characterId }) => characterId !== declaration.actorCharacterId && !declaration.opportunities.some((opportunity) => opportunity.responderCharacterId === characterId && opportunity.status === "pending")).map((participant) => <option key={participant.characterId} value={participant.characterId}>{participant.name}</option>)}</select><button disabled={busy || !exceptionalResponder[declaration.id]} onClick={() => { const reason = promptReason("Why may this exceptional participant respond?"); if (reason) void perform(() => addExceptionalResponder(view.context.encounterId, declaration.id, exceptionalResponder[declaration.id]!, reason), "Exceptional responder opportunity added."); }}>Add with Reason</button></div> : null}
          <div className="action-declaration-controls">
            {declaration.status === "draft" ? <><button disabled={busy} onClick={() => setEditor(editorFromDraft(declaration.id, declaration.draft))}>Edit Draft</button><button disabled={busy} onClick={() => void perform(() => lockActionDeclaration(view.context.encounterId, declaration.id), "Declaration locked. Initiative remains unchanged.")}>Lock</button><button disabled={busy} onClick={() => void perform(() => cancelActionDeclaration(view.context.encounterId, declaration.id), "Draft cancelled at zero Initiative cost.")}>Cancel Draft</button></> : null}
            {declaration.status === "locked" ? <><button disabled={busy} onClick={() => void perform(() => commitActionDeclaration(view.context.encounterId, declaration.id), "Declaration committed to the shared Initiative timeline.")}>Commit Initiative</button><button disabled={busy} onClick={() => void perform(() => reviseLockedActionDeclaration(view.context.encounterId, declaration.id), "Locked declaration preserved; explicit draft revision created.")}>Create Revision</button><button disabled={busy} onClick={() => void perform(() => cancelActionDeclaration(view.context.encounterId, declaration.id), "Locked declaration cancelled at zero Initiative cost.")}>Cancel Locked</button></> : null}
            {declaration.status === "rolling-ready" || declaration.status === "rolling" || declaration.status === "committed" ? <><button disabled={busy} onClick={() => { const reason = promptReason("Why does this action require a G.O.D. ruling?"); if (reason) void perform(() => markActionDeclarationAwaitingRuling(view.context.encounterId, declaration.id, reason), "Declaration is awaiting a G.O.D. ruling."); }}>Await Ruling</button>{declaration.timing?.status === "active" ? <><button disabled={busy} onClick={() => promptTimingCorrection(declaration.id, declaration.timing!.remainingInitiativeCost)}>Correct Progress</button><button disabled={busy} onClick={() => { const reason = promptReason("Why should the remaining action timing be marked complete now?"); if (reason) void perform(() => completeActionDeclarationTiming(view.context.encounterId, declaration.id, reason), "Action timing completed by an explicit audited ruling."); }}>Complete Timing</button></> : null}<button disabled={busy} onClick={() => { const reason = promptReason("Why was this action interrupted?"); if (reason) void perform(() => interruptActionDeclaration(view.context.encounterId, declaration.id, reason), "Action interrupted; only elapsed Initiative remains spent."); }}>Interrupt</button><button disabled={busy} onClick={() => { const reason = promptReason("Cancellation reason (optional).") ?? ""; void perform(() => cancelActionDeclaration(view.context.encounterId, declaration.id, reason), "Committed action cancelled without charging unelapsed cost."); }}>Cancel</button><button disabled={busy} onClick={() => { const reason = promptReason("Abandonment reason."); if (reason) void perform(() => abandonActionDeclaration(view.context.encounterId, declaration.id, reason), "Action abandoned without charging unelapsed cost."); }}>Abandon</button>{declaration.timing?.status === "completed" ? <button disabled={busy} onClick={() => void perform(() => resolveActionDeclaration(view.context.encounterId, declaration.id), "Action explicitly marked resolved. No outcome was invented.")}>Resolve</button> : null}</> : null}
            {declaration.status === "awaiting-god-ruling" ? <><button disabled={busy} onClick={() => { const reason = promptReason("Record the explicit continue ruling."); if (reason) void perform(() => continueActionDeclarationAfterRuling(view.context.encounterId, declaration.id, reason), "Ruling recorded; action is rolling-ready."); }}>Continue</button>{declaration.timing?.status === "completed" ? <button disabled={busy} onClick={() => { const reason = promptReason("Resolution ruling summary (optional).") ?? ""; void perform(() => resolveActionDeclaration(view.context.encounterId, declaration.id, reason), "Action explicitly resolved."); }}>Resolve</button> : null}<button disabled={busy} onClick={() => { const reason = promptReason("Why was this action interrupted?"); if (reason) void perform(() => interruptActionDeclaration(view.context.encounterId, declaration.id, reason), "Action interrupted by explicit ruling."); }}>Interrupt</button></> : null}
            {declaration.status === "interrupted" ? <><button disabled={busy} onClick={() => { const reason = promptReason("Why may this interrupted action resume from retained progress?"); if (reason) void perform(() => resumeInterruptedActionDeclaration(view.context.encounterId, declaration.id, reason), "Interrupted action resumed from retained progress."); }}>Resume by Ruling</button><button disabled={busy} onClick={() => { const reason = promptReason("Why must this interrupted action restart from its original cost?"); if (reason) void perform(() => restartInterruptedActionDeclaration(view.context.encounterId, declaration.id, reason), "Interrupted action restarted by explicit ruling."); }}>Restart by Ruling</button>{declaration.timing ? <button disabled={busy} onClick={() => promptTimingCorrection(declaration.id, declaration.timing!.remainingInitiativeCost)}>Correct Remaining</button> : null}<button disabled={busy} onClick={() => { const reason = promptReason("Abandonment reason."); if (reason) void perform(() => abandonActionDeclaration(view.context.encounterId, declaration.id, reason), "Interrupted action abandoned."); }}>Abandon</button></> : null}
          </div>
          {declaration.events.length ? <details className="action-audit"><summary>Audit history · {declaration.events.length}</summary><ol>{[...declaration.events].reverse().map((event) => <li key={event.id}><b>{event.eventKind}</b><span>{event.fromStatus ?? "created"} → {event.toStatus} · {displayTime(event.createdAt)}</span>{event.reason ? <small>{event.reason}</small> : null}</li>)}</ol></details> : null}
        </div>
      </details>)}
      {!view.declarations.length ? <p className="tabletop-empty">No declarations yet. Create a draft without spending Initiative.</p> : null}
    </div>
  </section>;
}
