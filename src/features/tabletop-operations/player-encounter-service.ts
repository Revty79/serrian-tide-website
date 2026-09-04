import "server-only";

import { and, asc, eq } from "drizzle-orm";

import type { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { campaignCharacter } from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterParticipant,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";

import {
  readCombatAidEncounterInTransaction,
  type CombatAidEncounterView,
  type CombatAidParticipant,
} from "./combat-aid-service";
import {
  readRollLedgerInTransaction,
  type AuthorizedRollActor,
  type RollLedgerEntry,
} from "./roll-runtime-service";
import type { OwnedEncounterRuntimeContext } from "./runtime-integration-service";
import {
  assertPlayerRollVisibility,
  projectPlayerParticipantSummaries,
  type PlayerParticipantProjection,
} from "./player-encounter-policy";

export type PlayerEncounterTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ActivePlayerEncounterContext = OwnedEncounterRuntimeContext & {
  characterId: number;
  characterName: string;
  encounterTitle: string;
  sceneTitle: string;
  sessionTitle: string;
  campaignName: string;
};

export type PlayerEncounterParticipantSummary = PlayerParticipantProjection;

export type PlayerEncounterView = {
  context: {
    campaignId: number;
    campaignName: string;
    sessionId: number;
    sessionTitle: string;
    sceneId: number;
    sceneTitle: string;
    encounterId: number;
    encounterTitle: string;
  };
  initiativeRuntime: CombatAidEncounterView["initiativeRuntime"];
  character: CombatAidParticipant;
  participants: PlayerEncounterParticipantSummary[];
  reactions: CombatAidEncounterView["reactions"];
  rolls: RollLedgerEntry[];
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

/**
 * Resolves Player access through the complete active hierarchy. No "latest"
 * fallback is allowed: the Character must be the signed-in Player's PC and be
 * present in the active Session, Scene, and Encounter at every membership layer.
 */
export async function resolveActivePlayerEncounterInTransaction(
  tx: PlayerEncounterTransaction,
  characterIdInput: number,
  playerUserId: string,
  lock = false,
): Promise<ActivePlayerEncounterContext | null> {
  const characterId = positiveId(characterIdInput, "Character");
  let query = tx.select({
    characterId: campaignCharacter.id,
    characterName: campaignCharacter.name,
    encounterId: campaignSessionEncounter.id,
    encounterTitle: campaignSessionEncounter.title,
    encounterStatus: campaignSessionEncounter.status,
    sceneId: campaignSessionScene.id,
    sceneTitle: campaignSessionScene.title,
    sceneStatus: campaignSessionScene.status,
    sessionId: campaignSession.id,
    sessionTitle: campaignSession.title,
    sessionStatus: campaignSession.status,
    campaignId: campaign.id,
    campaignName: campaign.name,
    ownerUserId: campaign.createdByUserId,
  }).from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .innerJoin(campaignSession, and(
      eq(campaignSession.campaignId, campaignCharacter.campaignId),
      eq(campaignSession.status, "active"),
    ))
    .innerJoin(campaignSessionRoster, and(
      eq(campaignSessionRoster.sessionId, campaignSession.id),
      eq(campaignSessionRoster.campaignId, campaignCharacter.campaignId),
      eq(campaignSessionRoster.characterId, campaignCharacter.id),
    ))
    .innerJoin(campaignSessionScene, and(
      eq(campaignSessionScene.sessionId, campaignSession.id),
      eq(campaignSessionScene.campaignId, campaignCharacter.campaignId),
      eq(campaignSessionScene.status, "active"),
    ))
    .innerJoin(campaignSessionSceneMember, and(
      eq(campaignSessionSceneMember.sceneId, campaignSessionScene.id),
      eq(campaignSessionSceneMember.sessionId, campaignSession.id),
      eq(campaignSessionSceneMember.campaignId, campaignCharacter.campaignId),
      eq(campaignSessionSceneMember.characterId, campaignCharacter.id),
    ))
    .innerJoin(campaignSessionEncounter, and(
      eq(campaignSessionEncounter.sceneId, campaignSessionScene.id),
      eq(campaignSessionEncounter.sessionId, campaignSession.id),
      eq(campaignSessionEncounter.campaignId, campaignCharacter.campaignId),
      eq(campaignSessionEncounter.status, "active"),
    ))
    .innerJoin(campaignSessionEncounterParticipant, and(
      eq(campaignSessionEncounterParticipant.encounterId, campaignSessionEncounter.id),
      eq(campaignSessionEncounterParticipant.sceneId, campaignSessionScene.id),
      eq(campaignSessionEncounterParticipant.sessionId, campaignSession.id),
      eq(campaignSessionEncounterParticipant.campaignId, campaignCharacter.campaignId),
      eq(campaignSessionEncounterParticipant.characterId, campaignCharacter.id),
    ))
    .where(and(
      eq(campaignCharacter.id, characterId),
      eq(campaignCharacter.playerUserId, playerUserId),
      eq(campaignCharacter.isNpc, false),
    ))
    .orderBy(asc(campaignSession.id), asc(campaignSessionScene.id), asc(campaignSessionEncounter.id))
    .limit(2);
  if (lock) {
    query = query.for("update", { of: campaignSessionEncounter }) as typeof query;
  }
  const rows = await query;
  if (rows.length > 1) throw new Error("The active tabletop hierarchy is ambiguous for this Character.");
  return rows[0] ?? null;
}

export function projectPlayerEncounterView(
  context: ActivePlayerEncounterContext,
  combatAid: CombatAidEncounterView,
  tableRolls: readonly RollLedgerEntry[],
): PlayerEncounterView {
  const character = combatAid.participants.find(
    ({ identity }) => identity.characterId === context.characterId && identity.kind === "pc",
  );
  if (!character) throw new Error("The Player Character is no longer an Encounter Participant.");
  assertPlayerRollVisibility(tableRolls, context.characterId);

  return {
    context: {
      campaignId: context.campaignId,
      campaignName: context.campaignName,
      sessionId: context.sessionId,
      sessionTitle: context.sessionTitle,
      sceneId: context.sceneId,
      sceneTitle: context.sceneTitle,
      encounterId: context.encounterId,
      encounterTitle: context.encounterTitle,
    },
    initiativeRuntime: combatAid.initiativeRuntime,
    character,
    participants: projectPlayerParticipantSummaries(combatAid.participants),
    reactions: combatAid.reactions.filter(({ reactorCharacterId }) => reactorCharacterId === context.characterId),
    rolls: [...tableRolls],
  };
}

export async function readPlayerEncounterInTransaction(
  tx: PlayerEncounterTransaction,
  characterId: number,
  playerUserId: string,
): Promise<PlayerEncounterView | null> {
  const context = await resolveActivePlayerEncounterInTransaction(tx, characterId, playerUserId);
  if (!context) return null;
  const combatAid = await readCombatAidEncounterInTransaction(tx, context.encounterId, context.ownerUserId);
  const rollActor: AuthorizedRollActor = {
    userId: playerUserId,
    campaignId: context.campaignId,
    readAs: "player",
    canRecordGodOnly: false,
    characterId: context.characterId,
  };
  const rollPage = await readRollLedgerInTransaction(tx, rollActor, context.sessionId, {
    sceneId: context.sceneId,
    encounterId: context.encounterId,
    limit: 30,
  });
  return projectPlayerEncounterView(context, combatAid, rollPage.rolls);
}
