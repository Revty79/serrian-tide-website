import {
  DERIVED_ABILITY_ATTRIBUTE_KEYS,
  type DerivedAbilityAttributeKey,
  type DerivedAbilityDefinition,
  type DerivedAbilityTriggerDefinition,
} from "./models";

export type DerivedAbilityEvaluationContext = {
  attributes: Partial<Record<DerivedAbilityAttributeKey, number>>;
};

export type DerivedAbilityQueryRow = {
  id: number;
  name: string;
  description: string;
  mechanicalEffect: string;
  sourceSystem: string | null;
  sourceExternalId: string | null;
  triggerId: number;
  triggerType: string;
  attributeKey: string | null;
  minimumScore: number | null;
  triggerSortOrder: number;
};

export function groupDerivedAbilityRows(
  rows: readonly DerivedAbilityQueryRow[],
): DerivedAbilityDefinition[] {
  const definitions = new Map<number, DerivedAbilityDefinition>();
  for (const row of rows) {
    const definition = definitions.get(row.id) ?? {
      id: row.id,
      name: row.name,
      description: row.description,
      mechanicalEffect: row.mechanicalEffect,
      sourceSystem: row.sourceSystem,
      sourceExternalId: row.sourceExternalId,
      triggers: [],
    };
    definition.triggers.push({
      id: row.triggerId,
      derivedAbilityId: row.id,
      triggerType: row.triggerType,
      attributeKey: row.attributeKey,
      minimumScore: row.minimumScore,
      sortOrder: row.triggerSortOrder,
    });
    definitions.set(row.id, definition);
  }
  return [...definitions.values()];
}

export function normalizeV1DerivedAbilityTrigger(
  trigger: DerivedAbilityTriggerDefinition,
): DerivedAbilityTriggerDefinition & {
  triggerType: "attribute";
  attributeKey: DerivedAbilityAttributeKey;
  minimumScore: number;
} {
  if (trigger.triggerType !== "attribute") {
    throw new Error("V1 Derived Abilities support only Attribute triggers.");
  }
  if (
    !trigger.attributeKey ||
    !DERIVED_ABILITY_ATTRIBUTE_KEYS.includes(
      trigger.attributeKey as DerivedAbilityAttributeKey,
    )
  ) {
    throw new Error("Derived Ability Attribute must be STR, DEX, CON, INT, WIS, or CHR.");
  }
  if (
    trigger.minimumScore === null ||
    !Number.isInteger(trigger.minimumScore) ||
    trigger.minimumScore < 0
  ) {
    throw new Error("Derived Ability Required Score must be a non-negative whole number.");
  }
  return {
    ...trigger,
    triggerType: "attribute",
    attributeKey: trigger.attributeKey as DerivedAbilityAttributeKey,
    minimumScore: trigger.minimumScore,
  };
}

export function evaluateDerivedAbilityTrigger(
  trigger: DerivedAbilityTriggerDefinition,
  context: DerivedAbilityEvaluationContext,
): boolean {
  if (trigger.triggerType !== "attribute") return false;
  const normalized = normalizeV1DerivedAbilityTrigger(trigger);
  const currentValue = context.attributes[normalized.attributeKey];
  return (
    typeof currentValue === "number" &&
    Number.isFinite(currentValue) &&
    currentValue >= normalized.minimumScore
  );
}

export function getActiveDerivedAbilities(
  campaignEnabledAbilities: readonly DerivedAbilityDefinition[],
  context: DerivedAbilityEvaluationContext,
): DerivedAbilityDefinition[] {
  return campaignEnabledAbilities.filter(
    (ability) =>
      ability.triggers.length === 1 &&
      evaluateDerivedAbilityTrigger(ability.triggers[0]!, context),
  );
}

export function getDerivedAbilityRequirementSummary(
  ability: Pick<DerivedAbilityDefinition, "triggers">,
): string {
  if (ability.triggers.length !== 1) return "Invalid V1 trigger";
  const trigger = ability.triggers[0]!;
  if (
    trigger.triggerType !== "attribute" ||
    !trigger.attributeKey ||
    trigger.minimumScore === null
  ) {
    return "Unsupported trigger";
  }
  return `${trigger.attributeKey} ${trigger.minimumScore}+`;
}
