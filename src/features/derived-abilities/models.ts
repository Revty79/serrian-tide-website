export const DERIVED_ABILITY_ATTRIBUTE_KEYS = [
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHR",
] as const;

export type DerivedAbilityAttributeKey =
  (typeof DERIVED_ABILITY_ATTRIBUTE_KEYS)[number];

export type DerivedAbilityTriggerDefinition = {
  id?: number;
  derivedAbilityId?: number;
  triggerType: string;
  attributeKey: string | null;
  minimumScore: number | null;
  sortOrder: number;
};

export type DerivedAbilityDefinition = {
  id: number;
  name: string;
  description: string;
  mechanicalEffect: string;
  sourceSystem: string | null;
  sourceExternalId: string | null;
  triggers: DerivedAbilityTriggerDefinition[];
};
