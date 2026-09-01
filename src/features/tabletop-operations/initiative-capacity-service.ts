import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { raceMovementMode } from "@/db/race-schema";
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

function selectMovementMode(
  movement: ReadonlyArray<{ movementMode: string; baseMovement: number | null }>,
  requestedMovementMode?: string,
): { movementMode: string; baseMovement: number } {
  const usable = movement.filter((entry): entry is { movementMode: string; baseMovement: number } => (
    entry.baseMovement !== null
    && Number.isFinite(entry.baseMovement)
    && entry.baseMovement > 0
  ));
  if (!usable.length) throw new Error("The Initiative Participant has no usable authoritative Movement mode.");
  const requested = requestedMovementMode?.trim().toLocaleLowerCase("en-US");
  if (!requested) return usable[0]!;
  const selected = usable.find(({ movementMode }) => movementMode.trim().toLocaleLowerCase("en-US") === requested);
  if (!selected) throw new Error("The selected Movement mode is not available to that Initiative Participant.");
  return selected;
}

function parseCreatureSnapshot(value: string): CreatureStatisticsSource {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("The Creature NPC current snapshot is not valid JSON.");
  }
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
    const selected = selectMovementMode(
      effective.movement.map(({ movementMode, effectiveValue }) => ({
        movementMode,
        baseMovement: effectiveValue,
      })),
      requestedMovementMode,
    );
    return {
      characterId,
      sourceKind: "creature-npc",
      dexterity,
      ...selected,
      normalTotalInitiative: calculateNormalTotalInitiative(dexterity, selected.baseMovement),
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
  const selected = selectMovementMode(
    movementRows.map(({ movementMode, racialBaseMovement }) => ({
      movementMode,
      baseMovement: getCharacterMovementBaseValue(racialBaseMovement, profile.baseMovementSteps),
    })),
    requestedMovementMode,
  );
  return {
    characterId,
    sourceKind: character.isNpc ? "race-npc" : "player-character",
    dexterity: dexterityRow.value,
    ...selected,
    normalTotalInitiative: calculateNormalTotalInitiative(dexterityRow.value, selected.baseMovement),
  };
}
