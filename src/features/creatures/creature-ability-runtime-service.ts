import "server-only";

import { createHash } from "node:crypto";

import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign } from "@/db/campaign-schema";
import {
  campaignCharacter,
  campaignCreatureNpcProfile,
} from "@/db/realm-schema";
import {
  persistPlannedMechanicalEffectInTransaction,
  type PersistedMechanicalEffectObserver,
} from "@/features/active-state/mechanical-effect-service";
import {
  lockActiveHealthInTransaction,
  readActiveHealthInTransaction,
  type ActiveHealthTransaction,
} from "@/features/active-state/active-health-service";
import { requireSession } from "@/lib/server-access";

import { normalizeCreatureAbilityDefinition } from "./creature-ability";
import {
  executeCreatureAbilityUseInTransaction,
  planCreatureAbilityUse,
  type CreatureAbilityRuntimeTarget,
  type CreatureAbilityUsePlan,
  type CreatureAbilityUseRequest,
  type CreatureAbilityUseResult,
} from "./creature-ability-runtime";

export type CreatureAbilityTargetOption = {
  characterId: number;
  name: string;
  isNpc: boolean;
  npcKind: "race" | "creature";
};

export type CreatureAbilityUsePreparation = {
  plan: CreatureAbilityUsePlan;
  targetOptions: CreatureAbilityTargetOption[];
};

type SourceCreature = {
  characterId: number;
  campaignId: number;
  name: string;
  ability: ReturnType<typeof normalizeCreatureAbilityDefinition>;
  fingerprint: string;
};

type LoadedPlan = {
  campaignId: number;
  plan: CreatureAbilityUsePlan;
  targets: CreatureAbilityRuntimeTarget[];
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must reference a saved record.`);
  return value;
}

function validateRequest(input: CreatureAbilityUseRequest): CreatureAbilityUseRequest {
  positiveId(input.sourceCharacterId, "Creature Ability source");
  if (typeof input.abilityCanonicalId !== "string" || !input.abilityCanonicalId.trim()) {
    throw new Error("Creature Ability identity is required.");
  }
  if (!Array.isArray(input.targetCharacterIds)) throw new Error("Creature Ability targets must be an ordered list.");
  input.targetCharacterIds.forEach((targetId) => positiveId(targetId, "Creature Ability target"));
  if (typeof input.effectSelections !== "object" || input.effectSelections === null || Array.isArray(input.effectSelections)) {
    throw new Error("Creature Ability effect selections are invalid.");
  }
  for (const [key, selection] of Object.entries(input.effectSelections)) {
    if (!key.trim() || typeof selection !== "object" || selection === null || Array.isArray(selection)) {
      throw new Error("Creature Ability effect selection identity is invalid.");
    }
    if (selection.poolKey !== undefined && selection.poolKey !== null && typeof selection.poolKey !== "string") {
      throw new Error("Creature Ability HP Pool selection is invalid.");
    }
    if (
      selection.hitLocationNumber !== undefined
      && selection.hitLocationNumber !== null
      && !Number.isSafeInteger(selection.hitLocationNumber)
    ) throw new Error("Creature Ability hit-location selection is invalid.");
  }
  if (input.previewFingerprint !== null && typeof input.previewFingerprint !== "string") {
    throw new Error("Creature Ability preview fingerprint is invalid.");
  }
  return {
    ...input,
    abilityCanonicalId: input.abilityCanonicalId.trim(),
    targetCharacterIds: [...input.targetCharacterIds],
    effectSelections: { ...input.effectSelections },
  };
}

function parseAbilities(snapshotJson: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshotJson);
  } catch {
    throw new Error("The Creature NPC current snapshot is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("The Creature NPC current snapshot is invalid.");
  }
  const abilities = (parsed as { abilities?: unknown }).abilities;
  if (!Array.isArray(abilities)) throw new Error("The Creature NPC current snapshot has no valid Ability list.");
  return abilities.map(normalizeCreatureAbilityDefinition);
}

function fingerprintAbility(ability: ReturnType<typeof normalizeCreatureAbilityDefinition>): string {
  return createHash("sha256").update(JSON.stringify(ability)).digest("hex");
}

async function requireGodSubject(tx: ActiveHealthTransaction, userId: string): Promise<void> {
  const roles = await tx.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, userId));
  if (!roles.some(({ role }) => role === "god")) {
    throw new Error("Only a G.O.D. may use Creature NPC Abilities.");
  }
}

async function loadSourceCreature(
  tx: ActiveHealthTransaction,
  sourceCharacterId: number,
  abilityCanonicalId: string,
  userId: string,
  lock: boolean,
): Promise<SourceCreature> {
  const query = tx.select({
    characterId: campaignCharacter.id,
    campaignId: campaignCharacter.campaignId,
    name: campaignCharacter.name,
    isNpc: campaignCharacter.isNpc,
    npcKind: campaignCharacter.npcKind,
    campaignOwnerUserId: campaign.createdByUserId,
  }).from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .where(eq(campaignCharacter.id, sourceCharacterId))
    .limit(1);
  const sourceRows = await query;
  const source = sourceRows[0];
  if (!source || !source.isNpc || source.npcKind !== "creature") {
    throw new Error("Creature Ability source must be a saved Creature NPC.");
  }
  if (source.campaignOwnerUserId !== userId) {
    throw new Error("Only the Campaign-owning G.O.D. may use this Creature NPC Ability.");
  }
  const profileQuery = tx.select({ snapshot: campaignCreatureNpcProfile.currentSnapshotJson })
    .from(campaignCreatureNpcProfile)
    .where(eq(campaignCreatureNpcProfile.characterId, sourceCharacterId))
    .limit(1);
  const profileRows = lock ? await profileQuery.for("update") : await profileQuery;
  const profile = profileRows[0];
  if (!profile) throw new Error("Creature NPC current snapshot is missing.");
  const abilities = parseAbilities(profile.snapshot);
  const ability = abilities.find(({ canonicalId }) => canonicalId === abilityCanonicalId);
  if (!ability) throw new Error("The selected Ability is no longer present in this Creature NPC's current snapshot.");
  return {
    characterId: source.characterId,
    campaignId: source.campaignId,
    name: source.name,
    ability,
    fingerprint: fingerprintAbility(ability),
  };
}

async function loadTargets(
  tx: ActiveHealthTransaction,
  source: SourceCreature,
  targetCharacterIds: readonly number[],
  lock: boolean,
): Promise<CreatureAbilityRuntimeTarget[]> {
  if (!targetCharacterIds.length) return [];
  const uniqueIds = [...new Set(targetCharacterIds)];
  const query = tx.select({
    characterId: campaignCharacter.id,
    campaignId: campaignCharacter.campaignId,
    name: campaignCharacter.name,
    isNpc: campaignCharacter.isNpc,
    npcKind: campaignCharacter.npcKind,
  }).from(campaignCharacter)
    .where(inArray(campaignCharacter.id, uniqueIds))
    .orderBy(asc(campaignCharacter.id));
  const rows = await query;
  const byId = new Map(rows.map((row) => [row.characterId, row]));
  for (const targetId of uniqueIds) {
    const target = byId.get(targetId);
    if (!target) throw new Error(`Target Character ${targetId} was not found.`);
    if (target.campaignId !== source.campaignId) throw new Error("Creature Ability targets must belong to the source Creature's Campaign.");
  }
  const healthById = new Map<number, Awaited<ReturnType<typeof readActiveHealthInTransaction>>>();
  for (const targetId of [...uniqueIds].sort((left, right) => left - right)) {
    const target = byId.get(targetId)!;
    const npcKind = target.npcKind === "creature" ? "creature" : "race";
    const health = lock
      ? await lockActiveHealthInTransaction(tx, target.characterId, npcKind)
      : await readActiveHealthInTransaction(tx, target.characterId, npcKind);
    healthById.set(targetId, health);
  }
  const targets: CreatureAbilityRuntimeTarget[] = [];
  for (const targetId of targetCharacterIds) {
    const target = byId.get(targetId)!;
    const npcKind = target.npcKind === "creature" ? "creature" : "race";
    const health = healthById.get(targetId)!;
    targets.push({
      characterId: target.characterId,
      name: target.name,
      isNpc: target.isNpc,
      npcKind,
      anatomy: health.anatomy,
      state: health.state,
    });
  }
  return targets;
}

async function loadAuthoritativePlan(
  tx: ActiveHealthTransaction,
  request: CreatureAbilityUseRequest,
  userId: string,
  lock: boolean,
): Promise<LoadedPlan> {
  await requireGodSubject(tx, userId);
  const source = await loadSourceCreature(
    tx,
    request.sourceCharacterId,
    request.abilityCanonicalId,
    userId,
    lock,
  );
  if (lock && request.previewFingerprint !== source.fingerprint) {
    throw new Error("This Creature Ability changed after preview. Prepare a new authoritative preview before confirming.");
  }
  const targets = await loadTargets(tx, source, request.targetCharacterIds, lock);
  return {
    campaignId: source.campaignId,
    targets,
    plan: planCreatureAbilityUse({
      sourceCreature: { characterId: source.characterId, name: source.name },
      ability: source.ability,
      fingerprint: source.fingerprint,
      targets,
      targetCharacterIds: request.targetCharacterIds,
      effectSelections: request.effectSelections,
    }),
  };
}

async function listTargetOptions(
  tx: ActiveHealthTransaction,
  campaignId: number,
): Promise<CreatureAbilityTargetOption[]> {
  const rows = await tx.select({
    characterId: campaignCharacter.id,
    name: campaignCharacter.name,
    isNpc: campaignCharacter.isNpc,
    npcKind: campaignCharacter.npcKind,
  }).from(campaignCharacter)
    .where(eq(campaignCharacter.campaignId, campaignId))
    .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));
  return rows.map((row) => ({
    characterId: row.characterId,
    name: row.name,
    isNpc: row.isNpc,
    npcKind: row.npcKind === "creature" ? "creature" : "race",
  }));
}

export async function prepareCreatureAbilityUse(
  input: CreatureAbilityUseRequest,
): Promise<CreatureAbilityUsePreparation> {
  const request = validateRequest(input);
  const session = await requireSession();
  return db.transaction((tx) => prepareCreatureAbilityUseInTransaction(
    tx,
    request,
    session.user.id,
  ));
}

/** Caller-owned preview boundary used by Encounter orchestration. */
export async function prepareCreatureAbilityUseInTransaction(
  tx: ActiveHealthTransaction,
  input: CreatureAbilityUseRequest,
  actingUserId: string,
): Promise<CreatureAbilityUsePreparation> {
  const request = validateRequest(input);
  const loaded = await loadAuthoritativePlan(tx, request, actingUserId, false);
  const targetOptions = await listTargetOptions(tx, loaded.campaignId);
  return { plan: loaded.plan, targetOptions };
}

/** Executes one Creature Ability inside a transaction owned by the caller. */
export async function executeCreatureAbilityUseInCallerTransaction(
  tx: ActiveHealthTransaction,
  input: CreatureAbilityUseRequest,
  actingUserId: string,
  confirmed: boolean,
  onPersistedEffect?: PersistedMechanicalEffectObserver,
): Promise<CreatureAbilityUseResult> {
  const request = validateRequest(input);
  let loaded: LoadedPlan | null = null;
  return executeCreatureAbilityUseInTransaction(
    async (execute) => execute({
      loadAndPlan: async () => {
        loaded = await loadAuthoritativePlan(tx, request, actingUserId, true);
        return loaded.plan;
      },
      applyAutomaticEffect: async (application) => {
        const target = loaded?.targets.find(({ characterId }) => characterId === application.targetCharacterId);
        if (!target) throw new Error("The planned Creature Ability effect lost its authoritative target state.");
        const persisted = await persistPlannedMechanicalEffectInTransaction(tx, {
          plan: application.plan,
          targetCharacterId: application.targetCharacterId,
          sourceEffectKey: application.effectKey,
          targetAnatomy: target.anatomy,
        });
        if (persisted && onPersistedEffect) await onPersistedEffect(persisted);
      },
    }),
    confirmed,
  );
}

export async function executeCreatureAbilityUse(
  input: CreatureAbilityUseRequest,
  confirmed: boolean,
): Promise<CreatureAbilityUseResult> {
  const request = validateRequest(input);
  const session = await requireSession();
  return db.transaction((tx) => executeCreatureAbilityUseInCallerTransaction(
    tx,
    request,
    session.user.id,
    confirmed,
  ));
}
