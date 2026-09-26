"use client";

import { useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { FormPreviewSection as Section, TransformationSummary, interactionCondition, formLabel } from "@/components/forms/form-preview";
import { availableCreatureForms, resolveCreatureFormPreview } from "@/features/creatures/creature-form-preview";
import { CREATURE_FORM_EQUIPMENT, CREATURE_FORM_MANIPULATION, CREATURE_FORM_SPEECH } from "@/features/creatures/creature-forms";
import type { CreatureDraft } from "@/features/creatures/models";
import styles from "@/components/forms/form-preview.module.css";

const number = (value: number | null | undefined) => value == null ? "Unspecified" : String(Number(value.toFixed(4)));
const fieldLabel = (value: string) => formLabel(value.replace(/([a-z])([A-Z])/g, "$1-$2"));

/** Read-only native authored details, including nested effects and Magic Construction. No editor/actions. */
function AuthoredDetails({ value }: { value: unknown }) {
  if (value == null || value === "") return <>Unspecified</>;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((row, index) => <li key={index}><AuthoredDetails value={row} /></li>)}</ul> : <>None authored</>;
  if (typeof value === "object") return <dl className={styles.definitions}>{Object.entries(value).filter(([key]) => !["id", "key", "effectKey", "canonicalId", "schemaVersion", "sortOrder"].includes(key)).map(([key, entry]) => <div key={key}><dt>{fieldLabel(key)}</dt><dd><AuthoredDetails value={entry} /></dd></div>)}</dl>;
  return <>{String(value)}</>;
}

/** No mutation callback: selected Form never enters the editable Creature NPC draft. */
export function CreatureFormPreviewViewer({ snapshot, hpAdjustment }: { snapshot: CreatureDraft; hpAdjustment: number }) {
  const [formId, setFormId] = useState<number | null>(null);
  const forms = availableCreatureForms(snapshot);
  if (!forms.length) return null;
  const preview = resolveCreatureFormPreview(snapshot, formId, hpAdjustment);
  const definition = preview?.definition;
  const m = preview?.form.mechanics;
  return <section className={styles.viewer} aria-label="Creature Form viewer">
    <GuidedField className="st-field" label="View Form" help="Preview Forms captured from this exact Creature when the NPC was created. Selection changes only this display; refresh or reopening returns to Normal. Library edits do not change these frozen definitions."><select className="st-control" value={preview?.form.id ?? ""} onChange={event => setFormId(event.target.value ? Number(event.target.value) : null)}><option value="">Normal</option>{forms.map(form => <option key={form.id} value={form.id}>{form.name}</option>)}</select></GuidedField>
    {preview && definition && m && <div className={styles.body} data-creature-form-preview>
      <header><h2>{preview.form.name}</h2><p className={styles.notice}><strong>Form Preview — viewing this Form does not change the Creature NPC&apos;s current runtime state.</strong></p><p>Normal editing and live controls remain below. Saving uses the Normal draft. These are maximums, not current health; stored damage is never redistributed.</p><p>{preview.form.description}</p><p>{preview.form.notes}</p><p>Size: {definition.core.size} · Maximum HP: {number(preview.hp.finalTotalHp)} · Individual HP adjustment: {number(hpAdjustment)} · Normal CR: {definition.core.challengeRating ?? "Unspecified"} · Normal XP: {definition.core.killXp ?? "Unspecified"}</p></header>
      <Section title="Preview Attributes"><div className={styles.grid}>{preview.hp.statistics.attributes.map(row => <dl className={styles.card} key={row.attributeKey} data-preview-attribute={row.attributeKey}><dt>{row.attributeKey}</dt><dd>Base {number(row.baseValue)} · Effective {number(row.effectiveValue)}</dd><dd>{definition.attributes.find(attribute => attribute.attributeKey === row.attributeKey)?.notes}</dd></dl>)}</div><p>Creature Size multiplier ×{number(preview.hp.statistics.sizeMultiplier)} · HP multiplier ×{number(preview.hp.statistics.hpMultiplier)} · Base Magic bonus {number(preview.hp.statistics.baseMagicBonus)}</p></Section>
      <Section title="Preview HP pools and hit locations"><p>Maximums only; Active Health remains unchanged.</p><div className={styles.grid}>{preview.hp.pools.map(row => <div className={styles.card} key={row.canonicalId}><strong>{row.poolName}</strong><p>HP {number(row.maximumHp)} · {number(row.hpPercentage)}% · {row.notes}</p></div>)}</div><ul>{definition.hitLocations.map(row => <li key={row.hitLocationNumber}><strong>{row.hitLocationNumber}: {row.locationName}</strong> · {row.bodyPartsIncluded} · Pool {preview.hp.pools.find(pool => pool.canonicalId === row.hpPoolCanonicalId)?.poolName ?? "Unassigned"} · Natural Armor {number(row.naturalArmor)} · Soak {number(row.soak)} · {row.locationEffect} · {row.notes}</li>)}</ul></Section>
      <Section title="Preview Movement">{definition.movement.length ? <ul>{definition.movement.map((row, index) => <li key={index}>{row.movementMode}: Base {number(row.movementValue)} · Effective {number(preview.hp.statistics.movement[index]?.effectiveValue)} · Initiative {number(row.initiative)} · Requirements: {row.requirements || "None authored"} · {row.notes}</li>)}</ul> : <p>No movement modes.</p>}</Section>
      <Section title="Preview Attacks">{definition.attacks.length ? definition.attacks.map(row => <article key={row.canonicalId} className={styles.card}><h4>{row.attackName}</h4><p>Attack {number(row.attackPercentage)}% · Damage {row.damage ?? "Unspecified"} {row.damageType} · Initiative {number(row.authoring?.initiativeCost)} · Mode {formLabel(row.authoring?.mode)}</p><p>Range/reach: {row.rangeReach || "Unspecified"} · Required anatomy: {row.requiredAnatomy || "None authored"} · Requirements: {row.requirements || "None authored"} · Uses/recharge: {row.usesRecharge || "None authored"}</p><p>{row.specialEffect} {row.notes}</p><details><summary>Attack range, effects and Magic Construction</summary><AuthoredDetails value={row.authoring} /></details></article>) : <p>No attacks.</p>}</Section>
      <Section title="Preview Abilities">{definition.abilities.length ? definition.abilities.map(row => <article key={row.canonicalId} className={styles.card}><h4>{row.abilityName}</h4><p>{row.abilityType} · Activation: {row.activation || formLabel(row.authoring?.activationType)} · Initiative {number(row.authoring?.initiativeCost)} · CR impact: {row.crImpact}</p><p>{row.description}</p><p>Requirements: {row.requirements || "None authored"} · Uses/recharge: {row.usesRecharge || "None authored"}</p><p>{row.mechanicalEffect} {row.notes}</p><details><summary>Ability costs, conditions, limits, effects and Magic Construction</summary><AuthoredDetails value={row.authoring} /><AuthoredDetails value={row.effects} /></details></article>) : <p>No abilities.</p>}</Section>
      <Section title="Preview Defenses">{definition.defenses.length ? <ul>{definition.defenses.map((row, index) => <li key={index}>{row.defenseType} · Against {row.against} · {row.value ?? "Unspecified"} · {row.notes} · CR impact {row.crImpact}</li>)}</ul> : <p>No defenses.</p>}</Section>
      <Section title="Preview Skills"><p>{m.skills.mode === "creature" ? "Using Creature Skills." : m.skills.mode === "add" ? "Unrelated Creature knowledge is retained; Form ranks replace the same Skill link." : "Form Skills explicitly replace Creature Skills."}</p>{definition.skillLinks.length ? <ul>{definition.skillLinks.map(row => <li key={row.skillId}>{row.skillName} · {row.skillClassification} · Rank {row.rank ?? "Unspecified"} · {row.notes}</li>)}</ul> : <p>No Skills.</p>}</Section>
      <Section title="Preview Interaction Rules"><p>{formLabel(m.interactionMode)} · Informational only.</p>{preview.interactionRules.length ? <ul>{preview.interactionRules.map((rule, index) => <li key={`${index}:${rule.key}`}><strong>{rule.name}</strong> · {formLabel(rule.ruleType)} · {formLabel(rule.scope)} · {rule.percentage == null ? "" : `${rule.percentage}%`} · Match {rule.match}: {rule.conditions.map(interactionCondition).join("; ")}. {rule.notes}</li>)}</ul> : <p>No Interaction Rules.</p>}</Section>
      <Section title="Preview Physical Capabilities"><p>{CREATURE_FORM_MANIPULATION[m.manipulation.state]} · {m.manipulation.notes}</p><p>{CREATURE_FORM_SPEECH[m.speech.state]} · {m.speech.notes}</p><p>{CREATURE_FORM_EQUIPMENT[m.equipment.state]} · {m.equipment.notes}</p>{m.restrictions.length ? <ul>{m.restrictions.map(row => <li key={row.key}>{row.name}: {row.notes}</li>)}</ul> : <p>No additional restrictions.</p>}</Section>
      <Section title="Transformation definition"><TransformationSummary value={preview.form.transformation} /></Section>
    </div>}
  </section>;
}
