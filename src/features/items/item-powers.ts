import {
  PASSIVE_REQUIRED_EQUIPMENT_STATES,
  passiveLifecycleLabel,
  validatePassiveItemEffect,
  type PassiveRequiredEquipmentState,
} from "./equipment-state";
import {
  decodeMechanicalEffect,
  encodeMechanicalEffect,
  type MechanicalEffect,
} from "@/features/mechanical-effects";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import { adaptSpellToMechanicalEffects } from "@/features/spell-construction/mechanical-effects-adapter";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import { validateSpell } from "@/features/spell-construction/engine/validateSpell";
import { hasProgressiveSpellModifier } from "@/features/spell-construction/engine/progressiveSpell";
import { adaptProgressiveSpellToMechanicalEffects } from "@/features/spell-construction/mechanical-effects-adapter";
import type { PractitionerLevel } from "@/features/spell-construction/models/rules";
import type { SpellDocument } from "@/features/spell-construction/models/spell";

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
  archived: boolean;
};

export type ItemPowerCustomConstruction = {
  document: SpellDocument;
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
  fixedPowerLevel: string | null;
  source: ItemPowerSource | null;
  customConstruction: ItemPowerCustomConstruction | null;
  effects: ItemPowerEffect[];
  sortOrder: number;
};

export type ItemPowerValidationInput = {
  powers: readonly ItemPower[];
  hasWeaponProfile: boolean;
  hasChargePool: boolean;
  isMagical: boolean;
};

export function resolveItemPowerConstruction(document: SpellDocument, fixedPowerLevel: string | null) {
  const progressive = hasProgressiveSpellModifier(document);
  if (!progressive || !fixedPowerLevel) return { progressive: false, calculation: calculateSpell(document), adapter: adaptSpellToMechanicalEffects(document) };
  const level = fixedPowerLevel as PractitionerLevel;
  return { progressive: true, calculation: calculateSpell(document), adapter: adaptProgressiveSpellToMechanicalEffects(document, level) };
}

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
    if (power.trigger === "weapon-hit" && power.resolutionMode !== "weapon-hit") throw new Error(`Weapon-Hit Power ${name} must use Weapon-Hit resolution.`);
    if (power.trigger === "passive" && (power.resolutionMode === "weapon-hit" || power.resolutionMode === "fixed-roll")) throw new Error(`Passive Power ${name} cannot use activation resolution.`);
    if (power.trigger === "passive" && power.initiativeCost !== null) throw new Error(`Passive Power ${name} cannot define an activation Initiative.`);
    if (power.trigger === "weapon-hit" && power.initiativeCost !== null) throw new Error(`Weapon-Hit Power ${name} cannot define a separate Initiative.`);
    if (power.trigger === "activated" && power.resolutionMode === "weapon-hit") throw new Error(`Activated Power ${name} cannot use Weapon-Hit resolution.`);
    const initiativeCost = power.trigger === "activated" ? nonNegative(power.initiativeCost, `Power ${index + 1} Initiative`) : null;
    if (power.trigger === "passive" && !power.requiredEquipmentState) throw new Error(`Passive Power ${name} requires an Equipment State.`);
    if (power.requiredEquipmentState && !PASSIVE_REQUIRED_EQUIPMENT_STATES.includes(power.requiredEquipmentState)) throw new Error(`Power ${name} has an invalid Equipment State.`);
    if (power.trigger === "weapon-hit" && !input.hasWeaponProfile) throw new Error(`Weapon-Hit Power ${name} requires a Weapon Profile.`);
    if (power.trigger !== "activated" && power.resourceCostKind === "consume-item") throw new Error(`Power ${name} can only consume an Item when Activated.`);
    if (power.trigger === "passive" && power.resourceCostKind === "shared-charges") throw new Error(`Passive Power ${name} cannot spend Charges.`);
    if (power.resourceCostKind !== "none") {
      positiveWhole(power.resourceCostAmount, `Power ${name} Resource Cost`);
      if (power.resourceCostKind === "shared-charges" && !input.hasChargePool) throw new Error(`Power ${name} spends Charges but this Item has no Charge Pool.`);
    } else if (power.resourceCostAmount !== null) {
      throw new Error(`Power ${name} cannot define an amount with no resource cost.`);
    }
    const fixedRollTarget = power.resolutionMode === "fixed-roll" ? positiveWhole(power.fixedRollTarget, `Power ${name} Roll Target`) : null;
    if (power.fixedPowerLevel !== null && !["Apprentice", "Novice", "Master", "High Master", "Grand Master"].includes(power.fixedPowerLevel)) throw new Error(`Power ${name} Fixed Power Level is invalid.`);
    let customConstruction: ItemPowerCustomConstruction | null = null;
    if (power.customConstruction) {
      if (!input.isMagical) throw new Error(`Power ${name} Custom Magic requires a Magical Item.`);
      const document = parseSpellDocument(JSON.stringify(power.customConstruction.document));
      const validation = document ? calculateSpell(document) : null;
      if (!validation) throw new Error(`Power ${name} Custom Magic Construction could not be calculated.`);
      resolveItemPowerConstruction(document, power.fixedPowerLevel);
      const spellValidation = validateSpell(document, undefined, validation);
      if (spellValidation.issues.some((issue) => issue.severity === "ERROR")) throw new Error(`Power ${name} Custom Magic Construction has unresolved validation errors.`);
      const adapter = adaptSpellToMechanicalEffects(document);
      if (!adapter.valid) throw new Error(`Power ${name} Custom Magic Construction has unresolved Mechanical Effect errors.`);
      customConstruction = { document };
    }
    if (power.source && !input.isMagical) throw new Error(`Power ${name} Canonical Source requires a Magical Item.`);
    if (power.source && power.customConstruction) throw new Error(`Power ${name} cannot use both a Canonical Source and Custom Magic.`);
    const effects = power.effects.map((entry: ItemPowerEffect, effectIndex: number) => {
      if (entry.id !== null && (!Number.isSafeInteger(entry.id) || entry.id <= 0)) throw new Error(`Power ${name} Effect ${effectIndex + 1} has an invalid identity.`);
      const decoded = decodeMechanicalEffect(encodeMechanicalEffect(entry.effect));
      const passiveReadyEffect = power.trigger === "passive" && (decoded.kind === "condition.apply" || decoded.kind === "modifier.apply")
        ? { ...decoded, duration: { kind: "until-removed" as const, value: null, label: passiveLifecycleLabel(power.requiredEquipmentState!) } }
        : decoded;
      const effect = power.trigger === "passive"
        ? validatePassiveItemEffect({ id: entry.id, requiredEquipmentState: power.requiredEquipmentState!, effect: passiveReadyEffect }).effect
        : passiveReadyEffect;
      return { id: entry.id, effect };
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
      fixedPowerLevel: power.fixedPowerLevel,
      customConstruction,
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
    customConstruction: power.customConstruction ? { document: structuredClone(power.customConstruction.document) } : null,
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
