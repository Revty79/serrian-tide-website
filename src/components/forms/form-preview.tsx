import type { ReactNode } from "react";
import { ABILITY_FACT_DEFINITIONS } from "@/features/ability-use-conditions/facts";
import { ABILITY_CONDITION_OPERATOR_LABELS } from "@/features/ability-use-conditions/authoring";
import type { DerivedAbilityUseConditionDefinition } from "@/features/derived-abilities/models";
import type { FormCosts, FormTiming, FormTransformation } from "@/features/forms/form-transformation";
import type { InteractionCondition } from "@/features/interaction-rules/interaction-rules";
import styles from "./form-preview.module.css";
import { formChoiceLabel, formRefreshLabel } from "@/features/forms/form-language";
export const formLabel = formChoiceLabel;
/** Complete read-only details shared by both Form viewers. */
export function FormAuthoredDetails({ value }: { value: unknown }) {
  if (value == null || value === "") return <>Not recorded</>;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((row, index) => <li key={index}><FormAuthoredDetails value={row} /></li>)}</ul> : <>None recorded</>;
  const labels: Record<string, string> = { activationType: "How it is used", resourceKey: "Resource name", refreshScope: "When uses return", refreshKey: "Event that restores uses", conditionKey: "Required circumstance", operator: "What must be true", numericValue: "Required number", textValue: "Required text", onHitEffects: "Effects on a hit", magic: "Magic Construction", document: "Spell details", kind: "Type" };
  if (typeof value === "object") return <dl className={styles.definitions}>{Object.entries(value).filter(([key]) => !["id", "key", "effectKey", "canonicalId", "schemaVersion", "sortOrder"].includes(key)).map(([key, entry]) => <div key={key}><dt>{labels[key] ?? formLabel(key.replace(/([a-z])([A-Z])/g, "$1-$2"))}</dt><dd><FormAuthoredDetails value={entry} /></dd></div>)}</dl>;
  return <>{String(value)}</>;
}
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
  if (!value) return <p>No transformation rules recorded. How to change, return, pay costs and limit uses is still undecided.</p>;
  return <dl className={styles.definitions}>
    <FormPreviewDefinition title="Who controls the change?">{formLabel(value.entryMethod)} {value.entryNotes}</FormPreviewDefinition>
    <FormPreviewDefinition title="Time to change">{timing(value.entryTiming)}</FormPreviewDefinition><FormPreviewDefinition title="Costs to change">{costs(value.entryCosts)}</FormPreviewDefinition>
    <FormPreviewDefinition title="Conditions needed before changing">{conditions(value.requirements)}</FormPreviewDefinition><FormPreviewDefinition title="What can force the change?">{conditions(value.involuntaryTriggers)}</FormPreviewDefinition>
    <FormPreviewDefinition title="Duration">{formLabel(value.duration.mode)} {value.duration.description}</FormPreviewDefinition>
    <FormPreviewDefinition title="Ways to return">{value.exitMethods.map(formLabel).join(", ") || "Unspecified"} {value.exitNotes}</FormPreviewDefinition>
    <FormPreviewDefinition title="Time to return">{timing(value.exitTiming)}</FormPreviewDefinition><FormPreviewDefinition title="Costs to return">{costs(value.exitCosts)}</FormPreviewDefinition>
    <FormPreviewDefinition title="How often changes are allowed">{formLabel(value.limitMode)}{value.useLimits.length ? <ul>{value.useLimits.map((limit, index) => <li key={index}>{limit.maximumUses} uses · {formRefreshLabel(limit.refreshScope)} {limit.refreshKey} {limit.notes}</li>)}</ul> : null}</FormPreviewDefinition>
    <FormPreviewDefinition title="Waiting time or other limits">{value.cooldown}</FormPreviewDefinition><FormPreviewDefinition title="Equipment when changing">{value.equipmentEntryNotes}</FormPreviewDefinition><FormPreviewDefinition title="Equipment when returning">{value.equipmentExitNotes}</FormPreviewDefinition><FormPreviewDefinition title="Transformation notes">{value.notes}</FormPreviewDefinition>
  </dl>;
}
