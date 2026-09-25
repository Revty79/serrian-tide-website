import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { armorProfile, itemArmorDamageModifier } from "@/db/item-schema";
import { race } from "@/db/race-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import { readRaceNaturalProtectionInTransaction } from "@/features/races/race-natural-protection-service";
import { raceHitLocations } from "@/features/races/race-anatomy";
import { buildProtectionLayers, type ProtectionLayers, type ProtectionTarget } from "./protection-layers";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Trusted server read, like the existing equipment/active-state transaction readers.
 * Caller must authorize the Character or exact Campaign/Encounter before calling. No public action or writes. */
export async function readProtectionLayersInTransaction(tx: Transaction, target: ProtectionTarget): Promise<ProtectionLayers> {
  let characterId: number;
  if (target.kind === "encounter-participant") {
    const [participant] = await tx.select().from(campaignSessionEncounterParticipant).where(and(
      eq(campaignSessionEncounterParticipant.campaignId, target.campaignId), eq(campaignSessionEncounterParticipant.encounterId, target.encounterId),
      eq(campaignSessionEncounterParticipant.characterId, target.participantId),
    )).limit(1);
    if (!participant) throw new Error("Protection target does not belong to this Campaign/Encounter.");
    if (participant.participantKind === "creature") {
      const local = object(participant.localStateJson);
      const modifiers = Array.isArray(local?.modifiers) ? local.modifiers.map(object).filter((entry): entry is Record<string, unknown> => entry !== null) : [];
      return buildProtectionLayers({ target, creature: { snapshot: participant.creatureSnapshotJson, identity: `encounter:${target.encounterId}:participant:${participant.participantId}` }, modifiers });
    }
    characterId = participant.characterId;
  } else characterId = target.characterId;
  if (!Number.isSafeInteger(characterId) || characterId <= 0) throw new Error("Protection needs a saved Character or exact Encounter participant.");
  const [character] = await tx.select({ npcKind: campaignCharacter.npcKind }).from(campaignCharacter).where(eq(campaignCharacter.id, characterId)).limit(1);
  if (!character) throw new Error("Protection Character no longer exists.");
  const equipment = await readCharacterEquipmentStateInTransaction(tx, characterId);
  const effects = await readActiveEffectsInTransaction(tx, characterId);
  const itemIds = [...new Set(equipment.wornArmor.map(({ itemId }) => itemId))];
  const armor = itemIds.length ? await tx.select({ itemId: armorProfile.itemId, text: armorProfile.damageModifiersSourceText }).from(armorProfile).where(inArray(armorProfile.itemId, itemIds)) : [];
  const damageModifiers = itemIds.length ? await tx.select().from(itemArmorDamageModifier).where(inArray(itemArmorDamageModifier.itemId, itemIds)).orderBy(asc(itemArmorDamageModifier.sortOrder), asc(itemArmorDamageModifier.id)) : [];
  const worn = equipment.wornArmor.map((entry) => ({ ...entry, damageModifiersSourceText: armor.find(({ itemId }) => itemId === entry.itemId)?.text ?? "",
    damageModifiers: damageModifiers.filter(({ itemId }) => itemId === entry.itemId).map(({ id, damageType, modifier, modifierText, notes }) => ({ id, damageType, modifier, modifierText, notes })) }));
  if (character.npcKind === "creature") {
    const [profile] = await tx.select({ snapshot: campaignCreatureNpcProfile.currentSnapshotJson }).from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId, characterId)).limit(1);
    if (!profile) throw new Error("Creature NPC protection snapshot is missing.");
    return buildProtectionLayers({ target, creature: { snapshot: profile.snapshot, identity: `creature-npc:${characterId}` }, worn, modifiers: effects.modifiers });
  }
  const [assignedRace] = await tx.select({ id: race.id, name: race.name, anatomy: race.anatomy }).from(campaignCharacterProfile)
    .innerJoin(race, eq(race.id, campaignCharacterProfile.raceId)).where(eq(campaignCharacterProfile.characterId, characterId)).limit(1);
  return buildProtectionLayers({ target, worn, modifiers: effects.modifiers, locations: raceHitLocations(assignedRace?.anatomy),
    race: assignedRace ? { ...assignedRace, protections: await readRaceNaturalProtectionInTransaction(tx, assignedRace.id) } : undefined });
}
