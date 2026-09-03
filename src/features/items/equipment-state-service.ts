import "server-only";

import { and, asc, eq, inArray, isNull, like } from "drizzle-orm";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  armorLocation,
  armorProfile,
  item,
  itemPassiveEffect,
  weaponFiringMode,
  weaponProfile,
} from "@/db/item-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterActiveCondition,
  campaignCharacterActiveModifier,
  campaignCharacterItem,
  campaignCharacterItemEquipmentState,
  campaignCharacterItemInstance,
} from "@/db/realm-schema";
import {
  endModifierInTransaction,
  readActiveEffectsInTransaction,
  resolveConditionInTransaction,
  type ActiveEffectsTransaction,
} from "@/features/active-state/active-effects-service";
import type { ActiveEffectsView } from "@/features/active-state/active-effects";
import { canMutateActiveHealth } from "@/features/active-state/authorization";
import { persistPlannedMechanicalEffectInTransaction } from "@/features/active-state/mechanical-effect-service";
import {
  getCharacterWeaponDamage,
  getCharacterWeaponDamageAttributeKeys,
  getCharacterWeaponDamageSummary,
  type CharacterWeaponDamageInput,
} from "@/features/characters/character-sheet-rules";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  type CharacterAttributeKey,
} from "@/features/characters/models";
import { decodeMechanicalEffect, planMechanicalEffect } from "@/features/mechanical-effects";
import { requireSession } from "@/lib/server-access";
import { resolveFirearmFiringMode } from "./firearm-timing";

import {
  ACTIVE_EQUIPMENT_STATES,
  EQUIPMENT_STATES,
  getActiveStackQuantity,
  getInactiveStackQuantity,
  passiveLifecycleLabel,
  passiveSourceEffectKey,
  shouldPassiveEffectBeActive,
  validatePassiveItemEffect,
  type ActiveEquipmentState,
  type ActiveManualPassiveEffect,
  type CharacterEquipmentStateView,
  type EquipmentState,
  type ItemPassiveEffectDefinition,
  type PassiveRequiredEquipmentState,
} from "./equipment-state";

export type EquipmentStateTransaction = ActiveEffectsTransaction;

export type SetStackEquipmentStateCommand = {
  characterId: number;
  itemId: number;
  state: ActiveEquipmentState;
  quantity: number;
  includeEffectHistory?: boolean;
};

export type SetInstanceEquipmentStateCommand = {
  characterId: number;
  instanceId: number;
  state: EquipmentState;
  includeEffectHistory?: boolean;
};

export type EquipmentStateMutationResult = {
  equipmentState: CharacterEquipmentStateView;
  activeEffects: ActiveEffectsView;
};

type OwnedEquipmentSnapshot = {
  stacks: Array<{
    itemId: number;
    itemName: string;
    equipmentGroup: string;
    ownedQuantity: number;
  }>;
  instances: Array<{
    instanceId: number;
    itemId: number;
    itemName: string;
    equipmentGroup: string;
    currentCharges: number;
    state: EquipmentState;
  }>;
  activeStackQuantities: Map<number, Partial<Record<ActiveEquipmentState, number>>>;
};

type LoadedPassiveEffect = ItemPassiveEffectDefinition & {
  id: number;
  itemId: number;
  itemName: string;
  sortOrder: number;
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must reference a saved record.`);
  return value;
}

export function requireEquipmentState(value: string): EquipmentState {
  if (!EQUIPMENT_STATES.includes(value as EquipmentState)) throw new Error("Equipment State must be Inactive, Equipped, Worn, or Wielded.");
  return value as EquipmentState;
}

export async function lockEquipmentStateCharacterInTransaction(tx: EquipmentStateTransaction, characterId: number): Promise<void> {
  positiveId(characterId, "Equipment State Character");
  const rows = await tx.select({ id: campaignCharacter.id }).from(campaignCharacter)
    .where(eq(campaignCharacter.id, characterId)).limit(1).for("update");
  if (!rows.length) throw new Error("Character not found for Equipment State.");
}

async function loadOwnedEquipmentInTransaction(
  tx: EquipmentStateTransaction,
  characterId: number,
): Promise<OwnedEquipmentSnapshot> {
  const stacks = await tx.select({
      itemId: campaignCharacterItem.itemId,
      itemName: item.name,
      equipmentGroup: item.equipmentGroup,
      ownedQuantity: campaignCharacterItem.quantity,
    }).from(campaignCharacterItem)
      .innerJoin(item, eq(item.id, campaignCharacterItem.itemId))
      .where(and(eq(campaignCharacterItem.characterId, characterId), eq(item.catalogScope, "equipment")))
      .orderBy(asc(item.name), asc(item.id));
  const stateRows = await tx.select({
      itemId: campaignCharacterItemEquipmentState.itemId,
      state: campaignCharacterItemEquipmentState.state,
      quantity: campaignCharacterItemEquipmentState.quantity,
    }).from(campaignCharacterItemEquipmentState)
      .where(eq(campaignCharacterItemEquipmentState.characterId, characterId))
      .orderBy(asc(campaignCharacterItemEquipmentState.itemId), asc(campaignCharacterItemEquipmentState.state));
  const instances = await tx.select({
      instanceId: campaignCharacterItemInstance.id,
      itemId: campaignCharacterItemInstance.itemId,
      itemName: item.name,
      equipmentGroup: item.equipmentGroup,
      currentCharges: campaignCharacterItemInstance.currentCharges,
      state: campaignCharacterItemInstance.equipmentState,
    }).from(campaignCharacterItemInstance)
      .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId))
      .where(and(eq(campaignCharacterItemInstance.characterId, characterId), eq(item.catalogScope, "equipment")))
      .orderBy(asc(item.name), asc(campaignCharacterItemInstance.id));
  const activeStackQuantities = new Map<number, Partial<Record<ActiveEquipmentState, number>>>();
  for (const row of stateRows) {
    if (!ACTIVE_EQUIPMENT_STATES.includes(row.state as ActiveEquipmentState)) {
      throw new Error("Persisted stack Equipment State is invalid.");
    }
    const states = activeStackQuantities.get(row.itemId) ?? {};
    states[row.state as ActiveEquipmentState] = row.quantity;
    activeStackQuantities.set(row.itemId, states);
  }
  return {
    stacks: stacks.map((row) => ({
      ...row,
      equipmentGroup: row.equipmentGroup ?? "general",
    })),
    instances: instances.map((row) => ({
      ...row,
      equipmentGroup: row.equipmentGroup ?? "general",
      state: requireEquipmentState(row.state),
    })),
    activeStackQuantities,
  };
}

async function loadPassiveEffectsInTransaction(
  tx: EquipmentStateTransaction,
  itemIds: readonly number[],
): Promise<LoadedPassiveEffect[]> {
  if (!itemIds.length) return [];
  const rows = await tx.select({
    id: itemPassiveEffect.id,
    itemId: itemPassiveEffect.itemId,
    itemName: item.name,
    catalogScope: item.catalogScope,
    requiredEquipmentState: itemPassiveEffect.requiredEquipmentState,
    schemaVersion: itemPassiveEffect.schemaVersion,
    effectJson: itemPassiveEffect.effectJson,
    sortOrder: itemPassiveEffect.sortOrder,
  }).from(itemPassiveEffect)
    .innerJoin(item, eq(item.id, itemPassiveEffect.itemId))
    .where(inArray(itemPassiveEffect.itemId, [...itemIds]))
    .orderBy(asc(itemPassiveEffect.itemId), asc(itemPassiveEffect.sortOrder), asc(itemPassiveEffect.id));
  return rows.map((row) => {
    if (row.catalogScope !== "equipment") throw new Error(`Inventory Item ${row.itemName} cannot define active Equipment passives.`);
    const definition = validatePassiveItemEffect({
      id: row.id,
      requiredEquipmentState: row.requiredEquipmentState as PassiveRequiredEquipmentState,
      effect: decodeMechanicalEffect({ schemaVersion: row.schemaVersion, effectJson: row.effectJson }),
    });
    return { ...definition, id: row.id, itemId: row.itemId, itemName: row.itemName, sortOrder: row.sortOrder };
  });
}

function itemIsActiveFor(
  snapshot: OwnedEquipmentSnapshot,
  itemId: number,
  requiredEquipmentState: PassiveRequiredEquipmentState,
): boolean {
  return shouldPassiveEffectBeActive({
    requiredEquipmentState,
    activeStackQuantities: snapshot.activeStackQuantities.get(itemId) ?? {},
    instanceStates: snapshot.instances.filter((entry) => entry.itemId === itemId).map(({ state }) => state),
  });
}

export async function readCharacterEquipmentStateInTransaction(
  tx: EquipmentStateTransaction,
  characterId: number,
): Promise<CharacterEquipmentStateView> {
  positiveId(characterId, "Equipment State Character");
  const snapshot = await loadOwnedEquipmentInTransaction(tx, characterId);
  const itemIds = [...new Set([
    ...snapshot.stacks.map(({ itemId }) => itemId),
    ...snapshot.instances.map(({ itemId }) => itemId),
  ])];
  const activeItemIds = itemIds.filter((itemId) => (
    getActiveStackQuantity(snapshot.activeStackQuantities.get(itemId) ?? {}) > 0
    || snapshot.instances.some((entry) => entry.itemId === itemId && entry.state !== "inactive")
  ));
  const passives = await loadPassiveEffectsInTransaction(tx, activeItemIds);
  const armorRows = activeItemIds.length ? await tx.select().from(armorProfile).where(inArray(armorProfile.itemId, activeItemIds)) : [];
  const weaponRows = activeItemIds.length ? await tx.select().from(weaponProfile).where(inArray(weaponProfile.itemId, activeItemIds)) : [];
  const weaponProfileIds = weaponRows.map(({ id }) => id);
  const firingModeRows = weaponProfileIds.length ? await tx.select().from(weaponFiringMode)
    .where(inArray(weaponFiringMode.weaponProfileId, weaponProfileIds))
    .orderBy(asc(weaponFiringMode.weaponProfileId), asc(weaponFiringMode.sortOrder), asc(weaponFiringMode.id)) : [];
  const ammunitionItemIds = [...new Set(weaponRows.flatMap((profile) => (
    profile.ammunitionItemId === null ? [] : [profile.ammunitionItemId]
  )))];
  const ammunitionRows = ammunitionItemIds.length ? await tx.select({
    itemId: item.id,
    itemName: item.name,
    damage: weaponProfile.damage,
    damageType: weaponProfile.damageType,
    cyclingInitiativeModifier: weaponProfile.ammunitionCyclingInitiativeModifier,
    recoilResetInitiativeModifier: weaponProfile.ammunitionRecoilResetInitiativeModifier,
  }).from(item)
    .leftJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
    .where(inArray(item.id, ammunitionItemIds)) : [];
  const attributeRows = await tx.select({
    attributeKey: campaignCharacterAttribute.attributeKey,
    value: campaignCharacterAttribute.value,
  }).from(campaignCharacterAttribute)
    .where(eq(campaignCharacterAttribute.characterId, characterId));
  const locationRows = activeItemIds.length ? await tx.select({ itemId: armorLocation.itemId, locationCode: armorLocation.locationCode }).from(armorLocation).where(inArray(armorLocation.itemId, activeItemIds)).orderBy(asc(armorLocation.itemId), asc(armorLocation.sortOrder)) : [];
  const armorByItem = new Map(armorRows.map((row) => [row.itemId, row]));
  const weaponByItem = new Map(weaponRows.map((row) => [row.itemId, row]));
  const ammunitionByItem = new Map(ammunitionRows.map((row) => [row.itemId, row]));
  const firingModesByProfile = new Map<number, typeof firingModeRows>();
  for (const mode of firingModeRows) firingModesByProfile.set(mode.weaponProfileId, [...(firingModesByProfile.get(mode.weaponProfileId) ?? []), mode]);
  const attributes = Object.fromEntries(CHARACTER_ATTRIBUTE_KEYS.map((key) => [key, 0])) as Record<CharacterAttributeKey, number>;
  const presentAttributeKeys = new Set<CharacterAttributeKey>();
  for (const row of attributeRows) {
    if (CHARACTER_ATTRIBUTE_KEYS.includes(row.attributeKey as CharacterAttributeKey)) {
      const key = row.attributeKey as CharacterAttributeKey;
      attributes[key] = row.value;
      presentAttributeKeys.add(key);
    }
  }
  const weaponRuntimeFields = (profile: (typeof weaponRows)[number]) => {
    const ammunition = profile.ammunitionItemId === null ? null : ammunitionByItem.get(profile.ammunitionItemId) ?? null;
    const timingFields = {
      ammunitionTiming: ammunition ? {
        itemId: ammunition.itemId,
        itemName: ammunition.itemName,
        cyclingInitiativeModifier: ammunition.cyclingInitiativeModifier ?? 0,
        recoilResetInitiativeModifier: ammunition.recoilResetInitiativeModifier ?? 0,
      } : null,
      firingModes: (firingModesByProfile.get(profile.id) ?? []).map((mode) => resolveFirearmFiringMode({
        id: mode.id,
        name: mode.name,
        sortOrder: mode.sortOrder,
        baseCyclingInitiativeCost: mode.baseCyclingInitiativeCost,
        baseRecoilResetInitiativeCost: mode.baseRecoilResetInitiativeCost,
        deliveryCadence: mode.deliveryCadence as "per-trigger" | "sustained-per-initiative" | null,
        roundsPerCadence: mode.roundsPerCadence,
        mechanicsReviewRequired: mode.mechanicsReviewRequired,
      }, ammunition?.cyclingInitiativeModifier ?? 0, ammunition?.recoilResetInitiativeModifier ?? 0)),
    };
    const damageInput: CharacterWeaponDamageInput = {
      damageSource: profile.damageSource,
      damage: profile.damage,
      damageType: profile.damageType,
      ammunitionItemId: profile.ammunitionItemId,
      ammunitionItemName: ammunition?.itemName ?? null,
      ammunitionDamage: ammunition?.damage ?? null,
      ammunitionDamageType: ammunition?.damageType ?? null,
      weaponType: profile.weaponType,
      rangeText: profile.rangeText,
      reachText: profile.reachText,
    };
    const resolved = getCharacterWeaponDamage(damageInput);
    const requiredAttributes = getCharacterWeaponDamageAttributeKeys(damageInput);
    if (!requiredAttributes.every((key) => presentAttributeKeys.has(key))) {
      return {
        damage: resolved.damage ?? "",
        damageType: resolved.damageType ?? "",
        authoredDamage: "",
        authoredDamageModifier: "required Character Attribute unavailable",
        authoredDamageSourceName: resolved.sourceName,
        ...timingFields,
      };
    }
    const summary = getCharacterWeaponDamageSummary(damageInput, attributes);
    return {
      damage: resolved.damage ?? "",
      damageType: resolved.damageType ?? "",
      authoredDamage: summary.totalDamage === "\u2014" ? "" : summary.totalDamage,
      authoredDamageModifier: summary.modifier,
      authoredDamageSourceName: resolved.sourceName,
      ...timingFields,
    };
  };
  const locationsByItem = new Map<number, string[]>();
  for (const row of locationRows) locationsByItem.set(row.itemId, [...(locationsByItem.get(row.itemId) ?? []), row.locationCode]);

  const activeManualPassives: ActiveManualPassiveEffect[] = passives.flatMap((entry) => (
    entry.effect.kind === "manual" && itemIsActiveFor(snapshot, entry.itemId, entry.requiredEquipmentState)
      ? [{
          passiveEffectId: entry.id,
          itemId: entry.itemId,
          itemName: entry.itemName,
          requiredEquipmentState: entry.requiredEquipmentState,
          lifecycleLabel: passiveLifecycleLabel(entry.requiredEquipmentState),
          title: entry.effect.title,
          description: entry.effect.description,
        }]
      : []
  ));

  const wornArmor = [
    ...snapshot.stacks.flatMap((entry) => {
      const activeQuantity = snapshot.activeStackQuantities.get(entry.itemId)?.worn ?? 0;
      const profile = armorByItem.get(entry.itemId);
      return activeQuantity > 0 && profile ? [{
        ownershipKey: `stack:${entry.itemId}`,
        instanceId: null,
        itemId: entry.itemId,
        itemName: entry.itemName,
        activeQuantity,
        baseSoak: profile.baseSoak,
        coverage: profile.coverage,
        coveredLocationKeys: locationsByItem.get(entry.itemId) ?? [],
        armorType: profile.armorType,
        rulesText: profile.rulesText,
      }] : [];
    }),
    ...snapshot.instances.flatMap((entry) => {
      const profile = entry.state === "worn" ? armorByItem.get(entry.itemId) : null;
      return profile ? [{
        ownershipKey: `instance:${entry.instanceId}`,
        instanceId: entry.instanceId,
        itemId: entry.itemId,
        itemName: `${entry.itemName} · Copy #${entry.instanceId}`,
        activeQuantity: 1,
        baseSoak: profile.baseSoak,
        coverage: profile.coverage,
        coveredLocationKeys: locationsByItem.get(entry.itemId) ?? [],
        armorType: profile.armorType,
        rulesText: profile.rulesText,
      }] : [];
    }),
  ];
  const wieldedWeapons = [
    ...snapshot.stacks.flatMap((entry) => {
      const activeQuantity = snapshot.activeStackQuantities.get(entry.itemId)?.wielded ?? 0;
      const profile = weaponByItem.get(entry.itemId);
      return activeQuantity > 0 && profile ? [{
        ownershipKey: `stack:${entry.itemId}`,
        instanceId: null,
        itemId: entry.itemId,
        itemName: entry.itemName,
        activeQuantity,
        weaponType: profile.weaponType,
        handedness: profile.handedness,
        ...weaponRuntimeFields(profile),
        initiativeCost: profile.initiativeCost,
        range: profile.rangeText,
        reach: profile.reachText,
        rulesText: profile.rulesText,
      }] : [];
    }),
    ...snapshot.instances.flatMap((entry) => {
      const profile = entry.state === "wielded" ? weaponByItem.get(entry.itemId) : null;
      return profile ? [{
        ownershipKey: `instance:${entry.instanceId}`,
        instanceId: entry.instanceId,
        itemId: entry.itemId,
        itemName: `${entry.itemName} · Copy #${entry.instanceId}`,
        activeQuantity: 1,
        weaponType: profile.weaponType,
        handedness: profile.handedness,
        ...weaponRuntimeFields(profile),
        initiativeCost: profile.initiativeCost,
        range: profile.rangeText,
        reach: profile.reachText,
        rulesText: profile.rulesText,
      }] : [];
    }),
  ];
  return {
    characterId,
    stacks: snapshot.stacks.map((entry) => {
      const active = snapshot.activeStackQuantities.get(entry.itemId) ?? {};
      const activeQuantity = getActiveStackQuantity(active);
      return {
        ...entry,
        equippedQuantity: active.equipped ?? 0,
        wornQuantity: active.worn ?? 0,
        wieldedQuantity: active.wielded ?? 0,
        inactiveQuantity: getInactiveStackQuantity(entry.ownedQuantity, activeQuantity),
      };
    }),
    instances: snapshot.instances,
    wornArmor,
    wieldedWeapons,
    activeManualPassives,
  };
}

export type PassiveReconciliationResult = {
  created: string[];
  ended: string[];
  resolved: string[];
  activeManualPassives: ActiveManualPassiveEffect[];
};

export async function reconcileItemPassiveEffectsInTransaction(
  tx: EquipmentStateTransaction,
  characterId: number,
  itemIds?: readonly number[],
): Promise<PassiveReconciliationResult> {
  await lockEquipmentStateCharacterInTransaction(tx, characterId);
  const snapshot = await loadOwnedEquipmentInTransaction(tx, characterId);
  const conditions = await tx.select().from(campaignCharacterActiveCondition).where(and(
      eq(campaignCharacterActiveCondition.characterId, characterId),
      eq(campaignCharacterActiveCondition.sourceKind, "item"),
      like(campaignCharacterActiveCondition.sourceEffectKey, "passive:%"),
      isNull(campaignCharacterActiveCondition.resolvedAt),
    )).orderBy(asc(campaignCharacterActiveCondition.createdAt), asc(campaignCharacterActiveCondition.id));
  const modifiers = await tx.select().from(campaignCharacterActiveModifier).where(and(
      eq(campaignCharacterActiveModifier.characterId, characterId),
      eq(campaignCharacterActiveModifier.sourceKind, "item"),
      like(campaignCharacterActiveModifier.sourceEffectKey, "passive:%"),
      isNull(campaignCharacterActiveModifier.endedAt),
    )).orderBy(asc(campaignCharacterActiveModifier.createdAt), asc(campaignCharacterActiveModifier.id));
  const requestedIds = itemIds ? new Set(itemIds.map((id) => positiveId(id, "Passive Item"))) : null;
  const ownedIds = [
    ...snapshot.stacks.map(({ itemId }) => itemId),
    ...snapshot.instances.map(({ itemId }) => itemId),
  ];
  const existingIds = [...conditions, ...modifiers].flatMap(({ sourceId }) => {
    const id = Number(sourceId);
    return Number.isSafeInteger(id) && id > 0 ? [id] : [];
  });
  const reconciliationIds = [...new Set(requestedIds ? [...requestedIds] : [...ownedIds, ...existingIds])];
  const passives = await loadPassiveEffectsInTransaction(tx, reconciliationIds);
  const desired = passives.filter((entry) => itemIsActiveFor(snapshot, entry.itemId, entry.requiredEquipmentState));
  const desiredByKey = new Map(desired.map((entry) => [`${entry.itemId}:${passiveSourceEffectKey(entry.id)}`, entry]));
  const keptConditions = new Set<string>();
  const keptModifiers = new Set<string>();
  const result: PassiveReconciliationResult = { created: [], ended: [], resolved: [], activeManualPassives: [] };

  for (const condition of conditions) {
    const itemId = Number(condition.sourceId);
    if (requestedIds && !requestedIds.has(itemId)) continue;
    const key = `${itemId}:${condition.sourceEffectKey}`;
    const target = desiredByKey.get(key);
    if (target?.effect.kind === "condition.apply" && !keptConditions.has(key)) {
      keptConditions.add(key);
      continue;
    }
    await resolveConditionInTransaction(tx, characterId, condition.id, "Passive Item equipment requirement is no longer satisfied.");
    result.resolved.push(key);
  }
  for (const modifier of modifiers) {
    const itemId = Number(modifier.sourceId);
    if (requestedIds && !requestedIds.has(itemId)) continue;
    const key = `${itemId}:${modifier.sourceEffectKey}`;
    const target = desiredByKey.get(key);
    if (target?.effect.kind === "modifier.apply" && !keptModifiers.has(key)) {
      keptModifiers.add(key);
      continue;
    }
    await endModifierInTransaction(tx, characterId, modifier.id, "Passive Item equipment requirement is no longer satisfied.");
    result.ended.push(key);
  }

  for (const entry of desired) {
    const sourceEffectKey = passiveSourceEffectKey(entry.id);
    const key = `${entry.itemId}:${sourceEffectKey}`;
    if (entry.effect.kind === "manual") {
      result.activeManualPassives.push({
        passiveEffectId: entry.id,
        itemId: entry.itemId,
        itemName: entry.itemName,
        requiredEquipmentState: entry.requiredEquipmentState,
        lifecycleLabel: passiveLifecycleLabel(entry.requiredEquipmentState),
        title: entry.effect.title,
        description: entry.effect.description,
      });
      continue;
    }
    if (entry.effect.kind !== "condition.apply" && entry.effect.kind !== "modifier.apply") continue;
    const alreadyActive = entry.effect.kind === "condition.apply" ? keptConditions.has(key) : keptModifiers.has(key);
    if (alreadyActive) continue;
    const plan = planMechanicalEffect({
      effect: entry.effect,
      source: { kind: "item", id: entry.itemId, name: entry.itemName },
      application: { targetCharacterId: characterId },
    });
    await persistPlannedMechanicalEffectInTransaction(tx, {
      plan,
      targetCharacterId: characterId,
      sourceEffectKey,
    });
    result.created.push(key);
  }
  return result;
}

export async function validateEquipmentOwnershipMutationInTransaction(
  tx: EquipmentStateTransaction,
  input: {
    characterId: number;
    nextStackQuantities: readonly { itemId: number; quantity: number }[];
    removedInstanceIds: readonly number[];
  },
): Promise<void> {
  await lockEquipmentStateCharacterInTransaction(tx, input.characterId);
  const nextQuantities = new Map(input.nextStackQuantities.map(({ itemId, quantity }) => [itemId, quantity]));
  const stateRows = await tx.select({ itemId: campaignCharacterItemEquipmentState.itemId, quantity: campaignCharacterItemEquipmentState.quantity })
    .from(campaignCharacterItemEquipmentState)
    .where(eq(campaignCharacterItemEquipmentState.characterId, input.characterId));
  const activeByItem = new Map<number, number>();
  for (const row of stateRows) activeByItem.set(row.itemId, (activeByItem.get(row.itemId) ?? 0) + row.quantity);
  for (const [itemId, activeQuantity] of activeByItem) {
    if (activeQuantity > (nextQuantities.get(itemId) ?? 0)) {
      throw new Error("Reduce or remove active Equipment State before reducing that Item's owned quantity.");
    }
  }
  if (input.removedInstanceIds.length) {
    const rows = await tx.select({ id: campaignCharacterItemInstance.id, state: campaignCharacterItemInstance.equipmentState })
      .from(campaignCharacterItemInstance)
      .where(and(
        eq(campaignCharacterItemInstance.characterId, input.characterId),
        inArray(campaignCharacterItemInstance.id, [...input.removedInstanceIds]),
      )).for("update");
    if (rows.some(({ state }) => state !== "inactive")) {
      throw new Error("Set an owned Item copy to Inactive before removing it.");
    }
  }
}

export async function reconcileEquipmentAfterOwnershipMutationInTransaction(
  tx: EquipmentStateTransaction,
  characterId: number,
): Promise<void> {
  await lockEquipmentStateCharacterInTransaction(tx, characterId);
  const stateRows = await tx.select({ itemId: campaignCharacterItemEquipmentState.itemId }).from(campaignCharacterItemEquipmentState)
    .where(eq(campaignCharacterItemEquipmentState.characterId, characterId));
  const ownershipRows = await tx.select({ itemId: campaignCharacterItem.itemId }).from(campaignCharacterItem)
    .where(eq(campaignCharacterItem.characterId, characterId));
  const owned = new Set(ownershipRows.map(({ itemId }) => itemId));
  const orphanIds = [...new Set(stateRows.map(({ itemId }) => itemId).filter((itemId) => !owned.has(itemId)))];
  if (orphanIds.length) {
    await tx.delete(campaignCharacterItemEquipmentState).where(and(
      eq(campaignCharacterItemEquipmentState.characterId, characterId),
      inArray(campaignCharacterItemEquipmentState.itemId, orphanIds),
    ));
  }
  await reconcileItemPassiveEffectsInTransaction(tx, characterId);
}

export async function assertConsumableHasInactiveQuantityInTransaction(
  tx: EquipmentStateTransaction,
  input: { characterId: number; itemId: number; ownedQuantity: number; consumeQuantity: number },
): Promise<void> {
  await lockEquipmentStateCharacterInTransaction(tx, input.characterId);
  const rows = await tx.select({ quantity: campaignCharacterItemEquipmentState.quantity })
    .from(campaignCharacterItemEquipmentState)
    .where(and(
      eq(campaignCharacterItemEquipmentState.characterId, input.characterId),
      eq(campaignCharacterItemEquipmentState.itemId, input.itemId),
    ));
  const activeQuantity = rows.reduce((total, row) => total + row.quantity, 0);
  if (input.ownedQuantity - input.consumeQuantity < activeQuantity) {
    throw new Error("This Item use would consume an active equipped copy. Set enough copies to Inactive first.");
  }
}

type Access = { tx: EquipmentStateTransaction };
async function withEquipmentAccess<T>(characterId: number, operation: (access: Access) => Promise<T>): Promise<T> {
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
    if (!canMutateActiveHealth(
      { userId: session.user.id, roles: roleNames },
      { playerUserId: entity.playerUserId, campaignOwnerUserId: entity.owner, isNpc: entity.isNpc, isCampaignMember: entity.member === session.user.id },
    )) throw new Error("You do not have permission to manage this entity's Equipment State.");
    return operation({ tx });
  });
}

export function getCharacterEquipmentState(characterId: number): Promise<CharacterEquipmentStateView> {
  return withEquipmentAccess(characterId, ({ tx }) => readCharacterEquipmentStateInTransaction(tx, characterId));
}

export async function setStackEquipmentStateInTransaction(
  tx: EquipmentStateTransaction,
  command: SetStackEquipmentStateCommand,
): Promise<EquipmentStateMutationResult> {
  positiveId(command.itemId, "Equipment Item");
  if (!ACTIVE_EQUIPMENT_STATES.includes(command.state)) throw new Error("Stack Equipment State must be Equipped, Worn, or Wielded.");
  if (!Number.isSafeInteger(command.quantity) || command.quantity < 0) throw new Error("Active Equipment quantity must be a whole number zero or greater.");
  await lockEquipmentStateCharacterInTransaction(tx, command.characterId);
  const ownershipRows = await tx.select({ quantity: campaignCharacterItem.quantity, scope: item.catalogScope })
    .from(campaignCharacterItem).innerJoin(item, eq(item.id, campaignCharacterItem.itemId))
    .where(and(eq(campaignCharacterItem.characterId, command.characterId), eq(campaignCharacterItem.itemId, command.itemId)))
    .limit(1).for("update");
  const ownership = ownershipRows[0];
  if (!ownership) throw new Error("The Character does not own that Item as a stack.");
  if (ownership.scope !== "equipment") throw new Error("Inventory-only Items cannot enter Equipment State.");
  const states = await tx.select({ state: campaignCharacterItemEquipmentState.state, quantity: campaignCharacterItemEquipmentState.quantity })
    .from(campaignCharacterItemEquipmentState)
    .where(and(eq(campaignCharacterItemEquipmentState.characterId, command.characterId), eq(campaignCharacterItemEquipmentState.itemId, command.itemId)));
  const nextActive = states.reduce((total, row) => total + (row.state === command.state ? 0 : row.quantity), 0) + command.quantity;
  getInactiveStackQuantity(ownership.quantity, nextActive);
  if (command.quantity === 0) {
    await tx.delete(campaignCharacterItemEquipmentState).where(and(
      eq(campaignCharacterItemEquipmentState.characterId, command.characterId),
      eq(campaignCharacterItemEquipmentState.itemId, command.itemId),
      eq(campaignCharacterItemEquipmentState.state, command.state),
    ));
  } else {
    await tx.insert(campaignCharacterItemEquipmentState).values({
      characterId: command.characterId,
      itemId: command.itemId,
      state: command.state,
      quantity: command.quantity,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [campaignCharacterItemEquipmentState.characterId, campaignCharacterItemEquipmentState.itemId, campaignCharacterItemEquipmentState.state],
      set: { quantity: command.quantity, updatedAt: new Date() },
    });
  }
  await reconcileItemPassiveEffectsInTransaction(tx, command.characterId, [command.itemId]);
  const equipmentState = await readCharacterEquipmentStateInTransaction(tx, command.characterId);
  const activeEffects = await readActiveEffectsInTransaction(tx, command.characterId, command.includeEffectHistory ?? false);
  return { equipmentState, activeEffects };
}

export function setStackEquipmentState(command: SetStackEquipmentStateCommand): Promise<EquipmentStateMutationResult> {
  return withEquipmentAccess(command.characterId, ({ tx }) => setStackEquipmentStateInTransaction(tx, command));
}

export async function setInstanceEquipmentStateInTransaction(
  tx: EquipmentStateTransaction,
  command: SetInstanceEquipmentStateCommand,
): Promise<EquipmentStateMutationResult> {
  positiveId(command.instanceId, "Owned Item copy");
  const state = requireEquipmentState(command.state);
  await lockEquipmentStateCharacterInTransaction(tx, command.characterId);
  const rows = await tx.select({ itemId: campaignCharacterItemInstance.itemId, scope: item.catalogScope })
    .from(campaignCharacterItemInstance).innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId))
    .where(and(eq(campaignCharacterItemInstance.characterId, command.characterId), eq(campaignCharacterItemInstance.id, command.instanceId)))
    .limit(1).for("update");
  const owned = rows[0];
  if (!owned) throw new Error("Owned Item copy was not found.");
  if (owned.scope !== "equipment") throw new Error("Inventory-only Items cannot enter Equipment State.");
  await tx.update(campaignCharacterItemInstance).set({ equipmentState: state, updatedAt: new Date() }).where(and(
    eq(campaignCharacterItemInstance.characterId, command.characterId),
    eq(campaignCharacterItemInstance.id, command.instanceId),
  ));
  await reconcileItemPassiveEffectsInTransaction(tx, command.characterId, [owned.itemId]);
  const equipmentState = await readCharacterEquipmentStateInTransaction(tx, command.characterId);
  const activeEffects = await readActiveEffectsInTransaction(tx, command.characterId, command.includeEffectHistory ?? false);
  return { equipmentState, activeEffects };
}

export function setInstanceEquipmentState(command: SetInstanceEquipmentStateCommand): Promise<EquipmentStateMutationResult> {
  return withEquipmentAccess(command.characterId, ({ tx }) => setInstanceEquipmentStateInTransaction(tx, command));
}
