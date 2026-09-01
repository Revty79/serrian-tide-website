import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  campaignCharacter,
  campaignCharacterActiveHealth,
  campaignCharacterActiveHealthPool,
  campaignCharacterAttribute,
  campaignCharacterInjury,
  campaignCharacterProfile,
  campaignCreatureNpcProfile,
} from "@/db/realm-schema";
import { requireSession } from "@/lib/server-access";

import {
  resolveCreatureHealthAnatomy,
  resolveHumanoidHealthAnatomy,
  type CreatureHealthSnapshot,
} from "./anatomy";
import { canMutateActiveHealth } from "./authorization";
import {
  createEmptyActiveHealthState,
  resolveActiveHealthView,
  resolveLocalizedDamageTarget,
} from "./health-rules";
import type {
  ActiveHealthAnatomy,
  ActiveHealthState,
  ActiveHealthView,
} from "./models";

export type ActiveHealthTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ActiveHealthTransactionContext = {
  characterId: number;
  anatomy: ActiveHealthAnatomy;
  state: ActiveHealthState;
  view: ActiveHealthView;
};

type MutationContext = {
  tx: ActiveHealthTransaction;
  characterId: number;
  anatomy: ActiveHealthAnatomy;
};

export type ApplyLocalizedDamageCommand = {
  characterId: number;
  amount: number;
  hitLocationNumber?: number | null;
  poolKey?: string | null;
  injuryName?: string;
  injuryNotes?: string;
};

export type AddInjuryCommand = {
  characterId: number;
  hitLocationNumber?: number | null;
  poolKey?: string | null;
  name: string;
  notes?: string;
  damageAmount?: number | null;
};

function assertCharacterId(characterId: number) {
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error("Active Health requires a saved Character.");
  }
}

function positiveAmount(amount: number, label: string) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return amount;
}

function optionalDamageAmount(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return null;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Injury Damage must be zero or greater when recorded.");
  }
  return amount;
}

function injuryName(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error("Injury Name is required.");
  if (normalized.length > 160) throw new Error("Injury Name must be 160 characters or fewer.");
  return normalized;
}

function injuryNotes(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  if (normalized.length > 5000) throw new Error("Injury Notes must be 5,000 characters or fewer.");
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`Creature snapshot ${label} is invalid.`);
  return value;
}

function nullableNumber(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Creature snapshot ${label} is invalid.`);
  }
  return value;
}

function numberValue(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Creature snapshot ${label} is invalid.`);
  }
  return value;
}

function parseCreatureHealthSnapshot(raw: string): CreatureHealthSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The Creature NPC current anatomy snapshot is not valid JSON.");
  }
  if (!isRecord(parsed)) throw new Error("The Creature NPC current anatomy snapshot is invalid.");
  const rawAttributes = parsed.attributes;
  const rawPools = parsed.hpPools;
  const rawLocations = parsed.hitLocations;
  if (!Array.isArray(rawAttributes) || !Array.isArray(rawPools) || !Array.isArray(rawLocations)) {
    throw new Error("The Creature NPC current anatomy snapshot is incomplete.");
  }

  const attributes = rawAttributes.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Creature snapshot Attribute ${index + 1} is invalid.`);
    return {
      attributeKey: textValue(value, "attributeKey", `Attribute ${index + 1} key`),
      value: nullableNumber(value, "value", `Attribute ${index + 1} value`),
    };
  });
  const hpPools = rawPools.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Creature snapshot HP Pool ${index + 1} is invalid.`);
    return {
      canonicalId: textValue(value, "canonicalId", `HP Pool ${index + 1} ID`),
      poolName: textValue(value, "poolName", `HP Pool ${index + 1} Name`),
      hpPercentage: nullableNumber(value, "hpPercentage", `HP Pool ${index + 1} percentage`),
      sortOrder: numberValue(value, "sortOrder", `HP Pool ${index + 1} order`),
    };
  });
  const hitLocations = rawLocations.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Creature snapshot Hit Location ${index + 1} is invalid.`);
    const poolKey = value.hpPoolCanonicalId;
    if (poolKey !== null && typeof poolKey !== "string") {
      throw new Error(`Creature snapshot Hit Location ${index + 1} HP Pool is invalid.`);
    }
    return {
      hitLocationNumber: numberValue(value, "hitLocationNumber", `Hit Location ${index + 1} number`),
      locationName: textValue(value, "locationName", `Hit Location ${index + 1} Name`),
      bodyPartsIncluded: textValue(value, "bodyPartsIncluded", `Hit Location ${index + 1} Body Parts`),
      hpPoolCanonicalId: poolKey,
      sortOrder: numberValue(value, "sortOrder", `Hit Location ${index + 1} order`),
    };
  });
  return { attributes, hpPools, hitLocations };
}

async function loadAnatomy(
  tx: ActiveHealthTransaction,
  characterId: number,
  npcKind: string,
): Promise<ActiveHealthAnatomy> {
  if (npcKind === "creature") {
    const [profile] = await tx
      .select({
        currentSnapshotJson: campaignCreatureNpcProfile.currentSnapshotJson,
        hpAdjustment: campaignCreatureNpcProfile.hpAdjustment,
      })
      .from(campaignCreatureNpcProfile)
      .where(eq(campaignCreatureNpcProfile.characterId, characterId))
      .limit(1);
    if (!profile) throw new Error("Creature NPC anatomy is missing.");
    return resolveCreatureHealthAnatomy(
      parseCreatureHealthSnapshot(profile.currentSnapshotJson),
      profile.hpAdjustment,
    );
  }

  const [profile] = await tx
    .select({ hpMultiplierSteps: campaignCharacterProfile.hpMultiplierSteps })
    .from(campaignCharacterProfile)
    .where(eq(campaignCharacterProfile.characterId, characterId))
    .limit(1);
  const [constitution] = await tx
    .select({ value: campaignCharacterAttribute.value })
    .from(campaignCharacterAttribute)
    .where(and(
      eq(campaignCharacterAttribute.characterId, characterId),
      eq(campaignCharacterAttribute.attributeKey, "CON"),
    ))
    .limit(1);
  if (!profile || !constitution) throw new Error("Character health anatomy is incomplete.");
  return resolveHumanoidHealthAnatomy(constitution.value, profile.hpMultiplierSteps);
}

async function readState(
  tx: ActiveHealthTransaction,
  characterId: number,
): Promise<ActiveHealthState> {
  const [health] = await tx
    .select({ totalDamage: campaignCharacterActiveHealth.totalDamage })
    .from(campaignCharacterActiveHealth)
    .where(eq(campaignCharacterActiveHealth.characterId, characterId))
    .limit(1);
  if (!health) return createEmptyActiveHealthState(characterId);

  const pools = await tx
    .select({
      poolKey: campaignCharacterActiveHealthPool.poolKey,
      poolNameSnapshot: campaignCharacterActiveHealthPool.poolNameSnapshot,
      damage: campaignCharacterActiveHealthPool.damage,
    })
    .from(campaignCharacterActiveHealthPool)
    .where(eq(campaignCharacterActiveHealthPool.characterId, characterId));
  const injuries = await tx
    .select()
    .from(campaignCharacterInjury)
    .where(eq(campaignCharacterInjury.characterId, characterId))
    .orderBy(
      asc(campaignCharacterInjury.resolved),
      desc(campaignCharacterInjury.createdAt),
      desc(campaignCharacterInjury.id),
    );

  return {
    characterId,
    totalDamage: health.totalDamage,
    pools,
    injuries: injuries.map((injury) => ({
      ...injury,
      createdAt: injury.createdAt.toISOString(),
      updatedAt: injury.updatedAt.toISOString(),
      resolvedAt: injury.resolvedAt?.toISOString() ?? null,
    })),
  };
}

async function ensureHealthRow(tx: ActiveHealthTransaction, characterId: number) {
  await tx
    .insert(campaignCharacterActiveHealth)
    .values({ characterId })
    .onConflictDoNothing({ target: campaignCharacterActiveHealth.characterId });
  await tx
    .select({ characterId: campaignCharacterActiveHealth.characterId })
    .from(campaignCharacterActiveHealth)
    .where(eq(campaignCharacterActiveHealth.characterId, characterId))
    .limit(1)
    .for("update");
}

/**
 * Active Health's transaction-capable read boundary for trusted server callers.
 * The caller owns authorization and the surrounding transaction. The health row
 * is created and locked so the returned state remains authoritative until that
 * transaction commits or rolls back.
 */
export async function lockActiveHealthInTransaction(
  tx: ActiveHealthTransaction,
  characterId: number,
  npcKind: string,
): Promise<ActiveHealthTransactionContext> {
  assertCharacterId(characterId);
  await ensureHealthRow(tx, characterId);
  const anatomy = await loadAnatomy(tx, characterId, npcKind);
  const state = await readState(tx, characterId);
  return {
    characterId,
    anatomy,
    state,
    view: resolveActiveHealthView(anatomy, state),
  };
}

/** Read-only companion used by preview flows. */
export async function readActiveHealthInTransaction(
  tx: ActiveHealthTransaction,
  characterId: number,
  npcKind: string,
): Promise<ActiveHealthTransactionContext> {
  assertCharacterId(characterId);
  const anatomy = await loadAnatomy(tx, characterId, npcKind);
  const state = await readState(tx, characterId);
  return {
    characterId,
    anatomy,
    state,
    view: resolveActiveHealthView(anatomy, state),
  };
}

/**
 * Persists a state already resolved by Active Health's pure rules. This keeps
 * external runtimes out of the health tables while allowing resource changes
 * and health changes to share one caller-owned database transaction.
 */
export async function persistActiveHealthStateInTransaction(
  tx: ActiveHealthTransaction,
  anatomy: ActiveHealthAnatomy,
  state: ActiveHealthState,
): Promise<ActiveHealthView> {
  assertCharacterId(state.characterId);
  if (!Number.isFinite(state.totalDamage) || state.totalDamage < 0) {
    throw new Error("Active Health total Damage must be zero or greater.");
  }
  const seenPoolKeys = new Set<string>();
  for (const pool of state.pools) {
    if (!pool.poolKey.trim() || !pool.poolNameSnapshot.trim()) {
      throw new Error("Active Health pool identity is incomplete.");
    }
    if (seenPoolKeys.has(pool.poolKey)) {
      throw new Error(`Active Health pool ${JSON.stringify(pool.poolKey)} is duplicated.`);
    }
    if (!Number.isFinite(pool.damage) || pool.damage < 0) {
      throw new Error(`Active Health pool ${JSON.stringify(pool.poolKey)} Damage must be zero or greater.`);
    }
    seenPoolKeys.add(pool.poolKey);
  }

  const now = new Date();
  await ensureHealthRow(tx, state.characterId);
  await tx
    .update(campaignCharacterActiveHealth)
    .set({ totalDamage: state.totalDamage, updatedAt: now })
    .where(eq(campaignCharacterActiveHealth.characterId, state.characterId));
  for (const pool of state.pools) {
    await tx
      .insert(campaignCharacterActiveHealthPool)
      .values({
        characterId: state.characterId,
        poolKey: pool.poolKey,
        poolNameSnapshot: pool.poolNameSnapshot,
        damage: pool.damage,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          campaignCharacterActiveHealthPool.characterId,
          campaignCharacterActiveHealthPool.poolKey,
        ],
        set: {
          poolNameSnapshot: pool.poolNameSnapshot,
          damage: pool.damage,
          updatedAt: now,
        },
      });
  }
  return resolveActiveHealthView(anatomy, state);
}

async function withAuthorizedHealthTransaction<T>(
  characterId: number,
  operation: (context: MutationContext) => Promise<T>,
): Promise<T> {
  assertCharacterId(characterId);
  const session = await requireSession();
  return db.transaction(async (tx) => {
    const roles = await tx
      .select({ role: userRole.role })
      .from(userRole)
      .where(eq(userRole.userId, session.user.id));
    const [entity] = await tx
      .select({
        characterId: campaignCharacter.id,
        playerUserId: campaignCharacter.playerUserId,
        isNpc: campaignCharacter.isNpc,
        npcKind: campaignCharacter.npcKind,
        campaignOwnerUserId: campaign.createdByUserId,
        membershipUserId: campaignPlayer.userId,
      })
      .from(campaignCharacter)
      .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
      .leftJoin(
        campaignPlayer,
        and(
          eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
          eq(campaignPlayer.userId, session.user.id),
        ),
      )
      .where(eq(campaignCharacter.id, characterId))
      .limit(1)
      .for("update", { of: campaignCharacter });
    if (!entity) throw new Error("Character not found.");
    if (!canMutateActiveHealth(
      { userId: session.user.id, roles: roles.map(({ role }) => role) },
      {
        playerUserId: entity.playerUserId,
        campaignOwnerUserId: entity.campaignOwnerUserId,
        isNpc: entity.isNpc,
        isCampaignMember: entity.membershipUserId === session.user.id,
      },
    )) {
      throw new Error("You do not have permission to manage this Character's Active Health.");
    }
    const anatomy = await loadAnatomy(tx, characterId, entity.npcKind);
    return operation({ tx, characterId, anatomy });
  });
}

async function readView(context: MutationContext): Promise<ActiveHealthView> {
  return resolveActiveHealthView(
    context.anatomy,
    await readState(context.tx, context.characterId),
  );
}

export async function getActiveHealth(characterId: number): Promise<ActiveHealthView> {
  return withAuthorizedHealthTransaction(characterId, readView);
}

export async function applyLocalizedDamageToCharacter(
  command: ApplyLocalizedDamageCommand,
): Promise<ActiveHealthView> {
  return withAuthorizedHealthTransaction(command.characterId, async (context) => {
    const target = resolveLocalizedDamageTarget(context.anatomy, command);
    const nameInput = command.injuryName?.trim() ?? "";
    const notes = injuryNotes(command.injuryNotes);
    if (!nameInput && notes) throw new Error("An Injury Name is required when Injury Notes are recorded.");
    const now = new Date();
    await ensureHealthRow(context.tx, context.characterId);
    await context.tx
      .update(campaignCharacterActiveHealth)
      .set({
        totalDamage: sql`${campaignCharacterActiveHealth.totalDamage} + ${target.amount}`,
        updatedAt: now,
      })
      .where(eq(campaignCharacterActiveHealth.characterId, context.characterId));
    await context.tx
      .insert(campaignCharacterActiveHealthPool)
      .values({
        characterId: context.characterId,
        poolKey: target.poolKey,
        poolNameSnapshot: target.poolName,
        damage: target.amount,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          campaignCharacterActiveHealthPool.characterId,
          campaignCharacterActiveHealthPool.poolKey,
        ],
        set: {
          poolNameSnapshot: target.poolName,
          damage: sql`${campaignCharacterActiveHealthPool.damage} + ${target.amount}`,
          updatedAt: now,
        },
      });
    if (nameInput) {
      await context.tx.insert(campaignCharacterInjury).values({
        characterId: context.characterId,
        poolKey: target.poolKey,
        poolNameSnapshot: target.poolName,
        hitLocationNumber: target.hitLocationNumber,
        hitLocationNameSnapshot: target.hitLocationName,
        name: injuryName(nameInput),
        notes,
        damageAmount: target.amount,
        updatedAt: now,
      });
    }
    return readView(context);
  });
}

export async function healCharacterFullBody(
  characterId: number,
  amountInput: number,
): Promise<ActiveHealthView> {
  const amount = positiveAmount(amountInput, "Healing");
  return withAuthorizedHealthTransaction(characterId, async (context) => {
    const now = new Date();
    await ensureHealthRow(context.tx, context.characterId);
    await context.tx
      .update(campaignCharacterActiveHealth)
      .set({
        totalDamage: sql`greatest(0, ${campaignCharacterActiveHealth.totalDamage} - ${amount})`,
        updatedAt: now,
      })
      .where(eq(campaignCharacterActiveHealth.characterId, context.characterId));
    await context.tx
      .update(campaignCharacterActiveHealthPool)
      .set({
        damage: sql`greatest(0, ${campaignCharacterActiveHealthPool.damage} - ${amount})`,
        updatedAt: now,
      })
      .where(eq(campaignCharacterActiveHealthPool.characterId, context.characterId));
    return readView(context);
  });
}

export async function healCharacterArea(
  characterId: number,
  poolKey: string,
  amountInput: number,
): Promise<ActiveHealthView> {
  const amount = positiveAmount(amountInput, "Healing");
  return withAuthorizedHealthTransaction(characterId, async (context) => {
    const pool = context.anatomy.pools.find((entry) => entry.key === poolKey);
    if (!pool) throw new Error(`HP Pool ${JSON.stringify(poolKey)} is not part of the current anatomy.`);
    await ensureHealthRow(context.tx, context.characterId);
    await context.tx
      .update(campaignCharacterActiveHealthPool)
      .set({
        poolNameSnapshot: pool.name,
        damage: sql`greatest(0, ${campaignCharacterActiveHealthPool.damage} - ${amount})`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(campaignCharacterActiveHealthPool.characterId, context.characterId),
        eq(campaignCharacterActiveHealthPool.poolKey, pool.key),
      ));
    return readView(context);
  });
}

export async function addCharacterInjury(command: AddInjuryCommand): Promise<ActiveHealthView> {
  const damageAmount = optionalDamageAmount(command.damageAmount);
  return withAuthorizedHealthTransaction(command.characterId, async (context) => {
    const target = resolveLocalizedDamageTarget(context.anatomy, {
      amount: damageAmount && damageAmount > 0 ? damageAmount : 1,
      hitLocationNumber: command.hitLocationNumber,
      poolKey: command.poolKey,
    });
    const now = new Date();
    await ensureHealthRow(context.tx, context.characterId);
    await context.tx.insert(campaignCharacterInjury).values({
      characterId: context.characterId,
      poolKey: target.poolKey,
      poolNameSnapshot: target.poolName,
      hitLocationNumber: target.hitLocationNumber,
      hitLocationNameSnapshot: target.hitLocationName,
      name: injuryName(command.name),
      notes: injuryNotes(command.notes),
      damageAmount,
      updatedAt: now,
    });
    return readView(context);
  });
}

export async function resolveCharacterInjury(
  characterId: number,
  injuryId: number,
): Promise<ActiveHealthView> {
  if (!Number.isInteger(injuryId) || injuryId <= 0) throw new Error("A saved Injury is required.");
  return withAuthorizedHealthTransaction(characterId, async (context) => {
    const now = new Date();
    const resolved = await context.tx
      .update(campaignCharacterInjury)
      .set({ resolved: true, resolvedAt: now, updatedAt: now })
      .where(and(
        eq(campaignCharacterInjury.id, injuryId),
        eq(campaignCharacterInjury.characterId, context.characterId),
        eq(campaignCharacterInjury.resolved, false),
      ))
      .returning({ id: campaignCharacterInjury.id });
    if (!resolved.length) throw new Error("The unresolved Injury could not be found.");
    return readView(context);
  });
}

export async function restoreCharacterHealth(characterId: number): Promise<ActiveHealthView> {
  return withAuthorizedHealthTransaction(characterId, async (context) => {
    const now = new Date();
    await ensureHealthRow(context.tx, context.characterId);
    await context.tx
      .update(campaignCharacterActiveHealth)
      .set({ totalDamage: 0, updatedAt: now })
      .where(eq(campaignCharacterActiveHealth.characterId, context.characterId));
    await context.tx
      .update(campaignCharacterActiveHealthPool)
      .set({ damage: 0, updatedAt: now })
      .where(eq(campaignCharacterActiveHealthPool.characterId, context.characterId));
    await context.tx
      .update(campaignCharacterInjury)
      .set({ resolved: true, resolvedAt: now, updatedAt: now })
      .where(and(
        eq(campaignCharacterInjury.characterId, context.characterId),
        eq(campaignCharacterInjury.resolved, false),
      ));
    return readView(context);
  });
}
