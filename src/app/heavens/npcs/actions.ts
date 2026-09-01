"use server";

import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  CREATURE_CR_IMPACTS,
  CREATURE_SIZE_OPTIONS,
  type CreatureCrImpact,
  type CreatureSize,
} from "@/db/creature-schema";
import { item, itemEffect, itemRuntimeProfile } from "@/db/item-schema";
import {
  campaignCharacter,
  campaignCharacterActiveHealthPool,
  campaignCharacterAttribute,
  campaignCharacterInjury,
  campaignCharacterItem,
  campaignCharacterItemInstance,
  campaignCharacterProfile,
  campaignCreatureNpcProfile,
  campaignInventoryItem,
} from "@/db/realm-schema";
import {
  getCreature,
  type CreatureAggregate,
  type CreatureDraft,
} from "@/app/heavens/creatures/actions";
import { CHARACTER_ATTRIBUTE_KEYS } from "@/features/characters/models";
import {
  copyCreatureAbility,
  normalizeCreatureSnapshotAbilities,
} from "@/features/creatures/creature-ability";
import {
  assertItemOwnershipStrategy,
  assertNoStackInstanceOwnershipCollision,
  getStartingItemInstanceCharges,
  planOwnedItemInstancePersistence,
  validateCurrentItemCharges,
  type DraftOwnedItemInstance,
} from "@/features/items/item-ownership";
import {
  DEFAULT_ITEM_RUNTIME_PROFILE,
  validateItemRuntimeProfile,
  type ItemRuntimeProfile,
  type ItemUseMode,
} from "@/features/items/item-runtime";
import {
  reconcileEquipmentAfterOwnershipMutationInTransaction,
  validateEquipmentOwnershipMutationInTransaction,
} from "@/features/items/equipment-state-service";
import { requireGod } from "@/lib/server-access";

export type CreatureNpcDraft = {
  characterId: number;
  campaignId: number;
  creatureId: number;
  creatureName: string;
  campaignName: string;
  name: string;
  personality: string;
  instanceNotes: string;
  hpAdjustment: number;
  baselineSnapshot: CreatureDraft;
  currentSnapshot: CreatureDraft;
  items: Array<{ itemId: number; quantity: number; unitCostCredits: number }>;
  itemInstances: Array<DraftOwnedItemInstance & {
    currentCharges: number;
    acquiredAt: string | null;
  }>;
  authorizedItems: Array<{
    id: number;
    name: string;
    canonicalId: string;
    catalogScope: string;
    equipmentGroup: string | null;
    category: string;
    credits: number | null;
    isMagical: boolean;
    effectCount: number;
    runtimeProfile: ItemRuntimeProfile;
  }>;
};

type ItemRuntimeColumns = {
  runtimeUseMode: string | null;
  runtimeQuantityPerUse: number | null;
  runtimeMaximumCharges: number | null;
  runtimeChargesPerUse: number | null;
  runtimeRechargeNotes: string | null;
  runtimeActivationLabel: string | null;
  runtimeUseNotes: string | null;
};

function readItemRuntimeProfile(row: ItemRuntimeColumns): ItemRuntimeProfile {
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
  if (!validation.valid) throw new Error(validation.issues.map(({ message }) => message).join(" "));
  return validation.profile;
}

async function requireOwner(campaignId: number) {
  const session = await requireGod();
  const [owned] = await db
    .select({ id: campaign.id })
    .from(campaign)
    .where(and(eq(campaign.id, campaignId), eq(campaign.createdByUserId, session.user.id)))
    .limit(1);
  if (!owned) throw new Error("Only the Campaign creator can manage its NPCs.");
  return session;
}

function snapshotFromAggregate(aggregate: CreatureAggregate): CreatureDraft {
  return {
    id: aggregate.id,
    core: { ...aggregate.core },
    attributes: aggregate.attributes.map((row) => ({ ...row })),
    movement: aggregate.movement.map((row) => ({ ...row })),
    hpPools: aggregate.hpPools.map((row) => ({ ...row })),
    hitLocations: aggregate.hitLocations.map((row) => ({ ...row })),
    attacks: aggregate.attacks.map((row) => ({ ...row })),
    skillLinks: aggregate.skillLinks.map((row) => ({ ...row })),
    abilities: aggregate.abilities.map((row) => ({
      ...copyCreatureAbility(row),
      crImpact: row.crImpact,
    })),
    defenses: aggregate.defenses.map((row) => ({ ...row })),
    uses: aggregate.uses.map((row) => ({ ...row })),
    derivedCreatures: [],
  };
}

function normalizeSnapshotCore(core: CreatureDraft["core"]): CreatureDraft["core"] {
  const size = core.size as CreatureSize;
  if (!CREATURE_SIZE_OPTIONS.includes(size)) {
    throw new Error(`Creature Size must be one of: ${CREATURE_SIZE_OPTIONS.join(", ")}.`);
  }
  const steps = (value: number | null | undefined, label: string) => {
    const normalized = value ?? 0;
    if (!Number.isInteger(normalized) || normalized < 0) {
      throw new Error(`${label} must be a whole number zero or greater.`);
    }
    return normalized;
  };
  return {
    ...core,
    size,
    hpMultiplierSteps: steps(core.hpMultiplierSteps, "HP Multiplier Steps"),
    baseMovementSteps: steps(core.baseMovementSteps, "Base Movement Steps"),
    baseMagicSteps: steps(core.baseMagicSteps, "Base Magic Steps"),
  };
}

function parseSnapshot(value: string, label: string): CreatureDraft {
  try {
    const parsed = JSON.parse(value) as CreatureDraft;
    const normalized = normalizeCreatureSnapshotAbilities(parsed);
    return {
      ...parsed,
      core: normalizeSnapshotCore(parsed.core),
      abilities: normalized.abilities.map((ability) => ({
        ...ability,
        crImpact: CREATURE_CR_IMPACTS.includes(ability.crImpact as CreatureCrImpact)
          ? ability.crImpact as CreatureCrImpact
          : "None",
      })),
    };
  } catch (error) {
    throw new Error(`${label} contains invalid Creature data: ${error instanceof Error ? error.message : "Unreadable snapshot."}`);
  }
}

export async function createCreatureNpc(
  campaignId: number,
  creatureId: number,
): Promise<CreatureNpcDraft> {
  const session = await requireOwner(campaignId);
  const template = await getCreature(creatureId);
  if (!template) throw new Error("The selected master Creature no longer exists.");
  const snapshot = snapshotFromAggregate(template);
  const [campaignRow] = await db
    .select({ name: campaign.name, startingCredits: campaign.startingCreditAmount })
    .from(campaign)
    .where(eq(campaign.id, campaignId))
    .limit(1);
  if (!campaignRow) throw new Error("Campaign not found.");

  const characterId = await db.transaction(async (tx) => {
    await tx
      .insert(campaignPlayer)
      .values({ campaignId, userId: session.user.id, isNpcController: true })
      .onConflictDoNothing();
    const [created] = await tx.insert(campaignCharacter).values({
      campaignId,
      playerUserId: session.user.id,
      name: template.core.canonicalName,
      isNpc: true,
      npcKind: "creature",
    }).returning({ id: campaignCharacter.id });
    await tx.insert(campaignCharacterProfile).values({
      characterId: created.id,
      creditsRemaining: campaignRow.startingCredits,
    });
    await tx.insert(campaignCharacterAttribute).values(
      CHARACTER_ATTRIBUTE_KEYS.map((attributeKey) => ({ characterId: created.id, attributeKey, value: 25 })),
    );
    await tx.insert(campaignCreatureNpcProfile).values({
      characterId: created.id,
      creatureId,
      personality: "",
      instanceNotes: "",
      hpAdjustment: 0,
      baselineSnapshotJson: JSON.stringify(snapshot),
      currentSnapshotJson: JSON.stringify(snapshot),
    });
    return created.id;
  });

  revalidatePath("/heavens/npcs");
  return getCreatureNpc(characterId);
}

export async function getCreatureNpc(characterId: number): Promise<CreatureNpcDraft> {
  const [core] = await db
    .select({
      characterId: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      name: campaignCharacter.name,
      npcKind: campaignCharacter.npcKind,
      campaignName: campaign.name,
    })
    .from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .where(and(eq(campaignCharacter.id, characterId), eq(campaignCharacter.isNpc, true)))
    .limit(1);
  if (!core || core.npcKind !== "creature") throw new Error("Creature NPC not found.");
  await requireOwner(core.campaignId);

  const [profile] = await db
    .select()
    .from(campaignCreatureNpcProfile)
    .where(eq(campaignCreatureNpcProfile.characterId, characterId))
    .limit(1);
  if (!profile) throw new Error("Creature NPC profile is missing.");

  const [template, ownedItems, ownedItemInstances, authorizedItems] = await Promise.all([
    getCreature(profile.creatureId),
    db.select({
      itemId: campaignCharacterItem.itemId,
      quantity: campaignCharacterItem.quantity,
      unitCostCredits: campaignCharacterItem.unitCostCredits,
      runtimeUseMode: itemRuntimeProfile.useMode,
      runtimeQuantityPerUse: itemRuntimeProfile.quantityPerUse,
      runtimeMaximumCharges: itemRuntimeProfile.maximumCharges,
      runtimeChargesPerUse: itemRuntimeProfile.chargesPerUse,
      runtimeRechargeNotes: itemRuntimeProfile.rechargeNotes,
      runtimeActivationLabel: itemRuntimeProfile.activationLabel,
      runtimeUseNotes: itemRuntimeProfile.useNotes,
    })
      .from(campaignCharacterItem)
      .innerJoin(item, eq(item.id, campaignCharacterItem.itemId))
      .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
      .where(eq(campaignCharacterItem.characterId, characterId)),
    db.select({
      id: campaignCharacterItemInstance.id,
      itemId: campaignCharacterItemInstance.itemId,
      currentCharges: campaignCharacterItemInstance.currentCharges,
      unitCostCredits: campaignCharacterItemInstance.unitCostCredits,
      acquiredAt: campaignCharacterItemInstance.acquiredAt,
      runtimeUseMode: itemRuntimeProfile.useMode,
      runtimeQuantityPerUse: itemRuntimeProfile.quantityPerUse,
      runtimeMaximumCharges: itemRuntimeProfile.maximumCharges,
      runtimeChargesPerUse: itemRuntimeProfile.chargesPerUse,
      runtimeRechargeNotes: itemRuntimeProfile.rechargeNotes,
      runtimeActivationLabel: itemRuntimeProfile.activationLabel,
      runtimeUseNotes: itemRuntimeProfile.useNotes,
    })
      .from(campaignCharacterItemInstance)
      .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId))
      .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
      .where(eq(campaignCharacterItemInstance.characterId, characterId))
      .orderBy(asc(campaignCharacterItemInstance.id)),
    db.select({
      id: item.id,
      name: item.name,
      canonicalId: item.canonicalId,
      catalogScope: item.catalogScope,
      equipmentGroup: item.equipmentGroup,
      category: item.category,
      credits: item.credits,
      isMagical: item.isMagical,
      effectCount: sql<number>`(select count(*)::int from ${itemEffect} where ${itemEffect.itemId} = ${item.id})`,
      runtimeUseMode: itemRuntimeProfile.useMode,
      runtimeQuantityPerUse: itemRuntimeProfile.quantityPerUse,
      runtimeMaximumCharges: itemRuntimeProfile.maximumCharges,
      runtimeChargesPerUse: itemRuntimeProfile.chargesPerUse,
      runtimeRechargeNotes: itemRuntimeProfile.rechargeNotes,
      runtimeActivationLabel: itemRuntimeProfile.activationLabel,
      runtimeUseNotes: itemRuntimeProfile.useNotes,
    }).from(campaignInventoryItem)
      .innerJoin(item, eq(item.id, campaignInventoryItem.itemId))
      .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
      .where(eq(campaignInventoryItem.campaignId, core.campaignId))
      .orderBy(asc(item.name)),
  ]);

  assertNoStackInstanceOwnershipCollision({
    definitions: [
      ...ownedItems.map((entry) => ({ itemId: entry.itemId, runtimeProfile: readItemRuntimeProfile(entry) })),
      ...ownedItemInstances.map((entry) => ({ itemId: entry.itemId, runtimeProfile: readItemRuntimeProfile(entry) })),
    ],
    stacks: ownedItems,
    instances: ownedItemInstances,
  });

  return {
    characterId,
    campaignId: core.campaignId,
    creatureId: profile.creatureId,
    creatureName: template?.core.canonicalName ?? `Creature ${profile.creatureId}`,
    campaignName: core.campaignName,
    name: core.name,
    personality: profile.personality,
    instanceNotes: profile.instanceNotes,
    hpAdjustment: profile.hpAdjustment,
    baselineSnapshot: parseSnapshot(profile.baselineSnapshotJson, "Baseline snapshot"),
    currentSnapshot: parseSnapshot(profile.currentSnapshotJson, "Current snapshot"),
    items: ownedItems.map(({ itemId, quantity, unitCostCredits }) => ({ itemId, quantity, unitCostCredits })),
    itemInstances: ownedItemInstances.map((entry) => ({
      draftId: entry.id,
      instanceId: entry.id,
      itemId: entry.itemId,
      currentCharges: validateCurrentItemCharges(entry.currentCharges),
      unitCostCredits: entry.unitCostCredits,
      acquiredAt: entry.acquiredAt.toISOString(),
    })),
    authorizedItems: authorizedItems.map((entry) => ({
      id: entry.id,
      name: entry.name,
      canonicalId: entry.canonicalId,
      catalogScope: entry.catalogScope,
      equipmentGroup: entry.equipmentGroup,
      category: entry.category,
      credits: entry.credits,
      isMagical: entry.isMagical,
      effectCount: entry.effectCount,
      runtimeProfile: readItemRuntimeProfile(entry),
    })),
  };
}

export async function saveCreatureNpc(input: CreatureNpcDraft): Promise<CreatureNpcDraft> {
  await requireOwner(input.campaignId);
  const current = await getCreatureNpc(input.characterId);
  if (current.campaignId !== input.campaignId || current.creatureId !== input.creatureId) {
    throw new Error("Creature NPC identity cannot be changed.");
  }
  const name = input.name.trim();
  if (!name) throw new Error("Creature NPC Name is required.");
  if (!Number.isFinite(input.hpAdjustment)) throw new Error("HP Adjustment must be a number.");
  if (input.currentSnapshot.core.canonicalId !== current.baselineSnapshot.core.canonicalId) {
    throw new Error("The Creature template identity cannot be changed on an individual NPC.");
  }

  const unique = (values: string[], label: string) => {
    const seen = new Set<string>();
    for (const raw of values) {
      const value = raw.trim();
      if (!value) throw new Error(`${label} is required.`);
      const key = value.toLowerCase();
      if (seen.has(key)) throw new Error(`${label} cannot be duplicated.`);
      seen.add(key);
    }
  };
  unique(input.currentSnapshot.attributes.map((row) => row.attributeKey), "Attribute");
  unique(input.currentSnapshot.movement.map((row) => row.movementMode), "Movement Mode");
  unique(input.currentSnapshot.hpPools.map((row) => row.canonicalId), "HP Pool ID");
  unique(input.currentSnapshot.attacks.map((row) => row.canonicalId), "Attack ID");
  unique(input.currentSnapshot.abilities.map((row) => row.canonicalId), "Ability ID");
  const normalizedAbilities = normalizeCreatureSnapshotAbilities(input.currentSnapshot).abilities.map((ability) => ({
    ...ability,
    crImpact: CREATURE_CR_IMPACTS.includes(ability.crImpact as CreatureCrImpact)
      ? ability.crImpact as CreatureCrImpact
      : "None" as CreatureCrImpact,
  }));

  const authorizedIds = new Set(current.authorizedItems.map(({ id }) => id));
  const authorizedById = new Map(current.authorizedItems.map((entry) => [entry.id, entry]));
  const seenItems = new Set<number>();
  const items = input.items.map((entry) => {
    if (!authorizedIds.has(entry.itemId)) throw new Error("Creature NPC inventory must use Campaign-authorized Items.");
    if (seenItems.has(entry.itemId)) throw new Error("An Item can only appear once in Creature NPC inventory.");
    if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) throw new Error("Creature NPC Item quantity must be a positive whole number.");
    seenItems.add(entry.itemId);
    const source = authorizedById.get(entry.itemId);
    if (!source) throw new Error("Creature NPC inventory must use Campaign-authorized Items.");
    assertItemOwnershipStrategy(source.runtimeProfile, "stack", source.name);
    const existing = current.items.find((owned) => owned.itemId === entry.itemId);
    return {
      itemId: entry.itemId,
      quantity: entry.quantity,
      unitCostCredits: source.credits ?? existing?.unitCostCredits ?? 0,
    };
  });

  if (!Array.isArray(input.itemInstances)) throw new Error("Creature NPC Item instances are missing.");
  const existingInstances = new Map(
    current.itemInstances.flatMap((entry) => entry.instanceId === null ? [] : [[entry.instanceId, entry] as const]),
  );
  const seenDraftIds = new Set<number>();
  const seenInstanceIds = new Set<number>();
  const itemInstances = input.itemInstances.map((entry) => {
    if (!Number.isSafeInteger(entry.draftId) || seenDraftIds.has(entry.draftId)) {
      throw new Error("Every Creature NPC Item instance needs a distinct draft identity.");
    }
    seenDraftIds.add(entry.draftId);
    const source = authorizedById.get(entry.itemId);
    if (!source) throw new Error("Creature NPC Item instances must use Campaign-authorized Items.");
    assertItemOwnershipStrategy(source.runtimeProfile, "instance", source.name);
    if (entry.instanceId === null) {
      if (entry.draftId >= 0) throw new Error("An unsaved Creature NPC Item instance needs a temporary draft identity.");
      return {
        ...entry,
        currentCharges: getStartingItemInstanceCharges(source.runtimeProfile),
        unitCostCredits: source.credits ?? entry.unitCostCredits,
        acquiredAt: null,
      };
    }
    if (!Number.isInteger(entry.instanceId) || entry.instanceId <= 0 || seenInstanceIds.has(entry.instanceId)) {
      throw new Error("Creature NPC Item instance identity is invalid or duplicated.");
    }
    seenInstanceIds.add(entry.instanceId);
    const existing = existingInstances.get(entry.instanceId);
    if (
      !existing
      || existing.itemId !== entry.itemId
      || existing.currentCharges !== entry.currentCharges
      || Math.abs(existing.unitCostCredits - entry.unitCostCredits) > 0.000001
      || existing.acquiredAt !== entry.acquiredAt
    ) {
      throw new Error("Creature NPC Item instance state and acquisition data cannot be changed here.");
    }
    return entry;
  });
  assertNoStackInstanceOwnershipCollision({
    definitions: current.authorizedItems.map((entry) => ({ itemId: entry.id, runtimeProfile: entry.runtimeProfile })),
    stacks: items,
    instances: itemInstances,
  });

  const normalizedSnapshot: CreatureDraft = {
    ...input.currentSnapshot,
    abilities: normalizedAbilities,
    id: current.baselineSnapshot.id,
    core: {
      ...normalizeSnapshotCore(input.currentSnapshot.core),
      canonicalId: current.baselineSnapshot.core.canonicalId,
      canonicalName: current.baselineSnapshot.core.canonicalName,
      parentCreatureId: current.baselineSnapshot.core.parentCreatureId,
      parentCreatureName: current.baselineSnapshot.core.parentCreatureName,
      sourceSystem: current.baselineSnapshot.core.sourceSystem,
    },
    derivedCreatures: [],
  };
  await db.transaction(async (tx) => {
    await tx
      .select({ id: campaignCharacter.id })
      .from(campaignCharacter)
      .where(eq(campaignCharacter.id, input.characterId))
      .limit(1)
      .for("update");
    const [lockedProfile] = await tx
      .select({ currentSnapshotJson: campaignCreatureNpcProfile.currentSnapshotJson })
      .from(campaignCreatureNpcProfile)
      .where(eq(campaignCreatureNpcProfile.characterId, input.characterId))
      .limit(1)
      .for("update");
    if (!lockedProfile) throw new Error("Creature NPC profile is missing.");
    const lockedSnapshot = parseSnapshot(lockedProfile.currentSnapshotJson, "Current snapshot");
    const nextPoolKeys = new Set(
      normalizedSnapshot.hpPools.map(({ canonicalId }) => canonicalId.toLocaleLowerCase("en-US")),
    );
    const removedPoolKeys = lockedSnapshot.hpPools
      .map(({ canonicalId }) => canonicalId)
      .filter((canonicalId) => !nextPoolKeys.has(canonicalId.toLocaleLowerCase("en-US")));
    if (removedPoolKeys.length) {
      const [damagedPool] = await tx
        .select({ poolKey: campaignCharacterActiveHealthPool.poolKey })
        .from(campaignCharacterActiveHealthPool)
        .where(and(
          eq(campaignCharacterActiveHealthPool.characterId, input.characterId),
          inArray(campaignCharacterActiveHealthPool.poolKey, removedPoolKeys),
          gt(campaignCharacterActiveHealthPool.damage, 0),
        ))
        .limit(1);
      const [unresolvedInjury] = await tx
        .select({ poolKey: campaignCharacterInjury.poolKey })
        .from(campaignCharacterInjury)
        .where(and(
          eq(campaignCharacterInjury.characterId, input.characterId),
          inArray(campaignCharacterInjury.poolKey, removedPoolKeys),
          eq(campaignCharacterInjury.resolved, false),
        ))
        .limit(1);
      const referencedPoolKey = damagedPool?.poolKey ?? unresolvedInjury?.poolKey;
      if (referencedPoolKey) {
        const currentPool = lockedSnapshot.hpPools.find(
          ({ canonicalId }) => canonicalId === referencedPoolKey,
        );
        throw new Error(
          `${currentPool?.poolName ?? referencedPoolKey} cannot be removed or assigned a new HP Pool ID while it has Active Damage or unresolved Injuries. Heal/resolve that state first.`,
        );
      }
    }
    await tx.update(campaignCharacter).set({ name, updatedAt: new Date() }).where(eq(campaignCharacter.id, input.characterId));
    await tx.update(campaignCreatureNpcProfile).set({
      personality: input.personality.trim(),
      instanceNotes: input.instanceNotes.trim(),
      hpAdjustment: input.hpAdjustment,
      currentSnapshotJson: JSON.stringify(normalizedSnapshot),
      updatedAt: new Date(),
    }).where(eq(campaignCreatureNpcProfile.characterId, input.characterId));
    const { removedInstanceIds, newInstances } = planOwnedItemInstancePersistence({
      existingInstanceIds: current.itemInstances.flatMap(
        (entry) => entry.instanceId === null ? [] : [entry.instanceId],
      ),
      drafts: itemInstances,
    });
    await validateEquipmentOwnershipMutationInTransaction(tx, {
      characterId: input.characterId,
      nextStackQuantities: items,
      removedInstanceIds,
    });
    await tx.delete(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, input.characterId));
    if (items.length) {
      await tx.insert(campaignCharacterItem).values(items.map((entry) => ({
        characterId: input.characterId,
        itemId: entry.itemId,
        quantity: entry.quantity,
        unitCostCredits: entry.unitCostCredits,
      })));
    }
    if (removedInstanceIds.length) {
      await tx.delete(campaignCharacterItemInstance).where(and(
        eq(campaignCharacterItemInstance.characterId, input.characterId),
        inArray(campaignCharacterItemInstance.id, removedInstanceIds),
      ));
    }
    if (newInstances.length) {
      await tx.insert(campaignCharacterItemInstance).values(newInstances.map((entry) => ({
        characterId: input.characterId,
        itemId: entry.itemId,
        currentCharges: entry.currentCharges,
        unitCostCredits: entry.unitCostCredits,
      })));
    }
    await reconcileEquipmentAfterOwnershipMutationInTransaction(tx, input.characterId);
  });

  revalidatePath("/heavens/npcs");
  revalidatePath(`/heavens/npcs/${input.characterId}`);
  return getCreatureNpc(input.characterId);
}
