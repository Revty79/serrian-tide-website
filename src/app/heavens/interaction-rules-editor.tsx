"use client";

import { Children, cloneElement, isValidElement, useEffect, useId, useState, type ReactNode } from "react";
import { CREATURE_CR_IMPACTS, type CreatureCrImpact } from "@/db/creature-schema";
import {
  INTERACTION_CONDITION_KINDS, INTERACTION_EFFECT_LABELS, INTERACTION_RULE_TYPES, INTERACTION_SOURCE_KINDS,
  usesInteractionPercentage, type InteractionCondition, type InteractionRule, type InteractionRuleOwner,
  type InteractionRuleProfile, type InteractionRuleType,
} from "@/features/interaction-rules/interaction-rules";
import { getInteractionRuleCatalog } from "./interaction-rule-actions";
import styles from "./interaction-rules-editor.module.css";

const TYPE_HELP: Record<InteractionRuleType, string> = {
  requirement: "The covered harmful effect only works when these source conditions are satisfied.",
  immunity: "A matching incoming effect is completely negated. Immunity has no percentage.",
  resistance: "Matching damage is reduced by the authored percentage.",
  vulnerability: "Matching damage is increased by the authored percentage.",
  absorption: "Matching damage becomes zero. The authored percentage becomes healing; the remainder vanishes. For example, 6 Fire at 50% gives 3 healing and zero damage. Healing is capped at normal maximum HP unless an explicit exception applies.",
};
const labels: Record<string, string> = {
  requirement: "Requirement", immunity: "Immunity", resistance: "Resistance", vulnerability: "Vulnerability", absorption: "Absorption",
  "damage-type": "Damage Type", magical: "Magical", "source-kind": "Source Kind", "item-property": "Item Property",
  "item-tag": "Item Tag", "mechanical-effect-kind": "Mechanical Effect Kind", "condition-name": "Condition Name",
  weapon: "Weapon", item: "Item", spell: "Spell", "derived-ability": "Derived Ability", skill: "Skill", attribute: "Attribute",
  "creature-attack": "Creature Attack", "creature-ability": "Creature Ability", "no-roll": "No Roll", manual: "Manual",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return <label className="st-field"><span id={id}>{label}</span>{Children.map(children, (child) => isValidElement<{ className?: string; "aria-labelledby"?: string }>(child)
    ? cloneElement(child, { className: "st-control", "aria-labelledby": id }) : child)}</label>;
}
function newCondition(kind: InteractionCondition["kind"], key = crypto.randomUUID()): InteractionCondition {
  switch (kind) {
    case "damage-type": return { key, kind, damageType: "" };
    case "magical": return { key, kind, magical: true };
    case "source-kind": return { key, kind, sourceKind: "weapon", weaponFamily: null };
    case "item-property": return { key, kind, propertyName: "", value: null, relatedCreatureCanonicalId: null };
    case "item-tag": return { key, kind, tagCanonicalId: "" };
    case "mechanical-effect-kind": return { key, kind, effectKind: "health.damage" };
    case "condition-name": return { key, kind, conditionName: "" };
  }
}

export function InteractionRulesEditor({ value, owner, onChange }: {
  value?: InteractionRuleProfile | null;
  owner: InteractionRuleOwner;
  onChange: (value: InteractionRuleProfile) => void;
}) {
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof getInteractionRuleCatalog>> | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const listId = useId();
  useEffect(() => {
    let active = true;
    getInteractionRuleCatalog().then((result) => { if (active) setCatalog(result); }, (error: unknown) => { if (active) setCatalogError(error instanceof Error ? error.message : "Catalog could not be loaded."); });
    return () => { active = false; };
  }, []);
  const rules = value?.rules ?? [];
  const update = (next: InteractionRule[]) => onChange({ schemaVersion: 1, rules: next.map((rule, sortOrder) => ({ ...rule, sortOrder })) });
  const patch = (key: string, change: Partial<InteractionRule>) => update(rules.map((rule) => rule.key === key ? { ...rule, ...change } : rule));
  function move(index: number, offset: number) {
    const next = [...rules]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; update(next);
  }
  return <section className={styles.editor} aria-label={owner === "race" ? "Racial Interaction Rules" : "Interaction Rules"}>
    <header className={styles.header}><h3>{owner === "race" ? "Racial Interaction Rules" : "Interaction Rules"}</h3>
      <button className="st-button" type="button" onClick={() => update([...rules, { key: crypto.randomUUID(), name: "", ruleType: "requirement", scope: "damage", match: "ANY", conditions: [newCondition("damage-type")], percentage: null, notes: "", sortOrder: rules.length, ...(owner === "creature" ? { crImpact: "None" as const } : {}) }])}>Add Interaction Rule</button>
    </header>
    <p className={styles.help}>Author incoming damage and effect interactions here. These rules are saved for review and are not applied in combat yet.</p>
    {owner === "creature" && <p className={styles.help}>Threat / CR Impact is saved but does not yet change calculated CR, to avoid counting the same legacy Defense twice.</p>}
    {catalogError && <p role="alert">{catalogError} Reopen this tab to retry catalog loading.</p>}
    {!rules.length && <p className={styles.help}>No Interaction Rules authored.</p>}
    <datalist id={`${listId}-properties`}>{[...new Set(catalog?.properties.map((row) => row.name) ?? [])].map((name) => <option key={name} value={name} />)}</datalist>
    {rules.map((rule, index) => <article className={styles.rule} key={rule.key} data-interaction-rule={rule.key}>
      <header className={styles.header}><h4>{rule.name || `Interaction Rule ${index + 1}`}</h4><div className={styles.buttons}>
        <button className="st-button" type="button" disabled={index === 0} onClick={() => move(index, -1)}>Up</button>
        <button className="st-button" type="button" disabled={index === rules.length - 1} onClick={() => move(index, 1)}>Down</button>
        <button className="st-button is-danger" type="button" onClick={() => update(rules.filter((entry) => entry.key !== rule.key))}>Remove Rule</button>
      </div></header>
      <div className={styles.grid}>
        <Field label="Rule Name"><input value={rule.name} onChange={(e) => patch(rule.key, { name: e.target.value })} /></Field>
        <Field label="Rule Type"><select value={rule.ruleType} onChange={(e) => { const ruleType = e.target.value as InteractionRuleType; patch(rule.key, { ruleType, percentage: null, ...(usesInteractionPercentage(ruleType) ? { scope: "damage" } : {}) }); }}>{INTERACTION_RULE_TYPES.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select></Field>
        <Field label="Applies To"><select value={rule.scope} onChange={(e) => patch(rule.key, { scope: e.target.value as InteractionRule["scope"] })}><option value="damage">Damage</option>{!usesInteractionPercentage(rule.ruleType) && <><option value="condition">Condition</option><option value="mechanical-effect">Mechanical Effect</option></>}</select></Field>
        <Field label="Match"><select value={rule.match} onChange={(e) => patch(rule.key, { match: e.target.value as InteractionRule["match"] })}><option value="ANY">ANY — at least one condition</option><option value="ALL">ALL — every condition</option></select></Field>
        {usesInteractionPercentage(rule.ruleType) && <Field label="Percentage"><input type="number" step="any" value={rule.percentage ?? ""} onChange={(e) => patch(rule.key, { percentage: e.target.value === "" ? null : Number(e.target.value) })} /></Field>}
        {owner === "creature" && <Field label="Threat / CR Impact"><select value={rule.crImpact ?? "None"} onChange={(e) => patch(rule.key, { crImpact: e.target.value as CreatureCrImpact })}>{CREATURE_CR_IMPACTS.map((impact) => <option key={impact}>{impact}</option>)}</select></Field>}
      </div>
      <p className={styles.help}>{TYPE_HELP[rule.ruleType]} {usesInteractionPercentage(rule.ruleType) && "Enter a percentage greater than zero; no upper cap is imposed."}</p>
      <p className={styles.help}>Match {rule.match === "ANY" ? "at least one" : "every"} condition below.</p>
      {rule.conditions.map((condition) => {
        const change = (next: InteractionCondition) => patch(rule.key, { conditions: rule.conditions.map((entry) => entry.key === condition.key ? next : entry) });
        return <div className={styles.condition} key={condition.key} data-interaction-condition={condition.key}>
          <div className={styles.grid}>
            <Field label="Condition Type"><select value={condition.kind} onChange={(e) => change(newCondition(e.target.value as InteractionCondition["kind"], condition.key))}>{INTERACTION_CONDITION_KINDS.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}</select></Field>
            {condition.kind === "damage-type" && <Field label="Damage Type"><input value={condition.damageType} onChange={(e) => change({ ...condition, damageType: e.target.value })} /></Field>}
            {condition.kind === "magical" && <Field label="Magical"><select value={String(condition.magical)} onChange={(e) => change({ ...condition, magical: e.target.value === "true" })}><option value="true">Yes</option><option value="false">No</option></select></Field>}
            {condition.kind === "source-kind" && <><Field label="Source Kind"><select value={condition.sourceKind} onChange={(e) => change({ ...condition, sourceKind: e.target.value as typeof condition.sourceKind, weaponFamily: null })}>{INTERACTION_SOURCE_KINDS.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}</select></Field>{condition.sourceKind === "weapon" && <Field label="Weapon Family"><select value={condition.weaponFamily ?? ""} onChange={(e) => change({ ...condition, weaponFamily: e.target.value === "firearm" ? "firearm" : null })}><option value="">Any Weapon</option><option value="firearm">Firearm only</option></select></Field>}</>}
            {condition.kind === "item-property" && <>
              <Field label="Property Name"><input list={`${listId}-properties`} value={condition.propertyName} onChange={(e) => change({ ...condition, propertyName: e.target.value })} /></Field>
              <Field label="Property Value (optional)"><input value={condition.value ?? ""} onChange={(e) => change({ ...condition, value: e.target.value || null })} /></Field>
              <Field label="Related Creature (optional)"><select value={condition.relatedCreatureCanonicalId ?? ""} onChange={(e) => change({ ...condition, relatedCreatureCanonicalId: e.target.value || null })}><option value="">No Creature restriction</option>{condition.relatedCreatureCanonicalId && !catalog?.creatures.some((entry) => entry.canonicalId === condition.relatedCreatureCanonicalId) && <option value={condition.relatedCreatureCanonicalId}>{condition.relatedCreatureCanonicalId}</option>}{catalog?.creatures.map((entry) => <option key={entry.canonicalId} value={entry.canonicalId}>{entry.name} ({entry.canonicalId})</option>)}</select></Field>
            </>}
            {condition.kind === "item-tag" && <Field label="Item Tag"><select value={condition.tagCanonicalId} onChange={(e) => change({ ...condition, tagCanonicalId: e.target.value })}><option value="">{catalog ? "Choose a catalog tag" : "Loading tags…"}</option>{condition.tagCanonicalId && !catalog?.tags.some((tag) => tag.canonicalId === condition.tagCanonicalId) && <option value={condition.tagCanonicalId}>{condition.tagCanonicalId}</option>}{catalog?.tags.map((tag) => <option key={tag.canonicalId} value={tag.canonicalId}>{tag.name}</option>)}</select></Field>}
            {condition.kind === "mechanical-effect-kind" && <Field label="Mechanical Effect Kind"><select value={condition.effectKind} onChange={(e) => change({ ...condition, effectKind: e.target.value as typeof condition.effectKind })}>{Object.entries(INTERACTION_EFFECT_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></Field>}
            {condition.kind === "condition-name" && <Field label="Condition Name"><input value={condition.conditionName} onChange={(e) => change({ ...condition, conditionName: e.target.value })} /></Field>}
          </div>
          {condition.kind === "item-property" && <p className={styles.help}>For Silver, enter Property Name “Material” and Value “Silver”. A blank value matches any value for that property. Related Creature is optional and matches an explicit property relationship.</p>}
          {condition.kind === "magical" && <p className={styles.help}>Uses the source’s explicitly authored Magical status or Spell Construction. Creature identity alone does not make its attacks Magical.</p>}
          <button className="st-button is-danger" type="button" onClick={() => patch(rule.key, { conditions: rule.conditions.filter((entry) => entry.key !== condition.key) })}>Remove Condition</button>
        </div>;
      })}
      <button className="st-button" type="button" onClick={() => patch(rule.key, { conditions: [...rule.conditions, newCondition("damage-type")] })}>Add Condition</button>
      <Field label="Rule Notes"><textarea rows={2} value={rule.notes} onChange={(e) => patch(rule.key, { notes: e.target.value })} /></Field>
    </article>)}
  </section>;
}
