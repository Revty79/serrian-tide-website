import {
  validateItemRuntimeProfile,
  type ItemRuntimeProfile,
} from "./item-runtime";

export const ITEM_OWNERSHIP_STRATEGIES = ["stack", "instance"] as const;

export type ItemOwnershipStrategy = (typeof ITEM_OWNERSHIP_STRATEGIES)[number];

export type ItemOwnershipRuntimeProfile = Pick<
  ItemRuntimeProfile,
  "useMode" | "quantityPerUse" | "maximumCharges" | "chargesPerUse" | "rechargeNotes" | "activationLabel" | "useNotes"
>;

export type OwnedItemStackLike = {
  itemId: number;
  quantity: number;
};

export type OwnedItemInstanceLike = {
  itemId: number;
};

export type DraftOwnedItemInstance = {
  draftId: number;
  instanceId: number | null;
  itemId: number;
  unitCostCredits: number;
};

export type ItemOwnershipDefinition = {
  itemId: number;
  runtimeProfile: ItemOwnershipRuntimeProfile;
  requiresExactInstance?: boolean;
};

function readValidRuntimeProfile(profile: ItemOwnershipRuntimeProfile): ItemRuntimeProfile {
  const validation = validateItemRuntimeProfile(profile);
  if (!validation.valid) {
    throw new Error(validation.issues.map(({ message }) => message).join(" "));
  }
  return validation.profile;
}

export function getItemOwnershipStrategy(
  runtimeProfile: ItemOwnershipRuntimeProfile,
  requiresExactInstance = false,
): ItemOwnershipStrategy {
  return requiresExactInstance || readValidRuntimeProfile(runtimeProfile).useMode === "charges"
    ? "instance"
    : "stack";
}

export function validateCurrentItemCharges(currentCharges: unknown): number {
  if (!Number.isSafeInteger(currentCharges) || (currentCharges as number) < 0) {
    throw new Error("Current Charges must be a whole number zero or greater.");
  }
  return currentCharges as number;
}

export function getStartingItemInstanceCharges(
  runtimeProfile: ItemOwnershipRuntimeProfile,
  requiresExactInstance = false,
): number {
  const profile = readValidRuntimeProfile(runtimeProfile);
  if (getItemOwnershipStrategy(profile, requiresExactInstance) !== "instance") {
    throw new Error("Only a charged Item or exact-instance Weapon can create an owned Item instance.");
  }
  return validateCurrentItemCharges(profile.maximumCharges ?? 0);
}

export function assertItemOwnershipStrategy(
  runtimeProfile: ItemOwnershipRuntimeProfile,
  actualStrategy: ItemOwnershipStrategy,
  label = "Item",
  options: { requiresExactInstance?: boolean; allowLegacyExactStack?: boolean } = {},
): void {
  const requiredStrategy = getItemOwnershipStrategy(runtimeProfile, options.requiresExactInstance);
  if (requiredStrategy === "instance" && actualStrategy === "stack" && options.allowLegacyExactStack && options.requiresExactInstance) {
    return;
  }
  if (requiredStrategy !== actualStrategy) {
    throw new Error(
      requiredStrategy === "instance"
        ? `${label} uses charges and must be stored as individual owned instances, not a quantity stack.`
        : `${label} must remain stack-owned in the current Item ownership rules.`,
    );
  }
}

export function assertNoStackInstanceOwnershipCollision(input: {
  definitions: readonly ItemOwnershipDefinition[];
  stacks: readonly OwnedItemStackLike[];
  instances: readonly OwnedItemInstanceLike[];
}): void {
  const definitions = new Map(input.definitions.map((entry) => [entry.itemId, entry]));
  const stackIds = new Set<number>();
  const instanceIds = new Set<number>();

  for (const stack of input.stacks) {
    const definition = definitions.get(stack.itemId);
    if (!definition) throw new Error(`Owned Item ${stack.itemId} is missing its runtime definition.`);
    assertItemOwnershipStrategy(definition.runtimeProfile, "stack", `Owned Item ${stack.itemId}`, {
      requiresExactInstance: definition.requiresExactInstance,
      allowLegacyExactStack: true,
    });
    stackIds.add(stack.itemId);
  }
  for (const instance of input.instances) {
    const definition = definitions.get(instance.itemId);
    if (!definition) throw new Error(`Owned Item ${instance.itemId} is missing its runtime definition.`);
    assertItemOwnershipStrategy(definition.runtimeProfile, "instance", `Owned Item ${instance.itemId}`, {
      requiresExactInstance: definition.requiresExactInstance,
    });
    instanceIds.add(instance.itemId);
  }
  for (const itemId of stackIds) {
    if (instanceIds.has(itemId) && !definitions.get(itemId)?.requiresExactInstance) {
      throw new Error(`Owned Item ${itemId} cannot exist as both a stack and individual instances.`);
    }
  }
}

export function getOwnedItemQuantity(
  itemId: number,
  stacks: readonly OwnedItemStackLike[],
  instances: readonly OwnedItemInstanceLike[],
): number {
  return (
    (stacks.find((entry) => entry.itemId === itemId)?.quantity ?? 0)
    + instances.filter((entry) => entry.itemId === itemId).length
  );
}

export function getOwnedItemPurchaseCost(input: {
  stacks: readonly (OwnedItemStackLike & { unitCostCredits: number })[];
  instances: readonly (OwnedItemInstanceLike & { unitCostCredits: number })[];
}): number {
  return input.stacks.reduce(
    (total, entry) => total + entry.quantity * entry.unitCostCredits,
    input.instances.reduce((total, entry) => total + entry.unitCostCredits, 0),
  );
}

export function createDraftOwnedItemInstances(input: {
  itemId: number;
  quantity: number;
  unitCostCredits: number;
  runtimeProfile: ItemOwnershipRuntimeProfile;
  requiresExactInstance?: boolean;
  createDraftId: () => number;
}): DraftOwnedItemInstance[] {
  assertItemOwnershipStrategy(input.runtimeProfile, "instance", `Item ${input.itemId}`, {
    requiresExactInstance: input.requiresExactInstance,
  });
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 0) {
    throw new Error("Owned Item instance quantity must be a whole number zero or greater.");
  }
  if (!Number.isFinite(input.unitCostCredits) || input.unitCostCredits < 0) {
    throw new Error("Item unit cost must be zero or greater.");
  }
  return Array.from({ length: input.quantity }, () => ({
    draftId: input.createDraftId(),
    instanceId: null,
    itemId: input.itemId,
    unitCostCredits: input.unitCostCredits,
  }));
}

export function resizeDraftOwnedItemInstances(input: {
  current: readonly DraftOwnedItemInstance[];
  itemId: number;
  quantity: number;
  unitCostCredits: number;
  runtimeProfile: ItemOwnershipRuntimeProfile;
  requiresExactInstance?: boolean;
  createDraftId: () => number;
}): DraftOwnedItemInstance[] {
  const otherItems = input.current.filter((entry) => entry.itemId !== input.itemId);
  const owned = input.current.filter((entry) => entry.itemId === input.itemId);
  if (input.quantity <= owned.length) {
    const retained = [...owned]
      .sort((left, right) => {
        if (left.instanceId === null && right.instanceId !== null) return 1;
        if (left.instanceId !== null && right.instanceId === null) return -1;
        return left.draftId - right.draftId;
      })
      .slice(0, Math.max(0, Math.trunc(input.quantity)));
    return [...otherItems, ...retained];
  }
  return [
    ...otherItems,
    ...owned,
    ...createDraftOwnedItemInstances({
      ...input,
      quantity: input.quantity - owned.length,
    }),
  ];
}

export function removeDraftOwnedItemInstance(
  instances: readonly DraftOwnedItemInstance[],
  draftId: number,
): DraftOwnedItemInstance[] {
  const index = instances.findIndex((entry) => entry.draftId === draftId);
  if (index < 0) throw new Error("The selected owned Item instance does not exist.");
  return instances.filter((_, candidateIndex) => candidateIndex !== index);
}

export function planOwnedItemInstancePersistence<T extends DraftOwnedItemInstance>(input: {
  existingInstanceIds: readonly number[];
  drafts: readonly T[];
}): { removedInstanceIds: number[]; newInstances: T[] } {
  const retainedIds = new Set(
    input.drafts.flatMap((entry) => entry.instanceId === null ? [] : [entry.instanceId]),
  );
  return {
    removedInstanceIds: input.existingInstanceIds.filter((id) => !retainedIds.has(id)),
    newInstances: input.drafts.filter((entry) => entry.instanceId === null),
  };
}

export function getItemChargeDisplay(input: {
  currentCharges: number;
  maximumCharges: number | null;
}): { label: string; exceedsCurrentMaximum: boolean } {
  const currentCharges = validateCurrentItemCharges(input.currentCharges);
  const maximumCharges = input.maximumCharges;
  if (!Number.isSafeInteger(maximumCharges) || (maximumCharges as number) <= 0) {
    return { label: `${currentCharges} Charges`, exceedsCurrentMaximum: false };
  }
  return {
    label: `${currentCharges} / ${maximumCharges} Charges`,
    exceedsCurrentMaximum: currentCharges > (maximumCharges as number),
  };
}
