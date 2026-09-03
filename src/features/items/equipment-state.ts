import {
  validateMechanicalEffect,
  type MechanicalEffect,
} from "@/features/mechanical-effects";
import type { ResolvedFirearmFiringMode } from "./firearm-timing";

export const EQUIPMENT_STATES = ["inactive", "equipped", "worn", "wielded"] as const;
export const ACTIVE_EQUIPMENT_STATES = ["equipped", "worn", "wielded"] as const;
export const PASSIVE_REQUIRED_EQUIPMENT_STATES = ["equipped", "worn", "wielded"] as const;

export type EquipmentState = (typeof EQUIPMENT_STATES)[number];
export type ActiveEquipmentState = (typeof ACTIVE_EQUIPMENT_STATES)[number];
export type PassiveRequiredEquipmentState = (typeof PASSIVE_REQUIRED_EQUIPMENT_STATES)[number];

export type ItemPassiveEffectDefinition = {
  id: number | null;
  requiredEquipmentState: PassiveRequiredEquipmentState;
  effect: MechanicalEffect;
};

export type StackEquipmentState = {
  itemId: number;
  itemName: string;
  equipmentGroup: string;
  ownedQuantity: number;
  equippedQuantity: number;
  wornQuantity: number;
  wieldedQuantity: number;
  inactiveQuantity: number;
};

export type InstanceEquipmentState = {
  instanceId: number;
  itemId: number;
  itemName: string;
  equipmentGroup: string;
  currentCharges: number;
  state: EquipmentState;
};

export type WornArmorRuntimeContext = {
  ownershipKey: string;
  instanceId: number | null;
  itemId: number;
  itemName: string;
  activeQuantity: number;
  baseSoak: number | null;
  coverage: string;
  coveredLocationKeys: string[];
  armorType: string;
  rulesText: string;
};

export type WieldedWeaponRuntimeContext = {
  ownershipKey: string;
  instanceId: number | null;
  itemId: number;
  itemName: string;
  activeQuantity: number;
  weaponType: string;
  handedness: string;
  damage: string;
  damageType: string;
  authoredDamage: string;
  authoredDamageModifier: string;
  authoredDamageSourceName: string | null;
  initiativeCost: number | null;
  range: string;
  reach: string;
  ammunitionTiming: null | {
    itemId: number;
    itemName: string;
    cyclingInitiativeModifier: number;
    recoilResetInitiativeModifier: number;
  };
  firingModes: ResolvedFirearmFiringMode[];
  rulesText: string;
};

export type ActiveManualPassiveEffect = {
  passiveEffectId: number;
  itemId: number;
  itemName: string;
  requiredEquipmentState: PassiveRequiredEquipmentState;
  lifecycleLabel: string;
  title: string;
  description: string;
};

export type CharacterEquipmentStateView = {
  characterId: number;
  stacks: StackEquipmentState[];
  instances: InstanceEquipmentState[];
  wornArmor: WornArmorRuntimeContext[];
  wieldedWeapons: WieldedWeaponRuntimeContext[];
  activeManualPassives: ActiveManualPassiveEffect[];
};

export function stateSatisfiesEquipmentRequirement(
  actual: EquipmentState,
  required: PassiveRequiredEquipmentState,
): boolean {
  if (actual === "inactive") return false;
  return required === "equipped" ? true : actual === required;
}

export function passiveLifecycleLabel(required: PassiveRequiredEquipmentState): string {
  return required === "equipped" ? "While Equipped" : required === "worn" ? "While Worn" : "While Wielded";
}

export function getActiveStackQuantity(input: {
  equipped?: number;
  worn?: number;
  wielded?: number;
}): number {
  return (input.equipped ?? 0) + (input.worn ?? 0) + (input.wielded ?? 0);
}

export function getInactiveStackQuantity(ownedQuantity: number, activeQuantity: number): number {
  if (!Number.isSafeInteger(ownedQuantity) || ownedQuantity <= 0) {
    throw new Error("Equipment ownership quantity must be a positive whole number.");
  }
  if (!Number.isSafeInteger(activeQuantity) || activeQuantity < 0 || activeQuantity > ownedQuantity) {
    throw new Error("Active Equipment quantity cannot exceed owned quantity.");
  }
  return ownedQuantity - activeQuantity;
}

export function validatePassiveItemEffect(input: ItemPassiveEffectDefinition): ItemPassiveEffectDefinition {
  if (input.id !== null && (!Number.isSafeInteger(input.id) || input.id <= 0)) {
    throw new Error("Passive effect identity must be a saved positive ID or null for a new definition.");
  }
  if (!PASSIVE_REQUIRED_EQUIPMENT_STATES.includes(input.requiredEquipmentState)) {
    throw new Error("Passive effect requires Equipped, Worn, or Wielded state.");
  }
  const validation = validateMechanicalEffect(input.effect);
  if (!validation.valid) throw new Error(validation.issues.map(({ message }) => message).join(" "));
  const effect = validation.effect;
  if (effect.kind === "health.damage" || effect.kind === "health.heal") {
    throw new Error("Health Damage and Healing cannot be automatic passive Item effects.");
  }
  if (
    (effect.kind === "condition.apply" || effect.kind === "modifier.apply")
    && effect.duration.kind !== "until-removed"
  ) {
    throw new Error("Passive Conditions and Modifiers must use Equipment-owned Until Removed lifecycle.");
  }
  return {
    id: input.id,
    requiredEquipmentState: input.requiredEquipmentState,
    effect: effect.kind === "condition.apply" || effect.kind === "modifier.apply"
      ? {
          ...effect,
          duration: {
            kind: "until-removed",
            value: null,
            label: passiveLifecycleLabel(input.requiredEquipmentState),
          },
        }
      : effect,
  };
}

export function passiveSourceEffectKey(passiveEffectId: number): string {
  if (!Number.isSafeInteger(passiveEffectId) || passiveEffectId <= 0) {
    throw new Error("Passive source effect identity must be a positive saved ID.");
  }
  return `passive:${passiveEffectId}`;
}

export function shouldPassiveEffectBeActive(input: {
  requiredEquipmentState: PassiveRequiredEquipmentState;
  activeStackQuantities: Partial<Record<ActiveEquipmentState, number>>;
  instanceStates: readonly EquipmentState[];
}): boolean {
  return ACTIVE_EQUIPMENT_STATES.some((state) => (
    (input.activeStackQuantities[state] ?? 0) > 0
    && stateSatisfiesEquipmentRequirement(state, input.requiredEquipmentState)
  )) || input.instanceStates.some((state) => stateSatisfiesEquipmentRequirement(state, input.requiredEquipmentState));
}

export function copyPassiveItemEffects(
  effects: readonly ItemPassiveEffectDefinition[],
): ItemPassiveEffectDefinition[] {
  return effects.map((entry) => ({
    id: null,
    requiredEquipmentState: entry.requiredEquipmentState,
    effect: structuredClone(entry.effect),
  }));
}
