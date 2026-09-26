import type { ReactNode } from "react";
import { ABILITY_FACT_DEFINITIONS } from "@/features/ability-use-conditions/facts";
import { ABILITY_CONDITION_OPERATOR_LABELS } from "@/features/ability-use-conditions/authoring";
import type { DerivedAbilityUseConditionDefinition } from "@/features/derived-abilities/models";
import type { FormCosts, FormTiming, FormTransformation } from "@/features/forms/form-transformation";
import type { InteractionCondition } from "@/features/interaction-rules/interaction-rules";
import styles from "./form-preview.module.css";
export const formLabel = (value: string | null | undefined) => value ? value.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ") : "Unspecified";
export function FormPreviewSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.section} aria-label={title}><h3>{title}</h3>{children}</section>;
}
export function FormPreviewDefinition({ title, children }: { title: string; children: ReactNode }) { return <div><dt>{title}</dt><dd>{children || "Unspecified"}</dd></div>; }
function timing(value: FormTiming) {
  return [formLabel(value.mode), value.initiativeCost === null ? "" : `${value.initiativeCost} Initiative`, value.time, value.notes].filter(Boolean).join(" · ");
}
function costs(value: FormCosts) {
  if (value.mode !== "costs") return value.mode === "none" ? "No resource cost" : "Unspecified";
  return value.costs.map(cost => `${cost.amount} ${cost.costType === "health" ? "HP" : formLabel(cost.costType)}${cost.resourceKey ? ` (${cost.resourceKey})` : ""}${cost.notes ? ` — ${cost.notes}` : ""}`).join("; ");
}
function conditions(value: DerivedAbilityUseConditionDefinition[]) {
  return value.length ? <ul>{value.map((condition, index) => <li key={index}>{[
    formLabel(condition.conditionType),
    ABILITY_FACT_DEFINITIONS.find(fact => fact.category === condition.conditionType && fact.key === condition.conditionKey)?.label ?? condition.conditionKey,
    condition.operator ? ABILITY_CONDITION_OPERATOR_LABELS[condition.operator] : "",
    condition.numericValue, condition.textValue, condition.notes,
  ].filter(part => part !== null && part !== "").join(" · ")}</li>)}</ul> : "None authored";
}
export function interactionCondition(condition: InteractionCondition): string {
  switch (condition.kind) {
    case "damage-type": return `Damage: ${condition.damageType}`;
    case "magical": return condition.magical ? "Magical" : "Nonmagical";
    case "source-kind": return `Source: ${formLabel(condition.sourceKind)}${condition.weaponFamily ? ` (${condition.weaponFamily})` : ""}`;
    case "item-property": return `Item property: ${condition.propertyName}${condition.value ? ` = ${condition.value}` : ""}${condition.relatedCreatureCanonicalId ? ` (${condition.relatedCreatureCanonicalId})` : ""}`;
    case "item-tag": return `Item tag: ${condition.tagCanonicalId}`;
    case "mechanical-effect-kind": return `Effect: ${condition.effectKind}`;
    case "condition-name": return `Condition: ${condition.conditionName}`;
  }
}
export function TransformationSummary({ value }: { value: FormTransformation | null }) {
  if (!value) return <p>No transformation definition authored.</p>;
  return <dl className={styles.definitions}>
    <FormPreviewDefinition title="Entry method">{formLabel(value.entryMethod)} {value.entryNotes}</FormPreviewDefinition>
    <FormPreviewDefinition title="Entry timing">{timing(value.entryTiming)}</FormPreviewDefinition><FormPreviewDefinition title="Entry costs">{costs(value.entryCosts)}</FormPreviewDefinition>
    <FormPreviewDefinition title="Entry requirements">{conditions(value.requirements)}</FormPreviewDefinition><FormPreviewDefinition title="Involuntary triggers">{conditions(value.involuntaryTriggers)}</FormPreviewDefinition>
    <FormPreviewDefinition title="Duration">{formLabel(value.duration.mode)} {value.duration.description}</FormPreviewDefinition>
    <FormPreviewDefinition title="Exit rules">{value.exitMethods.map(formLabel).join(", ") || "Unspecified"} {value.exitNotes}</FormPreviewDefinition>
    <FormPreviewDefinition title="Exit timing">{timing(value.exitTiming)}</FormPreviewDefinition><FormPreviewDefinition title="Exit costs">{costs(value.exitCosts)}</FormPreviewDefinition>
    <FormPreviewDefinition title="Use limits">{formLabel(value.limitMode)}{value.useLimits.length ? <ul>{value.useLimits.map((limit, index) => <li key={index}>{limit.maximumUses} uses · refresh {formLabel(limit.refreshScope)} {limit.refreshKey} {limit.notes}</li>)}</ul> : null}</FormPreviewDefinition>
    <FormPreviewDefinition title="Cooldown / custom limit">{value.cooldown}</FormPreviewDefinition><FormPreviewDefinition title="Equipment entry notes">{value.equipmentEntryNotes}</FormPreviewDefinition><FormPreviewDefinition title="Equipment exit notes">{value.equipmentExitNotes}</FormPreviewDefinition><FormPreviewDefinition title="Transformation notes">{value.notes}</FormPreviewDefinition>
  </dl>;
}
