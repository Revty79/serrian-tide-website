import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { raceMovementMode } from "@/db/race-schema";
import {
  campaignCharacter,
  campaignCharacterActiveCondition,
  campaignCharacterActiveModifier,
  campaignCharacterProfile,
  campaignCreatureNpcProfile,
} from "@/db/realm-schema";
import { skill } from "@/db/skill-schema";
import type {
  ConditionApplyEffect,
  MechanicalEffectSource,
  ModifierApplyEffect,
  TemporaryModifierChannel,
} from "@/features/mechanical-effects";
import { validateMechanicalEffect } from "@/features/mechanical-effects";
import { requireSession } from "@/lib/server-access";

import {
  formatRuntimeDuration,
  getActiveModifierTotal,
  validateMovementModifierTarget,
  type ActiveCondition,
  type ActiveEffectsView,
  type ActiveModifier,
} from "./active-effects";
import type { ActiveHealthTransaction } from "./active-health-service";
import {
  canOperateCampaignState,
  canReadActiveState,
} from "./authorization";

export type ActiveEffectsTransaction = ActiveHealthTransaction;

type ApplySourceEffect = {
  characterId: number;
  effect: ConditionApplyEffect | ModifierApplyEffect;
  source: MechanicalEffectSource;
  sourceEffectKey?: string | null;
};

export type AddManualConditionCommand = {
  characterId: number;
  name: string;
  description: string;
  duration: ConditionApplyEffect["duration"];
};

export type AddManualModifierCommand = {
  characterId: number;
  label: string;
  channel: TemporaryModifierChannel;
  targetKey: string;
  amount: number;
  duration: ModifierApplyEffect["duration"];
};

function positiveCharacterId(value: number): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error("Active State requires a saved Character.");
  return value;
}

function snapshot(source: MechanicalEffectSource, effectKey?: string | null) {
  const sourceId = String(source.id).trim();
  const sourceName = source.name.trim();
  if (!sourceId || !sourceName) {
    throw new Error("Active State source identity and name are required.");
  }
  return {
    sourceKind: source.kind,
    sourceId,
    sourceName,
    sourceEffectKey: effectKey?.trim() || null,
  };
}

function conditionRow(row: typeof campaignCharacterActiveCondition.$inferSelect): ActiveCondition {
  return {
    id: row.id,
    characterId: row.characterId,
    name: row.name,
    description: row.description,
    source: { kind: row.sourceKind as ActiveCondition["source"]["kind"], id: row.sourceId, name: row.sourceName, effectKey: row.sourceEffectKey },
    duration: { kind: row.durationKind as ActiveCondition["duration"]["kind"], value: row.durationValue, label: row.durationLabel },
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolutionNote: row.resolutionNote,
  };
}

function modifierRow(row: typeof campaignCharacterActiveModifier.$inferSelect): ActiveModifier {
  return {
    id: row.id,
    characterId: row.characterId,
    label: row.label,
    channel: row.modifierChannel as ActiveModifier["channel"],
    targetKey: row.targetKey,
    amount: row.amount,
    source: { kind: row.sourceKind as ActiveModifier["source"]["kind"], id: row.sourceId, name: row.sourceName, effectKey: row.sourceEffectKey },
    duration: { kind: row.durationKind as ActiveModifier["duration"]["kind"], value: row.durationValue, label: row.durationLabel },
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    endNote: row.endNote,
  };
}

export async function readActiveEffectsInTransaction(
  tx: ActiveEffectsTransaction,
  characterId: number,
  includeHistory = false,
): Promise<ActiveEffectsView> {
  positiveCharacterId(characterId);
  const conditionRows = await tx.select().from(campaignCharacterActiveCondition).where(and(
      eq(campaignCharacterActiveCondition.characterId, characterId),
      ...(includeHistory ? [] : [isNull(campaignCharacterActiveCondition.resolvedAt)]),
    )).orderBy(asc(campaignCharacterActiveCondition.createdAt), asc(campaignCharacterActiveCondition.id));
  const modifierRows = await tx.select().from(campaignCharacterActiveModifier).where(and(
      eq(campaignCharacterActiveModifier.characterId, characterId),
      ...(includeHistory ? [] : [isNull(campaignCharacterActiveModifier.endedAt)]),
    )).orderBy(asc(campaignCharacterActiveModifier.createdAt), asc(campaignCharacterActiveModifier.id));
  return { characterId, conditions: conditionRows.map(conditionRow), modifiers: modifierRows.map(modifierRow) };
}

async function requireModifierTarget(
  tx: ActiveEffectsTransaction,
  characterId: number,
  effect: ModifierApplyEffect,
): Promise<void> {
  if (effect.channel === "skill") {
    const skillId = Number(effect.targetKey.slice("skill:".length));
    const found = await tx.select({ id: skill.id }).from(skill).where(and(
      eq(skill.id, skillId),
      isNull(skill.archivedAt),
    )).limit(1);
    const creatureProfile = await tx.select({ snapshot: campaignCreatureNpcProfile.currentSnapshotJson }).from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId, characterId)).limit(1);
    if (!found) throw new Error("Temporary Skill Modifier target does not exist in the Skill catalog.");
    if (creatureProfile[0]) {
      const parsed = JSON.parse(creatureProfile[0].snapshot) as { skillLinks?: Array<{ skillId?: unknown }> };
      const hasSkill = (parsed.skillLinks ?? []).some(({ skillId: linkedSkillId }) => linkedSkillId === skillId);
      if (!hasSkill) throw new Error("Temporary Skill Modifier target is not part of this Creature NPC's current Skill snapshot.");
    }
  }
  if (effect.channel !== "movement") return;
  const profile = await tx.select({ raceId: campaignCharacterProfile.raceId }).from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, characterId)).limit(1);
  const creatureProfile = await tx.select({ snapshot: campaignCreatureNpcProfile.currentSnapshotJson }).from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId, characterId)).limit(1);
  let modes: string[] = [];
  if (creatureProfile[0]) {
    const parsed = JSON.parse(creatureProfile[0].snapshot) as { movement?: Array<{ movementMode?: unknown }> };
    modes = (parsed.movement ?? []).flatMap(({ movementMode }) => typeof movementMode === "string" ? [movementMode] : []);
  } else if (profile[0]?.raceId) {
    const rows = await tx.select({ mode: raceMovementMode.movementMode }).from(raceMovementMode).where(eq(raceMovementMode.raceId, profile[0].raceId));
    modes = rows.map(({ mode }) => mode);
  }
  if (!validateMovementModifierTarget(effect.targetKey, modes)) {
    throw new Error("Temporary Movement Modifier target is not an existing Movement Mode for this entity.");
  }
}

export async function applyConditionInTransaction(
  tx: ActiveEffectsTransaction,
  input: ApplySourceEffect & { effect: ConditionApplyEffect },
): Promise<ActiveCondition> {
  positiveCharacterId(input.characterId);
  const validation = validateMechanicalEffect(input.effect);
  if (!validation.valid || validation.effect.kind !== "condition.apply") {
    throw new Error(validation.valid
      ? "Active Condition effect kind is invalid."
      : validation.issues.map(({ message }) => message).join(" "));
  }
  const effect = validation.effect;
  const duration = formatRuntimeDuration(effect.duration);
  const [created] = await tx.insert(campaignCharacterActiveCondition).values({
    characterId: input.characterId,
    name: effect.name,
    description: effect.description,
    ...snapshot(input.source, input.sourceEffectKey),
    durationKind: duration.kind,
    durationValue: duration.value,
    durationLabel: duration.label,
  }).returning();
  if (!created) throw new Error("Active Condition was not persisted.");
  return conditionRow(created);
}

export async function applyModifierInTransaction(
  tx: ActiveEffectsTransaction,
  input: ApplySourceEffect & { effect: ModifierApplyEffect },
): Promise<ActiveModifier> {
  positiveCharacterId(input.characterId);
  const validation = validateMechanicalEffect(input.effect);
  if (!validation.valid || validation.effect.kind !== "modifier.apply") {
    throw new Error(validation.valid
      ? "Active Modifier effect kind is invalid."
      : validation.issues.map(({ message }) => message).join(" "));
  }
  const effect = validation.effect;
  await requireModifierTarget(tx, input.characterId, effect);
  const duration = formatRuntimeDuration(effect.duration);
  const [created] = await tx.insert(campaignCharacterActiveModifier).values({
    characterId: input.characterId,
    label: effect.label,
    modifierChannel: effect.channel,
    targetKey: effect.targetKey,
    amount: effect.amount,
    ...snapshot(input.source, input.sourceEffectKey),
    durationKind: duration.kind,
    durationValue: duration.value,
    durationLabel: duration.label,
  }).returning();
  if (!created) throw new Error("Active Modifier was not persisted.");
  return modifierRow(created);
}

export async function resolveConditionInTransaction(
  tx: ActiveEffectsTransaction,
  characterId: number,
  conditionId: number,
  note = "",
): Promise<void> {
  const rows = await tx.update(campaignCharacterActiveCondition).set({ resolvedAt: new Date(), resolutionNote: note.trim() }).where(and(
    eq(campaignCharacterActiveCondition.id, conditionId),
    eq(campaignCharacterActiveCondition.characterId, characterId),
    isNull(campaignCharacterActiveCondition.resolvedAt),
  )).returning({ id: campaignCharacterActiveCondition.id });
  if (!rows.length) throw new Error("Active Condition was not found or was already resolved.");
}

export async function endModifierInTransaction(
  tx: ActiveEffectsTransaction,
  characterId: number,
  modifierId: number,
  note = "",
): Promise<void> {
  const rows = await tx.update(campaignCharacterActiveModifier).set({ endedAt: new Date(), endNote: note.trim() }).where(and(
    eq(campaignCharacterActiveModifier.id, modifierId),
    eq(campaignCharacterActiveModifier.characterId, characterId),
    isNull(campaignCharacterActiveModifier.endedAt),
  )).returning({ id: campaignCharacterActiveModifier.id });
  if (!rows.length) throw new Error("Active Modifier was not found or was already ended.");
}

type Access = { tx: ActiveEffectsTransaction; userId: string; roles: string[]; ownsCampaign: boolean };
async function withAccess<T>(
  characterId: number,
  access: "read" | "god-mutate",
  operation: (authorized: Access) => Promise<T>,
): Promise<T> {
  const session = await requireSession();
  return db.transaction(async (tx) => {
    const roles = await tx.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, session.user.id));
    const entities = await tx.select({ playerUserId: campaignCharacter.playerUserId, isNpc: campaignCharacter.isNpc, owner: campaign.createdByUserId, member: campaignPlayer.userId })
        .from(campaignCharacter).innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
        .leftJoin(campaignPlayer, and(eq(campaignPlayer.campaignId, campaignCharacter.campaignId), eq(campaignPlayer.userId, session.user.id)))
        .where(eq(campaignCharacter.id, characterId)).limit(1);
    const entity = entities[0];
    if (!entity) throw new Error("Character not found.");
    const roleNames = roles.map(({ role }) => role);
    const subject = { userId: session.user.id, roles: roleNames };
    const accessEntity = {
      playerUserId: entity.playerUserId,
      campaignOwnerUserId: entity.owner,
      isNpc: entity.isNpc,
      isCampaignMember: entity.member === session.user.id,
    };
    const ownsCampaign = canOperateCampaignState(
      subject,
      entity.owner,
    );
    const authorized = access === "read"
      ? canReadActiveState(subject, accessEntity)
      : ownsCampaign;
    if (!authorized) throw new Error("You do not have permission to access this entity's Active Conditions and Modifiers.");
    return operation({ tx, userId: session.user.id, roles: roleNames, ownsCampaign });
  });
}

function withEffectsReadAccess<T>(characterId: number, operation: (access: Access) => Promise<T>): Promise<T> {
  return withAccess(characterId, "read", operation);
}

function withManualEffectsMutationAccess<T>(characterId: number, operation: (access: Access) => Promise<T>): Promise<T> {
  return withAccess(characterId, "god-mutate", operation);
}

export function getActiveEffects(characterId: number, includeHistory = false): Promise<ActiveEffectsView> {
  return withEffectsReadAccess(characterId, ({ tx }) => readActiveEffectsInTransaction(tx, characterId, includeHistory));
}

export function addManualCondition(command: AddManualConditionCommand): Promise<ActiveEffectsView> {
  return withManualEffectsMutationAccess(command.characterId, async ({ tx, userId }) => {
    await applyConditionInTransaction(tx, { characterId: command.characterId, effect: { kind: "condition.apply", name: command.name, description: command.description, duration: command.duration }, source: { kind: "god", id: userId, name: "G.O.D. Manual Adjustment" } });
    return readActiveEffectsInTransaction(tx, command.characterId, true);
  });
}

export function addManualModifier(command: AddManualModifierCommand): Promise<ActiveEffectsView> {
  return withManualEffectsMutationAccess(command.characterId, async ({ tx, userId }) => {
    await applyModifierInTransaction(tx, { characterId: command.characterId, effect: { kind: "modifier.apply", label: command.label, channel: command.channel, targetKey: command.targetKey, amount: command.amount, duration: command.duration }, source: { kind: "god", id: userId, name: "G.O.D. Manual Adjustment" } });
    return readActiveEffectsInTransaction(tx, command.characterId, true);
  });
}

export function resolveManualCondition(characterId: number, conditionId: number, note = ""): Promise<ActiveEffectsView> {
  return withManualEffectsMutationAccess(characterId, async ({ tx }) => { await resolveConditionInTransaction(tx, characterId, conditionId, note); return readActiveEffectsInTransaction(tx, characterId, true); });
}

export function endManualModifier(characterId: number, modifierId: number, note = ""): Promise<ActiveEffectsView> {
  return withManualEffectsMutationAccess(characterId, async ({ tx }) => { await endModifierInTransaction(tx, characterId, modifierId, note); return readActiveEffectsInTransaction(tx, characterId, true); });
}

export async function getActiveModifierTotalInTransaction(tx: ActiveEffectsTransaction, characterId: number, channel: TemporaryModifierChannel, targetKey: string): Promise<number> {
  return getActiveModifierTotal((await readActiveEffectsInTransaction(tx, characterId)).modifiers, channel, targetKey);
}
