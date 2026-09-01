"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { item, itemEffect, itemRuntimeProfile } from "@/db/item-schema";
import {
  campaignCharacter,
  campaignCharacterItem,
  campaignInventoryItem,
} from "@/db/realm-schema";
import {
  readActiveHealthInTransaction,
  type ActiveHealthTransaction,
} from "@/features/active-state/active-health-service";
import { persistPlannedMechanicalEffectInTransaction } from "@/features/active-state/mechanical-effect-service";
import {
  assertConsumableHasInactiveQuantityInTransaction,
  lockEquipmentStateCharacterInTransaction,
  reconcileItemPassiveEffectsInTransaction,
} from "@/features/items/equipment-state-service";
import {
  readItemChargeStateInTransaction,
  spendItemChargesInTransaction,
} from "@/features/items/item-charge-service";
import {
  canExecuteItemUse,
  executeItemUseInTransaction,
  getItemUseOwnershipRequirement,
  planItemUse,
  type ItemUseDefinition,
  type ItemUseExecutionResult,
  type ItemUsePlan,
  type ItemUseRequest,
  type ItemUseResource,
} from "@/features/items/item-use";
import {
  DEFAULT_ITEM_RUNTIME_PROFILE,
  validateItemRuntimeProfile,
  type ItemRuntimeProfile,
  type ItemUseMode,
} from "@/features/items/item-runtime";
import { requireSession } from "@/lib/server-access";

export type ItemUseTargetOption = {
  characterId: number;
  name: string;
  isNpc: boolean;
  npcKind: "race" | "creature";
};

export type ItemUsePreparation = {
  plan: ItemUsePlan;
  targetOptions: ItemUseTargetOption[];
  canChooseTarget: boolean;
};

type AccessEntity = {
  characterId: number;
  campaignId: number;
  name: string;
  playerUserId: string;
  campaignOwnerUserId: string;
  isNpc: boolean;
  npcKind: "race" | "creature";
  isCampaignMember: boolean;
};

type LoadedUse = {
  plan: ItemUsePlan;
  targetAnatomy: ItemUsePlan["initialHealth"]["anatomy"];
};

type RuntimeColumns = {
  runtimeUseMode: string | null;
  runtimeQuantityPerUse: number | null;
  runtimeMaximumCharges: number | null;
  runtimeChargesPerUse: number | null;
  runtimeRechargeNotes: string | null;
  runtimeActivationLabel: string | null;
  runtimeUseNotes: string | null;
};

function readRuntimeProfile(row: RuntimeColumns): ItemRuntimeProfile {
  const validation = validateItemRuntimeProfile(
    row.runtimeUseMode === null
      ? DEFAULT_ITEM_RUNTIME_PROFILE
      : {
          useMode: row.runtimeUseMode as ItemUseMode,
          quantityPerUse: row.runtimeQuantityPerUse,
          maximumCharges: row.runtimeMaximumCharges,
          chargesPerUse: row.runtimeChargesPerUse,
          rechargeNotes: row.runtimeRechargeNotes,
          activationLabel: row.runtimeActivationLabel,
          useNotes: row.runtimeUseNotes,
        },
  );
  if (!validation.valid) {
    throw new Error(validation.issues.map(({ message }) => message).join(" "));
  }
  return validation.profile;
}

function validateRequest(request: ItemUseRequest): ItemUseRequest {
  if (!Number.isInteger(request.sourceCharacterId) || request.sourceCharacterId <= 0) {
    throw new Error("Item use requires a saved source Character.");
  }
  if (!Number.isInteger(request.itemId) || request.itemId <= 0) {
    throw new Error("Item use requires a saved Item.");
  }
  if (
    request.itemInstanceId !== null
    && (!Number.isInteger(request.itemInstanceId) || request.itemInstanceId <= 0)
  ) {
    throw new Error("The selected owned Item copy is invalid.");
  }
  if (
    request.targetCharacterId !== null
    && (!Number.isInteger(request.targetCharacterId) || request.targetCharacterId <= 0)
  ) {
    throw new Error("The selected target Character is invalid.");
  }
  if (
    typeof request.effectSelections !== "object"
    || request.effectSelections === null
    || Array.isArray(request.effectSelections)
  ) {
    throw new Error("Item effect selections are invalid.");
  }
  return request;
}

async function loadAccessEntity(
  tx: ActiveHealthTransaction,
  characterId: number,
  userId: string,
  lock: boolean,
): Promise<AccessEntity> {
  const query = tx
    .select({
      characterId: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      name: campaignCharacter.name,
      playerUserId: campaignCharacter.playerUserId,
      campaignOwnerUserId: campaign.createdByUserId,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
      membershipUserId: campaignPlayer.userId,
    })
    .from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .leftJoin(
      campaignPlayer,
      and(
        eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
        eq(campaignPlayer.userId, userId),
      ),
    )
    .where(eq(campaignCharacter.id, characterId))
    .limit(1);
  const rows = lock
    ? await query.for("update", { of: campaignCharacter })
    : await query;
  const entity = rows[0];
  if (!entity) throw new Error("Character not found.");
  return {
    characterId: entity.characterId,
    campaignId: entity.campaignId,
    name: entity.name,
    playerUserId: entity.playerUserId,
    campaignOwnerUserId: entity.campaignOwnerUserId,
    isNpc: entity.isNpc,
    npcKind: entity.npcKind === "creature" ? "creature" : "race",
    isCampaignMember: entity.membershipUserId === userId,
  };
}

async function loadDefinition(
  tx: ActiveHealthTransaction,
  campaignId: number,
  itemId: number,
): Promise<ItemUseDefinition> {
  const [row] = await tx
    .select({
      id: item.id,
      name: item.name,
      runtimeUseMode: itemRuntimeProfile.useMode,
      runtimeQuantityPerUse: itemRuntimeProfile.quantityPerUse,
      runtimeMaximumCharges: itemRuntimeProfile.maximumCharges,
      runtimeChargesPerUse: itemRuntimeProfile.chargesPerUse,
      runtimeRechargeNotes: itemRuntimeProfile.rechargeNotes,
      runtimeActivationLabel: itemRuntimeProfile.activationLabel,
      runtimeUseNotes: itemRuntimeProfile.useNotes,
    })
    .from(campaignInventoryItem)
    .innerJoin(item, eq(item.id, campaignInventoryItem.itemId))
    .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
    .where(and(
      eq(campaignInventoryItem.campaignId, campaignId),
      eq(campaignInventoryItem.itemId, itemId),
    ))
    .limit(1);
  if (!row) throw new Error("That Item is not authorized for the source Character's Campaign.");
  const effects = await tx
    .select({
      id: itemEffect.id,
      schemaVersion: itemEffect.schemaVersion,
      effectJson: itemEffect.effectJson,
      sortOrder: itemEffect.sortOrder,
    })
    .from(itemEffect)
    .where(eq(itemEffect.itemId, itemId))
    .orderBy(asc(itemEffect.sortOrder), asc(itemEffect.id));
  return {
    id: row.id,
    name: row.name,
    runtimeProfile: readRuntimeProfile(row),
    effects,
  };
}

async function loadResource(
  tx: ActiveHealthTransaction,
  request: ItemUseRequest,
  profile: ItemRuntimeProfile,
  lock: boolean,
): Promise<ItemUseResource> {
  const requirement = getItemUseOwnershipRequirement(profile);
  if (requirement === "instance") {
    if (request.itemInstanceId === null) {
      throw new Error("Choose the specific owned Item copy to use.");
    }
    const owned = await readItemChargeStateInTransaction(tx, {
      characterId: request.sourceCharacterId,
      itemId: request.itemId,
      instanceId: request.itemInstanceId,
    }, lock);
    return {
      kind: "instance",
      instanceId: request.itemInstanceId,
      currentCharges: owned.currentCharges,
    };
  }

  if (request.itemInstanceId !== null) {
    throw new Error("This Item is stack-owned and cannot use an Item-copy identity.");
  }
  const query = tx
    .select({ quantity: campaignCharacterItem.quantity })
    .from(campaignCharacterItem)
    .where(and(
      eq(campaignCharacterItem.characterId, request.sourceCharacterId),
      eq(campaignCharacterItem.itemId, request.itemId),
    ))
    .limit(1);
  const rows = lock ? await query.for("update") : await query;
  return { kind: "stack", quantity: rows[0]?.quantity ?? 0 };
}

async function loadUse(
  tx: ActiveHealthTransaction,
  request: ItemUseRequest,
  userId: string,
  lock: boolean,
): Promise<LoadedUse> {
  const roles = await tx
    .select({ role: userRole.role })
    .from(userRole)
    .where(eq(userRole.userId, userId));
  const subject = { userId, roles: roles.map(({ role }) => role) };
  const source = await loadAccessEntity(tx, request.sourceCharacterId, userId, lock);
  const targetId = request.targetCharacterId ?? request.sourceCharacterId;
  const target = targetId === source.characterId
    ? source
    : await loadAccessEntity(tx, targetId, userId, lock);
  if (!canExecuteItemUse(subject, source, target)) {
    throw new Error("You do not have permission to use this Item with that source and target.");
  }

  const definition = await loadDefinition(tx, source.campaignId, request.itemId);
  const resource = await loadResource(tx, request, definition.runtimeProfile, lock);
  const health = await readActiveHealthInTransaction(
    tx,
    target.characterId,
    target.npcKind,
  );
  return {
    plan: planItemUse({
      definition,
      resource,
      requestedItemInstanceId: request.itemInstanceId,
      target: {
        characterId: target.characterId,
        name: target.name,
        anatomy: health.anatomy,
        state: health.state,
      },
      effectSelections: request.effectSelections,
    }),
    targetAnatomy: health.anatomy,
  };
}

async function listTargetOptions(
  tx: ActiveHealthTransaction,
  source: AccessEntity,
  userId: string,
  roles: readonly string[],
): Promise<{ options: ItemUseTargetOption[]; canChooseTarget: boolean }> {
  const canChooseTarget = roles.includes("god") && source.campaignOwnerUserId === userId;
  if (!canChooseTarget) {
    return {
      canChooseTarget: false,
      options: [{
        characterId: source.characterId,
        name: source.name,
        isNpc: source.isNpc,
        npcKind: source.npcKind,
      }],
    };
  }
  const rows = await tx
    .select({
      characterId: campaignCharacter.id,
      name: campaignCharacter.name,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
    })
    .from(campaignCharacter)
    .where(eq(campaignCharacter.campaignId, source.campaignId))
    .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));
  return {
    canChooseTarget: true,
    options: rows.map((row) => ({
      characterId: row.characterId,
      name: row.name,
      isNpc: row.isNpc,
      npcKind: row.npcKind === "creature" ? "creature" : "race",
    })),
  };
}

export async function prepareCharacterItemUse(
  input: ItemUseRequest,
): Promise<ItemUsePreparation> {
  const request = validateRequest(input);
  const session = await requireSession();
  return db.transaction((tx) => prepareCharacterItemUseInTransaction(
    tx,
    request,
    session.user.id,
  ));
}

/** Caller-owned preview boundary used by Tabletop Operations. */
export async function prepareCharacterItemUseInTransaction(
  tx: ActiveHealthTransaction,
  input: ItemUseRequest,
  actingUserId: string,
): Promise<ItemUsePreparation> {
  const request = validateRequest(input);
  const roles = await tx
    .select({ role: userRole.role })
    .from(userRole)
    .where(eq(userRole.userId, actingUserId));
  const source = await loadAccessEntity(tx, request.sourceCharacterId, actingUserId, false);
  const targets = await listTargetOptions(
    tx,
    source,
    actingUserId,
    roles.map(({ role }) => role),
  );
  const loaded = await loadUse(tx, request, actingUserId, false);
  return { plan: loaded.plan, targetOptions: targets.options, canChooseTarget: targets.canChooseTarget };
}

/** Executes one Item use inside a transaction owned by the caller. */
export async function executeCharacterItemUseInCallerTransaction(
  tx: ActiveHealthTransaction,
  input: ItemUseRequest,
  actingUserId: string,
): Promise<ItemUseExecutionResult> {
  const request = validateRequest(input);
  let loaded: LoadedUse | null = null;
  return executeItemUseInTransaction(async (execute) => execute({
    loadAndPlan: async () => {
      await lockEquipmentStateCharacterInTransaction(tx, request.sourceCharacterId);
      loaded = await loadUse(tx, request, actingUserId, true);
      return loaded.plan;
    },
    consumeResource: async (resource) => {
      if (resource.kind === "stack") {
        if (resource.useMode === "unlimited") return;
        await assertConsumableHasInactiveQuantityInTransaction(tx, {
          characterId: request.sourceCharacterId,
          itemId: request.itemId,
          ownedQuantity: resource.before,
          consumeQuantity: resource.before - resource.after,
        });
        if (resource.after === 0) {
          const deleted = await tx.delete(campaignCharacterItem).where(and(
            eq(campaignCharacterItem.characterId, request.sourceCharacterId),
            eq(campaignCharacterItem.itemId, request.itemId),
          )).returning({ itemId: campaignCharacterItem.itemId });
          if (!deleted.length) throw new Error("The owned Item stack changed before use could resolve.");
          await reconcileItemPassiveEffectsInTransaction(tx, request.sourceCharacterId, [request.itemId]);
          return;
        }
        const updated = await tx.update(campaignCharacterItem).set({ quantity: resource.after }).where(and(
          eq(campaignCharacterItem.characterId, request.sourceCharacterId),
          eq(campaignCharacterItem.itemId, request.itemId),
        )).returning({ itemId: campaignCharacterItem.itemId });
        if (!updated.length) throw new Error("The owned Item stack changed before use could resolve.");
        await reconcileItemPassiveEffectsInTransaction(tx, request.sourceCharacterId, [request.itemId]);
        return;
      }
      const spent = await spendItemChargesInTransaction(tx, {
        characterId: request.sourceCharacterId,
        itemId: request.itemId,
        instanceId: resource.instanceId,
      });
      if (spent.currentCharges !== resource.after) {
        throw new Error("The authoritative Charge spend no longer matches the planned Item use.");
      }
    },
    applyAutomaticEffect: async (effect) => {
      const context = loaded;
      if (!context) throw new Error("The planned Item effect lost its authoritative target state.");
      await persistPlannedMechanicalEffectInTransaction(tx, {
        plan: effect.plan,
        targetCharacterId: context.plan.target.characterId,
        sourceEffectKey: String(effect.effectId),
        targetAnatomy: context.targetAnatomy,
      });
    },
  }));
}

export async function executeCharacterItemUse(
  input: ItemUseRequest,
): Promise<ItemUseExecutionResult> {
  const request = validateRequest(input);
  const session = await requireSession();
  const result = await db.transaction((tx) => executeCharacterItemUseInCallerTransaction(
    tx,
    request,
    session.user.id,
  ));

  revalidatePath(`/realms/characters/${request.sourceCharacterId}`);
  revalidatePath(`/heavens/characters/${request.sourceCharacterId}`);
  revalidatePath(`/heavens/npcs/${request.sourceCharacterId}`);
  if (request.targetCharacterId !== null && request.targetCharacterId !== request.sourceCharacterId) {
    revalidatePath(`/realms/characters/${request.targetCharacterId}`);
    revalidatePath(`/heavens/characters/${request.targetCharacterId}`);
    revalidatePath(`/heavens/npcs/${request.targetCharacterId}`);
  }
  return result;
}
