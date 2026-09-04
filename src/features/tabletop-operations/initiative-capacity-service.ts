import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { raceMovementMode } from "@/db/race-schema";
import {
  campaignSessionEncounterParticipant,
} from "@/db/tabletop-operations-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterProfile,
  campaignCreatureNpcProfile,
} from "@/db/realm-schema";
import {
  getCharacterMovementBaseValue,
} from "@/features/characters/character-rules";
import {
  resolveEffectiveCreatureStatistics,
  type CreatureStatisticsSource,
} from "@/features/creatures/creature-size-rules";

import { calculateNormalTotalInitiative } from "./initiative-runtime";

type TabletopTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ResolvedInitiativeCapacity = {
  characterId: number;
  sourceKind: "player-character" | "race-npc" | "creature-npc";
  dexterity: number;
  movementMode: string;
  baseMovement: number;
  normalTotalInitiative: number;
};

export type InitiativeCapacityOption = {
  movementMode: string;
  baseMovement: number;
  normalTotalInitiative: number;
};

export type ResolvedInitiativeCapacityOptions = {
  characterId: number;
  sourceKind: ResolvedInitiativeCapacity["sourceKind"];
  dexterity: number;
  movementModes: InitiativeCapacityOption[];
};

function selectMovementMode(
  movement: ReadonlyArray<InitiativeCapacityOption>,
  requestedMovementMode?: string,
): InitiativeCapacityOption {
  const usable = movement.filter((entry) => (
    Number.isFinite(entry.baseMovement)
    && entry.baseMovement > 0
  ));
  if (!usable.length) throw new Error("The Initiative Participant has no usable authoritative Movement mode.");
  const requested = requestedMovementMode?.trim().toLocaleLowerCase("en-US");
  if (!requested) return usable[0]!;
  const selected = usable.find(({ movementMode }) => movementMode.trim().toLocaleLowerCase("en-US") === requested);
  if (!selected) throw new Error("The selected Movement mode is not available to that Initiative Participant.");
  return selected;
}

function parseCreatureSnapshot(value: unknown): CreatureStatisticsSource {
  let parsed: unknown;
  try { parsed = typeof value === "string" ? JSON.parse(value) : value; }
  catch { throw new Error("The Creature current snapshot is not valid JSON."); }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("The Creature NPC current snapshot is invalid.");
  }
  return parsed as CreatureStatisticsSource;
}

export async function resolveInitiativeCapacityInTransaction(
  tx: TabletopTransaction,
  characterId: number,
  expectedCampaignId: number,
  requestedMovementMode?: string,
): Promise<ResolvedInitiativeCapacity> {
  const options = await resolveInitiativeCapacityOptionsInTransaction(
    tx,
    characterId,
    expectedCampaignId,
  );
  const selected = selectMovementMode(options.movementModes, requestedMovementMode);
  return {
    characterId,
    sourceKind: options.sourceKind,
    dexterity: options.dexterity,
    ...selected,
  };
}

export async function resolveInitiativeCapacityOptionsInTransaction(
  tx: TabletopTransaction,
  characterId: number,
  expectedCampaignId: number,
): Promise<ResolvedInitiativeCapacityOptions> {
  if (Number.isSafeInteger(characterId) && characterId < 0) {
    const [occurrence] = await tx.select({
      campaignId: campaignSessionEncounterParticipant.campaignId,
      participantKind: campaignSessionEncounterParticipant.participantKind,
      snapshot: campaignSessionEncounterParticipant.creatureSnapshotJson,
    }).from(campaignSessionEncounterParticipant).where(and(
      eq(campaignSessionEncounterParticipant.characterId, characterId),
      eq(campaignSessionEncounterParticipant.campaignId, expectedCampaignId),
    )).limit(1);
    if (!occurrence || occurrence.participantKind !== "creature" || occurrence.snapshot === null) {
      throw new Error("The Initiative Creature does not belong to this Campaign encounter.");
    }
    const effective = resolveEffectiveCreatureStatistics(parseCreatureSnapshot(occurrence.snapshot));
    const dexterity = effective.attributeValues.Dexterity;
    if (dexterity === null || !Number.isFinite(dexterity)) {
      throw new Error("The encounter Creature snapshot has no usable effective Dexterity.");
    }
    const movementModes = effective.movement.flatMap(({ movementMode, effectiveValue }) => effectiveValue !== null && Number.isFinite(effectiveValue) && effectiveValue > 0
      ? [{ movementMode, baseMovement: effectiveValue, normalTotalInitiative: calculateNormalTotalInitiative(dexterity, effectiveValue) }]
      : []);
    if (!movementModes.length) throw new Error("The Initiative Creature has no usable authored Movement mode.");
    return { characterId, sourceKind: "creature-npc", dexterity, movementModes };
  }
  const [character] = await tx
    .select({
      id: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
    })
    .from(campaignCharacter)
    .where(and(
      eq(campaignCharacter.id, characterId),
      eq(campaignCharacter.campaignId, expectedCampaignId),
    ))
    .limit(1);
  if (!character) throw new Error("The Initiative Participant does not belong to this Campaign.");

  if (character.isNpc && character.npcKind === "creature") {
    const [profile] = await tx
      .select({ currentSnapshotJson: campaignCreatureNpcProfile.currentSnapshotJson })
      .from(campaignCreatureNpcProfile)
      .where(eq(campaignCreatureNpcProfile.characterId, characterId))
      .limit(1);
    if (!profile) throw new Error("The Creature NPC is missing its current authoritative snapshot.");
    const effective = resolveEffectiveCreatureStatistics(parseCreatureSnapshot(profile.currentSnapshotJson));
    const dexterity = effective.attributeValues.Dexterity;
    if (dexterity === null || !Number.isFinite(dexterity)) {
      throw new Error("The Creature NPC current snapshot has no usable effective Dexterity.");
    }
    const movementModes = effective.movement.flatMap(({ movementMode, effectiveValue }) => (
      effectiveValue !== null && Number.isFinite(effectiveValue) && effectiveValue > 0
        ? [{
            movementMode,
            baseMovement: effectiveValue,
            normalTotalInitiative: calculateNormalTotalInitiative(dexterity, effectiveValue),
          }]
        : []
    ));
    if (!movementModes.length) throw new Error("The Initiative Participant has no usable authoritative Movement mode.");
    return {
      characterId,
      sourceKind: "creature-npc",
      dexterity,
      movementModes,
    };
  }

  const [profile] = await tx
    .select({
      raceId: campaignCharacterProfile.raceId,
      baseMovementSteps: campaignCharacterProfile.baseMovementSteps,
    })
    .from(campaignCharacterProfile)
    .where(eq(campaignCharacterProfile.characterId, characterId))
    .limit(1);
  if (!profile?.raceId) throw new Error("The Character has no Race Movement profile for Initiative.");
  const [dexterityRow] = await tx
    .select({ value: campaignCharacterAttribute.value })
    .from(campaignCharacterAttribute)
    .where(and(
      eq(campaignCharacterAttribute.characterId, characterId),
      eq(campaignCharacterAttribute.attributeKey, "DEX"),
    ))
    .limit(1);
  if (!dexterityRow || !Number.isFinite(dexterityRow.value)) {
    throw new Error("The Character has no usable Dexterity for Initiative.");
  }
  const movementRows = await tx
    .select({
      movementMode: raceMovementMode.movementMode,
      racialBaseMovement: raceMovementMode.baseValue,
    })
    .from(raceMovementMode)
    .where(eq(raceMovementMode.raceId, profile.raceId))
    .orderBy(asc(raceMovementMode.sortOrder), asc(raceMovementMode.id));
  const movementModes = movementRows.flatMap(({ movementMode, racialBaseMovement }) => {
    const baseMovement = getCharacterMovementBaseValue(racialBaseMovement, profile.baseMovementSteps);
    return baseMovement !== null && Number.isFinite(baseMovement) && baseMovement > 0
      ? [{
          movementMode,
          baseMovement,
          normalTotalInitiative: calculateNormalTotalInitiative(dexterityRow.value, baseMovement),
        }]
      : [];
  });
  if (!movementModes.length) throw new Error("The Initiative Participant has no usable authoritative Movement mode.");
  return {
    characterId,
    sourceKind: character.isNpc ? "race-npc" : "player-character",
    dexterity: dexterityRow.value,
    movementModes,
  };
}
