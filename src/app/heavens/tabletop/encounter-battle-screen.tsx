"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  BattleActivity,
  BattleActor,
  BattleCommands,
  BattleGrid,
  BattleGuide,
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
import { CombatOperationStateProvider } from "@/components/tabletop/combat-operation-state";
import { CombatRecoveryCard } from "@/components/tabletop/combat-recovery-card";
import type { InitiativeTrackerReadModel } from "@/features/tabletop-operations/initiative-tracker";
import type { CombatAidEncounterView, CombatAidParticipant } from "@/features/tabletop-operations/combat-aid-service";
import type { ActionDeclarationWorkspaceView } from "@/features/tabletop-operations/action-declaration-service";
import type { DefenseInterventionWorkspaceView } from "@/features/tabletop-operations/defense-intervention-service";
import type { ActionEffectWorkspaceView } from "@/features/tabletop-operations/action-effect-plan-service";
import type { FirearmWorkspaceView } from "@/features/tabletop-operations/firearm-readiness-service";
import type { FirearmAttackWorkspaceView } from "@/features/tabletop-operations/firearm-attack-service";
import type { PlayerCombatRulingRequestView } from "@/features/tabletop-operations/player-combat-ruling-service";
import type { RollWorkspaceView } from "@/features/tabletop-operations/roll-runtime-service";
import { resolveEncounterBattleParticipantId } from "@/features/tabletop-operations/encounter-battle-selection";
import { TabletopLiveRefresh } from "@/features/tabletop-operations/tabletop-live-refresh";

import {
  ActionDeclarationWorkspace,
  type BattleDeclarationPreset,
  type BattleDeclarationSourceChoice,
} from "./action-declaration-workspace";
import { ActionEffectPlanWorkspace } from "./action-effect-plan-workspace";
import { CombatAidWorkspace } from "./combat-aid-workspace";
import { DefenseInterventionWorkspace } from "./defense-intervention-workspace";
import { FirearmAttackWorkspace } from "./firearm-attack-workspace";
import { FirearmReadinessWorkspace } from "./firearm-readiness-workspace";
import { InitiativeTracker } from "./initiative-tracker";
import { PlayerCombatRulingWorkspace } from "./player-combat-ruling-workspace";
import {
  advanceEncounterInitiativeRound,
  advanceEncounterInitiativeTimeline,
  holdEncounterInitiative,
  passEncounterInitiative,
  recoverClosedEncounterInitiative,
} from "./initiative-actions";

type BattleCommand = BattleDeclarationPreset["command"] | "defend" | "hold" | "pass";

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function actionStatusLabel(status: string): string {
  if (["committed", "rolling-ready", "rolling"].includes(status)) return "In progress";
  if (status === "awaiting-god-ruling") return "Needs G.O.D. ruling";
  return titleCase(status);
}

function participantDetail(participant: CombatAidParticipant | null, choiceOwner: "god" | "player"): string {
  if (participant?.identity.playerName) return `Player: ${participant.identity.playerName}`;
  if (participant?.identity.creatureTemplateName) return `Creature: ${participant.identity.creatureTemplateName}`;
  return choiceOwner === "player" ? "Player controlled" : participant?.identity.kindLabel ?? "Encounter participant";
}

function healthValue(participant: CombatAidParticipant | null): { value: string; detail: string } {
  if (participant?.occurrenceState) return {
    value: `${participant.occurrenceState.remainingHp ?? "?"} / ${participant.occurrenceState.maximumHp ?? "?"}`,
    detail: `${participant.occurrenceState.totalDamage} occurrence damage`,
  };
  if (participant?.health) return {
    value: `${participant.health.total.remainingHp ?? "?"} / ${participant.health.total.maximumHp ?? "?"}`,
    detail: `${participant.health.total.damage} damage`,
  };
  return { value: "Unavailable", detail: "No resolved Health view" };
}

function activityEntries(
  view: ActionDeclarationWorkspaceView | null,
  rows: ActionDeclarationWorkspaceView["declarations"] = view?.declarations ?? [],
): BattleActivityEntry[] {
  if (!view) return [];
  return [...rows].reverse().slice(0, 10).map((declaration) => {
    const targetIds = declaration.lockedSnapshot?.targetCharacterIds ?? declaration.draft.targetCharacterIds;
    const targets = targetIds.map((id) => view.participants.find(({ characterId }) => characterId === id)?.name).filter(Boolean);
    const timing = declaration.timing
      ? `${declaration.timing.remainingInitiativeCost} Initiative remains; completes at ${declaration.timing.expectedCompletionInitiative}.`
      : "Not committed to Initiative.";
    return {
      id: String(declaration.id),
      eyebrow: declaration.actorName,
      title: declaration.lockedSnapshot?.label ?? declaration.draft.label,
      detail: `${targets.length ? `Target: ${targets.join(", ")}. ` : ""}${timing}`,
      status: actionStatusLabel(declaration.status),
      attention: ["resolved", "cancelled", "abandoned"].includes(declaration.status) ? null : declaration.rollState.message,
    };
  });
}

export function EncounterBattleScreen({
  campaignId,
  returnHref,
  initialSelectedCombatantId,
  initiative,
  combatAid,
  declarations,
  defenses,
  effects,
  firearmReadiness,
  firearmAttacks,
  playerRulings,
  rollWorkspace,
}: {
  campaignId: number;
  returnHref: string;
  initialSelectedCombatantId: number | null;
  initiative: InitiativeTrackerReadModel;
  combatAid: CombatAidEncounterView | null;
  declarations: ActionDeclarationWorkspaceView | null;
  defenses: DefenseInterventionWorkspaceView | null;
  effects: ActionEffectWorkspaceView | null;
  firearmReadiness: FirearmWorkspaceView | null;
  firearmAttacks: FirearmAttackWorkspaceView | null;
  playerRulings: readonly PlayerCombatRulingRequestView[];
  rollWorkspace: RollWorkspaceView | null;
}) {
  const router = useRouter();
  const presentationParticipants = declarations?.participants ?? initiative.participants.map((participant) => ({
    characterId: participant.characterId,
    name: participant.name,
    currentInitiative: participant.currentInitiative,
    participationStatus: participant.participationStatus,
    hasActiveAction: participant.activeActionId !== null,
    choiceOwner: participant.playerName ? "player" as const : "god" as const,
    weapons: [],
    movementModes: participant.movementModes,
    hitLocations: [],
    creatureAttacks: [],
  }));
  const firstSelected = resolveEncounterBattleParticipantId({
    requestedParticipantId: initialSelectedCombatantId,
    participants: presentationParticipants,
    nextEventParticipantIds: initiative.nextEvent?.characterIds ?? [],
  }) ?? 0;
  const [selectedCombatantId, setSelectedCombatantId] = useState(firstSelected);
  const selectedCombatant = presentationParticipants.find(({ characterId }) => characterId === selectedCombatantId) ?? null;
  const selectedState = combatAid?.participants.find(({ identity }) => identity.characterId === selectedCombatantId) ?? null;
  const trackerParticipant = initiative.participants.find(({ characterId }) => characterId === selectedCombatantId) ?? null;
  const actorIsGodControlled = selectedCombatant?.choiceOwner === "god";
  const declarationOpportunityAvailable = Boolean(actorIsGodControlled && trackerParticipant?.canAct && !selectedCombatant?.hasActiveAction);
  const [command, setCommand] = useState<BattleCommand>("attack");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const focusRecoveredActionRef = useRef(false);
  const pendingDeclarations = declarations?.declarations.filter(({ status }) => !["resolved", "cancelled", "abandoned"].includes(status)) ?? [];
  const completedDeclarations = declarations?.declarations.filter(({ status }) => ["resolved", "cancelled", "abandoned"].includes(status)) ?? [];
  const closedUnfinishedDeclarations = initiative.runtime?.runtime.status === "closed" ? pendingDeclarations : [];
  const preferredExchange = pendingDeclarations.find((declaration) => (
    declaration.actorCharacterId === selectedCombatantId
    || declaration.opportunities.some(({ responderCharacterId }) => responderCharacterId === selectedCombatantId)
  )) ?? pendingDeclarations[0] ?? null;
  const [requestedExchangeId, setRequestedExchangeId] = useState<number | null>(preferredExchange?.id ?? null);
  const selectedExchange = pendingDeclarations.find(({ id }) => id === requestedExchangeId) ?? preferredExchange;
  const responseCount = declarations?.declarations.reduce((total, declaration) => total + declaration.opportunities.filter(({ status }) => status === "pending").length, 0) ?? 0;
  const focusedResponseCount = declarations?.declarations.reduce((total, declaration) => total + declaration.opportunities.filter(({ responderCharacterId, status }) => responderCharacterId === selectedCombatantId && status === "pending").length, 0) ?? 0;
  const resultCount = effects?.plans.filter(({ status }) => !["applied", "declined"].includes(status)).length ?? 0;
  const focusedResolution = declarations?.declarations.some((declaration) => (
    ["rolling-ready", "rolling", "awaiting-god-ruling"].includes(declaration.status)
    && (declaration.actorCharacterId === selectedCombatantId || declaration.opportunities.some(({ responderCharacterId }) => responderCharacterId === selectedCombatantId))
  )) ?? false;
  const currentOpportunityParticipants = initiative.nextEvent?.kind === "normal-opportunity" && !initiative.nextEvent.canAdvance
    ? presentationParticipants.filter(({ characterId }) => initiative.nextEvent?.characterIds.includes(characterId))
    : [];
  const currentOpportunityNames = currentOpportunityParticipants.map(({ name }) => name).join(", ");
  const currentGodOpportunity = currentOpportunityParticipants.find(({ choiceOwner }) => choiceOwner === "god") ?? null;
  const selectedOwnedExchange = pendingDeclarations.find(({ actorCharacterId }) => actorCharacterId === selectedCombatantId) ?? null;
  const selectedResponseExchange = pendingDeclarations.find((declaration) => declaration.opportunities.some(({ responderCharacterId, status }) => responderCharacterId === selectedCombatantId && status === "pending")) ?? null;
  const focusedExchange = command === "defend" ? selectedResponseExchange ?? selectedOwnedExchange : selectedOwnedExchange;
  const selectedPendingResponses = declarations?.declarations.reduce((total, declaration) => total + declaration.opportunities.filter(({ responderCharacterId, status }) => responderCharacterId === selectedCombatantId && status === "pending").length, 0) ?? 0;
  const selectedPlan = effects?.plans.find(({ declarationId }) => declarationId === selectedOwnedExchange?.id) ?? null;
  const selectedResultReady = effects?.eligibleDeclarations.some(({ id }) => id === selectedOwnedExchange?.id) ?? false;
  const firearmAttackAvailable = Boolean(selectedCombatant?.weapons.some(({ firingModes }) => firingModes.length > 0));
  const firearmPreparationAvailable = Boolean(
    firearmReadiness
    && firearmReadiness.selectedCharacterId === selectedCombatantId
    && (firearmReadiness.firearms.length || firearmReadiness.legacyStacks.length),
  );
  const declarationAttackAvailable = Boolean(selectedCombatant?.creatureAttacks.length || selectedCombatant?.weapons.some(({ firingModes }) => firingModes.length === 0));
  const declarationCommand = command !== "defend" && command !== "hold" && command !== "pass";
  const health = healthValue(selectedState);
  const manaPools = selectedState?.mana?.pools ?? [];
  const manaCurrent = manaPools.reduce((sum, pool) => sum + pool.currentMana, 0);
  const equipmentCount = (selectedState?.equipment?.wieldedWeapons.length ?? 0) + (selectedState?.equipment?.wornArmor.length ?? 0);
  const conditions = selectedState?.occurrenceState?.conditions ?? selectedState?.effects?.conditions.map(({ name }) => name) ?? [];
  const commandDefinitions: readonly BattleCommandEntry<BattleCommand>[] = [
    { key: "attack", label: "Attack", disabled: !actorIsGodControlled, disabledReason: "This combatant's choices belong to their Player." },
    { key: "cast", label: "Cast", disabled: !actorIsGodControlled, disabledReason: "This combatant's choices belong to their Player." },
    { key: "item", label: "Item", disabled: !actorIsGodControlled, disabledReason: "This combatant's choices belong to their Player." },
    { key: "ability", label: "Ability", disabled: !actorIsGodControlled, disabledReason: "This combatant's choices belong to their Player." },
    { key: "defend", label: "Defend", badge: focusedResponseCount, disabled: !actorIsGodControlled, disabledReason: "This response belongs to the Player." },
    { key: "called-shot", label: "Called Shot", disabled: !actorIsGodControlled, disabledReason: "This combatant's choices belong to their Player." },
    { key: "move-other", label: "Move / Other", disabled: !actorIsGodControlled, disabledReason: "This combatant's choices belong to their Player." },
    { key: "hold", label: "Hold", disabled: !actorIsGodControlled, disabledReason: "This combatant's choices belong to their Player." },
    { key: "pass", label: "Pass", disabled: !actorIsGodControlled, disabledReason: "This combatant's choices belong to their Player." },
  ];
  const rosterEntries: BattleRosterEntry[] = presentationParticipants.map((participant) => {
    const state = combatAid?.participants.find(({ identity }) => identity.characterId === participant.characterId) ?? null;
    const pending = declarations?.declarations.find(({ actorCharacterId, status }) => actorCharacterId === participant.characterId && !["resolved", "cancelled", "abandoned"].includes(status));
    return {
      id: participant.characterId,
      eyebrow: state?.identity.kindLabel ?? "Participant",
      name: participant.name,
      detail: participantDetail(state, participant.choiceOwner),
      initiative: String(participant.currentInitiative),
      status: titleCase(participant.participationStatus),
      attention: pending?.rollState.message ?? (initiative.nextEvent?.characterIds.includes(participant.characterId) ? "Needs to act" : null),
      controllable: participant.choiceOwner === "god",
    };
  });
  const battleSourceChoices: BattleDeclarationSourceChoice[] = selectedState ? [
    ...selectedState.spellSources.map((spell) => ({
      key: `spell:${spell.kind}:${"allocationId" in spell ? spell.allocationId : spell.savedSpellId}`,
      kind: "spell" as const,
      ref: spell.kind === "catalog" ? `spell:catalog:${spell.allocationId}` : spell.kind === "personal" ? `spell:personal:${spell.savedSpellId}` : `spell:raw-saved:${spell.savedSpellId}`,
      instanceId: null,
      label: spell.name,
      detail: spell.kind === "catalog" ? "Known Catalog Spell" : spell.kind === "personal" ? "Personal Spellbook" : "Saved formula requiring review",
    })),
    ...(selectedState.resources?.stacks ?? []).filter(({ runtime }) => runtime.useMode !== "none").map((item) => ({
      key: `item:stack:${item.itemId}`,
      kind: "item" as const,
      ref: `item:${item.itemId}`,
      instanceId: null,
      label: item.itemName,
      detail: `${item.runtime.activationLabel} · ${item.quantity} available`,
    })),
    ...(selectedState.resources?.chargedInstances ?? []).map((item) => ({
      key: `item:instance:${item.instanceId}`,
      kind: "item" as const,
      ref: `item:${item.itemId}`,
      instanceId: item.instanceId,
      label: item.itemName,
      detail: `${item.currentCharges} / ${item.maximumCharges ?? "?"} charges`,
    })),
    ...selectedState.creatureAbilities.map((ability) => ({
      key: `creature-ability:${ability.canonicalId}`,
      kind: "creature-ability" as const,
      ref: ability.canonicalId,
      instanceId: null,
      label: ability.abilityName,
      detail: `${ability.activation}${ability.requirements ? ` · ${ability.requirements}` : ""}`,
    })),
    ...selectedState.derivedAbilities.map((ability) => ({
      key: `derived-ability:${ability.id}`,
      kind: "derived-ability" as const,
      ref: `derived-ability:${ability.id}`,
      instanceId: null,
      label: ability.name,
      detail: `${titleCase(ability.activation)} · currently available`,
    })),
  ] : [];
  const firearmWorkspace = (command === "attack" || command === "called-shot")
    && firearmPreparationAvailable
    && firearmReadiness
    && firearmReadiness.selectedCharacterId === selectedCombatantId
    ? <>
      <FirearmReadinessWorkspace view={firearmReadiness} lockCharacterSelection />
      {firearmAttacks ? <FirearmAttackWorkspace readiness={firearmReadiness} attackView={firearmAttacks} initialCalledShot={command === "called-shot"} selectedDeclarationId={selectedExchange?.id ?? -1} /> : null}
    </>
    : null;

  useEffect(() => {
    if (initiative.runtime?.runtime.status !== "active" || !focusRecoveredActionRef.current) return;
    focusRecoveredActionRef.current = false;
    window.requestAnimationFrame(() => {
      const stage = document.getElementById("encounter-selected-action");
      stage?.focus({ preventScroll: true });
      stage?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [initiative.runtime?.runtime.status]);

  function selectCombatant(characterId: number): void {
    setSelectedCombatantId(characterId);
    setCommand("attack");
    setFeedback(null);
    const nextExchange = pendingDeclarations.find((declaration) => (
      declaration.actorCharacterId === characterId
      || declaration.opportunities.some(({ responderCharacterId }) => responderCharacterId === characterId)
    )) ?? pendingDeclarations[0] ?? null;
    setRequestedExchangeId(nextExchange?.id ?? null);
    const params = new URLSearchParams(window.location.search);
    params.set("actor", String(characterId));
    params.delete("firearmCharacter");
    params.delete("firearmInstance");
    router.replace(`/heavens/tabletop?${params.toString()}`, { scroll: false });
  }

  function chooseCommand(next: BattleCommand): void {
    setCommand(next);
    setFeedback(null);
  }

  function openRecoveryAction(declarationId: number): void {
    const declaration = closedUnfinishedDeclarations.find(({ id }) => id === declarationId);
    if (!declaration) return;
    openExchange(declarationId, true);
  }

  function openExchange(declarationId: number, scroll = false): void {
    const declaration = pendingDeclarations.find(({ id }) => id === declarationId);
    if (!declaration) return;
    selectCombatant(declaration.actorCharacterId);
    setRequestedExchangeId(declaration.id);
    if (!scroll) return;
    window.requestAnimationFrame(() => {
      const stage = document.getElementById("encounter-selected-action");
      stage?.focus({ preventScroll: true });
      stage?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function disposition(kind: "hold" | "pass"): Promise<void> {
    if (!selectedCombatant || !actorIsGodControlled) return;
    setBusy(true);
    setFeedback(null);
    try {
      if (kind === "hold") await holdEncounterInitiative(initiative.encounter.id, selectedCombatant.characterId);
      else await passEncounterInitiative(initiative.encounter.id, selectedCombatant.characterId);
      setFeedback({ kind: "success", message: `${selectedCombatant.name} is now ${kind === "hold" ? "holding" : "passed"}.` });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Initiative disposition could not be recorded." });
    } finally {
      setBusy(false);
    }
  }

  async function advance(kind: "event" | "round"): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      if (kind === "event") await advanceEncounterInitiativeTimeline(initiative.encounter.id);
      else await advanceEncounterInitiativeRound(initiative.encounter.id);
      setFeedback({ kind: "success", message: kind === "event" ? "The next combat step is ready." : "The next Initiative Round is ready." });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Initiative could not advance." });
    } finally {
      setBusy(false);
    }
  }

  async function recoverClosedInitiative(): Promise<void> {
    const recoveryAction = closedUnfinishedDeclarations.find(({ id }) => id === selectedExchange?.id)
      ?? closedUnfinishedDeclarations[0]
      ?? null;
    setBusy(true);
    setFeedback(null);
    try {
      await recoverClosedEncounterInitiative(initiative.encounter.id);
      if (recoveryAction) {
        setSelectedCombatantId(recoveryAction.actorCharacterId);
        setRequestedExchangeId(recoveryAction.id);
        setCommand("attack");
      }
      focusRecoveredActionRef.current = true;
      setFeedback({ kind: "success", message: "Combat continued. The unfinished action is open below." });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Combat could not be continued." });
    } finally {
      setBusy(false);
    }
  }

  const attention = closedUnfinishedDeclarations.length
    ? "Combat is closed."
    : responseCount
    ? `${responseCount} response choice${responseCount === 1 ? "" : "s"} need attention.`
    : resultCount
      ? `${resultCount} result${resultCount === 1 ? "" : "s"} need review.`
      : initiative.nextEvent?.summary ?? "Initialize Initiative to begin battle operations.";

  return <CombatOperationStateProvider scope={`god-battle:${initiative.encounter.id}`}><BattleShell labelledBy="encounter-battle-title">
    <BattleHeader
      titleId="encounter-battle-title"
      eyebrow="THE HEAVENS / RUN ENCOUNTER"
      title={initiative.encounter.title}
      summary={attention}
      metrics={[
        { label: "Round", value: initiative.runtime?.runtime.roundNumber ?? "—" },
        { label: "Initiative", value: initiative.runtime?.runtime.timelineInitiative ?? "—", detail: initiative.nextEvent?.eyebrow },
        { label: "Responses", value: responseCount },
        { label: "Results", value: resultCount },
      ]}
      actions={<><TabletopLiveRefresh mode="god" campaignId={campaignId} /><Link className="st-button is-secondary" href={returnHref}>Tabletop Reference</Link></>}
    />

    {!closedUnfinishedDeclarations.length ? <p className="tabletop-feedback">{initiative.nextEvent?.detail ?? (initiative.canAdvanceRound ? "The current Round is complete and may advance." : "Waiting for Initiative or unfinished combat actions.")}</p> : null}

    <CombatRecoveryCard
      actions={closedUnfinishedDeclarations.map((declaration) => ({
        id: declaration.id,
        combatantName: declaration.actorName,
        actionName: declaration.lockedSnapshot?.label ?? declaration.draft.label,
        detail: declaration.rollState.message,
      }))}
      busy={busy}
      onContinue={() => void recoverClosedInitiative()}
      onOpenAction={openRecoveryAction}
    />

    {!selectedCombatant && selectedCombatantId !== 0 ? <p className="tabletop-feedback is-error">The selected combatant left this Encounter. The roster has not switched you to someone else; choose a current participant.</p> : null}
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

    <BattleGrid>
      <BattleRoster entries={rosterEntries} selectedId={selectedCombatantId} onSelect={selectCombatant} />
      <BattleMainColumn>
        {selectedCombatant ? <BattleActor
          eyebrow={selectedState?.identity.kindLabel ?? "Selected participant"}
          name={selectedCombatant.name}
          detail={participantDetail(selectedState, selectedCombatant.choiceOwner)}
          status={selectedCombatant.choiceOwner === "god" ? (selectedCombatant.hasActiveAction ? "Action in progress" : trackerParticipant?.isCurrentOpportunity ? "Ready to act" : "Waiting") : `Waiting for ${selectedCombatant.name}`}
          metrics={[
            { label: "Health", value: health.value, detail: health.detail },
            { label: "Mana", value: manaPools.length ? manaCurrent : "—", detail: manaPools.length ? `${manaPools.length} active pool${manaPools.length === 1 ? "" : "s"}` : "No active Mana pool" },
            { label: "Initiative", value: selectedCombatant.currentInitiative, detail: trackerParticipant ? `${trackerParticipant.normalTotalInitiative} normal` : "Not enrolled" },
            { label: "Equipment", value: equipmentCount || "—", detail: equipmentCount ? "Wielded and worn" : "None active" },
          ]}
        >
          {(selectedState?.equipment?.wieldedWeapons ?? []).slice(0, 3).map((weapon) => <span key={weapon.ownershipKey}>{weapon.itemName} · {weapon.initiativeCost ?? "?"} Initiative</span>)}
          {(selectedState?.creatureAttacks ?? []).slice(0, 3).map((attack) => <span key={attack.canonicalId}>{attack.attackName} · {attack.damage ?? "damage ruling"}</span>)}
          {conditions.slice(0, 4).map((condition) => <small key={condition}>{condition}</small>)}
          {!conditions.length ? <small>No active Conditions</small> : null}
        </BattleActor> : <p className="tabletop-empty">Choose an Encounter participant to inspect.</p>}

        {!closedUnfinishedDeclarations.length ? selectedPendingResponses ? <BattleGuide
          eyebrow="YOUR NEXT STEP"
          title={`Choose ${selectedCombatant?.name ?? "this combatant"}'s defense`}
          detail={`${selectedPendingResponses} incoming action${selectedPendingResponses === 1 ? " needs" : "s need"} a response. Choose Defend below.`}
          tone="attention"
        ><button className="st-button is-primary" type="button" onClick={() => setCommand("defend")}>Choose defense</button></BattleGuide>
        : selectedOwnedExchange ? selectedOwnedExchange.timing?.status === "active" ? <BattleGuide
          eyebrow="ACTION IN PROGRESS"
          title={selectedOwnedExchange.lockedSnapshot?.label ?? selectedOwnedExchange.draft.label}
          detail={`${selectedOwnedExchange.timing.remainingInitiativeCost} Initiative remains before the next part of this action.`}
          tone="waiting"
        >{initiative.nextEvent?.canAdvance ? <button className="st-button is-primary" type="button" disabled={busy} onClick={() => void advance("event")}>Next combat step</button> : null}</BattleGuide>
        : selectedOwnedExchange.rollState.attackRollId === null && !selectedOwnedExchange.rollState.resolved ? <BattleGuide
          eyebrow="YOUR NEXT STEP"
          title={`Roll ${selectedOwnedExchange.lockedSnapshot?.label ?? selectedOwnedExchange.draft.label}`}
          detail="The action has finished its Initiative timing. Use the Roll control below."
          tone="ready"
        /> : selectedOwnedExchange.rollState.missingResponseRolls ? <BattleGuide
          eyebrow="WAITING FOR DEFENSE"
          title={`${selectedOwnedExchange.rollState.missingResponseRolls} defense Roll${selectedOwnedExchange.rollState.missingResponseRolls === 1 ? " is" : "s are"} still needed`}
          detail="The exchange continues automatically when the required Rolls are recorded."
          tone="waiting"
        /> : selectedResultReady || selectedPlan ? <BattleGuide
          eyebrow={selectedPlan?.status === "requires-god-ruling" ? "RULING NEEDED" : "YOUR NEXT STEP"}
          title={selectedPlan?.status === "requires-god-ruling" ? "Review the unresolved result" : "Apply the combat result"}
          detail={selectedPlan?.status === "requires-god-ruling" ? "Only the unresolved part needs a G.O.D. decision." : "Known damage and resources can be applied from the result below."}
          tone={selectedPlan?.status === "requires-god-ruling" ? "attention" : "ready"}
        /> : <BattleGuide eyebrow="EXCHANGE IN PROGRESS" title={selectedOwnedExchange.lockedSnapshot?.label ?? selectedOwnedExchange.draft.label} detail={selectedOwnedExchange.rollState.message} tone="waiting" />
        : trackerParticipant?.canAct ? <BattleGuide eyebrow="YOUR NEXT STEP" title={`${selectedCombatant?.name ?? "This combatant"} can act now`} detail="Choose one action below. Known costs and rules are filled in automatically." tone="ready" />
        : currentOpportunityParticipants.length ? <BattleGuide
          eyebrow="WHO ACTS NOW"
          title={`${currentOpportunityNames} can act`}
          detail={currentGodOpportunity ? "Open that combatant and choose an action." : "Waiting for the Player to choose an action."}
          tone={currentGodOpportunity ? "ready" : "waiting"}
        >{currentGodOpportunity ? <button className="st-button is-primary" type="button" onClick={() => selectCombatant(currentGodOpportunity.characterId)}>Play {currentGodOpportunity.name}</button> : null}</BattleGuide>
        : initiative.nextEvent?.canAdvance ? <BattleGuide eyebrow="YOUR NEXT STEP" title={initiative.nextEvent.summary} detail="Continue to the next meaningful combat choice." tone="ready"><button className="st-button is-primary" type="button" disabled={busy} onClick={() => void advance("event")}>Next combat step</button></BattleGuide>
        : initiative.canAdvanceRound ? <BattleGuide eyebrow="ROUND COMPLETE" title={`Round ${initiative.runtime?.runtime.roundNumber ?? ""} is finished`} detail="Start the next Round when the table is ready." tone="ready"><button className="st-button is-primary" type="button" disabled={busy} onClick={() => void advance("round")}>Next Round</button></BattleGuide>
        : <BattleGuide eyebrow="WAITING" title="Combat is waiting for an unfinished choice" detail={initiative.nextEvent?.detail ?? "Open a pending exchange to continue."} tone="waiting" /> : null}

        {initiative.runtime ? <BattleCommands commands={commandDefinitions} selected={command} onSelect={chooseCommand} /> : null}

        {!initiative.runtime ? <BattleStage eyebrow="START COMBAT" title="Start Initiative" detail="Choose the participants and begin combat."><InitiativeTracker data={initiative} /></BattleStage> : selectedCombatant ? <BattleStage
          id="encounter-selected-action"
          eyebrow={actorIsGodControlled ? command.replaceAll("-", " ").toUpperCase() : "PLAYER CONTROLLED"}
          title={actorIsGodControlled ? command === "defend" ? `Choose ${selectedCombatant.name}'s defense` : command === "hold" || command === "pass" ? `${titleCase(command)} ${selectedCombatant.name}'s Initiative` : `Act as ${selectedCombatant.name}` : `Waiting for ${selectedCombatant.name}`}
          detail={focusedResponseCount ? `${focusedResponseCount} incoming response choice${focusedResponseCount === 1 ? "" : "s"} available.` : focusedResolution ? "Continue the current declaration, Roll, defense, or result here." : trackerParticipant?.isCurrentOpportunity ? "This combatant has the current normal opportunity." : "Other eligible combatants may act while this one waits."}
        >
          {!actorIsGodControlled ? <p className="tabletop-feedback">This Player owns their ordinary action and defense choices. G.O.D. visibility does not transfer control or response knowledge.</p> : null}
          {actorIsGodControlled && declarationCommand && !declarationOpportunityAvailable && !selectedOwnedExchange ? <p className="tabletop-feedback">{trackerParticipant?.activeActionId ? `${selectedCombatant.name} already has an action in progress.` : currentOpportunityNames ? `It is ${currentOpportunityNames}'s opportunity to act.` : "Continue the combat step shown above before declaring another action."}</p> : null}
          {focusedExchange ? <aside className="encounter-selected-action"><strong>{focusedExchange.actorName} — {focusedExchange.lockedSnapshot?.label ?? focusedExchange.draft.label}</strong><span>{focusedExchange.rollState.message}</span><details><summary>Action details</summary><small>Combat record #{focusedExchange.id} · {actionStatusLabel(focusedExchange.status)}</small></details></aside> : null}

          {actorIsGodControlled && (command === "hold" || command === "pass") ? <div className="encounter-battle-disposition"><p>{command === "hold" ? `${selectedCombatant.name} will wait for a later opening this Round.` : `${selectedCombatant.name} will take no more normal actions this Round.`}</p><button className="st-button" type="button" disabled={busy || (command === "hold" ? !trackerParticipant?.canHold : !trackerParticipant?.canPass)} onClick={() => void disposition(command)}>{command === "hold" ? "Hold" : "Pass"}</button></div> : null}

          {actorIsGodControlled && declarationCommand && declarationOpportunityAvailable && declarations ? <>
            {(command === "cast" || command === "item" || command === "ability") ? <p className="tabletop-feedback">Choose an exact current source. The source, current ownership, Initiative, Mana or Item costs, and supported consequences are rechecked and frozen on the server. Any genuinely unresolved Roll mode remains an explicit ruling.</p> : null}
            {command !== "attack" && command !== "called-shot" || declarationAttackAvailable ? <ActionDeclarationWorkspace
              view={declarations}
              battlePreset={{ actorCharacterId: selectedCombatant.characterId, command }}
              battleSourceChoices={battleSourceChoices}
              compact
              directCommit
            /> : null}
          </> : null}

          {actorIsGodControlled && firearmWorkspace ? declarationAttackAvailable
            ? <BattleSecondary summary="Firearm readiness and per-bullet attack">{firearmWorkspace}</BattleSecondary>
            : firearmWorkspace
          : null}

          {declarations && defenses && focusedExchange && (command === "defend" || !focusedExchange.rollState.resolved) ? <DefenseInterventionWorkspace actions={declarations} defense={defenses} compact selectedDeclarationId={focusedExchange.id} /> : actorIsGodControlled && command === "defend" && declarations && defenses ? <DefenseInterventionWorkspace actions={declarations} defense={defenses} compact selectedCombatantId={selectedCombatant.characterId} /> : null}
          {effects && selectedOwnedExchange && selectedOwnedExchange.rollState.resolved ? <ActionEffectPlanWorkspace encounterId={initiative.encounter.id} view={effects} compact selectedDeclarationId={selectedOwnedExchange.id} /> : null}
        </BattleStage> : null}
      </BattleMainColumn>
      <BattleActivity entries={activityEntries(declarations, pendingDeclarations)} title="Pending exchanges" selectedId={selectedExchange ? String(selectedExchange.id) : null} onSelect={(id) => openExchange(Number(id))} />
    </BattleGrid>

    <BattleSecondary summary="Initiative controls and shared timeline" open={!initiative.runtime}><InitiativeTracker data={initiative} /></BattleSecondary>
    {completedDeclarations.length ? <BattleSecondary summary={`Completed combat history · ${completedDeclarations.length}`}><BattleActivity entries={activityEntries(declarations, completedDeclarations)} title="Completed exchanges" /></BattleSecondary> : null}
    {effects ? <BattleSecondary summary="All consequence plans"><ActionEffectPlanWorkspace encounterId={initiative.encounter.id} view={effects} /></BattleSecondary> : null}
    {firearmReadiness && firearmAttacks ? <BattleSecondary summary="All firearm attack history"><FirearmAttackWorkspace readiness={firearmReadiness} attackView={firearmAttacks} historyOnly /></BattleSecondary> : null}
    {playerRulings.length ? <BattleSecondary summary={`Player rulings and exceptions · ${playerRulings.length}`}><PlayerCombatRulingWorkspace encounterId={initiative.encounter.id} requests={playerRulings} /></BattleSecondary> : null}
    {declarations && defenses ? <BattleSecondary summary="Advanced declaration, eligibility, and defense controls"><ActionDeclarationWorkspace view={declarations} /><DefenseInterventionWorkspace actions={declarations} defense={defenses} /></BattleSecondary> : null}
    {combatAid ? <BattleSecondary summary="Full combat reference and manual operations"><CombatAidWorkspace data={combatAid} rollWorkspace={rollWorkspace} /></BattleSecondary> : null}
  </BattleShell></CombatOperationStateProvider>;
}
