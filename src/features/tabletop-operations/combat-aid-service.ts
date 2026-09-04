import "server-only";

import { and, asc, eq, gt, inArray, or } from "drizzle-orm";

import type { db } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign } from "@/db/campaign-schema";
import { creature } from "@/db/creature-schema";
import {
  campaignCharacter,
  campaignCharacterSkillAllocation,
  campaignCharacterSpellDocument,
  campaignCreatureNpcProfile,
} from "@/db/realm-schema";
import { skill, skillExtension } from "@/db/skill-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterPendingActionSource,
  campaignSessionEncounterReaction,
  campaignSessionScene,
} from "@/db/tabletop-operations-schema";
import type { ActiveEffectsView } from "@/features/active-state/active-effects";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import type { ActiveHealthView } from "@/features/active-state/models";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import type { ActiveManaView } from "@/features/active-state/active-mana";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import type { CharacterEquipmentStateView } from "@/features/items/equipment-state";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import {
  readCharacterOperationalItemsInTransaction,
  type CharacterOperationalItemStateView,
} from "@/features/items/item-operational-read-service";
import type {
  InitiativeParticipationStatus,
  InitiativeRuntimeStatus,
  PendingInitiativeActionStatus,
} from "@/features/tabletop-operations/initiative-runtime";
import {
  canHoldingParticipantIntervene,
  canParticipantReactToAction,
} from "@/features/tabletop-operations/initiative-runtime";
import { buildInitiativeTrackerReadModel } from "@/features/tabletop-operations/initiative-tracker";
import {
  readEncounterCreatureAbilitiesInTransaction,
  readEncounterCreatureAttacksInTransaction,
  type EncounterCreatureAbility,
  type EncounterCreatureAttack,
} from "@/features/tabletop-operations/runtime-integration-service";
import {
  readCharacterDurationBindingsInTransaction,
  type TabletopDurationBindingView,
} from "@/features/tabletop-operations/duration-lifecycle-service";
import { assertCampaignSessionOwner } from "@/features/tabletop-operations/session-foundation";
import {
  classifySessionRosterEntity,
  getSessionRosterEntityLabel,
  type SessionRosterEntityKind,
} from "@/features/tabletop-operations/session-roster";

export type CombatAidTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CombatAidInitiativeSummary =
  | { enrolled: false }
  | {
      enrolled: true;
      runtimeStatus: InitiativeRuntimeStatus;
      normalTotalInitiative: number;
      currentInitiative: number;
      participationStatus: InitiativeParticipationStatus;
      deferredInitiativeCost: number;
      movementMode: string;
      isCurrentOpportunity: boolean;
      canAct: boolean;
      canHold: boolean;
      canPass: boolean;
      canIntervene: boolean;
      reactionOpportunityActionIds: number[];
      pendingAction: null | {
        id: number;
        label: string;
        status: PendingInitiativeActionStatus;
        remainingInitiativeCost: number;
        expectedCompletionInitiative: number;
      };
    };

export type CombatAidParticipant = {
  identity: {
    characterId: number;
    name: string;
    kind: SessionRosterEntityKind | "creature";
    kindLabel: string;
    playerName: string | null;
    creatureTemplateName: string | null;
  };
  health: ActiveHealthView | null;
  mana: ActiveManaView | null;
  effects: ActiveEffectsView | null;
  durationBindings: TabletopDurationBindingView[];
  equipment: CharacterEquipmentStateView | null;
  resources: CharacterOperationalItemStateView | null;
  creatureAttacks: EncounterCreatureAttack[];
  creatureAbilities: EncounterCreatureAbility[];
  spellSources: Array<
    | { kind: "catalog"; allocationId: number; name: string }
    | { kind: "personal"; savedSpellId: number; name: string }
    | { kind: "raw-saved"; savedSpellId: number; name: string }
  >;
  initiative: CombatAidInitiativeSummary;
  errors: Array<{ section: "health" | "mana" | "effects" | "equipment" | "resources"; message: string }>;
};

export type CombatAidAuthoredAction = {
  id: number;
  pendingActionId: number;
  sourceCharacterId: number;
  sourceKind: "weapon" | "creature-attack" | "spell" | "item" | "creature-ability";
  sourceRef: string;
  sourceInstanceId: number | null;
  targetCharacterIds: number[];
  resolutionStatus: "pending" | "resolved" | "cancelled" | "needs-ruling";
  resolutionSummary: string;
  resolvedAt: string | null;
};

export type CombatAidReaction = {
  id: number;
  pendingActionId: number;
  reactorCharacterId: number;
  reactionType: "dodge" | "block" | "parry" | "no-reaction" | "tackle" | "intervention";
  committedInitiativeCost: number;
  status: "declared" | "resolved" | "cancelled" | "needs-ruling";
  outcome: string;
  defenderFinalCost: number | null;
  attackerAdditionalCost: number | null;
};

export type CombatAidEncounterView = {
  encounter: {
    id: number;
    title: string;
    status: "planned" | "active" | "completed";
    sceneTitle: string;
    sessionTitle: string;
    campaignName: string;
  };
  initiativeRuntime: null | {
    status: InitiativeRuntimeStatus;
    roundNumber: number;
    stepNumber: number;
    timelineInitiative: number;
  };
  participants: CombatAidParticipant[];
  authoredActions: CombatAidAuthoredAction[];
  reactions: CombatAidReaction[];
};

type SectionName = CombatAidParticipant["errors"][number]["section"];

async function readSection<T>(
  section: SectionName,
  errors: CombatAidParticipant["errors"],
  read: () => Promise<T>,
): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    errors.push({ section, message: error instanceof Error ? error.message : `${section} state is unavailable.` });
    return null;
  }
}

export async function readCombatAidEncounterInTransaction(
  tx: CombatAidTransaction,
  encounterId: number,
  actingUserId: string,
): Promise<CombatAidEncounterView> {
  if (!Number.isSafeInteger(encounterId) || encounterId <= 0) throw new Error("Combat Aid Encounter is invalid.");
  const [context] = await tx.select({
    id: campaignSessionEncounter.id,
    title: campaignSessionEncounter.title,
    status: campaignSessionEncounter.status,
    sceneTitle: campaignSessionScene.title,
    sessionTitle: campaignSession.title,
    campaignName: campaign.name,
    ownerUserId: campaign.createdByUserId,
    sessionStatus: campaignSession.status,
    sceneStatus: campaignSessionScene.status,
  }).from(campaignSessionEncounter)
    .innerJoin(campaignSessionScene, and(
      eq(campaignSessionScene.id, campaignSessionEncounter.sceneId),
      eq(campaignSessionScene.sessionId, campaignSessionEncounter.sessionId),
    ))
    .innerJoin(campaignSession, eq(campaignSession.id, campaignSessionEncounter.sessionId))
    .innerJoin(campaign, eq(campaign.id, campaignSessionEncounter.campaignId))
    .where(eq(campaignSessionEncounter.id, encounterId))
    .limit(1);
  if (!context) throw new Error("That Encounter no longer exists.");
  assertCampaignSessionOwner(context.ownerUserId, actingUserId);

  const participantRows = await tx.select({
      characterId: campaignSessionEncounterParticipant.characterId,
      participantKind: campaignSessionEncounterParticipant.participantKind,
      displayLabel: campaignSessionEncounterParticipant.displayLabel,
      name: campaignCharacter.name,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
      playerName: user.name,
      playerUsername: user.username,
      creatureTemplateName: creature.canonicalName,
    }).from(campaignSessionEncounterParticipant)
      .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
      .leftJoin(user, eq(user.id, campaignCharacter.playerUserId))
      .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
      .leftJoin(creature, or(
        eq(creature.id, campaignCreatureNpcProfile.creatureId),
        eq(creature.id, campaignSessionEncounterParticipant.creatureId),
      ))
      .where(eq(campaignSessionEncounterParticipant.encounterId, encounterId))
      .orderBy(asc(campaignSessionEncounterParticipant.sortOrder), asc(campaignSessionEncounterParticipant.characterId));
  const runtimeRows = await tx.select({
      status: campaignSessionEncounterInitiative.status,
      roundNumber: campaignSessionEncounterInitiative.roundNumber,
      stepNumber: campaignSessionEncounterInitiative.stepNumber,
      timelineInitiative: campaignSessionEncounterInitiative.timelineInitiative,
      startedAt: campaignSessionEncounterInitiative.startedAt,
      closedAt: campaignSessionEncounterInitiative.closedAt,
    }).from(campaignSessionEncounterInitiative)
      .where(eq(campaignSessionEncounterInitiative.encounterId, encounterId)).limit(1);
  const initiativeRows = await tx.select({
      characterId: campaignSessionEncounterInitiativeParticipant.characterId,
      normalTotalInitiative: campaignSessionEncounterInitiativeParticipant.normalTotalInitiative,
      currentInitiative: campaignSessionEncounterInitiativeParticipant.currentInitiative,
      participationStatus: campaignSessionEncounterInitiativeParticipant.participationStatus,
      deferredInitiativeCost: campaignSessionEncounterInitiativeParticipant.deferredInitiativeCost,
      lastSatisfiedStep: campaignSessionEncounterInitiativeParticipant.lastSatisfiedStep,
      movementMode: campaignSessionEncounterInitiativeParticipant.movementMode,
    }).from(campaignSessionEncounterInitiativeParticipant)
      .where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, encounterId));
  const actionRows = await tx.select({
      id: campaignSessionEncounterPendingAction.id,
      encounterId: campaignSessionEncounterPendingAction.encounterId,
      actorCharacterId: campaignSessionEncounterPendingAction.actorCharacterId,
      label: campaignSessionEncounterPendingAction.label,
      actionKind: campaignSessionEncounterPendingAction.actionKind,
      allowsMultiRound: campaignSessionEncounterPendingAction.allowsMultiRound,
      originalInitiativeCost: campaignSessionEncounterPendingAction.originalInitiativeCost,
      initiativeSpent: campaignSessionEncounterPendingAction.initiativeSpent,
      status: campaignSessionEncounterPendingAction.status,
      remainingInitiativeCost: campaignSessionEncounterPendingAction.remainingInitiativeCost,
      startInitiative: campaignSessionEncounterPendingAction.startInitiative,
      startTimelineInitiative: campaignSessionEncounterPendingAction.startTimelineInitiative,
      expectedCompletionInitiative: campaignSessionEncounterPendingAction.expectedCompletionInitiative,
      startedRound: campaignSessionEncounterPendingAction.startedRound,
      completedRound: campaignSessionEncounterPendingAction.completedRound,
    }).from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.encounterId, encounterId))
      .orderBy(asc(campaignSessionEncounterPendingAction.id));
  const authoredActions = await tx.select({
    id: campaignSessionEncounterPendingActionSource.id,
    pendingActionId: campaignSessionEncounterPendingActionSource.pendingActionId,
    sourceCharacterId: campaignSessionEncounterPendingActionSource.sourceCharacterId,
    sourceKind: campaignSessionEncounterPendingActionSource.sourceKind,
    sourceRef: campaignSessionEncounterPendingActionSource.sourceRef,
    sourceInstanceId: campaignSessionEncounterPendingActionSource.sourceInstanceId,
    payloadJson: campaignSessionEncounterPendingActionSource.payloadJson,
    resolutionStatus: campaignSessionEncounterPendingActionSource.resolutionStatus,
    resolutionSummary: campaignSessionEncounterPendingActionSource.resolutionSummary,
    resolvedAt: campaignSessionEncounterPendingActionSource.resolvedAt,
  }).from(campaignSessionEncounterPendingActionSource)
    .where(eq(campaignSessionEncounterPendingActionSource.encounterId, encounterId))
    .orderBy(asc(campaignSessionEncounterPendingActionSource.id));
  const reactions = await tx.select({
    id: campaignSessionEncounterReaction.id,
    pendingActionId: campaignSessionEncounterReaction.pendingActionId,
    reactorCharacterId: campaignSessionEncounterReaction.reactorCharacterId,
    reactionType: campaignSessionEncounterReaction.reactionType,
    committedInitiativeCost: campaignSessionEncounterReaction.committedInitiativeCost,
    status: campaignSessionEncounterReaction.status,
    outcome: campaignSessionEncounterReaction.outcome,
    defenderFinalCost: campaignSessionEncounterReaction.defenderFinalCost,
    attackerAdditionalCost: campaignSessionEncounterReaction.attackerAdditionalCost,
  }).from(campaignSessionEncounterReaction)
    .where(eq(campaignSessionEncounterReaction.encounterId, encounterId))
    .orderBy(asc(campaignSessionEncounterReaction.id));
  const initiativeRuntime = runtimeRows[0] ? {
    ...runtimeRows[0],
    status: runtimeRows[0].status as InitiativeRuntimeStatus,
  } : null;
  const initiativeByCharacter = new Map(initiativeRows.map((row) => [row.characterId, row]));
  const unresolvedAuthoredActionIds = new Set(authoredActions
    .filter(({ resolutionStatus }) => resolutionStatus === "pending" || resolutionStatus === "needs-ruling")
    .map(({ pendingActionId }) => pendingActionId));
  const actionByCharacter = new Map(actionRows
    .filter((row) => row.status === "active" || row.status === "interrupted" || unresolvedAuthoredActionIds.has(row.id))
    .map((row) => [row.actorCharacterId, row]));
  const characterIds = participantRows.filter(({ participantKind }) => participantKind === "campaign-character").map(({ characterId }) => characterId);
  const personalSpells = characterIds.length ? await tx.select({
      characterId: campaignCharacterSpellDocument.characterId,
      savedSpellId: campaignCharacterSpellDocument.id,
      name: campaignCharacterSpellDocument.name,
      inSpellbook: campaignCharacterSpellDocument.inSpellbook,
    }).from(campaignCharacterSpellDocument)
      .where(inArray(campaignCharacterSpellDocument.characterId, characterIds))
      .orderBy(asc(campaignCharacterSpellDocument.name), asc(campaignCharacterSpellDocument.id)) : [];
  const catalogSpells = characterIds.length ? await tx.select({
      characterId: campaignCharacterSkillAllocation.characterId,
      allocationId: campaignCharacterSkillAllocation.id,
      name: skill.name,
    }).from(campaignCharacterSkillAllocation)
      .innerJoin(skill, eq(skill.id, campaignCharacterSkillAllocation.skillId))
      .innerJoin(skillExtension, and(
        eq(skillExtension.skillId, campaignCharacterSkillAllocation.skillId),
        eq(skillExtension.extensionType, "spell-construction"),
      ))
      .where(and(
        inArray(campaignCharacterSkillAllocation.characterId, characterIds),
        gt(campaignCharacterSkillAllocation.points, 0),
      )).orderBy(asc(skill.name), asc(campaignCharacterSkillAllocation.id)) : [];
  const personalByCharacter = new Map<number, typeof personalSpells>();
  for (const spell of personalSpells) personalByCharacter.set(spell.characterId, [...(personalByCharacter.get(spell.characterId) ?? []), spell]);
  const catalogByCharacter = new Map<number, typeof catalogSpells>();
  for (const spell of catalogSpells) catalogByCharacter.set(spell.characterId, [...(catalogByCharacter.get(spell.characterId) ?? []), spell]);
  const trackerParticipants = initiativeRuntime ? new Map(buildInitiativeTrackerReadModel({
    encounter: { id: context.id, title: context.title, status: context.status },
    sessionStatus: context.sessionStatus,
    sceneStatus: context.sceneStatus,
    identities: participantRows.map((row) => {
      const kind = row.participantKind === "creature" ? "creature" as const : classifySessionRosterEntity({ isNpc: row.isNpc ?? false, npcKind: row.npcKind ?? "race" });
      return {
        characterId: row.characterId,
        name: row.participantKind === "creature" ? row.displayLabel : row.name ?? `Character #${row.characterId}`,
        kind,
        kindLabel: kind === "creature" ? "Encounter Creature" : getSessionRosterEntityLabel(kind),
        playerName: kind === "pc" ? row.playerUsername ?? row.playerName : null,
        creatureTemplateName: kind === "creature-npc" || kind === "creature" ? row.creatureTemplateName : null,
      };
    }),
    capacities: [],
    runtime: {
      runtime: {
        ...initiativeRuntime,
        encounterId,
        startedAt: initiativeRuntime.startedAt.toISOString(),
        closedAt: initiativeRuntime.closedAt?.toISOString() ?? null,
      },
      participants: initiativeRows.map((row) => ({
        ...row,
        encounterId,
        participationStatus: row.participationStatus as InitiativeParticipationStatus,
      })),
      pendingActions: actionRows.map((row) => ({
        ...row,
        status: row.status as PendingInitiativeActionStatus,
      })),
    },
  }).participants.map((participant) => [participant.characterId, participant])) : new Map();

  const participants: CombatAidParticipant[] = [];
  for (const row of participantRows) {
    const errors: CombatAidParticipant["errors"] = [];
    const directCreature = row.participantKind === "creature";
    const kind = directCreature ? "creature" as const : classifySessionRosterEntity({ isNpc: row.isNpc ?? false, npcKind: row.npcKind ?? "race" });
    const initiative = initiativeByCharacter.get(row.characterId);
    const trackerParticipant = trackerParticipants.get(row.characterId);
    const action = actionByCharacter.get(row.characterId);
    const effects = directCreature ? null : await readSection("effects", errors, () => readActiveEffectsInTransaction(tx, row.characterId, false));
    const durationBindings = directCreature ? [] : await readCharacterDurationBindingsInTransaction(tx, row.characterId, false).catch((error) => {
      errors.push({ section: "effects", message: error instanceof Error ? error.message : "Duration lifecycle state is unavailable." });
      return [];
    });
    participants.push({
      identity: {
        characterId: row.characterId,
        name: directCreature ? row.displayLabel : row.name ?? `Character #${row.characterId}`,
        kind,
        kindLabel: kind === "creature" ? "Encounter Creature" : getSessionRosterEntityLabel(kind),
        playerName: kind === "pc" ? row.playerUsername ?? row.playerName : null,
        creatureTemplateName: kind === "creature-npc" || kind === "creature" ? row.creatureTemplateName : null,
      },
      health: directCreature ? null : await readSection("health", errors, async () => (
        await readActiveHealthInTransaction(tx, row.characterId, row.npcKind === "creature" ? "creature" : "race")
      ).view),
      mana: directCreature ? null : await readSection("mana", errors, () => readActiveManaInTransaction(tx, row.characterId)),
      effects,
      durationBindings,
      equipment: directCreature ? null : await readSection("equipment", errors, () => readCharacterEquipmentStateInTransaction(tx, row.characterId)),
      resources: directCreature ? null : await readSection("resources", errors, () => readCharacterOperationalItemsInTransaction(tx, row.characterId)),
      creatureAttacks: kind === "creature-npc" || kind === "creature"
        ? await readEncounterCreatureAttacksInTransaction(tx, row.characterId).catch(() => [])
        : [],
      creatureAbilities: kind === "creature-npc" || kind === "creature"
        ? await readEncounterCreatureAbilitiesInTransaction(tx, row.characterId).catch(() => [])
        : [],
      spellSources: [
        ...(catalogByCharacter.get(row.characterId) ?? []).map(({ allocationId, name }) => ({ kind: "catalog" as const, allocationId, name })),
        ...(personalByCharacter.get(row.characterId) ?? []).map(({ savedSpellId, name, inSpellbook }) => inSpellbook
          ? { kind: "personal" as const, savedSpellId, name }
          : { kind: "raw-saved" as const, savedSpellId, name }),
      ],
      initiative: initiative && initiativeRuntime ? {
        enrolled: true,
        runtimeStatus: initiativeRuntime.status,
        normalTotalInitiative: initiative.normalTotalInitiative,
        currentInitiative: initiative.currentInitiative,
        participationStatus: initiative.participationStatus as InitiativeParticipationStatus,
        deferredInitiativeCost: initiative.deferredInitiativeCost,
        movementMode: initiative.movementMode,
        isCurrentOpportunity: trackerParticipant?.isCurrentOpportunity ?? false,
        canAct: trackerParticipant?.canAct ?? false,
        canHold: trackerParticipant?.canHold ?? false,
        canPass: trackerParticipant?.canPass ?? false,
        canIntervene: trackerParticipant?.canIntervene ?? false,
        reactionOpportunityActionIds: initiativeRuntime.status === "active"
          ? actionRows.filter((candidate) => (
              candidate.status === "active"
              && candidate.actorCharacterId !== row.characterId
              && (
                canParticipantReactToAction(candidate, initiative.currentInitiative)
                || canHoldingParticipantIntervene({
                  encounterId,
                  status: initiativeRuntime.status,
                  roundNumber: initiativeRuntime.roundNumber,
                  stepNumber: initiativeRuntime.stepNumber,
                  timelineInitiative: initiativeRuntime.timelineInitiative,
                  startedAt: initiativeRuntime.startedAt,
                  closedAt: initiativeRuntime.closedAt,
                }, {
                  encounterId,
                  characterId: row.characterId,
                  normalTotalInitiative: initiative.normalTotalInitiative,
                  currentInitiative: initiative.currentInitiative,
                  participationStatus: initiative.participationStatus as InitiativeParticipationStatus,
                  deferredInitiativeCost: initiative.deferredInitiativeCost,
                  lastSatisfiedStep: initiative.lastSatisfiedStep,
                  movementMode: initiative.movementMode,
                })
              )
            )).map(({ id }) => id)
          : [],
        pendingAction: action ? {
          id: action.id,
          label: action.label,
          status: action.status as PendingInitiativeActionStatus,
          remainingInitiativeCost: action.remainingInitiativeCost,
          expectedCompletionInitiative: action.expectedCompletionInitiative,
        } : null,
      } : { enrolled: false },
      errors,
    });
  }
  return {
    encounter: {
      id: context.id,
      title: context.title,
      status: context.status,
      sceneTitle: context.sceneTitle,
      sessionTitle: context.sessionTitle,
      campaignName: context.campaignName,
    },
    initiativeRuntime,
    participants,
    authoredActions: authoredActions.map(({ payloadJson, ...entry }) => {
      let targetCharacterIds: number[] = [];
      try {
        const payload = JSON.parse(payloadJson) as Record<string, unknown>;
        if (entry.sourceKind === "weapon" || entry.sourceKind === "creature-attack") {
          if (typeof payload.targetCharacterId === "number") targetCharacterIds = [payload.targetCharacterId];
        } else if (entry.sourceKind === "item") {
          const target = typeof payload.targetCharacterId === "number"
            ? payload.targetCharacterId
            : typeof payload.sourceCharacterId === "number" ? payload.sourceCharacterId : null;
          if (target !== null) targetCharacterIds = [target];
        } else if (entry.sourceKind === "creature-ability") {
          targetCharacterIds = Array.isArray(payload.targetCharacterIds)
            ? payload.targetCharacterIds.filter((id): id is number => typeof id === "number")
            : [];
        } else {
          const selections = payload.selections as { targetGroups?: Record<string, unknown> } | undefined;
          targetCharacterIds = [...new Set(Object.values(selections?.targetGroups ?? {}).flatMap((ids) => (
            Array.isArray(ids) ? ids.filter((id): id is number => typeof id === "number") : []
          )))];
        }
      } catch {
        targetCharacterIds = [];
      }
      return {
        ...entry,
        targetCharacterIds,
        resolvedAt: entry.resolvedAt?.toISOString() ?? null,
      };
    }),
    reactions,
  };
}
