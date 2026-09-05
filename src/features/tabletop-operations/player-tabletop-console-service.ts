import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { characterDerivedAbilityUse, derivedAbility } from "@/db/derived-ability-schema";
import { item, itemEffect, weaponFiringMode } from "@/db/item-schema";
import { race } from "@/db/race-schema";
import {
  campaignCharacter,
  campaignCharacterItem,
  campaignCharacterItemInstance,
  campaignCharacterProfile,
} from "@/db/realm-schema";
import {
  campaignCharacterFirearmState,
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionRoll,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import { readCharacterItemChargeStateInTransaction } from "@/features/items/item-charge-service";
import { decodeItemEffects } from "@/features/items/item-runtime";
import { formatMechanicalEffectSummary } from "@/features/mechanical-effects";
import {
  readPlayerWeaponGovernanceInTransaction,
  type PlayerWeaponGovernanceView,
} from "@/features/items/weapon-governance-management-service";
import { requirePlayer } from "@/lib/server-access";

import {
  readPlayerCalledCheckSessionWorkspaceInTransaction,
  readPlayerCalledCheckWorkspaceInTransaction,
  type PlayerCalledCheckWorkspaceView,
} from "./called-check-service";
import { readActionEffectWorkspaceInTransaction, type ActionEffectWorkspaceView } from "./action-effect-plan-service";
import { readActionDeclarationWorkspaceInTransaction, type ActionDeclarationWorkspaceView } from "./action-declaration-service";
import { readDefenseInterventionWorkspaceInTransaction, type DefenseInterventionWorkspaceView } from "./defense-intervention-service";
import { readFirearmAttackWorkspaceInTransaction, type FirearmAttackWorkspaceView } from "./firearm-attack-service";
import { readFirearmWorkspaceInTransaction, type FirearmWorkspaceView } from "./firearm-readiness-service";
import { getNextInitiativeTimelineEvent } from "./initiative-runtime";
import {
  lockPlayerCombatContextInTransaction,
  readPlayerCombatRulingRequestsInTransaction,
  type PlayerCombatRulingRequestView,
} from "./player-combat-ruling-service";
import type {
  PlayerTabletopCharacterOption,
  PlayerTabletopFirearmState,
  PlayerTabletopItemEffectDetail,
} from "./player-tabletop-console";
import {
  recordRollInTransaction,
  readRollLedgerInTransaction,
  type AuthorizedRollActor,
  type RollLedgerEntry,
} from "./roll-runtime-service";
import { loadInitiativeEngineInTransaction } from "./runtime-integration-service";

export type PlayerTabletopConsoleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type PlayerCharacterContext = {
  characterId: number;
  characterName: string;
  campaignId: number;
  campaignName: string;
  campaignOverview: string;
  playerUsername: string;
  raceName: string | null;
  age: number | null;
  sex: string;
  npcKind: "race";
};

export type PlayerTabletopHierarchy = {
  session: null | {
    id: number;
    campaignId: number;
    title: string;
    status: "active";
    startedAt: string;
  };
  rostered: boolean;
  scene: null | {
    id: number;
    title: string;
    locationLabel: string;
    description: string;
  };
  encounter: null | {
    id: number;
    title: string;
    encounterType: string;
    description: string;
    participating: boolean;
    roundNumber: number | null;
    stepNumber: number | null;
    currentInitiative: number | null;
    participationStatus: string;
  };
};

export type PlayerTabletopRuntimeData = {
  identity: PlayerCharacterContext;
  hierarchy: PlayerTabletopHierarchy;
  health: Awaited<ReturnType<typeof readActiveHealthInTransaction>>["view"];
  mana: Awaited<ReturnType<typeof readActiveManaInTransaction>>;
  effects: Awaited<ReturnType<typeof readActiveEffectsInTransaction>>;
  equipment: Awaited<ReturnType<typeof readCharacterEquipmentStateInTransaction>>;
  charges: Awaited<ReturnType<typeof readCharacterItemChargeStateInTransaction>>;
  itemEffects: PlayerTabletopItemEffectDetail[];
  firearmStates: PlayerTabletopFirearmState[];
  calledChecks: Awaited<ReturnType<typeof readPlayerCalledCheckWorkspaceInTransaction>>;
  rolls: RollLedgerEntry[];
  recentSessions: Array<{
    id: number;
    title: string;
    sequenceNumber: number;
    status: "active" | "completed";
    startedAt: string;
    completedAt: string | null;
    sceneTitles: string[];
    encounterTitles: string[];
  }>;
  derivedAbilityUses: Array<{
    id: number;
    abilityName: string;
    effectSummary: string;
    manualSteps: string;
    usedAt: string;
  }>;
  calledCheckHistory: PlayerCalledCheckWorkspaceView[];
  combat: PlayerCombatConsoleData | null;
};

export type PlayerCombatConsoleData = Readonly<{
  context: { campaignId: number; sessionId: number; sceneId: number; encounterId: number };
  initiative: {
    roundNumber: number;
    stepNumber: number;
    timelineInitiative: number;
    normalTotalInitiative: number;
    currentInitiative: number;
    participationStatus: string;
    deferredInitiativeCost: number;
    canDeclareAction: boolean;
    blockers: readonly string[];
    pendingAction: null | {
      id: number;
      label: string;
      status: string;
      originalInitiativeCost: number;
      initiativeSpent: number;
      additionalInitiativeCost: number;
      remainingInitiativeCost: number;
      expectedCompletionInitiative: number;
      allowsMultiRound: boolean;
    };
  };
  targets: readonly { participantId: number; name: string; currentInitiative: number; participationStatus: string }[];
  declarations: ActionDeclarationWorkspaceView;
  defenses: DefenseInterventionWorkspaceView;
  firearms: Pick<FirearmWorkspaceView, "legacyStacks" | "firearms">;
  weaponGovernance: PlayerWeaponGovernanceView;
  firearmAttacks: FirearmAttackWorkspaceView;
  effects: ActionEffectWorkspaceView;
  rulingRequests: readonly PlayerCombatRulingRequestView[];
}>;

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

export async function listPlayerTabletopCharactersInTransaction(
  tx: PlayerTabletopConsoleTransaction,
  playerUserId: string,
): Promise<PlayerTabletopCharacterOption[]> {
  if (!playerUserId.trim()) throw new Error("Player Tabletop requires a signed-in user.");
  return tx.select({
    characterId: campaignCharacter.id,
    characterName: campaignCharacter.name,
    campaignId: campaign.id,
    campaignName: campaign.name,
  }).from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .innerJoin(campaignPlayer, and(
      eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
      eq(campaignPlayer.userId, campaignCharacter.playerUserId),
    ))
    .where(and(
      eq(campaignCharacter.playerUserId, playerUserId),
      eq(campaignPlayer.userId, playerUserId),
      eq(campaignCharacter.isNpc, false),
      isNull(campaignCharacter.archivedAt),
      isNull(campaign.archivedAt),
    ))
    .orderBy(asc(campaign.name), asc(campaignCharacter.name), asc(campaignCharacter.id));
}

async function loadPlayerCharacterContext(
  tx: PlayerTabletopConsoleTransaction,
  characterId: number,
  playerUserId: string,
): Promise<PlayerCharacterContext> {
  const [row] = await tx.select({
    characterId: campaignCharacter.id,
    characterName: campaignCharacter.name,
    campaignId: campaign.id,
    campaignName: campaign.name,
    campaignOverview: campaign.overview,
    playerUsername: user.username,
    playerName: user.name,
    raceName: race.name,
    age: campaignCharacterProfile.age,
    sex: campaignCharacterProfile.sex,
  }).from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .innerJoin(campaignPlayer, and(
      eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
      eq(campaignPlayer.userId, campaignCharacter.playerUserId),
    ))
    .innerJoin(user, eq(user.id, campaignCharacter.playerUserId))
    .leftJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id))
    .leftJoin(race, eq(race.id, campaignCharacterProfile.raceId))
    .where(and(
      eq(campaignCharacter.id, positiveId(characterId, "Player Tabletop Character")),
      eq(campaignCharacter.playerUserId, playerUserId),
      eq(campaignPlayer.userId, playerUserId),
      eq(campaignCharacter.isNpc, false),
      isNull(campaignCharacter.archivedAt),
      isNull(campaign.archivedAt),
    ))
    .limit(1);
  if (!row) throw new Error("That Character is not assigned to this Player.");
  return {
    characterId: row.characterId,
    characterName: row.characterName,
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    campaignOverview: row.campaignOverview,
    playerUsername: row.playerUsername ?? row.playerName,
    raceName: row.raceName,
    age: row.age,
    sex: row.sex ?? "",
    npcKind: "race",
  };
}

async function readActiveHierarchy(
  tx: PlayerTabletopConsoleTransaction,
  character: PlayerCharacterContext,
): Promise<PlayerTabletopHierarchy> {
  const activeSessions = await tx.select({
    id: campaignSession.id,
    campaignId: campaignSession.campaignId,
    title: campaignSession.title,
    status: campaignSession.status,
    startedAt: campaignSession.startedAt,
  }).from(campaignSession)
    .where(and(
      eq(campaignSession.campaignId, character.campaignId),
      eq(campaignSession.status, "active"),
    ))
    .orderBy(asc(campaignSession.id))
    .limit(2);
  if (activeSessions.length > 1) throw new Error("The Campaign has an ambiguous active Session hierarchy.");
  const active = activeSessions[0];
  if (!active?.startedAt || active.status !== "active") {
    return { session: null, rostered: false, scene: null, encounter: null };
  }
  const session = {
    id: active.id,
    campaignId: active.campaignId,
    title: active.title,
    status: "active" as const,
    startedAt: active.startedAt.toISOString(),
  };
  const [roster] = await tx.select({ characterId: campaignSessionRoster.characterId })
    .from(campaignSessionRoster)
    .where(and(
      eq(campaignSessionRoster.sessionId, active.id),
      eq(campaignSessionRoster.campaignId, character.campaignId),
      eq(campaignSessionRoster.characterId, character.characterId),
    )).limit(1);
  if (!roster) return { session, rostered: false, scene: null, encounter: null };

  const activeScenes = await tx.select({
    id: campaignSessionScene.id,
    title: campaignSessionScene.title,
    locationLabel: campaignSessionScene.locationLabel,
    description: campaignSessionScene.description,
  }).from(campaignSessionSceneMember)
    .innerJoin(campaignSessionScene, and(
      eq(campaignSessionScene.id, campaignSessionSceneMember.sceneId),
      eq(campaignSessionScene.sessionId, campaignSessionSceneMember.sessionId),
      eq(campaignSessionScene.campaignId, campaignSessionSceneMember.campaignId),
    ))
    .where(and(
      eq(campaignSessionSceneMember.characterId, character.characterId),
      eq(campaignSessionSceneMember.sessionId, active.id),
      eq(campaignSessionSceneMember.campaignId, character.campaignId),
      eq(campaignSessionScene.status, "active"),
    )).orderBy(asc(campaignSessionScene.id)).limit(2);
  if (activeScenes.length > 1) throw new Error("The Character has an ambiguous active Scene hierarchy.");
  const scene = activeScenes[0] ?? null;
  if (!scene) return { session, rostered: true, scene: null, encounter: null };

  const activeEncounters = await tx.select({
    id: campaignSessionEncounter.id,
    title: campaignSessionEncounter.title,
    encounterType: campaignSessionEncounter.encounterType,
    description: campaignSessionEncounter.description,
  }).from(campaignSessionEncounter)
    .where(and(
      eq(campaignSessionEncounter.sceneId, scene.id),
      eq(campaignSessionEncounter.sessionId, active.id),
      eq(campaignSessionEncounter.campaignId, character.campaignId),
      eq(campaignSessionEncounter.status, "active"),
    )).orderBy(asc(campaignSessionEncounter.id)).limit(2);
  if (activeEncounters.length > 1) throw new Error("The active Scene has an ambiguous Encounter hierarchy.");
  const activeEncounter = activeEncounters[0] ?? null;
  const projectedScene = {
    id: scene.id,
    title: scene.title,
    locationLabel: scene.locationLabel,
    description: scene.description,
  };
  if (!activeEncounter) return { session, rostered: true, scene: projectedScene, encounter: null };

  const [participant] = await tx.select({ characterId: campaignSessionEncounterParticipant.characterId })
    .from(campaignSessionEncounterParticipant)
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, activeEncounter.id),
      eq(campaignSessionEncounterParticipant.sceneId, scene.id),
      eq(campaignSessionEncounterParticipant.sessionId, active.id),
      eq(campaignSessionEncounterParticipant.campaignId, character.campaignId),
      eq(campaignSessionEncounterParticipant.characterId, character.characterId),
    )).limit(1);
  const [initiative] = participant ? await tx.select({
    roundNumber: campaignSessionEncounterInitiative.roundNumber,
    stepNumber: campaignSessionEncounterInitiative.stepNumber,
    status: campaignSessionEncounterInitiative.status,
  }).from(campaignSessionEncounterInitiative)
    .where(eq(campaignSessionEncounterInitiative.encounterId, activeEncounter.id))
    .limit(1) : [];
  const [initiativeParticipant] = participant ? await tx.select({
    currentInitiative: campaignSessionEncounterInitiativeParticipant.currentInitiative,
    participationStatus: campaignSessionEncounterInitiativeParticipant.participationStatus,
  }).from(campaignSessionEncounterInitiativeParticipant)
    .where(and(
      eq(campaignSessionEncounterInitiativeParticipant.encounterId, activeEncounter.id),
      eq(campaignSessionEncounterInitiativeParticipant.characterId, character.characterId),
    )).limit(1) : [];
  return {
    session,
    rostered: true,
    scene: projectedScene,
    encounter: {
      id: activeEncounter.id,
      title: activeEncounter.title,
      encounterType: activeEncounter.encounterType,
      description: activeEncounter.description,
      participating: Boolean(participant),
      roundNumber: initiative?.status === "active" ? initiative.roundNumber : null,
      stepNumber: initiative?.status === "active" ? initiative.stepNumber : null,
      currentInitiative: initiativeParticipant?.currentInitiative ?? null,
      participationStatus: initiativeParticipant?.participationStatus ?? "not-enrolled",
    },
  };
}

async function readItemEffectDetails(
  tx: PlayerTabletopConsoleTransaction,
  characterId: number,
): Promise<PlayerTabletopItemEffectDetail[]> {
  const stackIds = await tx.select({ itemId: campaignCharacterItem.itemId })
    .from(campaignCharacterItem)
    .where(eq(campaignCharacterItem.characterId, characterId));
  const instanceIds = await tx.select({ itemId: campaignCharacterItemInstance.itemId })
    .from(campaignCharacterItemInstance)
    .where(eq(campaignCharacterItemInstance.characterId, characterId));
  const ownedItemIds = [...new Set([...stackIds, ...instanceIds].map(({ itemId }) => itemId))];
  if (!ownedItemIds.length) return [];
  const rows = await tx.select({
    itemId: itemEffect.itemId,
    schemaVersion: itemEffect.schemaVersion,
    effectJson: itemEffect.effectJson,
    sortOrder: itemEffect.sortOrder,
  }).from(itemEffect)
    .where(inArray(itemEffect.itemId, ownedItemIds))
    .orderBy(asc(itemEffect.itemId), asc(itemEffect.sortOrder), asc(itemEffect.id));
  return ownedItemIds.map((itemId) => {
    try {
      const effects = decodeItemEffects(rows.filter((row) => row.itemId === itemId));
      return {
        itemId,
        effectSummaries: effects.map(formatMechanicalEffectSummary),
        requiresGodRuling: effects.some(({ kind }) => kind === "manual"),
      };
    } catch {
      return {
        itemId,
        effectSummaries: ["Saved structured effects require G.O.D. review."],
        requiresGodRuling: true,
      };
    }
  });
}

async function readFirearmStates(
  tx: PlayerTabletopConsoleTransaction,
  character: PlayerCharacterContext,
): Promise<PlayerTabletopFirearmState[]> {
  const rows = await tx.select({
    itemInstanceId: campaignCharacterFirearmState.itemInstanceId,
    selectedFiringModeId: campaignCharacterFirearmState.selectedFiringModeId,
    loadedAmmunitionItemId: campaignCharacterFirearmState.loadedAmmunitionItemId,
    loadedRounds: campaignCharacterFirearmState.loadedRounds,
    capacityRounds: campaignCharacterFirearmState.capacityRounds,
    readied: campaignCharacterFirearmState.readied,
    requiresCycling: campaignCharacterFirearmState.requiresCycling,
    requiresRecoilRecovery: campaignCharacterFirearmState.requiresRecoilRecovery,
    updatedAt: campaignCharacterFirearmState.updatedAt,
  }).from(campaignCharacterFirearmState)
    .innerJoin(campaignCharacterItemInstance, and(
      eq(campaignCharacterItemInstance.id, campaignCharacterFirearmState.itemInstanceId),
      eq(campaignCharacterItemInstance.characterId, campaignCharacterFirearmState.characterId),
      eq(campaignCharacterItemInstance.itemId, campaignCharacterFirearmState.itemId),
    ))
    .where(and(
      eq(campaignCharacterFirearmState.characterId, character.characterId),
      eq(campaignCharacterFirearmState.campaignId, character.campaignId),
    )).orderBy(asc(campaignCharacterFirearmState.itemInstanceId));
  if (!rows.length) return [];
  const modeIds = [...new Set(rows.map(({ selectedFiringModeId }) => selectedFiringModeId))];
  const modeRows = await tx.select({ id: weaponFiringMode.id, name: weaponFiringMode.name })
    .from(weaponFiringMode).where(inArray(weaponFiringMode.id, modeIds));
  const ammunitionIds = [...new Set(rows.flatMap(({ loadedAmmunitionItemId }) => (
    loadedAmmunitionItemId === null ? [] : [loadedAmmunitionItemId]
  )))];
  const ammunitionRows = ammunitionIds.length
    ? await tx.select({ id: item.id, name: item.name }).from(item).where(inArray(item.id, ammunitionIds))
    : [];
  const modeNames = new Map(modeRows.map((row) => [row.id, row.name]));
  const ammunitionNames = new Map(ammunitionRows.map((row) => [row.id, row.name]));
  return rows.map((row) => ({
    itemInstanceId: row.itemInstanceId,
    selectedModeName: modeNames.get(row.selectedFiringModeId) ?? "Unknown mode",
    loadedAmmunitionName: row.loadedAmmunitionItemId === null
      ? null
      : ammunitionNames.get(row.loadedAmmunitionItemId) ?? "Unknown ammunition",
    loadedRounds: row.loadedRounds,
    capacityRounds: row.capacityRounds,
    readied: row.readied,
    requiresCycling: row.requiresCycling,
    requiresRecoilRecovery: row.requiresRecoilRecovery,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

async function readHistory(
  tx: PlayerTabletopConsoleTransaction,
  character: PlayerCharacterContext,
  playerUserId: string,
): Promise<Pick<PlayerTabletopRuntimeData, "rolls" | "recentSessions" | "derivedAbilityUses" | "calledCheckHistory">> {
  const sessionRows = await tx.select({
    id: campaignSession.id,
    title: campaignSession.title,
    sequenceNumber: campaignSession.sequenceNumber,
    status: campaignSession.status,
    startedAt: campaignSession.startedAt,
    completedAt: campaignSession.completedAt,
  }).from(campaignSessionRoster)
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionRoster.sessionId),
      eq(campaignSession.campaignId, campaignSessionRoster.campaignId),
    ))
    .where(and(
      eq(campaignSessionRoster.characterId, character.characterId),
      eq(campaignSessionRoster.campaignId, character.campaignId),
      inArray(campaignSession.status, ["active", "completed"]),
    )).orderBy(desc(campaignSession.sequenceNumber), desc(campaignSession.id)).limit(6);
  const sessionIds = sessionRows.map(({ id }) => id);
  const sceneRows = sessionIds.length ? await tx.select({
    sessionId: campaignSessionScene.sessionId,
    title: campaignSessionScene.title,
  }).from(campaignSessionSceneMember)
    .innerJoin(campaignSessionScene, and(
      eq(campaignSessionScene.id, campaignSessionSceneMember.sceneId),
      eq(campaignSessionScene.sessionId, campaignSessionSceneMember.sessionId),
      eq(campaignSessionScene.campaignId, campaignSessionSceneMember.campaignId),
    ))
    .where(and(
      eq(campaignSessionSceneMember.characterId, character.characterId),
      inArray(campaignSessionSceneMember.sessionId, sessionIds),
      inArray(campaignSessionScene.status, ["active", "completed"]),
    )).orderBy(desc(campaignSessionScene.sequenceNumber), desc(campaignSessionScene.id)) : [];
  const encounterRows = sessionIds.length ? await tx.select({
    sessionId: campaignSessionEncounter.sessionId,
    title: campaignSessionEncounter.title,
  }).from(campaignSessionEncounterParticipant)
    .innerJoin(campaignSessionEncounter, and(
      eq(campaignSessionEncounter.id, campaignSessionEncounterParticipant.encounterId),
      eq(campaignSessionEncounter.sceneId, campaignSessionEncounterParticipant.sceneId),
      eq(campaignSessionEncounter.sessionId, campaignSessionEncounterParticipant.sessionId),
      eq(campaignSessionEncounter.campaignId, campaignSessionEncounterParticipant.campaignId),
    ))
    .where(and(
      eq(campaignSessionEncounterParticipant.characterId, character.characterId),
      inArray(campaignSessionEncounterParticipant.sessionId, sessionIds),
      inArray(campaignSessionEncounter.status, ["active", "completed"]),
    )).orderBy(desc(campaignSessionEncounter.id)) : [];

  const actor: AuthorizedRollActor = {
    userId: playerUserId,
    campaignId: character.campaignId,
    readAs: "player",
    canRecordGodOnly: false,
    characterId: character.characterId,
  };
  const rolls: RollLedgerEntry[] = [];
  for (const session of sessionRows) {
    if (rolls.length >= 30) break;
    const page = await readRollLedgerInTransaction(tx, actor, session.id, {
      characterId: character.characterId,
      limit: Math.min(30 - rolls.length, 30),
    });
    rolls.push(...page.rolls);
  }

  const useRows = await tx.select({
    id: characterDerivedAbilityUse.id,
    abilityName: derivedAbility.name,
    effectSummary: characterDerivedAbilityUse.effectSummary,
    manualSteps: characterDerivedAbilityUse.manualSteps,
    usedAt: characterDerivedAbilityUse.usedAt,
  }).from(characterDerivedAbilityUse)
    .innerJoin(derivedAbility, eq(derivedAbility.id, characterDerivedAbilityUse.derivedAbilityId))
    .where(eq(characterDerivedAbilityUse.characterId, character.characterId))
    .orderBy(desc(characterDerivedAbilityUse.usedAt), desc(characterDerivedAbilityUse.id))
    .limit(20);
  const calledCheckHistory: PlayerCalledCheckWorkspaceView[] = [];
  for (const session of sessionRows.filter(({ status }) => status === "completed").slice(0, 5)) {
    const workspace = await readPlayerCalledCheckSessionWorkspaceInTransaction(
      tx,
      session.id,
      character.characterId,
      playerUserId,
    );
    if (workspace) calledCheckHistory.push(workspace);
  }

  return {
    rolls,
    calledCheckHistory,
    recentSessions: sessionRows.flatMap((row) => row.startedAt ? [{
      id: row.id,
      title: row.title,
      sequenceNumber: row.sequenceNumber,
      status: row.status as "active" | "completed",
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      sceneTitles: [...new Set(sceneRows.filter(({ sessionId }) => sessionId === row.id).map(({ title }) => title))],
      encounterTitles: [...new Set(encounterRows.filter(({ sessionId }) => sessionId === row.id).map(({ title }) => title))],
    }] : []),
    derivedAbilityUses: useRows.map((row) => ({
      ...row,
      usedAt: row.usedAt.toISOString(),
    })),
  };
}

export async function readPlayerTabletopRollContextInTransaction(
  tx: PlayerTabletopConsoleTransaction,
  characterId: number,
  playerUserId: string,
): Promise<{
  campaignId: number;
  sessionId: number;
  sceneId: number | null;
  encounterId: number | null;
}> {
  const character = await loadPlayerCharacterContext(tx, characterId, playerUserId);
  const hierarchy = await readActiveHierarchy(tx, character);
  if (!hierarchy.session || !hierarchy.rostered) {
    throw new Error("This Character is not rostered in an active Session.");
  }
  return {
    campaignId: character.campaignId,
    sessionId: hierarchy.session.id,
    sceneId: hierarchy.scene?.id ?? null,
    encounterId: hierarchy.encounter?.participating ? hierarchy.encounter.id : null,
  };
}

export async function recordPlayerTabletopFreeRollInTransaction(
  tx: PlayerTabletopConsoleTransaction,
  input: {
    characterId: number;
    playerUserId: string;
    method: "random" | "entered";
    visibility: "table" | "private";
    enteredTotal?: number | null;
    label?: string;
    idempotencyKey: string;
  },
): Promise<{
  rollId: number;
  resultTotal: number;
  campaignId: number;
  sessionId: number;
  sceneId: number | null;
  encounterId: number | null;
}> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!/^[a-f0-9]{32}$/.test(idempotencyKey)) throw new Error("The Roll submission identity is invalid.");
  const context = await readPlayerTabletopRollContextInTransaction(
    tx,
    input.characterId,
    input.playerUserId,
  );
  const auditNote = `Player Tabletop general Roll · submission ${idempotencyKey} · not linked to a Called Check, action, or consequence.`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`serrian-tide:player-free-roll:${input.playerUserId}:${idempotencyKey}`}))`);
  const [existing] = await tx.select({
    id: campaignSessionRoll.id,
    resultTotal: campaignSessionRoll.resultTotal,
  }).from(campaignSessionRoll).where(and(
    eq(campaignSessionRoll.campaignId, context.campaignId),
    eq(campaignSessionRoll.sessionId, context.sessionId),
    eq(campaignSessionRoll.rollerCharacterId, input.characterId),
    eq(campaignSessionRoll.recordedByUserId, input.playerUserId),
    eq(campaignSessionRoll.purposeKind, "free"),
    eq(campaignSessionRoll.notes, auditNote),
  )).limit(1);
  if (existing) return { rollId: existing.id, resultTotal: existing.resultTotal, ...context };
  const roll = await recordRollInTransaction(tx, {
    userId: input.playerUserId,
    campaignId: context.campaignId,
    readAs: "player",
    canRecordGodOnly: false,
    characterId: input.characterId,
  }, {
    sessionId: context.sessionId,
    sceneId: context.sceneId,
    encounterId: context.encounterId,
    rollerCharacterId: input.characterId,
    targetCharacterId: null,
    pendingActionId: null,
    reactionId: null,
    method: input.method,
    visibility: input.visibility,
    purposeKind: "free",
    enteredTotal: input.method === "entered" ? input.enteredTotal ?? null : null,
    label: input.label?.trim() || "General percentile Roll",
    targetNumber: null,
    mechanical: null,
    notes: auditNote,
  });
  return { rollId: roll.id, resultTotal: roll.resultTotal, ...context };
}

export async function listPlayerTabletopCharacters(): Promise<PlayerTabletopCharacterOption[]> {
  const access = await requirePlayer();
  return db.transaction((tx) => listPlayerTabletopCharactersInTransaction(tx, access.user.id));
}

async function readPlayerCombatConsole(
  tx: PlayerTabletopConsoleTransaction,
  character: PlayerCharacterContext,
  hierarchy: PlayerTabletopHierarchy,
  playerUserId: string,
): Promise<PlayerCombatConsoleData | null> {
  if (!hierarchy.encounter?.participating) return null;
  const context = await lockPlayerCombatContextInTransaction(
    tx,
    hierarchy.encounter.id,
    character.characterId,
    playerUserId,
  );
  const actor = { authority: "player" as const, userId: playerUserId, characterId: character.characterId };
  const engine = await loadInitiativeEngineInTransaction(tx, context.encounterId);
  const participant = engine.participants.find(({ characterId }) => characterId === character.characterId);
  if (!participant) return null;
  const pendingAction = engine.pendingActions.find(({ actorCharacterId, status }) => (
    actorCharacterId === character.characterId && status === "active"
  )) ?? null;
  const next = getNextInitiativeTimelineEvent(engine);
  const blockers: string[] = [];
  if (participant.participationStatus !== "active") blockers.push(`Initiative status is ${participant.participationStatus}.`);
  if (pendingAction) blockers.push("An authored action is already in progress.");
  if (next.kind === "pending-completion") blockers.push("A pending action completion has priority at this Initiative.");
  if (next.kind !== "normal-opportunity" || !next.characterIds.includes(character.characterId)) {
    blockers.push("This Character does not have the next normal Initiative opportunity.");
  }
  const declarations = await readActionDeclarationWorkspaceInTransaction(tx, context, actor);
  const defenses = await readDefenseInterventionWorkspaceInTransaction(tx, context, actor);
  const firearmWorkspace = await readFirearmWorkspaceInTransaction(tx, context, character.characterId, null);
  const weaponGovernance = await readPlayerWeaponGovernanceInTransaction(tx, { userId: playerUserId }, character.characterId);
  const firearmAttacks = await readFirearmAttackWorkspaceInTransaction(tx, context, actor);
  const allEffects = await readActionEffectWorkspaceInTransaction(tx, context);
  const visiblePlans = allEffects.plans.filter((plan) => (
    plan.actorParticipantId === character.characterId
    || plan.effects.some(({ targetParticipantId }) => targetParticipantId === character.characterId)
  )).map((plan) => {
    const ownsPlan = plan.actorParticipantId === character.characterId;
    return {
      ...plan,
      sourceSnapshot: ownsPlan ? plan.sourceSnapshot : {
        ...plan.sourceSnapshot,
        governingSource: null,
        governingSnapshot: null,
        authoredData: { redacted: true },
      },
      governingRollSnapshot: ownsPlan ? plan.governingRollSnapshot : null,
      defenseResolution: ownsPlan ? plan.defenseResolution : null,
      sourceDivergence: ownsPlan ? plan.sourceDivergence : null,
      effects: ownsPlan ? plan.effects : plan.effects.filter(({ targetParticipantId }) => targetParticipantId === character.characterId),
      createdByUserId: "",
      reviewedByUserId: null,
      appliedByUserId: null,
      events: plan.events.map((event) => ({ ...event, actorUserId: "" })),
    };
  });
  const effects: ActionEffectWorkspaceView = {
    plans: visiblePlans,
    eligibleDeclarations: allEffects.eligibleDeclarations.filter(({ actorParticipantId }) => actorParticipantId === character.characterId),
    participants: allEffects.participants.filter(({ id }) => (
      id === character.characterId
      || visiblePlans.some((plan) => plan.effects.some(({ targetParticipantId }) => targetParticipantId === id))
    )),
  };
  const rulingRequests = await readPlayerCombatRulingRequestsInTransaction(
    tx,
    context.encounterId,
    character.characterId,
    playerUserId,
  );
  return {
    context: { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId: context.encounterId },
    initiative: {
      roundNumber: engine.runtime.roundNumber,
      stepNumber: engine.runtime.stepNumber,
      timelineInitiative: engine.runtime.timelineInitiative,
      normalTotalInitiative: participant.normalTotalInitiative,
      currentInitiative: participant.currentInitiative,
      participationStatus: participant.participationStatus,
      deferredInitiativeCost: participant.deferredInitiativeCost,
      canDeclareAction: blockers.length === 0,
      blockers,
      pendingAction: pendingAction ? {
        id: pendingAction.id,
        label: pendingAction.label,
        status: pendingAction.status,
        originalInitiativeCost: pendingAction.originalInitiativeCost,
        initiativeSpent: pendingAction.initiativeSpent,
        additionalInitiativeCost: pendingAction.additionalInitiativeCost ?? 0,
        remainingInitiativeCost: pendingAction.remainingInitiativeCost,
        expectedCompletionInitiative: pendingAction.expectedCompletionInitiative,
        allowsMultiRound: pendingAction.allowsMultiRound,
      } : null,
    },
    targets: declarations.participants
      .filter(({ characterId }) => characterId !== character.characterId)
      .map((entry) => ({
        participantId: entry.characterId,
        name: entry.name,
        currentInitiative: entry.currentInitiative,
        participationStatus: entry.participationStatus,
      })),
    declarations,
    defenses,
    firearms: { legacyStacks: firearmWorkspace.legacyStacks, firearms: firearmWorkspace.firearms.map((firearm) => ({
      ...firearm,
      history: firearm.history.map((event) => ({ ...event, actorUserId: "" })),
    })) },
    weaponGovernance,
    firearmAttacks,
    effects,
    rulingRequests,
  };
}

export async function readPlayerTabletopRuntimeInTransaction(
  tx: PlayerTabletopConsoleTransaction,
  characterId: number,
  playerUserId: string,
): Promise<PlayerTabletopRuntimeData> {
    const identity = await loadPlayerCharacterContext(tx, characterId, playerUserId);
    const hierarchy = await readActiveHierarchy(tx, identity);
    const health = (await readActiveHealthInTransaction(tx, identity.characterId, identity.npcKind)).view;
    const mana = await readActiveManaInTransaction(tx, identity.characterId);
    const effects = await readActiveEffectsInTransaction(tx, identity.characterId, true);
    const equipment = await readCharacterEquipmentStateInTransaction(tx, identity.characterId);
    const charges = await readCharacterItemChargeStateInTransaction(tx, identity.characterId);
    const itemEffects = await readItemEffectDetails(tx, identity.characterId);
    const firearmStates = await readFirearmStates(tx, identity);
    const calledChecks = await readPlayerCalledCheckWorkspaceInTransaction(tx, identity.characterId, playerUserId);
    const history = await readHistory(tx, identity, playerUserId);
    const combat = await readPlayerCombatConsole(tx, identity, hierarchy, playerUserId);
    return {
      identity,
      hierarchy,
      health,
      mana,
      effects,
      equipment,
      charges,
      itemEffects,
      firearmStates,
      calledChecks,
      combat,
      ...history,
    };
}

export async function readPlayerTabletopRuntime(characterId: number): Promise<PlayerTabletopRuntimeData> {
  const access = await requirePlayer();
  return db.transaction((tx) => readPlayerTabletopRuntimeInTransaction(tx, characterId, access.user.id));
}
