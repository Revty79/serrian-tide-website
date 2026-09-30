// Synthetic test definitions only. Never seeded into a shared database.
import type { MechanicsRule, SpecialAbilityMechanicsDocument } from "./models";
export function syntheticToolbox(skillId = 101, derivedAbilityId = 202): SpecialAbilityMechanicsDocument {
  const base = (key: string) => ({ key, title: `Synthetic ${key}`, description: " Authored synthetic definition. ", when: { mode: "always" as const }, limitations: "", notes: "", references: [] });
  const rules: MechanicsRule[] = [
    { ...base("resource"), kind: "resource", unit: "units", grantsResource: true, maximum: { kind: "fixed", amount: 7.5 }, maximumChanges: [
      { key: "change", when: { mode: "requirements", groups: [{ key: "g", conditions: [{ key: "c", kind: "skill-possession", skillId, operator: "possessed" }] }] }, amount: { kind: "manual", guidance: "G.O.D. decides the contribution." }, notes: "" },
    ], recovery: [{ key: "recovery", scope: "event", event: "Synthetic event", amount: { kind: "full" }, notes: "" }] },
    { ...base("modifier"), kind: "modifier", effect: { kind: "modifier.apply", channel: "skill", targetKey: `skill:${skillId}`, amount: -2, label: "Synthetic contribution", duration: { kind: "combat-rounds", value: 2 } }, adjudication: "No new stacking contract." },
    { ...base("interaction"), kind: "interaction", interaction: { ruleType: "resistance", scope: "damage", match: "ALL", percentage: 25, conditions: [{ key: "magical", kind: "magical", magical: true }] }, adjudication: "Shared semantics." },
    { ...base("choice"), kind: "choice", selection: { kind: "derived-ability", derivedAbilityIds: [derivedAbilityId] }, minimum: 1, maximum: 1, reselection: "god-approval", restrictions: "" },
    { ...base("activated"), kind: "activated", activationType: "triggered", trigger: "Synthetic trigger", costs: [
      { key: "cost", kind: "resource", resource: { kind: "local", resourceKey: "resource" }, amount: { kind: "fixed", amount: 2 }, notes: "" },
    ], useLimits: [{ key: "limit", maximumUses: 3, refreshScope: "scene", event: "", notes: "" }], duration: { kind: "scene" }, target: { kind: "self", description: "Intrinsic effect only." }, choiceKeys: ["choice"], effects: [
      { key: "effect", effect: { kind: "manual", title: "Synthetic intrinsic consequence", description: "G.O.D. determines handling." } },
    ], outcomes: [{ key: "outcome", kind: "success", description: "Existing result selects the branch.", effectKeys: ["effect"], adjudication: "", limitations: "", notes: "" }] },
    { ...base("override"), kind: "override", override: { mode: "manual", subsystem: "other", proposedChange: "A synthetic proposed exception.", conflictGuidance: "G.O.D. adjudicates." }, outcomes: [] },
  ];
  return { schemaVersion: 2, rules };
}
