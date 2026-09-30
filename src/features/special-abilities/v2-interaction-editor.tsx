"use client";
import { INTERACTION_RULE_TYPES, INTERACTION_SCOPES, INTERACTION_SOURCE_KINDS, usesInteractionPercentage } from "@/features/interaction-rules/interaction-rules";
import type { AbilityInteraction, AbilityInteractionCondition } from "./v2-models";
import { newMechanicsKey } from "./authoring";
import { ChildList, humanOptions, NumberField, SelectField, TextField } from "./v2-fields";
import { EFFECT_LABELS } from "./v2-effect-editor";

function matchingCondition(kind: AbilityInteractionCondition["kind"], key: string): AbilityInteractionCondition {
  switch (kind) {
    case "damage-type": return { key, kind, damageType: "" };
    case "magical": return { key, kind, magical: true };
    case "source-kind": return { key, kind, sourceKind: INTERACTION_SOURCE_KINDS[0] };
    case "mechanical-effect-kind": return { key, kind, effectKind: "manual" };
    case "condition-name": return { key, kind, conditionName: "" };
  }
}
export function InteractionDefinitionEditor({ value, onChange }: { value: AbilityInteraction; onChange: (value: AbilityInteraction) => void }) {
  return <div className="mechanics-rule-fields">
    <SelectField label="Interaction type" value={value.ruleType} options={humanOptions(INTERACTION_RULE_TYPES)} help="Uses the existing Interaction Rule types. Requirement and Immunity have no percentage; percentage contributions apply to Damage."
      onChange={ruleType => onChange({ ...value, ruleType, percentage: usesInteractionPercentage(ruleType) ? value.percentage ?? 0 : null, scope: usesInteractionPercentage(ruleType) ? "damage" : value.scope })} />
    <SelectField label="Interaction scope" value={value.scope} options={humanOptions(usesInteractionPercentage(value.ruleType) ? ["damage"] as const : INTERACTION_SCOPES)} onChange={scope => onChange({ ...value, scope })} help="Choose what kind of incoming effect this contribution describes. No incoming-effect loader consumes it yet." />
    {usesInteractionPercentage(value.ruleType) && <NumberField label="Interaction percentage" value={value.percentage ?? 0} min={0} onChange={percentage => onChange({ ...value, percentage })} help="Enter a positive percentage using the shared Interaction semantics. This editor adds no stacking, rounding or percentage calculation rules." />}
    <SelectField label="Match incoming conditions" value={value.match} options={[{ value: "ALL", label: "All conditions (AND)" }, { value: "ANY", label: "Any condition (OR)" }]} onChange={match => onChange({ ...value, match })} help="These match incoming effect descriptors. The rule's Applies When conditions separately describe the ability owner's requirements." />
    <ChildList label="Incoming matching conditions" singular="Incoming Condition" rows={value.conditions} onChange={conditions => onChange({ ...value, conditions })} create={() => matchingCondition("damage-type", newMechanicsKey())}>{(condition, change) => <>
      <SelectField label="Incoming condition type" value={condition.kind} options={humanOptions(["damage-type", "magical", "source-kind", "mechanical-effect-kind", "condition-name"] as const)} onChange={kind => change(matchingCondition(kind, condition.key))} help="Shared descriptor matching only. Item tags and properties need additional identity protection and remain Manual/G.O.D. here." />
      {condition.kind === "damage-type" && <TextField label="Matching Damage Type" short value={condition.damageType} onChange={damageType => change({ ...condition, damageType })} help="Use the Damage Type name from the incoming effect's definition; this does not create a Damage Type." />}
      {condition.kind === "condition-name" && <TextField label="Matching Condition name" short value={condition.conditionName} onChange={conditionName => change({ ...condition, conditionName })} help="Use the existing Condition name to match." />}
      {condition.kind === "magical" && <SelectField label="Magical incoming effect" value={condition.magical ? "yes" : "no"} options={humanOptions(["yes", "no"] as const)} onChange={value => change({ ...condition, magical: value === "yes" })} help="Match the incoming descriptor's explicit magical status." />}
      {condition.kind === "source-kind" && <>
        <SelectField label="Incoming source kind" value={condition.sourceKind} options={humanOptions(INTERACTION_SOURCE_KINDS)} onChange={sourceKind => change({ key: condition.key, kind: condition.kind, sourceKind })} help="Uses existing incoming-effect source categories. This does not add Special Abilities as a runtime source." />
        {condition.sourceKind === "weapon" && <SelectField label="Weapon restriction" value={condition.weaponFamily ?? "any"} options={[{ value: "any", label: "Any weapon" }, { value: "firearm", label: "Firearm" }]} onChange={family => change({ ...condition, weaponFamily: family === "any" ? null : family })} help="The shared model supports an optional Firearm restriction for Weapon sources." />}
      </>}
      {condition.kind === "mechanical-effect-kind" && <SelectField label="Matching effect kind" value={condition.effectKind} options={Object.entries(EFFECT_LABELS).map(([kind, label]) => ({ value: kind as typeof condition.effectKind, label }))} onChange={effectKind => change({ ...condition, effectKind })} help="Match a supported shared Mechanical Effect kind; no effect is applied." />}
    </>}</ChildList>
  </div>;
}
