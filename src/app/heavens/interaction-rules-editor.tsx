"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { GuidedField } from "@/components/field-guidance";
import { fieldHelp } from "@/features/guidance/field-help";
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
  absorption: "Matching damage becomes zero. This percentage becomes healing; the rest vanishes. Healing stops at normal maximum HP unless an explicit rule allows more.",
};
const labels: Record<string, string> = {
  requirement: "Requirement", immunity: "Immunity", resistance: "Resistance", vulnerability: "Vulnerability", absorption: "Absorption",
  "damage-type": "Damage Type", magical: "Magical", "source-kind": "Source Kind", "item-property": "Item Property",
  "item-tag": "Item Tag", "mechanical-effect-kind": "Mechanical Effect Kind", "condition-name": "Condition Name",
  weapon: "Weapon", item: "Item", spell: "Spell", "derived-ability": "Derived Ability", skill: "Skill", attribute: "Attribute",
  "creature-attack": "Creature Attack", "creature-ability": "Creature Ability", "no-roll": "No Roll", manual: "Manual",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <GuidedField label={label} help={fieldHelp("interaction", label)} className="st-field" controlClassName="st-control">{children}</GuidedField>;
}
function createInteractionKey() {
  // getRandomValues also works on plain HTTP LAN hosts, where randomUUID is unavailable.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function newCondition(kind: InteractionCondition["kind"], key = createInteractionKey()): InteractionCondition {
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

export function InteractionRulesEditor({ value, owner, onChange, authoringOnly = false }: {
  value?: InteractionRuleProfile | null;
  owner: InteractionRuleOwner;
  authoringOnly?: boolean;
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
      <button className="st-button" type="button" onClick={() => update([...rules, { key: createInteractionKey(), name: "", ruleType: "requirement", scope: "damage", match: "ANY", conditions: [newCondition("damage-type")], percentage: null, notes: "", sortOrder: rules.length, ...(owner === "creature" ? { crImpact: "None" as const } : {}) }])}>Add Interaction Rule</button>
    </header>
    <p className={styles.help}>{authoringOnly ? "Describe how this Form responds to incoming damage or harmful effects. These rules appear in preview but are not applied during play." : "These rules govern incoming damage and harmful effects in combat. Match the incoming source using the fields below; unknown facts or unresolved rule combinations need a G.O.D. ruling."}</p>
    {catalogError && <p role="alert">{catalogError} Reopen this tab to retry catalog loading.</p>}
    {!rules.length && <p className={styles.help}>No Interaction Rules authored.</p>}
    <datalist id={`${listId}-properties`}>{[...new Set(catalog?.properties.map((row) => row.name) ?? [])].map((name) => <option key={name} value={name} />)}</datalist>
    {rules.map((rule, index) => <InteractionRuleCard key={rule.key} rule={rule} owner={owner} catalog={catalog} listId={listId}
      index={index} count={rules.length} onMove={(offset) => move(index, offset)}
      onRemove={() => update(rules.filter((entry) => entry.key !== rule.key))} onChange={(change) => patch(rule.key, change)} />)}
  </section>;
}

const COMMON_CONDITIONS = ["damage-type", "magical", "item-property", "condition-name"] as const;
type Catalog = Awaited<ReturnType<typeof getInteractionRuleCatalog>>;
function InteractionRuleCard({ rule, owner, catalog, listId, index, count, onMove, onRemove, onChange }: {
  rule: InteractionRule; owner: InteractionRuleOwner; catalog: Catalog | null; listId: string; index: number; count: number;
  onMove: (offset: number) => void; onRemove: () => void; onChange: (change: Partial<InteractionRule>) => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const percentage = usesInteractionPercentage(rule.ruleType);
  const changeCondition = (next: InteractionCondition) => onChange({ conditions: rule.conditions.map((entry) => entry.key === next.key ? next : entry) });
  return <article className={styles.rule} data-interaction-rule={rule.key}>
    <header className={styles.header}><h4>{rule.name || `Interaction Rule ${index + 1}`}</h4><div className={styles.buttons}>
      <button className="st-button" type="button" disabled={index === 0} onClick={() => onMove(-1)}>Up</button>
      <button className="st-button" type="button" disabled={index === count - 1} onClick={() => onMove(1)}>Down</button>
      <button className="st-button is-danger" type="button" onClick={onRemove}>Remove Rule</button>
    </div></header>
    <div className={styles.grid}>
      <Field label="Rule Name"><input value={rule.name} onChange={(e) => onChange({ name: e.target.value })} /></Field>
      <Field label="Rule Type"><select value={rule.ruleType} onChange={(e) => { const ruleType = e.target.value as InteractionRuleType; onChange({ ruleType, percentage: null, ...(usesInteractionPercentage(ruleType) ? { scope: "damage" } : {}) }); }}>{INTERACTION_RULE_TYPES.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select></Field>
      {percentage && <Field label={rule.ruleType === "absorption" ? "Healing (%)" : "Amount (%)"}><input type="number" step="any" value={rule.percentage ?? ""} onChange={(e) => onChange({ percentage: e.target.value === "" ? null : Number(e.target.value) })} /></Field>}
      {rule.conditions.length > 1 && <Field label="Match"><select value={rule.match} onChange={(e) => onChange({ match: e.target.value as InteractionRule["match"] })}><option value="ANY">At least one condition must apply</option><option value="ALL">Every condition must apply</option></select></Field>}
    </div>
    <p className={styles.help}>{TYPE_HELP[rule.ruleType]}</p>
    {rule.scope !== "damage" && <p className={styles.help}>Applies to: {rule.scope === "condition" ? "Conditions" : "Other effects"}</p>}
    {rule.conditions.map((condition) => <div className={styles.condition} key={condition.key} data-interaction-condition={condition.key}>
      <div className={styles.grid}>
        <Field label={rule.ruleType === "requirement" ? "Requires" : "Against"}><select value={condition.kind} onChange={(e) => {
          if (e.target.value === "advanced") { setAdvanced(true); return; }
          changeCondition(newCondition(e.target.value as InteractionCondition["kind"], condition.key));
        }}>{COMMON_CONDITIONS.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}{!COMMON_CONDITIONS.some((kind) => kind === condition.kind) && <option value={condition.kind}>{labels[condition.kind]}</option>}<option value="advanced">More matching options...</option></select></Field>
        {condition.kind === "damage-type" && <Field label="Damage Type"><input value={condition.damageType} onChange={(e) => changeCondition({ ...condition, damageType: e.target.value })} /></Field>}
        {condition.kind === "magical" && <Field label="Magical"><select value={String(condition.magical)} onChange={(e) => changeCondition({ ...condition, magical: e.target.value === "true" })}><option value="true">Yes</option><option value="false">No</option></select></Field>}
        {condition.kind === "item-property" && <>
          <Field label="Property Name"><input list={`${listId}-properties`} value={condition.propertyName} onChange={(e) => changeCondition({ ...condition, propertyName: e.target.value })} /></Field>
          <Field label="Property Value (optional)"><input value={condition.value ?? ""} onChange={(e) => changeCondition({ ...condition, value: e.target.value || null })} /></Field>
        </>}
        {condition.kind === "condition-name" && <Field label="Condition Name"><input value={condition.conditionName} onChange={(e) => changeCondition({ ...condition, conditionName: e.target.value })} /></Field>}
      </div>
      {condition.kind === "source-kind" && <p className={styles.help}>{labels[condition.sourceKind]}{condition.weaponFamily === "firearm" ? ": Firearm only" : ""}; edit under Advanced Matching.</p>}
      {condition.kind === "item-tag" && <p className={styles.help}>Tag: {catalog?.tags.find((tag) => tag.canonicalId === condition.tagCanonicalId)?.name || "Choose a tag under Advanced Matching"}</p>}
      {condition.kind === "mechanical-effect-kind" && <p className={styles.help}>{INTERACTION_EFFECT_LABELS[condition.effectKind]}; edit under Advanced Matching.</p>}
      {condition.kind === "item-property" && condition.relatedCreatureCanonicalId && <p className={styles.help}>Restricted to a related Creature; review under Advanced Matching.</p>}
      {condition.kind === "condition-name" && rule.scope === "damage" && <p className={styles.help}>To cover incoming conditions, choose Condition under Advanced Matching.</p>}
      <button className="st-button is-danger" type="button" onClick={() => onChange({ conditions: rule.conditions.filter((entry) => entry.key !== condition.key) })}>Remove Condition</button>
    </div>)}
    <button className="st-button" type="button" onClick={() => onChange({ conditions: [...rule.conditions, newCondition("damage-type")] })}>Add Condition</button>
    <details className={styles.advanced} open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
      <summary>Advanced Matching</summary>
      {!percentage && <Field label="Applies To"><select value={rule.scope} onChange={(e) => onChange({ scope: e.target.value as InteractionRule["scope"] })}><option value="damage">Damage</option><option value="condition">Condition</option><option value="mechanical-effect">Mechanical Effect</option></select></Field>}
      {rule.conditions.map((condition, conditionIndex) => <div className={styles.condition} key={condition.key}>
        <p className={styles.help}>Condition {conditionIndex + 1}</p>
        <div className={styles.grid}>
          <Field label="Matching Type"><select value={condition.kind} onChange={(e) => changeCondition(newCondition(e.target.value as InteractionCondition["kind"], condition.key))}>{INTERACTION_CONDITION_KINDS.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}</select></Field>
          {condition.kind === "source-kind" && <><Field label="Source Kind"><select value={condition.sourceKind} onChange={(e) => changeCondition({ ...condition, sourceKind: e.target.value as typeof condition.sourceKind, weaponFamily: null })}>{INTERACTION_SOURCE_KINDS.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}</select></Field>{condition.sourceKind === "weapon" && <Field label="Weapon Family"><select value={condition.weaponFamily ?? ""} onChange={(e) => changeCondition({ ...condition, weaponFamily: e.target.value === "firearm" ? "firearm" : null })}><option value="">Any Weapon</option><option value="firearm">Firearm only</option></select></Field>}</>}
          {condition.kind === "item-property" && <Field label="Related Creature (optional)"><select value={condition.relatedCreatureCanonicalId ?? ""} onChange={(e) => changeCondition({ ...condition, relatedCreatureCanonicalId: e.target.value || null })}><option value="">No Creature restriction</option>{condition.relatedCreatureCanonicalId && !catalog?.creatures.some((entry) => entry.canonicalId === condition.relatedCreatureCanonicalId) && <option value={condition.relatedCreatureCanonicalId}>{condition.relatedCreatureCanonicalId}</option>}{catalog?.creatures.map((entry) => <option key={entry.canonicalId} value={entry.canonicalId}>{entry.name}</option>)}</select></Field>}
          {condition.kind === "item-tag" && <Field label="Item Tag"><select value={condition.tagCanonicalId} onChange={(e) => changeCondition({ ...condition, tagCanonicalId: e.target.value })}><option value="">{catalog ? "Choose a tag" : "Loading tags..."}</option>{condition.tagCanonicalId && !catalog?.tags.some((tag) => tag.canonicalId === condition.tagCanonicalId) && <option value={condition.tagCanonicalId}>{condition.tagCanonicalId} (unavailable)</option>}{catalog?.tags.map((tag) => <option key={tag.canonicalId} value={tag.canonicalId}>{tag.name}</option>)}</select></Field>}
          {condition.kind === "mechanical-effect-kind" && <Field label="Mechanical Effect Kind"><select value={condition.effectKind} onChange={(e) => changeCondition({ ...condition, effectKind: e.target.value as typeof condition.effectKind })}>{Object.entries(INTERACTION_EFFECT_LABELS).map(([kind, effectLabel]) => <option key={kind} value={kind}>{effectLabel}</option>)}</select></Field>}
        </div>
        {condition.kind === "item-property" && <p className={styles.help}>For Silver, use Material = Silver. A blank value accepts any value. Related Creature matches an explicit Item Property relationship and is optional.</p>}
        {condition.kind === "magical" && <p className={styles.help}>Magical comes from explicit source status or Spell Construction, never from Creature identity alone.</p>}
      </div>)}
      {owner === "creature" && <><Field label="Threat / CR Impact"><select value={rule.crImpact ?? "None"} onChange={(e) => onChange({ crImpact: e.target.value as CreatureCrImpact })}>{CREATURE_CR_IMPACTS.map((impact) => <option key={impact}>{impact}</option>)}</select></Field><p className={styles.help}>Saved for review; this does not yet change calculated CR.</p></>}
      <Field label="Rule Notes"><textarea rows={2} value={rule.notes} onChange={(e) => onChange({ notes: e.target.value })} /></Field>
    </details>
  </article>;
}
