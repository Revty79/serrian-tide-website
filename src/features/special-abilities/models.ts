import type { NUMERIC_REQUIREMENT_OPERATORS, POSSESSION_REQUIREMENT_OPERATORS } from "@/features/requirements/requirement-primitives";

export const SPECIAL_ABILITY_MECHANICS_EXTENSION = "special-ability-mechanics";
export const SPECIAL_ABILITY_MECHANICS_VERSION = 1 as const;
export const CAPABILITY_DOMAINS = ["sense", "movement", "breathing", "communication", "other"] as const;
export type NumericOperator = typeof NUMERIC_REQUIREMENT_OPERATORS[number];
export type PossessionOperator = typeof POSSESSION_REQUIREMENT_OPERATORS[number];

export type MechanicsReference =
  | { kind: "skill"; skillId: number }
  | { kind: "derived-ability"; derivedAbilityId: number };
export type MechanicsCondition = { key: string } & (
  | { kind: "self-progression"; operator: NumericOperator; requiredValue: number }
  | { kind: "skill-possession"; skillId: number; operator: PossessionOperator }
  | { kind: "derived-ability-possession"; derivedAbilityId: number; operator: PossessionOperator }
  | { kind: "manual"; notes: string }
);
export type MechanicsConditions =
  | { mode: "always" }
  | { mode: "requirements"; groups: Array<{ key: string; conditions: MechanicsCondition[] }> };
export type MechanicsRule = {
  key: string;
  title: string;
  description: string;
  when: MechanicsConditions;
  limitations: string;
  notes: string;
  references: MechanicsReference[];
} & (
  | { kind: "capability"; domain: typeof CAPABILITY_DOMAINS[number] }
  | { kind: "manual"; adjudication: string }
);
export type SpecialAbilityMechanicsDocument = {
  schemaVersion: typeof SPECIAL_ABILITY_MECHANICS_VERSION;
  rules: MechanicsRule[];
};
export type StoredMechanics = { schemaVersion: number; dataJson: string };
export type MechanicsDiagnostic = { code: string; path: string; message: string };
export type MechanicsRead =
  | { status: "absent"; schemaVersion: null; document: null; diagnostics: MechanicsDiagnostic[] }
  | { status: "ready"; schemaVersion: 1; document: SpecialAbilityMechanicsDocument; diagnostics: MechanicsDiagnostic[] }
  | { status: "invalid" | "unsupported"; schemaVersion: number; document: null; diagnostics: MechanicsDiagnostic[] };
export function emptySpecialAbilityMechanics(): SpecialAbilityMechanicsDocument {
  return { schemaVersion: 1, rules: [] };
}
export function referenceKey(reference: MechanicsReference): string {
  return reference.kind === "skill" ? `skill:${reference.skillId}` : `derived-ability:${reference.derivedAbilityId}`;
}
