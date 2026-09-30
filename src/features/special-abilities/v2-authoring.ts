import { newMechanicsKey } from "./authoring";
import type { MechanicsRule, SpecialAbilityMechanicsDocument } from "./models";
import type { DefinitionAmount, DefinitionCost, IntrinsicEffect, MechanicsV2Fields, OutcomeBranch } from "./v2-models";
export const RULE_FAMILY_LABELS = { capability: "Capability", manual: "Manual / G.O.D.", resource: "Resource", modifier: "Modifier", interaction: "Interaction", activated: "Activated / Triggered", override: "Rule Override", choice: "Choice / Binding Definition" } as const;
export const addRuleLabel = (kind: MechanicsV2Fields["kind"]) => `Add ${RULE_FAMILY_LABELS[kind]}${kind === "override" || kind === "choice" ? "" : " Rule"}`;
export const RULE_FAMILY_HELP = {
  resource: "Define a pool intrinsic to this ability. Its maximum and recovery are definitions only; no Character balance is created or changed.",
  modifier: "Describe an intrinsic contribution using the shared modifier vocabulary. Form Attributes, Size, movement replacement and protection stay on the Form. Nothing is applied.",
  interaction: "Define an ability-owned contribution using shared Interaction matching and percentage semantics. Existing Race, Form and Creature profiles remain with their owners. Incoming effects do not consume this definition yet.",
  activated: "Describe intentional use or an event response, costs and outcomes. No event is subscribed to, no cost is paid, and no effect or branch executes. Existing attacks, spells and Items retain their effects.",
  override: "Describe a proposed exception for G.O.D. determination. No safe definition-level override slots are registered yet. This does not alter casting, combat, movement or rolls.",
  choice: "Define a choice each owner may need to make. Allowed candidates belong here; a Character's selected value belongs to a future binding system. No selection state is stored here.",
} as const;
export function manualAmount(): DefinitionAmount { return { kind: "manual", guidance: "" }; }
export function newIntrinsicEffect(): IntrinsicEffect { return { key: newMechanicsKey(), effect: { kind: "manual", title: "", description: "" } }; }
export function newOutcome(): OutcomeBranch { return { key: newMechanicsKey(), kind: "manual", description: "", effectKeys: [], adjudication: "", limitations: "", notes: "" }; }
export function newCost(): DefinitionCost { return { key: newMechanicsKey(), kind: "custom", amount: manualAmount(), notes: "" }; }
export function newV2Rule(kind: MechanicsV2Fields["kind"]): MechanicsRule {
  const base = { key: newMechanicsKey(), title: "", description: "", when: { mode: "requirements" as const, groups: [] }, limitations: "", notes: "", references: [] };
  switch (kind) {
    case "resource": return { ...base, kind, unit: "", grantsResource: false, maximum: manualAmount(), maximumChanges: [], recovery: [] };
    case "modifier": return { ...base, kind, effect: { kind: "modifier.apply", label: "", channel: "attribute", targetKey: "", amount: 0, duration: { kind: "until-removed" } }, adjudication: "" };
    case "interaction": return { ...base, kind, interaction: { ruleType: "immunity", scope: "damage", match: "ALL", conditions: [], percentage: null }, adjudication: "" };
    case "activated": return { ...base, kind, activationType: "activated", trigger: "", costs: [], useLimits: [], duration: null, target: { kind: "manual", description: "" }, choiceKeys: [], effects: [], outcomes: [] };
    case "override": return { ...base, kind, override: { mode: "manual", subsystem: "other", proposedChange: "", conflictGuidance: "" }, outcomes: [] };
    case "choice": return { ...base, kind, selection: { kind: "manual", guidance: "" }, minimum: 1, maximum: 1, reselection: "god-approval", restrictions: "" };
  }
}
/** Called only by a deliberate author action. No keys or authored payloads change. */
export function upgradeMechanicsDocument(document: SpecialAbilityMechanicsDocument): SpecialAbilityMechanicsDocument {
  return { ...structuredClone(document), schemaVersion: 2 };
}
