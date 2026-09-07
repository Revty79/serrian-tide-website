"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  BattleActivity,
  BattleActor,
  BattleCommands,
  BattleGrid,
  BattleHeader,
  BattleMainColumn,
  BattleRoster,
  BattleSecondary,
  BattleShell,
  BattleStage,
  type BattleActivityEntry,
  type BattleCommandEntry,
  type BattleRosterEntry,
} from "@/components/tabletop/battle-layout";
import { CombatOperationStateProvider, useCombatOperationState } from "@/components/tabletop/combat-operation-state";
import type { CharacterWeaponGovernanceResult } from "@/features/items/character-weapon-governance";
import type {
  PlayerTabletopDerivedAbility,
  PlayerTabletopOwnedItem,
  PlayerTabletopSpell,
} from "@/features/tabletop-operations/player-tabletop-console";
import type { PlayerCombatConsoleData } from "@/features/tabletop-operations/player-tabletop-console-service";
import { TabletopLiveRefresh } from "@/features/tabletop-operations/tabletop-live-refresh";
import { formatAttackPercentileResult } from "@/features/tabletop-operations/percentile-resolution";
import { parsePhysicalPercentileInput } from "@/features/tabletop-operations/roll-runtime";
import {
  captureSubmittedAttempt,
  isUncertainSubmissionError,
  type SubmittedAttempt,
} from "@/features/tabletop-operations/submitted-attempt";

import {
  cancelPlayerCombatRulingRequest,
  clarifyPlayerCombatRulingRequest,
  commitPlayerFirearmTrigger,
  declarePlayerDefense,
  declarePlayerFirearmAttack,
  declarePlayerMovement,
  declarePlayerWeaponAttack,
  firePlayerFirearmAttack,
  rollPlayerDeclaredAttack,
  rollPlayerDeclaredResponse,
  setPlayerInitiativeDisposition,
  startPlayerFirearmPreparation,
  submitPlayerCombatRulingRequest,
} from "./player-combat-actions";
import styles from "./player-tabletop.module.css";

function submissionKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function actionStatusLabel(status: string): string {
  if (["committed", "rolling-ready", "rolling"].includes(status)) return "In progress";
  if (status === "awaiting-god-ruling") return "Needs G.O.D. ruling";
  return titleCase(status);
}

function governingLabel(source: unknown): string {
  if (!source || typeof source !== "object" || Array.isArray(source)) return "G.O.D. ruling required";
  const row = source as Record<string, unknown>;
  if (row.kind === "skill" && typeof row.skillName === "string") return `${row.skillName} · ${String(row.originalTarget ?? "?")}%`;
  if (row.kind === "attribute" && typeof row.attributeKey === "string") return `${row.attributeKey} straight Attribute · ${String(row.originalTarget ?? "?")}%`;
  return `${String(row.label ?? "G.O.D. ruling")} · ${String(row.originalTarget ?? "?")}%`;
}

function rulingSummary(ruling: Record<string, unknown>): string | null {
  const entries = Object.entries(ruling).flatMap(([key, value]) => (
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? [`${titleCase(key)}: ${String(value)}`]
      : []
  ));
  return entries.length ? entries.join(" · ") : null;
}

function isResolvedWeaponGovernance(result: CharacterWeaponGovernanceResult | null): result is Extract<
  CharacterWeaponGovernanceResult,
  { status: "resolved-normal" | "resolved-persistent-override" | "resolved-one-action-override" }
> {
  return result?.status === "resolved-normal"
    || result?.status === "resolved-persistent-override"
    || result?.status === "resolved-one-action-override";
}

function canonicalWeaponPath(result: CharacterWeaponGovernanceResult | null): string | null {
  if (!result || result.normalResolution.status !== "resolved") return null;
  return result.normalResolution.selectedAlternative.canonicalPath.rootToEndpoint.map(({ name }) => name).join(" → ");
}

function ResultMessage({ message }: { message: { error: boolean; text: string } | null }) {
  return message ? <p className={message.error ? styles.error : styles.notice} role={message.error ? "alert" : "status"}>{message.text}</p> : null;
}

function useCombatMutation(operationKey: string) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useCombatOperationState<{ error: boolean; text: string } | null>(`${operationKey}:message`, null);
  function run(
    action: () => Promise<unknown>,
    success: string,
    onSuccess?: () => void,
    onError?: (error: unknown) => void,
  ) {
    setMessage(null);
    startTransition(() => {
      void action().then(() => {
        onSuccess?.();
        setMessage({ error: false, text: success });
        router.refresh();
      }).catch((error: unknown) => {
        onError?.(error);
        setMessage({ error: true, text: error instanceof Error ? error.message : "The combat action could not be completed." });
      });
    });
  }
  return { busy, message, run };
}

type ReplayableAttempt = SubmittedAttempt<unknown> & Readonly<{
  execute: (payload: unknown, idempotencyKey: string) => Promise<unknown>;
  success: string;
}>;

function useSubmittedAttempt(mutation: ReturnType<typeof useCombatMutation>, operationKey: string) {
  const [attempt, setAttempt] = useCombatOperationState<ReplayableAttempt | null>(`${operationKey}:attempt`, null);
  const attemptRef = useRef<ReplayableAttempt | null>(null);
  useEffect(() => {
    attemptRef.current = attempt;
  }, [attempt, operationKey]);

  function remember(next: ReplayableAttempt | null): void {
    attemptRef.current = next;
    setAttempt(next);
  }

  function submit<T>(
    operation: string,
    payload: T,
    execute: (payload: T, idempotencyKey: string) => Promise<unknown>,
    success: string,
  ): void {
    if (attemptRef.current) return;
    const captured = captureSubmittedAttempt(submissionKey(), operation, payload);
    const replayable: ReplayableAttempt = {
      ...captured,
      execute: (saved, idempotencyKey) => execute(saved as T, idempotencyKey),
      success,
    };
    remember(replayable);
    mutation.run(
      () => replayable.execute(replayable.payload, replayable.idempotencyKey),
      success,
      () => remember(null),
      (error) => {
        if (!isUncertainSubmissionError(error)) remember(null);
      },
    );
  }

  function retry(): void {
    const saved = attemptRef.current;
    if (!saved) return;
    mutation.run(
      () => saved.execute(saved.payload, saved.idempotencyKey),
      saved.success,
      () => remember(null),
      (error) => {
        if (!isUncertainSubmissionError(error)) remember(null);
      },
    );
  }

  return {
    attempt,
    submit,
    retry,
  };
}

function AttemptRecovery({
  submission,
  mutation,
}: {
  submission: ReturnType<typeof useSubmittedAttempt>;
  mutation: ReturnType<typeof useCombatMutation>;
}) {
  if (!submission.attempt || !mutation.message?.error) return null;
  return <aside className={styles.attemptRecovery} role="status">
    <strong>We couldn&apos;t confirm whether your action finished.</strong>
    <span>Check and retry.</span>
    <div className={styles.actionRow}>
      <button className="st-button is-primary" type="button" disabled={mutation.busy} onClick={submission.retry}>Retry action</button>
    </div>
    <details><summary>Retry details</summary><span>{submission.attempt.operation}. Retrying uses the exact saved choices and request identity.</span></details>
  </aside>;
}

export function PlayerCombatIntentButton({
  characterId,
  combat,
  sourceKind,
  sourceRef,
  sourceInstanceId,
  label,
}: {
  characterId: number;
  combat: PlayerCombatConsoleData;
  sourceKind: string;
  sourceRef: string;
  sourceInstanceId?: number | null;
  label: string;
}) {
  const operationKey = `source:${sourceKind}:${sourceRef}:${sourceInstanceId ?? "stack"}`;
  const mutation = useCombatMutation(operationKey);
  const submission = useSubmittedAttempt(mutation, operationKey);
  const [intent, setIntent] = useCombatOperationState(`${operationKey}:intent`, "");
  return <form className={styles.compactAction} onSubmit={(event) => {
    event.preventDefault();
    submission.submit("Combat source request", {
      requestType: "manual-action" as const,
      sourceKind,
      sourceRef,
      sourceInstanceId,
      intent,
      requestedTiming: `Round ${combat.initiative.roundNumber}, Initiative ${combat.initiative.timelineInitiative}`,
    }, (attempt, idempotencyKey) => submitPlayerCombatRulingRequest(characterId, combat.context.encounterId, {
      ...attempt,
      idempotencyKey,
    }), `${label} ruling request sent to the G.O.D.`);
  }}>
    <label className="st-field"><span>Combat intent</span><input className="st-control" required maxLength={2000} value={intent} onChange={(event) => setIntent(event.target.value)} placeholder={`How do you want to use ${label}?`} /></label>
    <button className="st-button is-primary" type="submit" disabled={mutation.busy || submission.attempt !== null || !intent.trim()}>{mutation.busy ? "Sending…" : "Request ruling"}</button>
    <ResultMessage message={mutation.message} />
    <AttemptRecovery submission={submission} mutation={mutation} />
  </form>;
}

function ResponsePanel({ characterId, combat, selectedDeclarationId = null }: { characterId: number; combat: PlayerCombatConsoleData; selectedDeclarationId?: number | null }) {
  const mutation = useCombatMutation("response");
  const opportunities = combat.declarations.declarations.flatMap((declaration) => declaration.opportunities
    .filter(({ responderCharacterId, status }) => responderCharacterId === characterId
      && status === "pending"
      && (selectedDeclarationId === null || declaration.id === selectedDeclarationId))
    .map((opportunity) => ({ declaration, opportunity })));
  const weapons = combat.defenses.participants.find(({ characterId: id }) => id === characterId)?.weapons ?? [];
  const dodgeAvailable = combat.defenses.dodgeMappings.some(({ reviewState }) => reviewState === "approved");
  const [weaponKey, setWeaponKey] = useCombatOperationState("response:weapon", weapons[0]?.ownershipKey ?? "");
  const selectedWeapon = weapons.find(({ ownershipKey }) => ownershipKey === weaponKey) ?? null;
  const weaponChoiceStale = Boolean(weaponKey) && selectedWeapon === null;
  if (!opportunities.length) return null;
  return <section className={styles.combatPriority} aria-labelledby="player-response-title">
    <p className={styles.eyebrow}>RESPONSE REQUIRED</p>
    <h2 id="player-response-title">Choose a response before the action can Roll</h2>
    {opportunities.map(({ declaration, opportunity }) => {
      const protectedTarget = declaration.lockedSnapshot?.targetCharacterIds[0] ?? declaration.draft.targetCharacterIds[0] ?? characterId;
      return <article className={styles.combatCard} key={opportunity.id}>
        <h3>{declaration.actorName}: {declaration.lockedSnapshot?.label ?? declaration.draft.label}</h3>
        <p>{opportunity.reason}</p>
        <div className={styles.actionRow}>
          <button className="st-button" disabled={mutation.busy} onClick={() => mutation.run(() => declarePlayerDefense(characterId, combat.context.encounterId, { opportunityId: opportunity.id, reactionType: "no-reaction", protectedTargetParticipantId: protectedTarget }), "No Defense recorded.")}>No Defense</button>
          <button className="st-button" disabled={mutation.busy || !dodgeAvailable} title={dodgeAvailable ? undefined : "No approved Dodge Skill path is available."} onClick={() => mutation.run(() => declarePlayerDefense(characterId, combat.context.encounterId, { opportunityId: opportunity.id, reactionType: "dodge", protectedTargetParticipantId: protectedTarget }), "Dodge declared.")}>Dodge · 1 Initiative</button>
          {weapons.length ? <><select className="st-control" aria-label="Parry or Block Item" value={weaponKey} onChange={(event) => setWeaponKey(event.target.value)}>{weapons.map((weapon) => <option key={weapon.ownershipKey} value={weapon.ownershipKey}>{weapon.name} · {weapon.initiativeCost ?? "ruling"} Initiative</option>)}</select>
            <button className="st-button" disabled={mutation.busy || !selectedWeapon} onClick={() => mutation.run(() => declarePlayerDefense(characterId, combat.context.encounterId, { opportunityId: opportunity.id, reactionType: "parry", protectedTargetParticipantId: protectedTarget, itemId: selectedWeapon!.itemId, instanceId: selectedWeapon!.instanceId }), "Parry declared.")}>Parry</button>
            <button className="st-button" disabled={mutation.busy || !selectedWeapon} onClick={() => mutation.run(() => declarePlayerDefense(characterId, combat.context.encounterId, { opportunityId: opportunity.id, reactionType: "block", protectedTargetParticipantId: protectedTarget, itemId: selectedWeapon!.itemId, instanceId: selectedWeapon!.instanceId }), "Block declared.")}>Block</button></> : null}
        </div>
        {weaponChoiceStale ? <p className={styles.ruling}>The selected defense item is no longer available. Choose a current item before responding.</p> : null}
        {!dodgeAvailable ? <p>Dodge is unavailable because no approved canonical Dodge Skill path exists.</p> : null}
      </article>;
    })}
    <ResultMessage message={mutation.message} />
  </section>;
}

function InitiativePanel({ characterId, combat, disposition }: { characterId: number; combat: PlayerCombatConsoleData; disposition: "hold" | "pass" }) {
  const mutation = useCombatMutation(`initiative:${disposition}`);
  const initiative = combat.initiative;
  return <section className={styles.combatSection} aria-labelledby="player-initiative-title">
    <header><div><p className={styles.eyebrow}>AUTHORITATIVE INITIATIVE</p><h2 id="player-initiative-title">Round {initiative.roundNumber} · Step {initiative.stepNumber}</h2></div><strong>{initiative.currentInitiative} / {initiative.normalTotalInitiative}</strong></header>
    <div className={styles.combatStats}>
      <span>Timeline <strong>{initiative.timelineInitiative}</strong></span><span>Status <strong>{titleCase(initiative.participationStatus)}</strong></span><span>Deferred cost <strong>{initiative.deferredInitiativeCost}</strong></span>
    </div>
    {initiative.pendingAction ? <article className={styles.lockedReview}><strong>{initiative.pendingAction.label}</strong><span>{initiative.pendingAction.initiativeSpent} spent · {initiative.pendingAction.remainingInitiativeCost} remaining · {initiative.pendingAction.additionalInitiativeCost} defense-added · completes at {initiative.pendingAction.expectedCompletionInitiative}</span></article> : null}
    {initiative.canDeclareAction ? <div className={styles.actionRow}><button className="st-button" disabled={mutation.busy} onClick={() => mutation.run(() => setPlayerInitiativeDisposition(characterId, combat.context.encounterId, disposition), disposition === "hold" ? "Initiative is now holding." : "Initiative passed for this Encounter.")}>{disposition === "hold" ? "Hold" : "Pass"}</button></div> : <ul className={styles.blockers}>{initiative.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
    <ResultMessage message={mutation.message} />
  </section>;
}

function MovementPanel({ characterId, combat }: { characterId: number; combat: PlayerCombatConsoleData }) {
  const operationKey = "movement";
  const mutation = useCombatMutation(operationKey);
  const submission = useSubmittedAttempt(mutation, operationKey);
  const [mode, setMode] = useCombatOperationState(`${operationKey}:mode`, combat.initiative.movementModes[0]?.movementMode ?? combat.initiative.movementMode);
  const [distance, setDistance] = useCombatOperationState(`${operationKey}:distance`, "");
  const [intent, setIntent] = useCombatOperationState(`${operationKey}:intent`, "");
  const selected = combat.initiative.movementModes.find(({ movementMode }) => movementMode === mode) ?? null;
  const modeChoiceStale = Boolean(mode) && selected === null;
  const cost = selected && Number(distance) > 0 ? Math.ceil(Number(distance) / selected.baseMovement) : null;
  return <section className={styles.combatSection} aria-labelledby="player-movement-title">
    <header><div><p className={styles.eyebrow}>MOVEMENT</p><h2 id="player-movement-title">Move on the shared Initiative timeline</h2></div><strong>{cost === null ? "No Roll" : `${cost} Initiative`}</strong></header>
    {combat.initiative.movementModes.length ? <form className={styles.formGrid} onSubmit={(event) => {
      event.preventDefault();
      submission.submit("Movement declaration", {
        movementMode: mode,
        distanceFeet: Number(distance),
        intent,
      }, (attempt, idempotencyKey) => declarePlayerMovement(characterId, combat.context.encounterId, {
        ...attempt,
        idempotencyKey,
      }), "Movement locked and committed to Initiative.");
    }}>
      <label className="st-field"><span>Movement mode</span><select className="st-control" value={mode} onChange={(event) => setMode(event.target.value)}>{combat.initiative.movementModes.map((entry) => <option key={entry.movementMode} value={entry.movementMode}>{entry.movementMode} · {entry.baseMovement} ft per Initiative</option>)}</select></label>
      <label className="st-field"><span>Distance in feet</span><input className="st-control" required type="number" min="0.000001" step="any" value={distance} onChange={(event) => setDistance(event.target.value)} /></label>
      <label className={`${styles.wideField} st-field`}><span>Movement intent</span><input className="st-control" required maxLength={500} value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="Where and why you are moving" /></label>
      <p className={modeChoiceStale ? styles.ruling : styles.notice}>{modeChoiceStale ? "The selected Movement mode is no longer available in live Character state. Choose a current mode." : cost === null ? "Enter a distance to calculate its Initiative Cost." : `${distance} ft costs ${cost} Initiative. This action has no Roll.`}</p>
      <button className="st-button is-primary" type="submit" disabled={mutation.busy || submission.attempt !== null || !combat.initiative.canDeclareAction || cost === null || !intent.trim()}>Declare movement</button>
    </form> : <p className={styles.ruling}>No authoritative Movement mode is available for this Character.</p>}
    <ResultMessage message={mutation.message} />
    <AttemptRecovery submission={submission} mutation={mutation} />
  </section>;
}

function WeaponActions({ characterId, combat }: { characterId: number; combat: PlayerCombatConsoleData }) {
  const operationKey = "weapon-attack";
  const mutation = useCombatMutation(operationKey);
  const submission = useSubmittedAttempt(mutation, operationKey);
  const weapons = combat.declarations.participants.find(({ characterId: id }) => id === characterId)?.weapons.filter(({ firingModes }) => firingModes.length === 0) ?? [];
  const [weaponKey, setWeaponKey] = useCombatOperationState(`${operationKey}:weapon`, weapons[0]?.ownershipKey ?? "");
  const [target, setTarget] = useCombatOperationState(`${operationKey}:target`, String(combat.targets[0]?.participantId ?? ""));
  const [calledShot, setCalledShot] = useCombatOperationState(`${operationKey}:called-shot`, "");
  const selected = weapons.find(({ ownershipKey }) => ownershipKey === weaponKey) ?? null;
  const selectedTarget = combat.targets.find(({ participantId }) => participantId === Number(target)) ?? null;
  const sourceChoiceStale = Boolean(weaponKey) && selected === null;
  const targetChoiceStale = Boolean(target) && selectedTarget === null;
  const selectedGovernance = selected
    ? combat.weaponGovernance.weapons.find(({ itemId }) => itemId === selected.itemId)?.modes.find(({ firingModeId }) => firingModeId === null)?.resolution ?? null
    : null;
  const governanceResolved = isResolvedWeaponGovernance(selectedGovernance);
  const canonicalPath = canonicalWeaponPath(selectedGovernance);
  return <section className={styles.combatSection} aria-labelledby="weapon-actions-title"><header><div><p className={styles.eyebrow}>WEAPON ACTION</p><h2 id="weapon-actions-title">Melee and authored weapons</h2></div></header>
    {weapons.length && combat.targets.length ? <form className={styles.formGrid} onSubmit={(event) => { event.preventDefault(); submission.submit("Weapon declaration", { targetParticipantId: Number(target), itemId: selected!.itemId, instanceId: selected!.instanceId, calledShotRequestId: calledShot ? Number(calledShot) : null }, (attempt, idempotencyKey) => declarePlayerWeaponAttack(characterId, combat.context.encounterId, { ...attempt, idempotencyKey }), "Weapon action locked and committed."); }}>
      <label className="st-field"><span>Weapon</span><select className="st-control" value={weaponKey} onChange={(event) => { setWeaponKey(event.target.value); setCalledShot(""); }}>{weapons.map((weapon) => <option value={weapon.ownershipKey} key={weapon.ownershipKey}>{weapon.name} · {weapon.initiativeCost ?? "G.O.D. ruling"} Initiative</option>)}</select></label>
      <label className="st-field"><span>Target</span><select className="st-control" value={target} onChange={(event) => { setTarget(event.target.value); setCalledShot(""); }}>{combat.targets.map((entry) => <option value={entry.participantId} key={entry.participantId}>{entry.name}</option>)}</select></label>
      <label className="st-field"><span>Approved Called Shot</span><select className="st-control" value={calledShot} onChange={(event) => setCalledShot(event.target.value)}><option value="">None</option>{combat.rulingRequests.filter((request) => request.requestType === "called-shot" && request.status === "approved" && request.sourceRef === selected?.ownershipKey && request.sourceInstanceId === selected?.instanceId && request.targetParticipantId === Number(target)).map((request) => <option key={request.id} value={request.id}>{String(request.frozenRequest.objective ?? request.intent)} · penalty {String(request.ruling.penalty)}</option>)}</select></label>
      {selectedGovernance ? <div className={governanceResolved ? styles.lockedReview : styles.ruling}>
        <strong>{governanceResolved ? `Roll over ${selectedGovernance.originalTarget}%` : "G.O.D. ruling required"}</strong>
        {canonicalPath ? <span>Global canonical path: {canonicalPath}</span> : null}
        <span>{governanceResolved ? `Character fallback: ${governingLabel(selectedGovernance.source)}` : selectedGovernance.explanation}</span>
      </div> : <p className={styles.ruling}>This weapon has no canonical governance projection. Ask the G.O.D. to review its Equipment mapping.</p>}
      {sourceChoiceStale || targetChoiceStale ? <p className={styles.ruling}>A selected weapon or target changed in live Encounter state. Choose current values before declaring.</p> : null}
      <button className="st-button is-primary" type="submit" disabled={mutation.busy || submission.attempt !== null || !combat.initiative.canDeclareAction || !selected || !selectedTarget || selected.initiativeCost === null || !governanceResolved}>Declare attack</button>
    </form> : <p>No currently wielded non-firearm weapon and valid target are available.</p>}
    <ResultMessage message={mutation.message} />
    <AttemptRecovery submission={submission} mutation={mutation} />
  </section>;
}

function FirearmPanel({ characterId, combat, selectedDeclarationId = null, historyOnly = false }: { characterId: number; combat: PlayerCombatConsoleData; selectedDeclarationId?: number | null; historyOnly?: boolean }) {
  const operationKey = "firearm";
  const mutation = useCombatMutation(operationKey);
  const submission = useSubmittedAttempt(mutation, operationKey);
  const [target, setTarget] = useCombatOperationState(`${operationKey}:target`, String(combat.targets[0]?.participantId ?? ""));
  const [aim, setAim] = useCombatOperationState(`${operationKey}:aim`, "0");
  const [duration, setDuration] = useCombatOperationState(`${operationKey}:duration`, "1");
  const [entered, setEntered] = useCombatOperationState(`${operationKey}:entered`, "");
  const [preparationRounds, setPreparationRounds] = useCombatOperationState(`${operationKey}:rounds`, "");
  const [replaceLoad, setReplaceLoad] = useCombatOperationState(`${operationKey}:replace`, false);
  const [partialLoadDisposition, setPartialLoadDisposition] = useCombatOperationState<"none" | "retain" | "discard">(`${operationKey}:disposition`, "none");
  const [discardReason, setDiscardReason] = useCombatOperationState(`${operationKey}:discard-reason`, "");
  const approvedCalledShots = combat.rulingRequests.filter(({ requestType, status }) => requestType === "called-shot" && status === "approved");
  const selectedTargetAvailable = combat.targets.some(({ participantId }) => participantId === Number(target));
  const visibleAttacks = selectedDeclarationId === null
    ? combat.firearmAttacks.attacks
    : combat.firearmAttacks.attacks.filter(({ triggerDeclarationId }) => triggerDeclarationId === selectedDeclarationId);
  return <section className={styles.combatSection} aria-labelledby="firearms-title"><header><div><p className={styles.eyebrow}>FIREARM READINESS</p><h2 id="firearms-title">Readiness, Aim and attacks</h2></div></header>
    {!historyOnly && combat.firearms.legacyStacks.length ? <p className={styles.ruling}>Legacy aggregate firearms require G.O.D. initialization and are not converted here.</p> : null}
    {!historyOnly ? combat.firearms.firearms.map((firearm) => {
      const state = firearm.state;
      const selectedMode = state ? firearm.modes.find(({ id }) => id === state.selectedFiringModeId) ?? null : null;
      const modeGovernance = combat.weaponGovernance.weapons.find(({ itemId }) => itemId === firearm.itemId)?.modes.find(({ firingModeId }) => firingModeId === state?.selectedFiringModeId)?.resolution ?? null;
      const firearmGovernanceResolved = isResolvedWeaponGovernance(modeGovernance);
      const firearmCanonicalPath = canonicalWeaponPath(modeGovernance);
      const prep = (operation: "draw" | "ready" | "load" | "reload" | "unload" | "cycle" | "recover-recoil") => {
        const usesRounds = operation === "load" || operation === "reload";
        const usesDisposition = operation === "unload" || (operation === "reload" && replaceLoad);
        return submission.submit(`${titleCase(operation)} firearm`, {
          itemInstanceId: firearm.itemInstanceId,
          operation,
          requestedRounds: usesRounds ? Number(preparationRounds) : undefined,
          replaceCurrentLoad: operation === "reload" && replaceLoad,
          partialLoadDisposition: usesDisposition ? partialLoadDisposition : "none",
          discardReason: usesDisposition && partialLoadDisposition === "discard" ? discardReason : undefined,
        }, (attempt, idempotencyKey) => startPlayerFirearmPreparation(characterId, combat.context.encounterId, {
          ...attempt,
          idempotencyKey,
        }), `${titleCase(operation)} committed.`);
      };
      return <article className={styles.combatCard} key={firearm.itemInstanceId}>
        <header><div><span>READIED FIREARM</span><h3>{firearm.itemName}</h3></div><strong>{titleCase(firearm.readiness.status)}</strong></header>
        {state ? <p>{state.loadedRounds} / {state.capacityRounds ?? "?"} rounds · {state.loadedAmmunitionName ?? "unloaded"} · {selectedMode?.name ?? "Unknown mode"}</p> : <p className={styles.ruling}>Runtime state is not initialized. Ask the G.O.D. to review this exact copy.</p>}
        {modeGovernance ? <p className={firearmGovernanceResolved ? styles.notice : styles.ruling}>{firearmGovernanceResolved ? `Governing source: ${governingLabel(modeGovernance.source)}${firearmCanonicalPath ? ` · canonical ${firearmCanonicalPath}` : ""}` : modeGovernance.explanation}</p> : null}
        {firearm.readiness.blockers.length ? <ul className={styles.blockers}>{firearm.readiness.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}</ul> : null}
        {state && !firearm.preparation ? <div className={styles.actionRow}>
          {firearm.equipmentState !== "wielded" ? <button className="st-button" disabled={mutation.busy || submission.attempt !== null} onClick={() => prep("draw")}>Draw</button> : null}
          {firearm.equipmentState === "wielded" && !state.readied ? <button className="st-button" disabled={mutation.busy || submission.attempt !== null} onClick={() => prep("ready")}>Ready</button> : null}
          {state.requiresCycling ? <button className="st-button" disabled={mutation.busy || submission.attempt !== null} onClick={() => prep("cycle")}>Cycle</button> : null}
          {state.requiresRecoilRecovery ? <button className="st-button" disabled={mutation.busy || submission.attempt !== null} onClick={() => prep("recover-recoil")}>Recover recoil</button> : null}
        </div> : null}
        {state && !firearm.preparation ? <div className={styles.formGrid}>
          <label className="st-field"><span>Rounds to load</span><input className="st-control" type="number" min={1} max={state.capacityRounds ?? undefined} value={preparationRounds} onChange={(event) => setPreparationRounds(event.target.value)} /></label>
          {state.loadedRounds > 0 ? <><label className="st-field"><span>Partial-load handling</span><select className="st-control" value={partialLoadDisposition} onChange={(event) => setPartialLoadDisposition(event.target.value as typeof partialLoadDisposition)}><option value="none">Choose for unload/replacement</option><option value="retain">Return rounds to inventory</option><option value="discard">Discard rounds</option></select></label><label className={`st-field ${styles.checkboxField}`}><input type="checkbox" checked={replaceLoad} onChange={(event) => setReplaceLoad(event.target.checked)} /><span>Replace current load</span></label>{partialLoadDisposition === "discard" ? <label className="st-field"><span>Discard reason</span><input className="st-control" required maxLength={2000} value={discardReason} onChange={(event) => setDiscardReason(event.target.value)} /></label> : null}</> : null}
          {state.loadedRounds === 0
            ? <button className="st-button" disabled={mutation.busy || submission.attempt !== null || !preparationRounds} onClick={() => prep("load")}>Load</button>
            : <><button className="st-button" disabled={mutation.busy || submission.attempt !== null || !preparationRounds || (replaceLoad && partialLoadDisposition === "none") || (replaceLoad && partialLoadDisposition === "discard" && !discardReason.trim())} onClick={() => prep("reload")}>{replaceLoad ? "Replace load" : "Add rounds"}</button><button className="st-button" disabled={mutation.busy || submission.attempt !== null || partialLoadDisposition === "none" || (partialLoadDisposition === "discard" && !discardReason.trim())} onClick={() => prep("unload")}>Unload</button></>}
        </div> : null}
        {state && firearm.modes.length > 1 && !firearm.preparation ? <form className={styles.compactAction} onSubmit={(event) => {
          event.preventDefault();
          const modeId = Number(new FormData(event.currentTarget).get("mode"));
          submission.submit("Change firearm mode", { itemInstanceId: firearm.itemInstanceId, operation: "change-mode" as const, targetFiringModeId: modeId }, (attempt, idempotencyKey) => startPlayerFirearmPreparation(characterId, combat.context.encounterId, { ...attempt, idempotencyKey }), "Firing Mode change committed.");
        }}><label className="st-field"><span>Firing Mode</span><select className="st-control" name="mode" defaultValue={state.selectedFiringModeId}>{firearm.modes.flatMap((mode) => mode.id === null ? [] : [<option key={mode.id} value={mode.id}>{mode.name}{mode.mechanicsReviewRequired ? " · review required" : ""}</option>])}</select></label><button className="st-button" type="submit" disabled={mutation.busy || submission.attempt !== null}>Change mode</button></form> : null}
        {state && selectedMode && selectedMode.id !== null && firearm.readiness.status === "ready" && combat.targets.length ? <form className={styles.formGrid} onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const called = Number(form.get("called")) || null;
          submission.submit("Firearm declaration", { targetParticipantId: Number(target), itemInstanceId: firearm.itemInstanceId, firingModeId: selectedMode.id!, aimInitiative: Number(aim), firingDurationInitiative: Number(duration), calledShotRequestId: called }, (attempt, idempotencyKey) => declarePlayerFirearmAttack(characterId, combat.context.encounterId, { ...attempt, idempotencyKey }), "Firearm attack locked and committed.");
        }}>
          <label className="st-field"><span>Target</span><select className="st-control" value={target} onChange={(event) => setTarget(event.target.value)}>{combat.targets.map((entry) => <option key={entry.participantId} value={entry.participantId}>{entry.name}</option>)}</select></label>
          <label className="st-field"><span>Aim Initiative</span><input className="st-control" type="number" min={0} value={aim} onChange={(event) => setAim(event.target.value)} /></label>
          <label className="st-field"><span>Firing duration</span><input className="st-control" type="number" min={1} value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
          <label className="st-field"><span>Approved Called Shot</span><select className="st-control" name="called" defaultValue=""><option value="">None</option>{approvedCalledShots.filter((request) => request.sourceInstanceId === firearm.itemInstanceId && request.targetParticipantId === Number(target)).map((request) => <option key={request.id} value={request.id}>{String(request.frozenRequest.objective ?? request.intent)} · penalty {String(request.ruling.penalty)}</option>)}</select></label>
          <p className={styles.ruling}>Changing the exact firearm, target, Profile, firing mode, or Called Shot objective requires a new declaration. Spent Aim remains spent.</p>
          {!selectedTargetAvailable ? <p className={styles.ruling}>The selected target is no longer in the live Encounter. Choose a current target before declaring.</p> : null}
          <button className="st-button is-primary" type="submit" disabled={mutation.busy || submission.attempt !== null || !combat.initiative.canDeclareAction || !firearmGovernanceResolved || !selectedTargetAvailable}>Declare attack</button>
        </form> : null}
      </article>;
    }) : null}
    {visibleAttacks.map((attack) => <article className={styles.lockedReview} key={attack.id}>
      <strong>{attack.itemName} at {attack.targetName}</strong>
      <span>{titleCase(attack.effectiveStatus)} · target {attack.finalTarget}% · {attack.roundsDeclared} round{attack.roundsDeclared === 1 ? "" : "s"}{attack.aimInitiative ? ` · Aim ${attack.aimInitiative} (-${attack.aimTargetOffset})` : ""}{attack.calledShotDeclared ? ` · Called Shot ${attack.calledShotObjective} (${attack.calledShotPenalty})` : ""}</span>
      {attack.effectiveStatus === "trigger-ready" ? <button className="st-button is-primary" disabled={mutation.busy} onClick={() => mutation.run(() => commitPlayerFirearmTrigger(characterId, combat.context.encounterId, attack.id), "Trigger pull committed.")}>Pull trigger</button> : null}
      {attack.status === "committed" && attack.triggerTimingStatus === "completed" && attack.responderOpportunities.every(({ status }) => status !== "pending") ? <div className={styles.actionRow}>{attack.attackRollId === null ? <input className="st-control" aria-label="Physical firearm Roll" inputMode="numeric" pattern="[0-9]{1,3}" placeholder="01-99 or 00" value={entered} onChange={(event) => setEntered(event.target.value)} /> : <span>The attack Roll is recorded; response Rolls must finish before ammunition and outcomes are applied.</span>}<button className="st-button is-primary" disabled={mutation.busy} onClick={() => mutation.run(() => firePlayerFirearmAttack(characterId, combat.context.encounterId, attack.id, { method: "random" }), attack.attackRollId === null ? "Firearm Roll recorded." : "Firing completed from the recorded Roll.")}>{attack.attackRollId === null ? "Website Roll" : "Finish firing"}</button>{attack.attackRollId === null ? <button className="st-button is-secondary" disabled={mutation.busy || !entered.trim()} onClick={() => mutation.run(() => firePlayerFirearmAttack(characterId, combat.context.encounterId, attack.id, { method: "entered", enteredTotal: parsePhysicalPercentileInput(entered) }), "Physical firearm Roll recorded.")}>Enter physical Roll</button> : null}</div> : null}
      {attack.attackRoll ? <span>Roll {attack.attackRoll.resolution.resultTotal} · {formatAttackPercentileResult(attack.attackRoll.resolution)}</span> : null}
      {attack.bulletAllocation ? <span>{attack.bulletAllocation.survivingBulletHits} bullets survive defense · {attack.bulletAllocation.bulletsCancelled} cancelled · {attack.bulletAllocation.overflowDamage} overflow damage</span> : null}
      {attack.bullets.map((bullet) => <small key={bullet.id}>Bullet {bullet.bulletIndex}: {titleCase(bullet.status)} · {bullet.hitLocationName || "location pending"} · proposed {bullet.proposedNetDamage ?? "ruling"} damage</small>)}
      {attack.effectPlanStatus ? <span>Consequences: {titleCase(attack.effectPlanStatus)}</span> : null}
      {attack.rulingReasons.map((reason) => <small className={styles.ruling} key={reason}>{reason}</small>)}
    </article>)}
    {!visibleAttacks.length ? <p className={styles.boundaryNotice}>No firearm attack is attached to this exchange.</p> : null}
    {!historyOnly ? <><ResultMessage message={mutation.message} /><AttemptRecovery submission={submission} mutation={mutation} /></> : null}
  </section>;
}

function DeclarationAndRollPanel({ characterId, combat, selectedDeclarationId = null }: { characterId: number; combat: PlayerCombatConsoleData; selectedDeclarationId?: number | null }) {
  const mutation = useCombatMutation("locked-rolls");
  const [entered, setEntered] = useCombatOperationState("locked-rolls:entered", "");
  const declarations = combat.declarations.declarations.filter(({ id, actorCharacterId }) => (
    selectedDeclarationId === null ? actorCharacterId === characterId : id === selectedDeclarationId
  ));
  const reactions = combat.defenses.reactions.filter(({ declarationId, responderCharacterId }) => (
    responderCharacterId === characterId && (selectedDeclarationId === null || declarationId === selectedDeclarationId)
  ));
  return <section className={styles.combatSection} aria-labelledby="locked-actions-title"><header><div><p className={styles.eyebrow}>LOCKED WORK</p><h2 id="locked-actions-title">Declarations, Rolls and results</h2></div></header>
    {!declarations.length && !reactions.length ? <p>No combat declarations have been recorded for this Character.</p> : null}
    {declarations.map((declaration) => <article className={styles.lockedReview} key={declaration.id}><strong>{declaration.lockedSnapshot?.label ?? declaration.draft.label}</strong><span>{titleCase(declaration.status)} · {declaration.lockedSnapshot?.initiativeCost ?? declaration.draft.initiativeCost} Initiative</span>{declaration.lockedSnapshot?.governing ? <span>{governingLabel(declaration.lockedSnapshot.governing.source)}</span> : null}{declaration.timing ? <span>Started at {declaration.timing.startInitiative}; completes at {declaration.timing.expectedCompletionInitiative}. {declaration.timing.remainingInitiativeCost} Initiative remains.</span> : null}<small className={styles.ruling}>{declaration.rollState.message}</small>{declaration.status === "rolling-ready" && declaration.rollState.attackRollId === null && declaration.lockedSnapshot?.authoredSource?.resolutionMode !== "automatic-no-roll" && !declaration.draft.actionKind.startsWith("firearm-") ? <div className={styles.actionRow}><input className="st-control" aria-label="Physical attack Roll" inputMode="numeric" pattern="[0-9]{1,3}" placeholder="01-99 or 00" value={entered} onChange={(event) => setEntered(event.target.value)} /><button className="st-button is-primary" disabled={mutation.busy} onClick={() => mutation.run(() => rollPlayerDeclaredAttack(characterId, combat.context.encounterId, declaration.id, { method: "random" }), "Attack Roll recorded independently.")}>Website Roll</button><button className="st-button is-secondary" disabled={mutation.busy || !entered.trim()} onClick={() => mutation.run(() => rollPlayerDeclaredAttack(characterId, combat.context.encounterId, declaration.id, { method: "entered", enteredTotal: parsePhysicalPercentileInput(entered) }), "Physical attack Roll recorded independently.")}>Enter physical Roll</button></div> : null}{declaration.rulingReason ? <small className={styles.ruling}>{declaration.rulingReason}</small> : null}</article>)}
    {reactions.map((reaction) => <article className={styles.lockedReview} key={`reaction:${reaction.id}`}><strong>{titleCase(reaction.reactionType)}</strong><span>{titleCase(reaction.status)} · {reaction.committedInitiativeCost} Initiative · {reaction.declaration.source.label}</span>{reaction.rollRequired && reaction.rollId === null && reaction.status === "declared" ? <div className={styles.actionRow}><input className="st-control" aria-label="Physical defense Roll" inputMode="numeric" pattern="[0-9]{1,3}" placeholder="01-99 or 00" value={entered} onChange={(event) => setEntered(event.target.value)} /><button className="st-button is-primary" disabled={mutation.busy} onClick={() => mutation.run(() => rollPlayerDeclaredResponse(characterId, combat.context.encounterId, reaction.id, { method: "random" }), "Defense Roll recorded independently.")}>Roll response</button><button className="st-button is-secondary" disabled={mutation.busy || !entered.trim()} onClick={() => mutation.run(() => rollPlayerDeclaredResponse(characterId, combat.context.encounterId, reaction.id, { method: "entered", enteredTotal: parsePhysicalPercentileInput(entered) }), "Physical defense Roll recorded independently.")}>Enter physical Roll</button></div> : null}{reaction.outcome ? <span>Outcome: {titleCase(reaction.outcome)}</span> : null}{reaction.rulingReason ? <small className={styles.ruling} key={reaction.rulingReason}>{reaction.rulingReason}</small> : null}</article>)}
    <ResultMessage message={mutation.message} />
  </section>;
}

function RulingPanel({ characterId, combat, initialType = "intervention" }: { characterId: number; combat: PlayerCombatConsoleData; initialType?: "manual-action" | "called-shot" | "ally-defense" | "tackle" | "intervention" }) {
  const operationKey = `ruling:${initialType}`;
  const mutation = useCombatMutation(operationKey);
  const submission = useSubmittedAttempt(mutation, operationKey);
  const [type, setType] = useCombatOperationState<"manual-action" | "called-shot" | "ally-defense" | "tackle" | "intervention">(`${operationKey}:type`, initialType);
  const [intent, setIntent] = useCombatOperationState(`${operationKey}:intent`, "");
  const [target, setTarget] = useCombatOperationState(`${operationKey}:target`, String(combat.targets[0]?.participantId ?? ""));
  const [location, setLocation] = useCombatOperationState(`${operationKey}:location`, "");
  const attackSources = combat.declarations.participants.find(({ characterId: id }) => id === characterId)?.weapons ?? [];
  const [weaponSource, setWeaponSource] = useCombatOperationState(`${operationKey}:weapon`, attackSources[0]?.ownershipKey ?? "");
  const selectedSource = attackSources.find(({ ownershipKey }) => ownershipKey === weaponSource) ?? null;
  const selectedTarget = combat.targets.find(({ participantId }) => participantId === Number(target)) ?? null;
  const selectedLocation = selectedTarget?.hitLocations.find(({ result }) => result === Number(location)) ?? null;
  const targetChoiceStale = Boolean(target) && selectedTarget === null;
  return <section className={styles.combatSection} aria-labelledby="ruling-requests-title"><header><div><p className={styles.eyebrow}>G.O.D. RULINGS</p><h2 id="ruling-requests-title">Requests and exceptional intent</h2></div></header>
    <form className={styles.formGrid} onSubmit={(event) => {
      event.preventDefault();
      submission.submit("Combat ruling request", {
        requestType: type,
        targetParticipantId: target ? Number(target) : null,
        sourceKind: type === "called-shot" ? "weapon" : "manual",
        sourceRef: type === "called-shot" ? weaponSource : "player-stated-intent",
        sourceInstanceId: type === "called-shot" ? selectedSource?.instanceId ?? null : null,
        intent,
        objective: type === "called-shot" ? selectedLocation?.name ?? intent : intent,
        locationNumber: type === "called-shot" ? selectedLocation?.result ?? null : null,
        requestedTiming: `Round ${combat.initiative.roundNumber}, Initiative ${combat.initiative.timelineInitiative}`,
      }, (attempt, idempotencyKey) => submitPlayerCombatRulingRequest(characterId, combat.context.encounterId, {
        ...attempt,
        idempotencyKey,
      }), "Ruling request sent.");
    }}>
      <label className="st-field"><span>Request type</span><select className="st-control" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="intervention">General intervention</option><option value="ally-defense">Ally defense</option><option value="tackle">Tackle</option><option value="called-shot">Called Shot</option><option value="manual-action">Manual action</option></select></label>
      <label className="st-field"><span>Intended target</span><select className="st-control" value={target} onChange={(event) => { setTarget(event.target.value); setLocation(""); }}><option value="">No target</option>{combat.targets.map((entry) => <option key={entry.participantId} value={entry.participantId}>{entry.name}</option>)}</select></label>
      {type === "called-shot" ? <><label className="st-field"><span>Attack source</span><select className="st-control" required value={weaponSource} onChange={(event) => setWeaponSource(event.target.value)}>{attackSources.map((entry) => <option key={entry.ownershipKey} value={entry.ownershipKey}>{entry.name}{entry.instanceId ? " · individual item" : ""}</option>)}</select></label><label className="st-field"><span>Target location</span><select className="st-control" required value={location} onChange={(event) => setLocation(event.target.value)}><option value="">Choose location</option>{selectedTarget?.hitLocations.map((entry) => <option key={entry.result} value={entry.result}>{entry.name}</option>)}</select></label></> : null}
      <label className={`${styles.wideField} st-field`}><span>Your intent</span><textarea className="st-control" required maxLength={2000} value={intent} onChange={(event) => setIntent(event.target.value)} /></label>
      {targetChoiceStale ? <p className={styles.ruling}>The selected target is no longer in the live Encounter. Choose a current target or no target before submitting.</p> : null}
      <button className="st-button is-primary" type="submit" disabled={mutation.busy || submission.attempt !== null || targetChoiceStale || !intent.trim() || (type === "called-shot" && (!target || !selectedSource || !selectedLocation))}>{type === "called-shot" ? "Request Called Shot" : "Send request"}</button>
    </form>
    {combat.rulingRequests.map((request) => <article className={styles.lockedReview} key={request.id}><strong>{titleCase(request.requestType)} · {titleCase(request.status)}</strong><span>{request.intent}{request.targetName ? ` · target ${request.targetName}` : ""}</span><small>{request.blockedReason}</small>{request.godResponse ? <span>G.O.D.: {request.godResponse}</span> : null}{rulingSummary(request.ruling) ? <small>Ruling: {rulingSummary(request.ruling)}</small> : null}<div className={styles.actionRow}>{request.status === "clarification-requested" ? <button className="st-button" disabled={mutation.busy} onClick={() => { const answer = window.prompt("Clarification for the G.O.D."); if (answer?.trim()) mutation.run(() => clarifyPlayerCombatRulingRequest(characterId, combat.context.encounterId, request.id, answer), "Clarification sent."); }}>Clarify</button> : null}{["pending", "clarification-requested"].includes(request.status) ? <button className="st-button is-danger" disabled={mutation.busy} onClick={() => mutation.run(() => cancelPlayerCombatRulingRequest(characterId, combat.context.encounterId, request.id, "Cancelled by the requesting Player."), "Request cancelled.")}>Cancel request</button> : null}</div></article>)}
    <ResultMessage message={mutation.message} />
    <AttemptRecovery submission={submission} mutation={mutation} />
  </section>;
}

function EffectPlans({ combat, selectedDeclarationId = null }: { combat: PlayerCombatConsoleData; selectedDeclarationId?: number | null }) {
  const plans = selectedDeclarationId === null ? combat.effects.plans : combat.effects.plans.filter(({ declarationId }) => declarationId === selectedDeclarationId);
  if (!plans.length) return null;
  return <section className={styles.combatSection} aria-labelledby="player-effects-title"><header><div><p className={styles.eyebrow}>RESULTS</p><h2 id="player-effects-title">Consequences</h2></div></header>{plans.map((plan) => <article className={styles.lockedReview} key={plan.id}><strong>{plan.sourceSnapshot.displayName} · {titleCase(plan.status)}</strong><span>{plan.explanation}</span>{plan.governingRollSnapshot ? <span>Roll {plan.governingRollSnapshot.resolution.resultTotal} against {plan.governingRollSnapshot.resolution.finalTarget}: {plan.governingRollSnapshot.resolution.totalSuccesses} success{plan.governingRollSnapshot.resolution.totalSuccesses === 1 ? "" : "es"}</span> : null}{plan.effects.map((effect) => {
    const authored = effect.authoredValue && typeof effect.authoredValue === "object" && !Array.isArray(effect.authoredValue)
      ? effect.authoredValue as Record<string, unknown>
      : null;
    const instruction = authored?.instruction && typeof authored.instruction === "object" && !Array.isArray(authored.instruction)
      ? authored.instruction as Record<string, unknown>
      : null;
    const summary = typeof instruction?.summary === "string" ? instruction.summary : null;
    const calculation = instruction?.calculation && typeof instruction.calculation === "object" && !Array.isArray(instruction.calculation)
      ? instruction.calculation as Record<string, unknown>
      : null;
    const gross = typeof calculation?.grossDamage === "number" ? calculation.grossDamage : null;
    const armor = typeof calculation?.armor === "number" ? calculation.armor : null;
    const soak = typeof calculation?.soak === "number" ? calculation.soak : null;
    const net = typeof calculation?.netDamage === "number" ? calculation.netDamage : null;
    const calculationLine = gross !== null && armor !== null && soak !== null && net !== null
      ? `${gross} gross - ${armor} armor - ${soak} soak = ${net} damage`
      : null;
    const rulingReasons = Array.isArray(calculation?.rulingReasons)
      ? calculation.rulingReasons.filter((reason): reason is string => typeof reason === "string" && Boolean(reason.trim()))
      : [];
    const amount = typeof effect.calculatedValue === "number" ? effect.calculatedValue : null;
    return <details className={styles.resultCalculation} key={effect.id}><summary>{summary ?? `${effect.targetName}: ${titleCase(effect.effectType)}`}</summary>{calculationLine ? <span>{calculationLine}</span> : amount === null ? null : <span>{amount} proposed</span>}{rulingReasons.map((reason) => <small key={reason}>{reason}</small>)}<small>Status: {titleCase(effect.status)}.</small></details>;
  })}</article>)}</section>;
}

type PlayerBattleCommand = "attack" | "cast" | "item" | "ability" | "defend" | "called-shot" | "move-other" | "hold" | "pass";

const PLAYER_BATTLE_COMMANDS: readonly Readonly<{ key: PlayerBattleCommand; label: string }>[] = [
  { key: "attack", label: "Attack" },
  { key: "cast", label: "Cast" },
  { key: "item", label: "Item" },
  { key: "ability", label: "Ability" },
  { key: "defend", label: "Defend" },
  { key: "called-shot", label: "Called Shot" },
  { key: "move-other", label: "Move / Other" },
  { key: "hold", label: "Hold" },
  { key: "pass", label: "Pass" },
];

function spellSourceRef(spell: PlayerTabletopSpell): string {
  if (spell.castSource?.kind === "catalog") return `catalog:${spell.castSource.allocationId}`;
  if (spell.castSource?.kind === "personal") return `personal:${spell.castSource.savedSpellId}`;
  return spell.key;
}

function PlayerSourceCommand({
  command,
  characterId,
  combat,
  items,
  spells,
  abilities,
}: {
  command: "cast" | "item" | "ability";
  characterId: number;
  combat: PlayerCombatConsoleData;
  items: readonly PlayerTabletopOwnedItem[];
  spells: readonly PlayerTabletopSpell[];
  abilities: readonly PlayerTabletopDerivedAbility[];
}) {
  const sources = command === "cast"
    ? spells.map((spell) => ({ key: spell.key, label: spell.name, detail: `${spell.activationLabel} · ${spell.manaCost ?? "unresolved"} Mana`, sourceKind: "spell", sourceRef: spellSourceRef(spell), sourceInstanceId: null, available: spell.available, requiresRuling: spell.requiresGodRuling }))
    : command === "item"
      ? items.filter(({ firearmState, runtimeProfile }) => firearmState === null && runtimeProfile.useMode !== "none").map((item) => ({ key: item.ownershipKey, label: item.name, detail: `${item.equipmentState} · ${item.runtimeProfile.activationLabel}`, sourceKind: "item", sourceRef: item.ownershipKey, sourceInstanceId: item.instanceId, available: item.canUseSafely || item.requiresGodRuling, requiresRuling: item.requiresGodRuling }))
      : abilities.map((ability) => ({ key: String(ability.id), label: ability.name, detail: `${ability.activation} · ${ability.availability}${ability.costs.length ? ` · ${ability.costs.join(", ")}` : ""}`, sourceKind: "derived-ability", sourceRef: `derived-ability:${ability.id}`, sourceInstanceId: null, available: ability.availability === "Available", requiresRuling: ability.requiresGodRuling }));
  return <section className={styles.combatSection} aria-labelledby={`player-${command}-title`}>
    <header><div><p className={styles.eyebrow}>{command.toUpperCase()}</p><h2 id={`player-${command}-title`}>Choose an actual Character source</h2></div></header>
    <p className={styles.boundaryNotice}>Choose a source that is available to your Character. If it needs a ruling, you can send your intent to G.O.D.</p>
    {sources.length ? <div className={styles.commandSources}>{sources.map((source) => <article className={styles.combatCard} key={source.key}>
      <header><div><h3>{source.label}</h3><small>{source.detail}</small></div></header>
      {!source.available ? <small>This source is not available right now.</small> : source.requiresRuling ? <PlayerCombatIntentButton characterId={characterId} combat={combat} sourceKind={source.sourceKind} sourceRef={source.sourceRef} sourceInstanceId={source.sourceInstanceId} label={source.label} /> : <small>This source cannot be used from this combat screen yet.</small>}
    </article>)}</div> : <p>No applicable {command} sources are currently available to this Character.</p>}
  </section>;
}

function playerActivityEntries(
  combat: PlayerCombatConsoleData,
  rows: PlayerCombatConsoleData["declarations"]["declarations"] = combat.declarations.declarations,
): BattleActivityEntry[] {
  return [...rows].reverse().slice(0, 10).map((declaration) => {
    const targetIds = declaration.lockedSnapshot?.targetCharacterIds ?? declaration.draft.targetCharacterIds;
    const targets = targetIds.map((id) => combat.declarations.participants.find(({ characterId }) => characterId === id)?.name).filter(Boolean);
    return {
      id: String(declaration.id),
      eyebrow: declaration.actorName,
      title: declaration.lockedSnapshot?.label ?? declaration.draft.label,
      detail: `${targets.length ? `Target: ${targets.join(", ")}. ` : ""}${declaration.timing ? `${declaration.timing.remainingInitiativeCost} Initiative remains; completes at ${declaration.timing.expectedCompletionInitiative}.` : "Not committed to Initiative."}`,
      status: actionStatusLabel(declaration.status),
      attention: ["resolved", "cancelled", "abandoned"].includes(declaration.status) ? null : declaration.rollState.message,
    };
  });
}

export function PlayerCombatConsole({
  characterId,
  characterName,
  campaignName,
  encounterTitle,
  returnHref,
  combat,
  items,
  spells,
  abilities,
  resources,
  conditionLabels,
  equipmentLabels,
}: {
  characterId: number;
  characterName: string;
  campaignName: string;
  encounterTitle: string;
  returnHref: string;
  combat: PlayerCombatConsoleData;
  items: readonly PlayerTabletopOwnedItem[];
  spells: readonly PlayerTabletopSpell[];
  abilities: readonly PlayerTabletopDerivedAbility[];
  resources: Readonly<{ health: string; mana: string; relevantItems: number }>;
  conditionLabels: readonly string[];
  equipmentLabels: readonly string[];
}) {
  const [command, setCommand] = useState<PlayerBattleCommand>("attack");
  const pendingDeclarations = combat.declarations.declarations.filter(({ status }) => !["resolved", "cancelled", "abandoned"].includes(status));
  const completedDeclarations = combat.declarations.declarations.filter(({ status }) => ["resolved", "cancelled", "abandoned"].includes(status));
  const preferredExchange = pendingDeclarations.find((declaration) => (
    declaration.actorCharacterId === characterId
    || declaration.opportunities.some(({ responderCharacterId }) => responderCharacterId === characterId)
  )) ?? pendingDeclarations[0] ?? null;
  const [requestedExchangeId, setRequestedExchangeId] = useState<number | null>(preferredExchange?.id ?? null);
  const selectedExchange = pendingDeclarations.find(({ id }) => id === requestedExchangeId) ?? preferredExchange;
  const responseCount = combat.declarations.declarations.reduce((total, declaration) => total + declaration.opportunities.filter(({ responderCharacterId, status }) => responderCharacterId === characterId && status === "pending").length, 0);
  const self = combat.declarations.participants.find(({ characterId: id }) => id === characterId) ?? null;
  const weaponAvailable = Boolean(self?.weapons.length || combat.firearms.firearms.length);
  const castFlowAvailable = spells.some(({ available, requiresGodRuling }) => available && requiresGodRuling);
  const itemFlowAvailable = items.some(({ firearmState, runtimeProfile, requiresGodRuling }) => firearmState === null && runtimeProfile.useMode !== "none" && requiresGodRuling);
  const abilityFlowAvailable = abilities.some(({ availability, requiresGodRuling }) => availability === "Available" && requiresGodRuling);
  const commands: readonly BattleCommandEntry<PlayerBattleCommand>[] = PLAYER_BATTLE_COMMANDS.map((entry) => {
    const availability = entry.key === "attack" || entry.key === "called-shot"
      ? weaponAvailable && combat.targets.length > 0
      : entry.key === "cast"
        ? castFlowAvailable
        : entry.key === "item"
          ? itemFlowAvailable
          : entry.key === "ability"
            ? abilityFlowAvailable
            : entry.key === "defend"
              ? responseCount > 0
              : entry.key === "move-other"
                ? combat.initiative.movementModes.length > 0
                : combat.initiative.canDeclareAction;
    return {
      ...entry,
      badge: entry.key === "defend" ? responseCount : undefined,
      disabled: !availability,
      disabledReason: entry.key === "defend"
        ? "No eligible incoming response is open."
        : entry.key === "cast" || entry.key === "item" || entry.key === "ability"
          ? "No actual source has either a supported combat executor or a genuinely unresolved ruling."
          : "This command has no currently available source or legal Initiative opportunity.",
    };
  });
  const rosterEntries: BattleRosterEntry[] = [
    {
      id: characterId,
      eyebrow: "Your Character",
      name: characterName,
      detail: campaignName,
      initiative: String(combat.initiative.currentInitiative),
      status: titleCase(combat.initiative.participationStatus),
      attention: responseCount ? "Choose Defense" : combat.initiative.canDeclareAction ? "Ready to act" : null,
      controllable: true,
    },
    ...combat.targets.map((target) => ({
      id: target.participantId,
      eyebrow: "Visible target",
      name: target.name,
      detail: "Visible Encounter summary",
      initiative: String(target.currentInitiative),
      status: titleCase(target.participationStatus),
      controllable: false,
    })),
  ];
  const attention = responseCount
    ? `${responseCount} response choice${responseCount === 1 ? "" : "s"} need attention.`
    : combat.initiative.canDeclareAction
      ? "Your normal Initiative opportunity is ready."
      : combat.initiative.blockers[0] ?? "Waiting for the next legal combat step.";
  const stageTitle = command === "defend"
    ? "Choose Defense"
    : command === "hold" || command === "pass"
      ? `${titleCase(command)} Initiative`
      : command === "called-shot"
        ? "Request a Called Shot ruling"
        : command === "move-other"
          ? "Move or state other intent"
          : `Choose ${titleCase(command)}`;

  return <CombatOperationStateProvider scope={`player-battle:${combat.context.encounterId}:${characterId}`}><BattleShell labelledBy="player-battle-title">
    <BattleHeader
      titleId="player-battle-title"
      eyebrow="REALMS / ACTIVE ENCOUNTER"
      title={encounterTitle}
      summary={attention}
      metrics={[
        { label: "Round", value: combat.initiative.roundNumber, detail: `Step ${combat.initiative.stepNumber}` },
        { label: "Initiative", value: combat.initiative.currentInitiative, detail: `${combat.initiative.normalTotalInitiative} normal` },
        { label: "Health", value: resources.health },
        { label: "Mana", value: resources.mana },
      ]}
      actions={<><TabletopLiveRefresh mode="player" characterId={characterId} scope="console" /><Link className="st-button is-secondary" href={returnHref}>Tabletop Reference</Link><Link className="st-button" href={`/realms/characters/${characterId}`}>Character Sheet</Link></>}
    />
    <BattleGrid>
      <BattleRoster entries={rosterEntries} selectedId={characterId} />
      <BattleMainColumn>
        <BattleActor
          eyebrow="Your combatant"
          name={characterName}
          detail={campaignName}
          status={responseCount ? "Defense required" : combat.initiative.canDeclareAction ? "Ready to act" : "Waiting"}
          metrics={[
            { label: "Health", value: resources.health },
            { label: "Mana", value: resources.mana },
            { label: "Initiative", value: combat.initiative.currentInitiative, detail: `${combat.initiative.deferredInitiativeCost} deferred` },
            { label: "Equipment", value: equipmentLabels.length || "—", detail: `${resources.relevantItems} owned Items` },
          ]}
        >
          {equipmentLabels.slice(0, 4).map((label) => <span key={label}>{label}</span>)}
          {conditionLabels.slice(0, 4).map((label) => <small key={label}>{label}</small>)}
          {!conditionLabels.length ? <small>No active Conditions</small> : null}
        </BattleActor>
        <BattleCommands commands={commands} selected={command} onSelect={setCommand} />
        <BattleStage eyebrow={command.replaceAll("-", " ").toUpperCase()} title={stageTitle} detail={responseCount ? `Choose a response for ${responseCount} incoming action${responseCount === 1 ? "" : "s"}.` : combat.initiative.canDeclareAction ? "Choose an action for your current Initiative opportunity." : "Waiting for the next combat step."}>
          {selectedExchange ? <aside className={`${styles.lockedReview} ${styles.selectedAction}`}><strong>{selectedExchange.actorName} — {selectedExchange.lockedSnapshot?.label ?? selectedExchange.draft.label}</strong><span>{selectedExchange.rollState.message}</span><details><summary>Action details</summary><small>Combat record #{selectedExchange.id} · {actionStatusLabel(selectedExchange.status)}</small></details></aside> : <p className={styles.boundaryNotice}>No action is waiting for a response, Roll, ruling, or consequence.</p>}
          {selectedExchange ? <ResponsePanel characterId={characterId} combat={combat} selectedDeclarationId={selectedExchange.id} /> : null}
          {command === "attack" ? <><WeaponActions characterId={characterId} combat={combat} /><FirearmPanel characterId={characterId} combat={combat} selectedDeclarationId={selectedExchange?.id ?? -1} /></> : null}
          {command === "cast" || command === "item" || command === "ability" ? <PlayerSourceCommand command={command} characterId={characterId} combat={combat} items={items} spells={spells} abilities={abilities} /> : null}
          {command === "defend" && responseCount === 0 ? <p className={styles.boundaryNotice}>No eligible incoming response is open. Defense choices appear only when the authoritative timeline creates one.</p> : null}
          {command === "called-shot" ? <RulingPanel characterId={characterId} combat={combat} initialType="called-shot" /> : null}
          {command === "move-other" ? <><MovementPanel characterId={characterId} combat={combat} /><RulingPanel characterId={characterId} combat={combat} initialType="manual-action" /></> : null}
          {command === "hold" || command === "pass" ? <InitiativePanel characterId={characterId} combat={combat} disposition={command} /> : null}
          {selectedExchange ? <><DeclarationAndRollPanel characterId={characterId} combat={combat} selectedDeclarationId={selectedExchange.id} /><EffectPlans combat={combat} selectedDeclarationId={selectedExchange.id} /></> : null}
        </BattleStage>
      </BattleMainColumn>
      <BattleActivity entries={playerActivityEntries(combat, pendingDeclarations)} title="Pending exchanges" selectedId={selectedExchange ? String(selectedExchange.id) : null} onSelect={(id) => setRequestedExchangeId(Number(id))} />
    </BattleGrid>
    {completedDeclarations.length ? <BattleSecondary summary={`Completed combat history · ${completedDeclarations.length}`}><BattleActivity entries={playerActivityEntries(combat, completedDeclarations)} title="Completed exchanges" /></BattleSecondary> : null}
    <BattleSecondary summary="All readable declarations, Rolls, and consequences"><DeclarationAndRollPanel characterId={characterId} combat={combat} /><EffectPlans combat={combat} /><FirearmPanel characterId={characterId} combat={combat} historyOnly /></BattleSecondary>
  </BattleShell></CombatOperationStateProvider>;
}
