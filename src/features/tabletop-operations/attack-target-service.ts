import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import type { db } from "@/db";
import { itemArmorDamageModifier } from "@/db/item-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { getActiveModifierTotal } from "@/features/active-state/active-effects";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import type { ActiveHealthAnatomy } from "@/features/active-state/models";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";

import type { OwnedEncounterRuntimeContext } from "./runtime-integration-service";

export type AttackTargetTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AttackTargetSnapshot = Readonly<{
  participantId: number;
  name: string;
  participantKind: string;
  npcKind: string | null;
  anatomy: ActiveHealthAnatomy | null;
  sourceSnapshot: unknown;
}>;

export type AttackProtectionResolution = Readonly<{
  armor: number | null;
  soak: number | null;
  supported: boolean;
  snapshot: Record<string, unknown>;
  rulingReasons: readonly string[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function participantKey(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`${label} is invalid.`);
  return value;
}

function creatureAnatomy(snapshot: unknown): ActiveHealthAnatomy | null {
  if (!isRecord(snapshot)) return null;
  const pools = Array.isArray(snapshot.hpPools) ? snapshot.hpPools : [];
  const locations = Array.isArray(snapshot.hitLocations) ? snapshot.hitLocations : [];
  return {
    kind: "creature",
    totalMaximumHp: null,
    maximumHpNote: "Frozen direct-Creature occurrence anatomy.",
    pools: pools.flatMap((entry, sortOrder) => isRecord(entry) && typeof entry.canonicalId === "string" && typeof entry.poolName === "string" ? [{
      key: entry.canonicalId,
      name: entry.poolName,
      maximumHp: typeof entry.maximumHp === "number" ? entry.maximumHp : null,
      percentage: typeof entry.hpPercentage === "number" ? entry.hpPercentage : null,
      sortOrder: typeof entry.sortOrder === "number" ? entry.sortOrder : sortOrder,
    }] : []),
    hitLocations: locations.flatMap((entry) => isRecord(entry) && Number.isSafeInteger(entry.hitLocationNumber) && typeof entry.locationName === "string" ? [{
      result: Number(entry.hitLocationNumber),
      name: entry.locationName,
      bodyParts: typeof entry.bodyPartsIncluded === "string" ? entry.bodyPartsIncluded : entry.locationName,
      poolKey: typeof entry.hpPoolCanonicalId === "string" ? entry.hpPoolCanonicalId : null,
      poolName: null,
    }] : []),
  };
}

export async function readAttackTargetInTransaction(
  tx: AttackTargetTransaction,
  context: OwnedEncounterRuntimeContext,
  participantIdInput: number,
): Promise<AttackTargetSnapshot> {
  const participantId = participantKey(participantIdInput, "Attack target");
  const [participant] = await tx.select({
    participantId: campaignSessionEncounterParticipant.characterId,
    participantKind: campaignSessionEncounterParticipant.participantKind,
    displayLabel: campaignSessionEncounterParticipant.displayLabel,
    characterName: campaignCharacter.name,
    npcKind: campaignCharacter.npcKind,
    creatureSnapshot: campaignSessionEncounterParticipant.creatureSnapshotJson,
  }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId),
      eq(campaignCharacter.campaignId, campaignSessionEncounterParticipant.campaignId),
    ))
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
      eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
      eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
      eq(campaignSessionEncounterParticipant.characterId, participantId),
    )).limit(1);
  if (!participant) throw new Error("The exact attack target does not belong to this Encounter.");
  let anatomy: ActiveHealthAnatomy | null = null;
  if (participant.participantKind === "creature") {
    anatomy = creatureAnatomy(participant.creatureSnapshot);
  } else {
    try {
      anatomy = (await readActiveHealthInTransaction(
        tx,
        positiveId(participant.participantId, "Target Character"),
        participant.npcKind ?? "race",
      )).anatomy;
    } catch {
      anatomy = null;
    }
  }
  return {
    participantId,
    name: participant.participantKind === "creature"
      ? participant.displayLabel
      : participant.characterName ?? `Character #${participantId}`,
    participantKind: participant.participantKind,
    npcKind: participant.npcKind,
    anatomy,
    sourceSnapshot: participant.creatureSnapshot,
  };
}

function directCreatureProtection(
  target: AttackTargetSnapshot,
  hitLocationNumber: number | null,
): AttackProtectionResolution {
  const reasons: string[] = [];
  const snapshot = target.sourceSnapshot;
  const locations = isRecord(snapshot) && Array.isArray(snapshot.hitLocations) ? snapshot.hitLocations : [];
  const location = hitLocationNumber === null ? null : locations.find((entry) => isRecord(entry) && entry.hitLocationNumber === hitLocationNumber);
  if (!isRecord(location)) reasons.push("The frozen direct-Creature anatomy does not contain the resolved Hit Location.");
  const armor = isRecord(location) && typeof location.naturalArmor === "number" && Number.isFinite(location.naturalArmor) ? location.naturalArmor : isRecord(location) ? 0 : null;
  const soak = isRecord(location) && typeof location.soak === "number" && Number.isFinite(location.soak) ? location.soak : isRecord(location) ? 0 : null;
  if ((armor !== null && armor < 0) || (soak !== null && soak < 0)) reasons.push("Frozen Creature armor or soak is negative and requires a G.O.D. ruling.");
  if (isRecord(location) && typeof location.locationEffect === "string" && location.locationEffect.trim()) {
    reasons.push("The authored Creature Hit Location has an unsupported special location effect.");
  }
  return {
    armor: armor !== null && armor >= 0 ? armor : null,
    soak: soak !== null && soak >= 0 ? soak : null,
    supported: reasons.length === 0,
    snapshot: { participantKind: "creature", frozenLocation: location ?? null },
    rulingReasons: reasons,
  };
}

export async function resolveAttackProtectionInTransaction(
  tx: AttackTargetTransaction,
  target: AttackTargetSnapshot,
  hitLocationNumber: number | null,
  damageType: string | null,
): Promise<AttackProtectionResolution> {
  if (target.participantKind === "creature") return directCreatureProtection(target, hitLocationNumber);
  if (hitLocationNumber === null) {
    return { armor: null, soak: null, supported: false, snapshot: { participantKind: "campaign-character", hitLocationNumber: null }, rulingReasons: ["Armor and soak require an exact Hit Location."] };
  }
  const equipment = await readCharacterEquipmentStateInTransaction(tx, positiveId(target.participantId, "Target Character"));
  const relevantArmor = equipment.wornArmor.filter(({ coveredLocationKeys }) => coveredLocationKeys.includes(String(hitLocationNumber)));
  const itemIds = [...new Set(relevantArmor.map(({ itemId }) => itemId))];
  const damageModifiers = itemIds.length ? await tx.select().from(itemArmorDamageModifier)
    .where(inArray(itemArmorDamageModifier.itemId, itemIds))
    .orderBy(asc(itemArmorDamageModifier.itemId), asc(itemArmorDamageModifier.sortOrder), asc(itemArmorDamageModifier.id)) : [];
  const reasons: string[] = [];
  if (relevantArmor.length > 1) reasons.push("Multiple worn armor sources cover this Hit Location; no stacking rule was invented.");
  if (relevantArmor.some(({ baseSoak }) => baseSoak === null)) reasons.push("Location-relevant armor has no authored numeric base soak.");
  if (relevantArmor.some(({ baseSoak }) => baseSoak !== null && baseSoak < 0)) reasons.push("Location-relevant armor has negative authored soak and requires a G.O.D. ruling.");
  if (damageModifiers.length) reasons.push("Authored free-text armor damage-type modifiers require a G.O.D. ruling.");
  const activeEffects = await readActiveEffectsInTransaction(tx, target.participantId);
  const activeSoak = getActiveModifierTotal(activeEffects.modifiers, "soak", "self");
  if (activeSoak < 0) reasons.push("A negative active soak modifier requires a G.O.D. ruling for attack protection.");
  const armor = relevantArmor.length === 0 ? 0 : relevantArmor.length === 1 ? relevantArmor[0]!.baseSoak : null;
  return {
    armor,
    soak: activeSoak >= 0 ? activeSoak : null,
    supported: reasons.length === 0,
    snapshot: {
      participantKind: "campaign-character",
      hitLocationNumber,
      wornArmor: relevantArmor,
      activeSoakModifier: activeSoak,
      damageType,
      unsupportedDamageModifiers: damageModifiers,
    },
    rulingReasons: reasons,
  };
}
