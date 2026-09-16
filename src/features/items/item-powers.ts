import {
  PASSIVE_REQUIRED_EQUIPMENT_STATES,
  type PassiveRequiredEquipmentState,
} from "./equipment-state";
import {
  decodeMechanicalEffect,
  encodeMechanicalEffect,
  type MechanicalEffect,
} from "@/features/mechanical-effects";

export const ITEM_POWER_TRIGGERS = ["activated", "passive", "weapon-hit"] as const;
export type ItemPowerTrigger = (typeof ITEM_POWER_TRIGGERS)[number];

export const ITEM_POWER_RESOURCE_COSTS = ["none", "shared-charges", "consume-item"] as const;
export type ItemPowerResourceCost = (typeof ITEM_POWER_RESOURCE_COSTS)[number];

export const ITEM_POWER_RESOLUTION_MODES = ["automatic", "weapon-hit", "fixed-roll", "manual"] as const;
export type ItemPowerResolutionMode = (typeof ITEM_POWER_RESOLUTION_MODES)[number];

export type ItemPowerSource = {
  sourceSkillId: number;
  sourceSkillName: string;
  sourceExtensionType: "spell-construction";
  sourceSchemaVersion: number;
  fixedPowerLevel: string | null;
  archived: boolean;
};

export type ItemPowerEffect = {
  id: number | null;
  effect: MechanicalEffect;
};

export type ItemPower = {
  id: number | null;
  name: string;
  description: string;
  trigger: ItemPowerTrigger;
  activationLabel: string;
  initiativeCost: number | null;
  resourceCostKind: ItemPowerResourceCost;
  resourceCostAmount: number | null;
  requiredEquipmentState: PassiveRequiredEquipmentState | null;
  resolutionMode: ItemPowerResolutionMode;
  fixedRollTarget: number | null;
  source: ItemPowerSource | null;
  effects: ItemPowerEffect[];
  sortOrder: number;
};

export type ItemPowerValidationInput = {
  powers: readonly ItemPower[];
  hasWeaponProfile: boolean;
  hasChargePool: boolean;
};

function positiveWhole(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive whole number.`);
  return value;
}

function nonNegative(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater, or left blank.`);
  return value;
}

export function validateItemPowers(input: ItemPowerValidationInput): ItemPower[] {
  if (!Array.isArray(input.powers)) throw new Error("Item Powers must be an ordered list.");
  const ids = new Set<number>();
  return input.powers.map((power, index) => {
    if (power.id !== null) {
      if (!Number.isSafeInteger(power.id) || power.id <= 0 || ids.has(power.id)) throw new Error("Power identities must be saved positive IDs without duplicates.");
      ids.add(power.id);
    }
    const name = power.name.trim();
    if (!name) throw new Error(`Power ${index + 1} Name is required.`);
    if (!ITEM_POWER_TRIGGERS.includes(power.trigger)) throw new Error(`Power ${index + 1} has an invalid trigger.`);
    if (!ITEM_POWER_RESOLUTION_MODES.includes(power.resolutionMode)) throw new Error(`Power ${index + 1} has an invalid resolution mode.`);
    const initiativeCost = power.trigger === "activated" ? nonNegative(power.initiativeCost, `Power ${index + 1} Initiative`) : null;
    if (power.trigger === "passive" && !power.requiredEquipmentState) throw new Error(`Passive Power ${name} requires an Equipment State.`);
    if (power.requiredEquipmentState && !PASSIVE_REQUIRED_EQUIPMENT_STATES.includes(power.requiredEquipmentState)) throw new Error(`Power ${name} has an invalid Equipment State.`);
    if (power.trigger === "weapon-hit" && !input.hasWeaponProfile) throw new Error(`Weapon-Hit Power ${name} requires a Weapon Profile.`);
    if (power.trigger !== "activated" && power.resourceCostKind === "consume-item") throw new Error(`Power ${name} can only consume an Item when Activated.`);
    if (power.resourceCostKind !== "none") {
      positiveWhole(power.resourceCostAmount, `Power ${name} Resource Cost`);
      if (power.resourceCostKind === "shared-charges" && !input.hasChargePool) throw new Error(`Power ${name} spends Charges but this Item has no Charge Pool.`);
    } else if (power.resourceCostAmount !== null) {
      throw new Error(`Power ${name} cannot define an amount with no resource cost.`);
    }
    const fixedRollTarget = power.resolutionMode === "fixed-roll" ? positiveWhole(power.fixedRollTarget, `Power ${name} Roll Target`) : null;
    const effects = power.effects.map((entry: ItemPowerEffect, effectIndex: number) => {
      if (entry.id !== null && (!Number.isSafeInteger(entry.id) || entry.id <= 0)) throw new Error(`Power ${name} Effect ${effectIndex + 1} has an invalid identity.`);
      const decoded = decodeMechanicalEffect(encodeMechanicalEffect(entry.effect));
      return { id: entry.id, effect: decoded };
    });
    return {
      ...power,
      id: power.id,
      name,
      description: power.description.trim(),
      activationLabel: power.activationLabel.trim() || "Activate",
      initiativeCost,
      resourceCostAmount: power.resourceCostKind === "none" ? null : power.resourceCostAmount,
      requiredEquipmentState: power.trigger === "passive" ? power.requiredEquipmentState : null,
      fixedRollTarget,
      effects,
      sortOrder: index,
    };
  });
}

export function copyItemPowers(powers: readonly ItemPower[]): ItemPower[] {
  return powers.map((power) => ({
    ...power,
    id: null,
    source: power.source ? { ...power.source } : null,
    effects: power.effects.map((entry) => ({ id: null, effect: structuredClone(entry.effect) })),
  }));
}

export function encodeItemPowerEffects(effects: readonly ItemPowerEffect[]) {
  return effects.map((entry, sortOrder) => ({
    id: entry.id,
    schemaVersion: encodeMechanicalEffect(entry.effect).schemaVersion,
    effectJson: encodeMechanicalEffect(entry.effect).effectJson,
    sortOrder,
  }));
}

export function formatItemPowerTrigger(trigger: ItemPowerTrigger): string {
  return trigger === "weapon-hit" ? "Weapon Hit" : trigger[0]!.toUpperCase() + trigger.slice(1);
}
