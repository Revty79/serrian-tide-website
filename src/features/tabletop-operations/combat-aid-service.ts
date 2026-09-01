import "server-only";

import { and, asc, eq } from "drizzle-orm";

import type { db } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign } from "@/db/campaign-schema";
import { creature } from "@/db/creature-schema";
import { campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
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
    kind: SessionRosterEntityKind;
    kindLabel: string;
    playerName: string | null;
    creatureTemplateName: string | null;
  };
  health: ActiveHealthView | null;
  mana: ActiveManaView | null;
  effects: ActiveEffectsView | null;
  equipment: CharacterEquipmentStateView | null;
  resources: CharacterOperationalItemStateView | null;
  initiative: CombatAidInitiativeSummary;
  errors: Array<{ section: "health" | "mana" | "effects" | "equipment" | "resources"; message: string }>;
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
      characterId: campaignCharacter.id,
      name: campaignCharacter.name,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
      playerName: user.name,
      playerUsername: user.username,
      creatureTemplateName: creature.canonicalName,
    }).from(campaignSessionEncounterParticipant)
      .innerJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
      .innerJoin(user, eq(user.id, campaignCharacter.playerUserId))
      .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
      .leftJoin(creature, eq(creature.id, campaignCreatureNpcProfile.creatureId))
      .where(eq(campaignSessionEncounterParticipant.encounterId, encounterId))
      .orderBy(asc(campaignSessionEncounterParticipant.sortOrder), asc(campaignSessionEncounterParticipant.characterId));
  const runtimeRows = await tx.select({
      status: campaignSessionEncounterInitiative.status,
      roundNumber: campaignSessionEncounterInitiative.roundNumber,
      stepNumber: campaignSessionEncounterInitiative.stepNumber,
      timelineInitiative: campaignSessionEncounterInitiative.timelineInitiative,
    }).from(campaignSessionEncounterInitiative)
      .where(eq(campaignSessionEncounterInitiative.encounterId, encounterId)).limit(1);
  const initiativeRows = await tx.select({
      characterId: campaignSessionEncounterInitiativeParticipant.characterId,
      normalTotalInitiative: campaignSessionEncounterInitiativeParticipant.normalTotalInitiative,
      currentInitiative: campaignSessionEncounterInitiativeParticipant.currentInitiative,
      participationStatus: campaignSessionEncounterInitiativeParticipant.participationStatus,
      deferredInitiativeCost: campaignSessionEncounterInitiativeParticipant.deferredInitiativeCost,
      movementMode: campaignSessionEncounterInitiativeParticipant.movementMode,
    }).from(campaignSessionEncounterInitiativeParticipant)
      .where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, encounterId));
  const actionRows = await tx.select({
      id: campaignSessionEncounterPendingAction.id,
      actorCharacterId: campaignSessionEncounterPendingAction.actorCharacterId,
      label: campaignSessionEncounterPendingAction.label,
      status: campaignSessionEncounterPendingAction.status,
      remainingInitiativeCost: campaignSessionEncounterPendingAction.remainingInitiativeCost,
      expectedCompletionInitiative: campaignSessionEncounterPendingAction.expectedCompletionInitiative,
    }).from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.encounterId, encounterId))
      .orderBy(asc(campaignSessionEncounterPendingAction.id));
  const initiativeRuntime = runtimeRows[0] ? {
    ...runtimeRows[0],
    status: runtimeRows[0].status as InitiativeRuntimeStatus,
  } : null;
  const initiativeByCharacter = new Map(initiativeRows.map((row) => [row.characterId, row]));
  const actionByCharacter = new Map(actionRows
    .filter(({ status }) => status === "active" || status === "interrupted")
    .map((row) => [row.actorCharacterId, row]));

  const participants: CombatAidParticipant[] = [];
  for (const row of participantRows) {
    const errors: CombatAidParticipant["errors"] = [];
    const kind = classifySessionRosterEntity(row);
    const initiative = initiativeByCharacter.get(row.characterId);
    const action = actionByCharacter.get(row.characterId);
    participants.push({
      identity: {
        characterId: row.characterId,
        name: row.name,
        kind,
        kindLabel: getSessionRosterEntityLabel(kind),
        playerName: kind === "pc" ? row.playerUsername ?? row.playerName : null,
        creatureTemplateName: kind === "creature-npc" ? row.creatureTemplateName : null,
      },
      health: await readSection("health", errors, async () => (
        await readActiveHealthInTransaction(tx, row.characterId, row.npcKind)
      ).view),
      mana: await readSection("mana", errors, () => readActiveManaInTransaction(tx, row.characterId)),
      effects: await readSection("effects", errors, () => readActiveEffectsInTransaction(tx, row.characterId, false)),
      equipment: await readSection("equipment", errors, () => readCharacterEquipmentStateInTransaction(tx, row.characterId)),
      resources: await readSection("resources", errors, () => readCharacterOperationalItemsInTransaction(tx, row.characterId)),
      initiative: initiative && initiativeRuntime ? {
        enrolled: true,
        runtimeStatus: initiativeRuntime.status,
        normalTotalInitiative: initiative.normalTotalInitiative,
        currentInitiative: initiative.currentInitiative,
        participationStatus: initiative.participationStatus as InitiativeParticipationStatus,
        deferredInitiativeCost: initiative.deferredInitiativeCost,
        movementMode: initiative.movementMode,
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
  };
}
