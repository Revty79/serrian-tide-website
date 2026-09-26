"use client";

import { useState, type ReactNode } from "react";
import { GuidedField } from "@/components/field-guidance";
import { CHARACTER_ATTRIBUTE_LABELS, type CharacterAggregate, type CharacterDraft, type CharacterRaceAggregate } from "@/features/characters/models";
import { availableCharacterForms, resolveCharacterFormPreview } from "@/features/characters/character-form-preview";
import { FORM_EQUIPMENT, FORM_MANIPULATION, FORM_SPEECH } from "@/features/races/race-form-mechanics";
import { ABILITY_FACT_DEFINITIONS } from "@/features/ability-use-conditions/facts";
import { ABILITY_CONDITION_OPERATOR_LABELS } from "@/features/ability-use-conditions/authoring";
import type { DerivedAbilityUseConditionDefinition } from "@/features/derived-abilities/models";
import type { FormCosts, FormTiming, RaceFormTransformation } from "@/features/races/race-form-transformation";
import type { InteractionCondition } from "@/features/interaction-rules/interaction-rules";
import styles from "./character-form-preview.module.css";

const label = (value: string | null | undefined) => value ? value.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ") : "Unspecified";
const signed = (value: number) => value > 0 ? `+${value}` : String(value);
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.section} aria-label={title}><h3>{title}</h3>{children}</section>;
}
function Definition({ title, children }: { title: string; children: ReactNode }) { return <div><dt>{title}</dt><dd>{children || "Unspecified"}</dd></div>; }
function timing(value: FormTiming) {
  return [label(value.mode), value.initiativeCost === null ? "" : `${value.initiativeCost} Initiative`, value.time, value.notes].filter(Boolean).join(" · ");
}
function costs(value: FormCosts) {
  if (value.mode !== "costs") return value.mode === "none" ? "No resource cost" : "Unspecified";
  return value.costs.map(cost => `${cost.amount} ${cost.costType === "health" ? "HP" : label(cost.costType)}${cost.resourceKey ? ` (${cost.resourceKey})` : ""}${cost.notes ? ` — ${cost.notes}` : ""}`).join("; ");
}
function conditions(value: DerivedAbilityUseConditionDefinition[]) {
  return value.length ? <ul>{value.map((condition, index) => <li key={index}>{[
    label(condition.conditionType),
    ABILITY_FACT_DEFINITIONS.find(fact => fact.category === condition.conditionType && fact.key === condition.conditionKey)?.label ?? condition.conditionKey,
    condition.operator ? ABILITY_CONDITION_OPERATOR_LABELS[condition.operator] : "",
    condition.numericValue, condition.textValue, condition.notes,
  ].filter(part => part !== null && part !== "").join(" · ")}</li>)}</ul> : "None authored";
}
function interactionCondition(condition: InteractionCondition): string {
  switch (condition.kind) {
    case "damage-type": return `Damage: ${condition.damageType}`;
    case "magical": return condition.magical ? "Magical" : "Nonmagical";
    case "source-kind": return `Source: ${label(condition.sourceKind)}${condition.weaponFamily ? ` (${condition.weaponFamily})` : ""}`;
    case "item-property": return `Item property: ${condition.propertyName}${condition.value ? ` = ${condition.value}` : ""}${condition.relatedCreatureCanonicalId ? ` (${condition.relatedCreatureCanonicalId})` : ""}`;
    case "item-tag": return `Item tag: ${condition.tagCanonicalId}`;
    case "mechanical-effect-kind": return `Effect: ${condition.effectKind}`;
    case "condition-name": return `Condition: ${condition.conditionName}`;
  }
}
function Transformation({ value }: { value: RaceFormTransformation | null }) {
  if (!value) return <p>No transformation definition authored.</p>;
  return <dl className={styles.definitions}>
    <Definition title="Entry method">{label(value.entryMethod)} {value.entryNotes}</Definition>
    <Definition title="Entry timing">{timing(value.entryTiming)}</Definition><Definition title="Entry costs">{costs(value.entryCosts)}</Definition>
    <Definition title="Entry requirements">{conditions(value.requirements)}</Definition><Definition title="Involuntary triggers">{conditions(value.involuntaryTriggers)}</Definition>
    <Definition title="Duration">{label(value.duration.mode)} {value.duration.description}</Definition>
    <Definition title="Exit rules">{value.exitMethods.map(label).join(", ") || "Unspecified"} {value.exitNotes}</Definition>
    <Definition title="Exit timing">{timing(value.exitTiming)}</Definition><Definition title="Exit costs">{costs(value.exitCosts)}</Definition>
    <Definition title="Use limits">{label(value.limitMode)}{value.useLimits.length ? <ul>{value.useLimits.map((limit, index) => <li key={index}>{limit.maximumUses} uses · refresh {label(limit.refreshScope)} {limit.refreshKey} {limit.notes}</li>)}</ul> : null}</Definition>
    <Definition title="Cooldown / custom limit">{value.cooldown}</Definition><Definition title="Equipment entry notes">{value.equipmentEntryNotes}</Definition><Definition title="Equipment exit notes">{value.equipmentExitNotes}</Definition><Definition title="Transformation notes">{value.notes}</Definition>
  </dl>;
}

/** Deliberately accepts no mutation callback. Its selection is local to this mount. */
export function CharacterFormPreviewViewer({ aggregate, draft, race }: { aggregate: CharacterAggregate; draft: CharacterDraft; race: CharacterRaceAggregate | null }) {
  const [formId, setFormId] = useState<number | null>(null);
  const forms = availableCharacterForms(draft, race);
  if (!forms.length) return null;
  const preview = resolveCharacterFormPreview(draft, race, formId, aggregate.skillCatalog, aggregate.attributeReferenceCatalog);
  return <section className={styles.viewer} aria-label="Character Form viewer">
    <GuidedField className="st-field" label="View Form" help="Preview a Form owned by this exact selected Race. Selection changes only this display and resets to Normal when the sheet reopens. Character saving, creation budgets, live state, and printing keep the normal Character values."><select className="st-control" value={preview?.form.id ?? ""} onChange={event => setFormId(event.target.value ? Number(event.target.value) : null)}><option value="">Normal</option>{forms.map(form => <option key={form.id} value={form.id}>{form.name}</option>)}</select></GuidedField>
    {preview && <div className={styles.body} data-form-preview>
      <header><h2>{preview.form.name}</h2><p className={styles.notice}><strong>Form Preview — viewing this Form does not change the Character&apos;s current runtime state.</strong></p><p>Normal Character editing and live controls remain below. Saving and printing use Normal values.</p><p>{preview.form.description}</p>{preview.form.notes && <p>{preview.form.notes}</p>}<p><strong>Size:</strong> {preview.size} · <strong>Base Initiative:</strong> {preview.baseInitiative} · <strong>Maximum HP:</strong> {preview.hp}</p></header>
      <Section title="Preview Attributes"><div className={styles.grid}>{preview.attributes.map(attribute => <dl className={styles.card} key={attribute.key} data-preview-attribute={attribute.key}><dt>{CHARACTER_ATTRIBUTE_LABELS[attribute.key]} ({attribute.key})</dt><dd><strong>{attribute.value}</strong> · Normal {attribute.stored} {signed(attribute.adjustment)}</dd><dd>Modifier {signed(attribute.modifier)} · Roll target {attribute.rollTarget}</dd>{preview.attributeReferences.find(row => row.key === attribute.key)?.fields.map(field => <dd key={field.label}>{field.label}: {field.value ?? "Not recorded for this score"}</dd>)}</dl>)}</div></Section>
      <Section title="Preview Anatomy and HP"><p>{preview.anatomyChanged ? "This Form has different Anatomy. " : ""}Maximums only: saved damage and Active Health remain unchanged. No damage is redistributed.</p><div className={styles.grid}>{preview.anatomy.pools.map(pool => <div className={styles.card} key={pool.key}><strong>{pool.name}</strong><p>Maximum HP {pool.maximumHp ?? "Unknown"} · {pool.percentage === null ? "Percentage unspecified" : `${pool.percentage}%`}</p></div>)}</div><ul>{preview.anatomy.hitLocations.map(location => <li key={location.result}>{location.result}: {location.name} · {location.bodyParts} · HP pool {location.poolName ?? "Unassigned"}{location.locationEffect ? ` · ${location.locationEffect}` : ""}</li>)}</ul></Section>
      <Section title="Preview Movement">{preview.movement.length ? <ul>{preview.movement.map((mode, index) => <li key={index}>{mode.movementMode}: Base {mode.baseValue} · Movement Initiative {mode.initiative} {mode.notes}</li>)}</ul> : <p>No movement modes.</p>}<p>Includes the Character&apos;s existing movement advancement steps.</p></Section>
      <Section title="Preview Natural Protection">{preview.protections.length ? <ul>{preview.protections.map(protection => <li key={protection.key}>{protection.name}: Soak {protection.naturalSoak} · {protection.coverage.kind === "all" ? "All locations" : protection.coverage.locationKeys.map(key => `${key} ${preview.anatomy.hitLocations.find(location => String(location.result) === key)?.name ?? ""}`).join(", ")}</li>)}</ul> : <p>No Natural Protection.</p>}</Section>
      <Section title="Preview Natural Attacks">{preview.attacks.length ? preview.attacks.map(attack => <article className={styles.card} key={attack.key}><h4>{attack.attackName}</h4><p>Damage {attack.damage ?? "Unspecified"} · {attack.damageType || "Damage type unspecified"} · Initiative {attack.authoring.initiativeCost ?? "Unspecified"}</p><p>{label(attack.authoring.mode)} · Skill {attack.skillName || "Unspecified"} · Magical {attack.authoring.magical === null ? "Unspecified" : attack.authoring.magical ? "Yes" : "No"}</p><p>Reach {attack.authoring.range.reach ?? "—"} · Short {attack.authoring.range.short ?? "—"} · Medium {attack.authoring.range.medium ?? "—"} · Long {attack.authoring.range.long ?? "—"} {attack.authoring.range.unit}</p><p>{[attack.notes, attack.basisNotes, attack.anatomy.notes].filter(Boolean).join(" · ")}</p></article>) : <p>No Natural Attacks.</p>}</Section>
      <Section title="Preview Skills and Abilities"><p>Learned Skills are retained. Form additions affect this display only; Special Abilities are definitions, with no execution or permanent grant.</p>{preview.skills.length ? <ul>{preview.skills.map(skill => <li key={skill.allocationId}>{skill.name}: Points {skill.points} · Rank {skill.rank} · Roll target {skill.target}{skill.formAddition ? " · Includes Form addition" : ""}</li>)}</ul> : <p>No learned Skill calculations.</p>}<h4>Form additions</h4>{preview.skillAdditions.length ? <ul>{preview.skillAdditions.map((addition, index) => <li key={index}><strong>{addition.skillName}</strong> · {addition.linkType === "Granted" ? "Form-only ability" : `Form predisposition ${addition.value ?? 0}`} {addition.definition}</li>)}</ul> : <p>No Form additions.</p>}</Section>
      <Section title="Preview Interaction Rules"><p>{preview.interactionMode === "race" ? "Using Race rules" : preview.interactionMode === "add" ? "Race rules plus Form additions" : "Form rules replace Race rules"}. Informational only.</p>{preview.interactionRules.length ? <ul>{preview.interactionRules.map((rule, index) => <li key={`${index}:${rule.key}`}><strong>{rule.name}</strong> · {label(rule.ruleType)} · {label(rule.scope)} {rule.percentage === null ? "" : `${rule.percentage}%`} · Match {rule.match}: {rule.conditions.map(interactionCondition).join("; ")}. {rule.notes}</li>)}</ul> : <p>No Interaction Rules.</p>}</Section>
      <Section title="Preview Physical Capabilities"><dl className={styles.definitions}><Definition title="Manipulation">{FORM_MANIPULATION[preview.manipulation.state]} {preview.manipulation.notes}</Definition><Definition title="Speech">{FORM_SPEECH[preview.speech.state]} {preview.speech.notes}</Definition><Definition title="Equipment intent">{FORM_EQUIPMENT[preview.equipment.state]} {preview.equipment.notes}</Definition></dl>{preview.restrictions.length ? <ul>{preview.restrictions.map(restriction => <li key={restriction.key}>{restriction.name}: {restriction.notes}</li>)}</ul> : <p>No additional restrictions.</p>}</Section>
      <Section title="Transformation definition"><Transformation value={preview.transformation} /></Section>
    </div>}
  </section>;
}
