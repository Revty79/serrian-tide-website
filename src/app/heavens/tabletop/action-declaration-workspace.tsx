"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useCombatOperationState } from "@/components/tabletop/combat-operation-state";
import type { ActionDeclarationDraft, ActionWindowKind } from "@/features/tabletop-operations/action-declaration";
import type { ActionDeclarationWorkspaceView } from "@/features/tabletop-operations/action-declaration-service";
import { isUncertainSubmissionError } from "@/features/tabletop-operations/submitted-attempt";

import {
  abandonActionDeclaration,
  addExceptionalResponder,
  cancelActionDeclaration,
  commitActionDeclaration,
  completeActionDeclarationTiming,
  continueActionDeclarationAfterRuling,
  correctActionDeclarationRemainingCost,
  createActionDeclarationDraft,
  declareGodAction,
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

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type BattleDeclarationPreset = Readonly<{
  actorCharacterId: number;
  command: "attack" | "cast" | "item" | "ability" | "called-shot" | "move-other";
}>;

export type BattleDeclarationSourceChoice = Readonly<{
  key: string;
  kind: Extract<ActionDeclarationDraft["sourceKind"], "spell" | "item" | "creature-ability" | "derived-ability">;
  ref: string;
  instanceId: number | null;
  label: string;
  detail: string;
}>;

type EditorState = {
  declarationId: number | null;
  actorCharacterId: number;
  targetCharacterId: number | null;
  label: string;
  actionKind: string;
  sourceKind: ActionDeclarationDraft["sourceKind"];
  sourceRef: string;
  sourceInstanceId: string;
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
  calledShotLocation: string;
  movementMode: string;
  movementDistance: string;
  movementIntent: string;
  explicitModifiers: string;
  preparesForDeclarationId: number | null;
  godNotes: string;
};

function initialEditor(
  view: ActionDeclarationWorkspaceView,
  preset?: BattleDeclarationPreset,
  sourceChoices: readonly BattleDeclarationSourceChoice[] = [],
): EditorState {
  const actor = view.participants.find((participant) => participant.characterId === preset?.actorCharacterId && participant.choiceOwner === "god")
    ?? view.participants.find((participant) => (
    participant.choiceOwner === "god" && !participant.hasActiveAction && participant.participationStatus === "active"
  )) ?? view.participants.find(({ choiceOwner }) => choiceOwner === "god");
  const weapon = preset?.command === "attack" || preset?.command === "called-shot"
    ? actor?.weapons.find(({ firingModes }) => firingModes.length === 0) ?? null
    : actor?.weapons[0] ?? null;
  const creatureAttack = actor?.creatureAttacks[0] ?? null;
  const movement = actor?.movementModes[0] ?? null;
  const attackSource = creatureAttack ? "creature-attack" as const : "weapon" as const;
  const chosenSource = preset?.command === "cast"
    ? sourceChoices.find(({ kind }) => kind === "spell") ?? null
    : preset?.command === "item"
      ? sourceChoices.find(({ kind }) => kind === "item") ?? null
      : preset?.command === "ability"
        ? sourceChoices.find(({ kind }) => kind === "creature-ability" || kind === "derived-ability") ?? null
        : null;
  const commandSource: ActionDeclarationDraft["sourceKind"] = preset?.command === "attack" || preset?.command === "called-shot"
    ? attackSource
    : preset?.command === "cast"
      ? "spell"
      : preset?.command === "item"
        ? "item"
        : preset?.command === "ability"
          ? chosenSource?.kind ?? "derived-ability"
          : preset?.command === "move-other"
            ? "no-roll"
            : "generic";
  const attackCost = creatureAttack ? creatureAttack.initiativeCost : weapon?.initiativeCost ?? null;
  return {
    declarationId: null,
    actorCharacterId: actor?.characterId ?? 0,
    targetCharacterId: null,
    label: commandSource === "creature-attack" ? `${creatureAttack?.attackName ?? "Creature"} attack` : commandSource === "weapon" ? `${weapon?.name ?? "Weapon"} attack` : commandSource === "no-roll" ? `${movement?.movementMode ?? "Movement"} movement` : chosenSource?.label ?? "",
    actionKind: commandSource === "no-roll" ? "movement" : commandSource === "weapon" || commandSource === "creature-attack" ? "attack" : commandSource,
    sourceKind: commandSource,
    sourceRef: commandSource === "creature-attack" ? creatureAttack?.canonicalId ?? "" : chosenSource?.ref ?? "",
    sourceInstanceId: chosenSource?.instanceId === null || chosenSource?.instanceId === undefined ? "" : String(chosenSource.instanceId),
    weaponKey: commandSource === "weapon" ? weapon?.ownershipKey ?? "" : "",
    firingModeId: null,
    attackMode: commandSource === "creature-attack" ? "Creature attack" : commandSource === "weapon" ? "Authored weapon attack" : "",
    initiativeCost: (commandSource === "weapon" || commandSource === "creature-attack") && attackCost !== null ? String(attackCost) : "",
    allowsMultiRound: false,
    heldIntervention: false,
    windowKind: "ordinary",
    aimDeclared: false,
    calledShotDeclared: preset?.command === "called-shot",
    calledShotLabel: "",
    calledShotPenalty: "",
    calledShotLocation: "",
    movementMode: movement?.movementMode ?? "",
    movementDistance: "",
    movementIntent: "",
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
  const movement = actor?.movementModes.find(({ movementMode }) => movementMode === editor.movementMode) ?? null;
  const movementCost = editor.sourceKind === "no-roll" && editor.actionKind === "movement" && movement && Number(editor.movementDistance) > 0
    ? Math.ceil(Number(editor.movementDistance) / movement.baseMovement)
    : null;
  return {
    actorCharacterId: editor.actorCharacterId,
    targetCharacterIds: editor.targetCharacterId === null ? [] : [editor.targetCharacterId],
    label: editor.label,
    actionKind: editor.actionKind,
    sourceKind: editor.sourceKind,
    sourceRef: editor.sourceKind === "weapon" ? weapon?.ownershipKey ?? null : editor.sourceRef.trim() || null,
    sourceInstanceId: editor.sourceKind === "weapon"
      ? weapon?.instanceId ?? null
      : editor.sourceInstanceId.trim() ? Number(editor.sourceInstanceId) : null,
    sourcePayload: editor.sourceKind === "manual"
      ? { instruction: editor.godNotes }
      : editor.sourceKind === "no-roll" && editor.actionKind === "movement"
        ? { movement: { mode: editor.movementMode, distanceFeet: Number(editor.movementDistance), intent: editor.movementIntent } }
        : {},
    weaponItemId: editor.sourceKind === "weapon" ? weapon?.itemId ?? null : null,
    firingModeId: editor.sourceKind === "weapon" ? editor.firingModeId : null,
    attackMode: editor.attackMode,
    initiativeCost: movementCost ?? Number(editor.initiativeCost),
    allowsMultiRound: editor.allowsMultiRound,
    heldIntervention: editor.heldIntervention,
    windowKind: editor.windowKind,
    aimDeclared: editor.aimDeclared,
    calledShot: {
      declared: editor.calledShotDeclared,
      label: editor.calledShotLabel,
      assignedPenalty: editor.calledShotDeclared ? Number(editor.calledShotPenalty) : null,
      locationNumber: editor.calledShotDeclared && editor.calledShotLocation !== "" ? Number(editor.calledShotLocation) : null,
    },
    explicitModifiers: modifiersFromText(editor.explicitModifiers),
    preparesForDeclarationId: editor.windowKind === "preparation" ? editor.preparesForDeclarationId : null,
    godNotes: editor.godNotes,
  };
}

function editorFromDraft(declarationId: number, draft: ActionDeclarationDraft): EditorState {
  const movement = draft.sourcePayload?.movement;
  const movementPayload = movement && typeof movement === "object" && !Array.isArray(movement)
    ? movement as Record<string, unknown>
    : null;
  return {
    declarationId,
    actorCharacterId: draft.actorCharacterId,
    targetCharacterId: draft.targetCharacterIds[0] ?? null,
    label: draft.label,
    actionKind: draft.actionKind,
    sourceKind: draft.sourceKind,
    sourceRef: draft.sourceKind === "weapon" ? "" : draft.sourceRef ?? "",
    sourceInstanceId: draft.sourceKind === "weapon" || draft.sourceInstanceId === null ? "" : String(draft.sourceInstanceId),
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
    calledShotLocation: draft.calledShot.locationNumber === null || draft.calledShot.locationNumber === undefined ? "" : String(draft.calledShot.locationNumber),
    movementMode: typeof movementPayload?.mode === "string" ? movementPayload.mode : "",
    movementDistance: typeof movementPayload?.distanceFeet === "number" ? String(movementPayload.distanceFeet) : "",
    movementIntent: typeof movementPayload?.intent === "string" ? movementPayload.intent : "",
    explicitModifiers: draft.explicitModifiers.map((modifier) => `${modifier.label}: ${modifier.value}`).join("\n"),
    preparesForDeclarationId: draft.preparesForDeclarationId,
    godNotes: draft.godNotes,
  };
}

function displayTime(value: string | null): string {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

export function ActionDeclarationWorkspace({
  view,
  battlePreset,
  battleSourceChoices = [],
  compact = false,
  directCommit = false,
}: {
  view: ActionDeclarationWorkspaceView;
  battlePreset?: BattleDeclarationPreset;
  battleSourceChoices?: readonly BattleDeclarationSourceChoice[];
  compact?: boolean;
  directCommit?: boolean;
}) {
  const router = useRouter();
  const operationKey = battlePreset
    ? `declaration:${battlePreset.actorCharacterId}:${battlePreset.command}`
    : "declaration:advanced";
  const [editor, setEditor] = useCombatOperationState<EditorState>(`${operationKey}:editor`, () => initialEditor(view, battlePreset, battleSourceChoices));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useCombatOperationState<Feedback | null>(`${operationKey}:feedback`, null);
  const [directAttempt, setDirectAttempt] = useCombatOperationState<null | { draft: ActionDeclarationDraft; idempotencyKey: string }>(`${operationKey}:attempt`, null);
  const directAttemptRef = useRef(directAttempt);
  useEffect(() => {
    directAttemptRef.current = directAttempt;
  }, [directAttempt, operationKey]);
  const [exceptionalResponder, setExceptionalResponder] = useState<Record<number, number>>({});
  const [eligibilityReasons, setEligibilityReasons] = useState<Record<number, string>>({});
  const godControlledParticipants = view.participants.filter(({ choiceOwner }) => choiceOwner === "god");
  const actor = view.participants.find(({ characterId }) => characterId === editor.actorCharacterId) ?? null;
  const target = view.participants.find(({ characterId }) => characterId === editor.targetCharacterId) ?? null;
  const attackBattlePreset = battlePreset?.command === "attack" || battlePreset?.command === "called-shot";
  const battleWeapons = attackBattlePreset
    ? actor?.weapons.filter(({ firingModes }) => firingModes.length === 0) ?? []
    : actor?.weapons ?? [];
  const selectedWeapon = actor?.weapons.find(({ ownershipKey }) => ownershipKey === editor.weaponKey) ?? null;
  const selectedCreatureAttack = actor?.creatureAttacks.find(({ canonicalId }) => canonicalId === editor.sourceRef) ?? null;
  const selectedMovement = actor?.movementModes.find(({ movementMode }) => movementMode === editor.movementMode) ?? null;
  const compatibleBattleSources = battleSourceChoices.filter(({ kind }) => kind === editor.sourceKind);
  const exactBattleSourceRequired = Boolean(battlePreset) && ["spell", "item", "creature-ability", "derived-ability"].includes(editor.sourceKind);
  const selectedBattleSource = compatibleBattleSources.find(({ ref, instanceId }) => ref === editor.sourceRef && String(instanceId ?? "") === editor.sourceInstanceId) ?? null;
  const selectedAttackSourceAvailable = !attackBattlePreset || (editor.sourceKind === "weapon" ? selectedWeapon !== null : editor.sourceKind === "creature-attack" && selectedCreatureAttack !== null);
  const movementCost = selectedMovement && Number(editor.movementDistance) > 0
    ? Math.ceil(Number(editor.movementDistance) / selectedMovement.baseMovement)
    : null;
  const unresolvedDeclarations = useMemo(() => view.declarations.filter(({ status }) => ![
    "resolved", "cancelled", "abandoned",
  ].includes(status)), [view.declarations]);
  const headingId = compact ? "action-declaration-battle-heading" : "action-declaration-heading";

  async function perform(
    work: () => Promise<unknown>,
    success: string,
    onSuccess?: () => void,
    onError?: (error: unknown) => void,
  ): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      onSuccess?.();
      setFeedback({ kind: "success", message: success });
      router.refresh();
    } catch (error) {
      onError?.(error);
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
      setEditor(initialEditor(view, battlePreset, battleSourceChoices));
    }, editor.declarationId === null ? "Draft declaration created. No Initiative was spent." : "Draft declaration updated. No Initiative was spent.");
  }

  async function declareAction(): Promise<void> {
    let attempt = directAttemptRef.current;
    if (!attempt) {
      let draft: ActionDeclarationDraft;
      try {
        draft = draftFromEditor(editor, view);
      } catch (error) {
        setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The action declaration is invalid." });
        return;
      }
      attempt = {
        draft,
        idempotencyKey: [...crypto.getRandomValues(new Uint8Array(16))]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join(""),
      };
      directAttemptRef.current = attempt;
      setDirectAttempt(attempt);
    }
    await perform(
      () => declareGodAction(view.context.encounterId, attempt.draft, attempt.idempotencyKey),
      "Action declared and committed to the authoritative Initiative timeline.",
      () => {
        directAttemptRef.current = null;
        setDirectAttempt(null);
        setEditor(initialEditor(view, battlePreset, battleSourceChoices));
      },
      (error) => {
        if (!isUncertainSubmissionError(error)) {
          directAttemptRef.current = null;
          setDirectAttempt(null);
        }
      },
    );
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

  return <section className={`action-declaration-workspace${compact ? " is-battle-command" : ""}`} aria-labelledby={headingId}>
    {!compact ? <header className="action-declaration-heading">
      <div><span>ACTION DECLARATIONS</span><h6 id={headingId} className="font-sans">Lock intent before the Roll</h6></div>
      <strong>{unresolvedDeclarations.length} open</strong>
    </header> : <h6 id={headingId} className="sr-only">Declare the selected combatant&apos;s action</h6>}
    {!compact ? <p className="action-declaration-boundary">Drafts spend nothing. Commitment uses the shared Initiative runtime and creates responder opportunities from the exact inclusive Initiative window. Fictional eligibility stays with the G.O.D.</p> : null}
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    {directAttempt && feedback?.kind === "error" ? <aside className="action-declaration-recovery">
      <strong>We couldn&apos;t confirm whether your action finished.</strong>
      <span>Check and retry.</span>
      <div><button className="st-button is-primary" type="button" disabled={busy} onClick={() => void declareAction()}>Retry action</button></div>
      <details><summary>Retry details</summary><span>Retrying uses the exact saved combatant, source, target, timing, choices, and request identity.</span></details>
    </aside> : null}

    <form className="action-declaration-editor" onSubmit={(event) => { event.preventDefault(); void (directCommit ? declareAction() : saveDraft()); }}>
      <header><strong>{directCommit ? "Declare action" : editor.declarationId === null ? "New draft" : "Edit draft"}</strong><small>{directCommit ? "The server rechecks the exact source, cost, target, and current Initiative before committing." : "G.O.D. creates choices only for NPCs and creatures. Player choices arrive here automatically."}</small></header>
      {!compact ? <label className="st-field"><span>Acting combatant</span><select className="st-control" disabled={busy || editor.declarationId !== null || Boolean(battlePreset)} value={editor.actorCharacterId || ""} onChange={(event) => {
        const nextActor = view.participants.find(({ characterId }) => characterId === Number(event.target.value));
        setEditor({ ...editor, actorCharacterId: Number(event.target.value), weaponKey: "", firingModeId: null, sourceRef: "", movementMode: nextActor?.movementModes[0]?.movementMode ?? "" });
      }}><option value="">Choose NPC or creature</option>{godControlledParticipants.map((participant) => <option key={participant.characterId} value={participant.characterId}>{participant.name} · {participant.currentInitiative} · {participant.participationStatus}</option>)}</select></label> : null}
      <label className="st-field"><span>Target</span><select className="st-control" disabled={busy || (editor.sourceKind === "no-roll" && editor.actionKind === "movement")} value={editor.targetCharacterId ?? ""} onChange={(event) => setEditor({ ...editor, targetCharacterId: event.target.value ? Number(event.target.value) : null, calledShotLocation: "", calledShotLabel: "" })}><option value="">No target</option>{view.participants.filter(({ characterId }) => characterId !== editor.actorCharacterId).map((participant) => <option key={participant.characterId} value={participant.characterId}>{participant.name}</option>)}</select></label>
      <label className="st-field is-wide"><span>Action name</span><input className="st-control" required disabled={busy} value={editor.label} onChange={(event) => setEditor({ ...editor, label: event.target.value })} placeholder="Measured strike, open the gate, prepare aim…" /></label>
      {!compact ? <><label className="st-field"><span>Action type</span><input className="st-control" required disabled={busy} value={editor.actionKind} onChange={(event) => setEditor({ ...editor, actionKind: event.target.value })} /></label>
      <label className="st-field"><span>Timing</span><select className="st-control" disabled={busy} value={editor.windowKind} onChange={(event) => {
        const windowKind = event.target.value as ActionWindowKind;
        setEditor({ ...editor, windowKind, initiativeCost: windowKind === "firearm-trigger" ? "1" : editor.initiativeCost });
      }}><option value="ordinary">Ordinary</option><option value="melee-overlap">Melee overlap</option><option value="firearm-trigger">Firearm trigger · 1 Initiative</option><option value="preparation">Preparation</option></select></label></> : null}
      <label className="st-field"><span>Initiative Cost</span><input className="st-control" required type="number" min="0.000001" step="any" disabled={busy || editor.windowKind === "firearm-trigger" || (editor.sourceKind === "no-roll" && editor.actionKind === "movement")} value={movementCost === null ? editor.initiativeCost : String(movementCost)} onChange={(event) => setEditor({ ...editor, initiativeCost: event.target.value })} /></label>
      <label className="st-field"><span>Source</span><select className="st-control" disabled={busy || Boolean(battlePreset && !attackBattlePreset)} value={editor.sourceKind} onChange={(event) => {
        const sourceKind = event.target.value as ActionDeclarationDraft["sourceKind"];
        const nextWeapon = sourceKind === "weapon" ? battleWeapons[0] ?? null : null;
        const nextCreatureAttack = sourceKind === "creature-attack" ? actor?.creatureAttacks[0] ?? null : null;
        setEditor({
          ...editor,
          sourceKind,
          sourceRef: nextCreatureAttack?.canonicalId ?? "",
          sourceInstanceId: "",
          weaponKey: nextWeapon?.ownershipKey ?? "",
          firingModeId: null,
          label: nextCreatureAttack ? `${nextCreatureAttack.attackName} attack` : nextWeapon ? `${nextWeapon.name} attack` : editor.label,
          initiativeCost: nextCreatureAttack?.initiativeCost !== null && nextCreatureAttack?.initiativeCost !== undefined ? String(nextCreatureAttack.initiativeCost) : nextWeapon?.initiativeCost !== null && nextWeapon?.initiativeCost !== undefined ? String(nextWeapon.initiativeCost) : "",
          actionKind: sourceKind === "no-roll" ? "movement" : editor.actionKind,
          targetCharacterId: sourceKind === "no-roll" ? null : editor.targetCharacterId,
        });
      }}>{battlePreset ? attackBattlePreset ? <><option value="weapon" disabled={!battleWeapons.length}>Wielded non-firearm Weapon</option><option value="creature-attack" disabled={!actor?.creatureAttacks.length}>Authored Creature Attack</option></> : <option value={editor.sourceKind}>{titleCase(editor.sourceKind)}</option> : <><option value="generic">Legacy generic / descriptive</option><option value="weapon">Weapon / Profile</option><option value="item">Owned Item</option><option value="spell">Spell</option><option value="derived-ability">Derived Ability</option><option value="skill">Exact Skill allocation</option><option value="attribute">Character Attribute</option><option value="creature-attack">Creature attack</option><option value="creature-ability">Creature ability</option><option value="no-roll">Movement / explicit no-roll</option><option value="manual">Manual G.O.D. ruling</option></>}</select></label>
      {attackBattlePreset && !battleWeapons.length && !actor?.creatureAttacks.length ? <p className="tabletop-feedback is-error">This combatant has no actual non-firearm wielded Weapon or authored Creature Attack in loaded state. Firearms use the per-bullet Firearm flow below.</p> : null}
      {editor.sourceKind === "weapon" ? <>
        <label className="st-field"><span>Wielded Weapon</span><select className="st-control" required disabled={busy} value={editor.weaponKey} onChange={(event) => {
          const weapon = actor?.weapons.find(({ ownershipKey }) => ownershipKey === event.target.value);
          setEditor({ ...editor, weaponKey: event.target.value, firingModeId: null, initiativeCost: editor.windowKind === "firearm-trigger" ? "1" : weapon?.initiativeCost === null || weapon?.initiativeCost === undefined ? "" : String(weapon.initiativeCost) });
        }}><option value="">Choose weapon</option>{battleWeapons.map((weapon) => <option key={weapon.ownershipKey} value={weapon.ownershipKey}>{weapon.name}{weapon.initiativeCost === null ? " · G.O.D. cost required" : ` · cost ${weapon.initiativeCost}`}</option>)}</select></label>
        {!compact ? <label className="st-field"><span>Firing Mode</span><select className="st-control" disabled={busy || !selectedWeapon?.firingModes.length} value={editor.firingModeId ?? ""} onChange={(event) => setEditor({ ...editor, firingModeId: event.target.value ? Number(event.target.value) : null, attackMode: event.target.selectedOptions[0]?.textContent ?? "" })}><option value="">Default / none</option>{selectedWeapon?.firingModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</select></label> : null}
      </> : null}
      {editor.sourceKind === "creature-attack" ? <label className="st-field"><span>Creature Attack</span><select className="st-control" required disabled={busy} value={editor.sourceRef} onChange={(event) => {
        const attack = actor?.creatureAttacks.find(({ canonicalId }) => canonicalId === event.target.value);
        setEditor({ ...editor, sourceRef: event.target.value, label: attack?.attackName ? `${attack.attackName} attack` : editor.label, initiativeCost: attack?.initiativeCost === null || attack?.initiativeCost === undefined ? "" : String(attack.initiativeCost), attackMode: "Creature attack" });
      }}><option value="">Choose attack</option>{actor?.creatureAttacks.map((attack) => <option key={attack.canonicalId} value={attack.canonicalId}>{attack.attackName} · {attack.damage ?? "damage ruling"} · {attack.initiativeCost ?? "cost ruling"} Initiative</option>)}</select></label> : null}
      {editor.sourceKind === "no-roll" ? <>
        <label className="st-field"><span>Action</span><select className="st-control" disabled={busy} value={editor.actionKind === "movement" ? "movement" : "descriptive"} onChange={(event) => setEditor({ ...editor, actionKind: event.target.value === "movement" ? "movement" : "no-roll", targetCharacterId: null })}><option value="movement">Movement</option><option value="descriptive">Other action without a Roll</option></select></label>
        {editor.actionKind === "movement" ? <>
          <label className="st-field"><span>Movement mode</span><select className="st-control" required disabled={busy} value={editor.movementMode} onChange={(event) => setEditor({ ...editor, movementMode: event.target.value })}><option value="">Choose mode</option>{actor?.movementModes.map((mode) => <option key={mode.movementMode} value={mode.movementMode}>{mode.movementMode} · {mode.baseMovement} ft per Initiative</option>)}</select></label>
          <label className="st-field"><span>Distance in feet</span><input className="st-control" required disabled={busy} type="number" min="0.000001" step="any" value={editor.movementDistance} onChange={(event) => setEditor({ ...editor, movementDistance: event.target.value })} /></label>
          <label className="st-field is-wide"><span>Movement intent</span><input className="st-control" required disabled={busy} maxLength={500} value={editor.movementIntent} onChange={(event) => setEditor({ ...editor, movementIntent: event.target.value })} placeholder="Where and why this combatant is moving" /></label>
          <p className="action-declaration-source-note">{movementCost === null ? "Choose an authored Movement mode and distance." : `${editor.movementDistance} ft at ${selectedMovement?.baseMovement} ft per Initiative costs ${movementCost} Initiative and uses no Roll.`}</p>
        </> : null}
      </> : null}
      {!["generic", "weapon", "creature-attack", "no-roll", "manual"].includes(editor.sourceKind) ? <>
        {battlePreset ? compatibleBattleSources.length ? <label className="st-field"><span>Character source</span><select className="st-control" required disabled={busy} value={selectedBattleSource?.key ?? ""} onChange={(event) => {
          const choice = compatibleBattleSources.find(({ key }) => key === event.target.value);
          if (choice) setEditor({ ...editor, sourceRef: choice.ref, sourceInstanceId: choice.instanceId === null ? "" : String(choice.instanceId), label: choice.label });
        }}><option value="">Choose source</option>{compatibleBattleSources.map((choice) => <option key={choice.key} value={choice.key}>{choice.label} · {choice.detail}</option>)}</select></label> : <p className="action-declaration-source-note">No {editor.sourceKind.replaceAll("-", " ")} source is available for this combatant.</p> : <label className="st-field"><span>Source identity</span><input className="st-control" required disabled={busy} value={editor.sourceRef} onChange={(event) => setEditor({ ...editor, sourceRef: event.target.value })} placeholder={editor.sourceKind === "item" ? "item:123" : editor.sourceKind === "spell" ? "spell:personal:123" : editor.sourceKind === "derived-ability" ? "derived-ability:123" : editor.sourceKind === "skill" ? "skill-allocation:123" : editor.sourceKind === "attribute" ? "DEX" : "Canonical attack / ability ID"} /></label>}
        {!battlePreset && editor.sourceKind === "item" ? <label className="st-field"><span>Owned Item copy ID (when required)</span><input className="st-control" type="number" min={1} step={1} disabled={busy} value={editor.sourceInstanceId} onChange={(event) => setEditor({ ...editor, sourceInstanceId: event.target.value })} /></label> : null}
      </> : null}
      {exactBattleSourceRequired && editor.sourceRef && !selectedBattleSource ? <p className="tabletop-feedback is-error">The selected source changed or is no longer available in live Character state. Choose an available source before continuing.</p> : null}
      {editor.sourceKind === "manual" ? <p className="action-declaration-source-note">The Manual G.O.D. ruling uses the exact declaration identity and the G.O.D. Notes field as its frozen instruction.</p> : null}
      {!["generic", "weapon"].includes(editor.sourceKind) ? <p className="action-declaration-source-note">The supplied identity is only a request. Locking reloads ownership, availability, targets, costs, and authored effects server-side.</p> : null}
      {editor.windowKind === "preparation" ? <label className="st-field"><span>Later action</span><select className="st-control" disabled={busy} value={editor.preparesForDeclarationId ?? ""} onChange={(event) => setEditor({ ...editor, preparesForDeclarationId: event.target.value ? Number(event.target.value) : null })}><option value="">Not linked yet</option>{view.declarations.filter(({ id }) => id !== editor.declarationId).map((declaration) => <option key={declaration.id} value={declaration.id}>{declaration.actorName} · {declaration.draft.label}</option>)}</select></label> : null}
      {!compact ? <><label className="st-field action-declaration-check"><input type="checkbox" disabled={busy} checked={editor.allowsMultiRound} onChange={(event) => setEditor({ ...editor, allowsMultiRound: event.target.checked })} /><span>Allow this action to continue across Rounds</span></label>
      <label className="st-field action-declaration-check"><input type="checkbox" disabled={busy} checked={editor.heldIntervention} onChange={(event) => setEditor({ ...editor, heldIntervention: event.target.checked })} /><span>Held intervention</span></label>
      <label className="st-field action-declaration-check"><input type="checkbox" disabled={busy} checked={editor.aimDeclared} onChange={(event) => setEditor({ ...editor, aimDeclared: event.target.checked })} /><span>Aim already declared</span></label></> : null}
      {editor.sourceKind === "weapon" || editor.sourceKind === "creature-attack" ? <label className="st-field action-declaration-check"><input type="checkbox" disabled={busy || editor.targetCharacterId === null} checked={editor.calledShotDeclared} onChange={(event) => setEditor({ ...editor, calledShotDeclared: event.target.checked, calledShotLocation: event.target.checked ? editor.calledShotLocation : "", calledShotLabel: event.target.checked ? editor.calledShotLabel : "" })} /><span>Called Shot</span></label> : null}
      {editor.calledShotDeclared ? <><label className="st-field"><span>Target location</span><select className="st-control" required disabled={busy || !target} value={editor.calledShotLocation} onChange={(event) => {
        const location = target?.hitLocations.find(({ result }) => result === Number(event.target.value));
        setEditor({ ...editor, calledShotLocation: event.target.value, calledShotLabel: location?.name ?? "" });
      }}><option value="">Choose location</option>{target?.hitLocations.map((location) => <option key={location.result} value={location.result}>{location.name}</option>)}</select></label><label className="st-field"><span>G.O.D.-assigned penalty</span><input className="st-control" required type="number" min={0} step="any" disabled={busy} value={editor.calledShotPenalty} onChange={(event) => setEditor({ ...editor, calledShotPenalty: event.target.value })} /></label></> : null}
      {compact ? <details className="action-declaration-advanced">
        <summary>Modifiers and ruling notes</summary>
        <div>
          <label className="st-field"><span>Explicit Modifiers</span><textarea className="st-control" disabled={busy} rows={3} value={editor.explicitModifiers} onChange={(event) => setEditor({ ...editor, explicitModifiers: event.target.value })} placeholder={"One per line, Label: number\nCover: 10"} /></label>
          <label className="st-field"><span>G.O.D. Notes / Ruling Context</span><textarea className="st-control" disabled={busy} rows={3} value={editor.godNotes} onChange={(event) => setEditor({ ...editor, godNotes: event.target.value })} /></label>
        </div>
      </details> : <>
        <label className="st-field is-wide"><span>Explicit Modifiers</span><textarea className="st-control" disabled={busy} rows={3} value={editor.explicitModifiers} onChange={(event) => setEditor({ ...editor, explicitModifiers: event.target.value })} placeholder={"One per line, Label: number\nCover: 10"} /></label>
        <label className="st-field is-wide"><span>G.O.D. Notes / Ruling Context</span><textarea className="st-control" disabled={busy} rows={3} value={editor.godNotes} onChange={(event) => setEditor({ ...editor, godNotes: event.target.value })} /></label>
      </>}
      <footer><button type="submit" className="st-button is-primary" disabled={busy || directAttempt !== null || editor.actorCharacterId === 0 || !selectedAttackSourceAvailable || (exactBattleSourceRequired && !selectedBattleSource)}>{directCommit ? editor.sourceKind === "no-roll" && editor.actionKind === "movement" ? "Declare movement" : editor.sourceKind === "weapon" || editor.sourceKind === "creature-attack" ? "Declare attack" : `Declare ${titleCase(editor.actionKind)}` : editor.declarationId === null ? "Create Draft" : "Save Draft"}</button>{editor.declarationId !== null ? <button className="st-button" type="button" disabled={busy} onClick={() => setEditor(initialEditor(view, battlePreset, battleSourceChoices))}>Stop Editing</button> : null}</footer>
    </form>

    {!compact ? <><section className="action-run-grid">
      <header><div><span>THE RUN</span><strong>Who remains ahead</strong></div><small>Boundary equality opens an opportunity.</small></header>
      <div>{view.run.map((run) => {
        const participant = view.participants.find(({ characterId }) => characterId === run.actorCharacterId)!;
        const next = run.nextReachedParticipantId === null ? null : view.participants.find(({ characterId }) => characterId === run.nextReachedParticipantId);
        return <article key={run.actorCharacterId} className={run.hasTheRun ? "has-run" : ""}><span>{run.hasTheRun ? "HAS THE RUN" : "NO RUN"}</span><strong>{participant.name}</strong><small>{run.reason}</small><b>{run.maximumWindowBeforeInterference === null ? "No mechanical interferer" : `Window must stay below ${run.maximumWindowBeforeInterference}${next ? ` before ${next.name}` : ""}`}</b></article>;
      })}</div>
    </section>

    <div className="action-declaration-list">
      {[...view.declarations].reverse().map((declaration) => <details key={declaration.id} open={unresolvedDeclarations.some(({ id }) => id === declaration.id)}>
        <summary><div><span>{declaration.status.toLocaleUpperCase()}</span><strong>{declaration.draft.label}</strong><small>{declaration.actorName} · created {displayTime(declaration.createdAt)}</small></div><b>{declaration.timing ? `${declaration.timing.initiativeSpent} spent · ${declaration.timing.remainingInitiativeCost} remaining` : "No Initiative committed"}</b></summary>
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
          {declaration.lockedSnapshot ? <details className="action-audit"><summary>Technical audit context</summary><p>Campaign {declaration.lockedSnapshot.context.campaignId} · Session {declaration.lockedSnapshot.context.sessionId} · Scene {declaration.lockedSnapshot.context.sceneId} · Encounter {declaration.lockedSnapshot.context.encounterId} · Round {declaration.lockedSnapshot.context.roundNumber} · Step {declaration.lockedSnapshot.context.stepNumber}</p></details> : null}
          {declaration.opportunities.length ? <section className="action-opportunities"><strong>Responder opportunities</strong>{declaration.opportunities.map((opportunity) => <article key={opportunity.id}><div><span>{opportunity.source === "god-exception" ? "G.O.D. EXCEPTION" : `REACHED AT ${opportunity.reachedAtInitiative}`}</span><b>{opportunity.responderName}</b><small>{opportunity.reason}</small>{opportunity.rulingReason ? <small>Ruling: {opportunity.rulingReason}</small> : null}</div>{opportunity.status === "pending" && opportunity.requiresGodConfirmation ? <div><p>Can this combatant respond in the current fiction?</p><label className="st-field"><span>Reason when not eligible</span><input className="st-control" disabled={busy} value={eligibilityReasons[opportunity.id] ?? ""} onChange={(event) => setEligibilityReasons({ ...eligibilityReasons, [opportunity.id]: event.target.value })} /></label><button className="st-button is-primary" disabled={busy} onClick={() => void perform(() => reconcileResponderOpportunity(view.context.encounterId, opportunity.id, { decision: "allow" }), `${opportunity.responderName} may now choose a response.`)}>Allow response</button><button className="st-button is-secondary" disabled={busy || !(eligibilityReasons[opportunity.id] ?? "").trim()} onClick={() => void perform(() => reconcileResponderOpportunity(view.context.encounterId, opportunity.id, { decision: "ineligible", reason: eligibilityReasons[opportunity.id] ?? "" }), `${opportunity.responderName} was ruled ineligible.`)}>Not eligible</button></div> : opportunity.status === "pending" ? <p className="tabletop-feedback is-success">Eligible — waiting for {opportunity.responderName} to choose a response or No Defense.</p> : <p>{opportunity.status === "response-declared" ? "Response declared mechanically." : "No response is available from this opportunity."}</p>}</article>)}</section> : <p>No normal responder position was reached by this window.</p>}
          {declaration.status === "committed" && declaration.pendingActionId !== null ? <div className="action-exception"><select className="st-control" aria-label="Exceptional responder" value={exceptionalResponder[declaration.id] ?? ""} onChange={(event) => setExceptionalResponder({ ...exceptionalResponder, [declaration.id]: Number(event.target.value) })}><option value="">Exceptional responder…</option>{view.participants.filter(({ characterId }) => characterId !== declaration.actorCharacterId && !declaration.opportunities.some((opportunity) => opportunity.responderCharacterId === characterId && opportunity.status === "pending")).map((participant) => <option key={participant.characterId} value={participant.characterId}>{participant.name}</option>)}</select><button className="st-button is-secondary" disabled={busy || !exceptionalResponder[declaration.id]} onClick={() => { const reason = promptReason("Why may this exceptional participant respond?"); if (reason) void perform(() => addExceptionalResponder(view.context.encounterId, declaration.id, exceptionalResponder[declaration.id]!, reason), "Exceptional responder opportunity added."); }}>Add responder</button></div> : null}
          <div className="action-declaration-controls">
            {declaration.status === "draft" && view.participants.find(({ characterId }) => characterId === declaration.actorCharacterId)?.choiceOwner === "god" ? <><button className="st-button" disabled={busy} onClick={() => setEditor(editorFromDraft(declaration.id, declaration.draft))}>Edit Draft</button><button className="st-button is-primary" disabled={busy} onClick={() => void perform(() => lockActionDeclaration(view.context.encounterId, declaration.id), "Declaration locked. Initiative remains unchanged.")}>Lock</button><button className="st-button is-danger" disabled={busy} onClick={() => void perform(() => cancelActionDeclaration(view.context.encounterId, declaration.id), "Draft cancelled at zero Initiative cost.")}>Cancel Draft</button></> : null}
            {declaration.status === "locked" && view.participants.find(({ characterId }) => characterId === declaration.actorCharacterId)?.choiceOwner === "god" ? <><button className="st-button is-primary" disabled={busy} onClick={() => void perform(() => commitActionDeclaration(view.context.encounterId, declaration.id), "Declaration committed to the shared Initiative timeline.")}>Commit Initiative</button><button className="st-button" disabled={busy} onClick={() => void perform(() => reviseLockedActionDeclaration(view.context.encounterId, declaration.id), "Locked declaration preserved; explicit draft revision created.")}>Create Revision</button><button className="st-button is-danger" disabled={busy} onClick={() => void perform(() => cancelActionDeclaration(view.context.encounterId, declaration.id), "Locked declaration cancelled at zero Initiative cost.")}>Cancel</button></> : null}
            {(declaration.status === "draft" || declaration.status === "locked") && view.participants.find(({ characterId }) => characterId === declaration.actorCharacterId)?.choiceOwner === "player" ? <p className="tabletop-feedback">This Player controls the declaration. It will reach the G.O.D. here when committed.</p> : null}
            {declaration.status === "rolling-ready" || declaration.status === "rolling" || declaration.status === "committed" ? <><button className="st-button is-secondary" disabled={busy} onClick={() => { const reason = promptReason("Why does this action require a G.O.D. ruling?"); if (reason) void perform(() => markActionDeclarationAwaitingRuling(view.context.encounterId, declaration.id, reason), "Declaration is awaiting a G.O.D. ruling."); }}>Needs ruling</button>{declaration.timing?.status === "active" ? <><button className="st-button" disabled={busy} onClick={() => promptTimingCorrection(declaration.id, declaration.timing!.remainingInitiativeCost)}>Correct progress</button><button className="st-button is-primary" disabled={busy} onClick={() => { const reason = promptReason("Why should the remaining action timing be marked complete now?"); if (reason) void perform(() => completeActionDeclarationTiming(view.context.encounterId, declaration.id, reason), "Action timing completed by an explicit audited ruling."); }}>Complete timing</button></> : null}<button className="st-button is-secondary" disabled={busy} onClick={() => { const reason = promptReason("Why was this action interrupted?"); if (reason) void perform(() => interruptActionDeclaration(view.context.encounterId, declaration.id, reason), "Action interrupted; only elapsed Initiative remains spent."); }}>Interrupt</button><button className="st-button is-danger" disabled={busy} onClick={() => { const reason = promptReason("Cancellation reason (optional).") ?? ""; void perform(() => cancelActionDeclaration(view.context.encounterId, declaration.id, reason), "Committed action cancelled without charging unelapsed cost."); }}>Cancel</button><button className="st-button is-danger" disabled={busy} onClick={() => { const reason = promptReason("Abandonment reason."); if (reason) void perform(() => abandonActionDeclaration(view.context.encounterId, declaration.id, reason), "Action abandoned without charging unelapsed cost."); }}>Abandon</button>{declaration.timing?.status === "completed" ? <button className="st-button is-primary" disabled={busy} onClick={() => void perform(() => resolveActionDeclaration(view.context.encounterId, declaration.id), "Action explicitly marked resolved. No outcome was invented.")}>Resolve</button> : null}</> : null}
            {declaration.status === "awaiting-god-ruling" ? <><button className="st-button is-primary" disabled={busy} onClick={() => { const reason = promptReason("Record the explicit continue ruling."); if (reason) void perform(() => continueActionDeclarationAfterRuling(view.context.encounterId, declaration.id, reason), "Ruling recorded; action is rolling-ready."); }}>Continue</button>{declaration.timing?.status === "completed" ? <button className="st-button is-primary" disabled={busy} onClick={() => { const reason = promptReason("Resolution ruling summary (optional).") ?? ""; void perform(() => resolveActionDeclaration(view.context.encounterId, declaration.id, reason), "Action explicitly resolved."); }}>Resolve</button> : null}<button className="st-button is-secondary" disabled={busy} onClick={() => { const reason = promptReason("Why was this action interrupted?"); if (reason) void perform(() => interruptActionDeclaration(view.context.encounterId, declaration.id, reason), "Action interrupted by explicit ruling."); }}>Interrupt</button></> : null}
            {declaration.status === "interrupted" ? <><button className="st-button is-primary" disabled={busy} onClick={() => { const reason = promptReason("Why may this interrupted action resume from retained progress?"); if (reason) void perform(() => resumeInterruptedActionDeclaration(view.context.encounterId, declaration.id, reason), "Interrupted action resumed from retained progress."); }}>Resume</button><button className="st-button is-secondary" disabled={busy} onClick={() => { const reason = promptReason("Why must this interrupted action restart from its original cost?"); if (reason) void perform(() => restartInterruptedActionDeclaration(view.context.encounterId, declaration.id, reason), "Interrupted action restarted by explicit ruling."); }}>Restart</button>{declaration.timing ? <button className="st-button" disabled={busy} onClick={() => promptTimingCorrection(declaration.id, declaration.timing!.remainingInitiativeCost)}>Correct remaining</button> : null}<button className="st-button is-danger" disabled={busy} onClick={() => { const reason = promptReason("Abandonment reason."); if (reason) void perform(() => abandonActionDeclaration(view.context.encounterId, declaration.id, reason), "Interrupted action abandoned."); }}>Abandon</button></> : null}
          </div>
          {declaration.events.length ? <details className="action-audit"><summary>Audit history · {declaration.events.length}</summary><ol>{[...declaration.events].reverse().map((event) => <li key={event.id}><b>{event.eventKind}</b><span>{event.fromStatus ?? "created"} → {event.toStatus} · {displayTime(event.createdAt)}</span>{event.reason ? <small>{event.reason}</small> : null}</li>)}</ol></details> : null}
        </div>
      </details>)}
      {!view.declarations.length ? <p className="tabletop-empty">No declarations yet. Create a draft without spending Initiative.</p> : null}
    </div></> : null}
  </section>;
}
