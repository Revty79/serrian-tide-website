import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseSpecialAbilityMechanics as parse, readSpecialAbilityMechanics as read } from "./codec";
import { parseDefinitionAmount, parseDefinitionDuration, parseIntrinsicEffect } from "./v2-codec";
import { syntheticToolbox } from "./v2-fixtures";
import { newV2Rule, upgradeMechanicsDocument } from "./v2-authoring";
import { mechanicsDraftState, moveMechanicsChild, newMechanicsRule } from "./authoring";
import { collectMechanicsReferences } from "./references";
import { resolveSpecialAbilityMechanics } from "./resolution";
import { SPECIAL_ABILITY_OVERRIDE_SLOTS, requireRegisteredOverrideSlot } from "./override-registry";
import { V2RuleEditor } from "./v2-rule-editor";
import { AmountEditor } from "./v2-fields";
import { MechanicsPreview } from "./mechanics-preview";
import type { SkillDraft } from "@/app/heavens/skills/actions";
import { normalizeInteractionRuleProfile, INTERACTION_RULE_TYPES } from "@/features/interaction-rules/interaction-rules";
import { MODIFIER_ATTRIBUTE_KEYS, TEMPORARY_MODIFIER_CHANNELS } from "@/features/mechanical-effects/models";
import { DERIVED_ABILITY_COST_TYPES, DERIVED_ABILITY_REFRESH_SCOPES } from "@/features/derived-abilities/models";

const draft = (data = syntheticToolbox()): SkillDraft => ({ core: { name: "Synthetic", classification: "special ability", tier: null, primaryAttribute: null, secondaryAttribute: null, definition: "Synthetic", sourceSystem: null, sourceExternalId: null }, relationships: [], extensions: [{ extensionType: "special-ability-mechanics", schemaVersion: data.schemaVersion, data }] });
const single = (rule: unknown) => parse({ schemaVersion: 2, rules: [rule] });
const get = <K extends ReturnType<typeof syntheticToolbox>["rules"][number]["kind"]>(kind: K) => {
  const rule = syntheticToolbox().rules.find(rule => rule.kind === kind);
  if (!rule || rule.kind !== kind) throw new Error("Fixture missing");
  return rule as Extract<typeof rule, { kind: K }>;
};
test("v1 opens without mutation; explicit upgrade preserves legacy rules, bytes and identities", () => {
  const old = { schemaVersion: 1 as const, rules: [newMechanicsRule("capability"), newMechanicsRule("manual")].map(rule => ({ ...rule, title: "Synthetic", description: " Keep spaces. ", when: { mode: "always" as const }, ...(rule.kind === "manual" ? { adjudication: "G.O.D." } : {}) })) };
  const before = JSON.stringify(old), state = mechanicsDraftState(draft(old));
  assert.equal(state.kind, "editable"); if (state.kind === "editable") assert.equal(state.document.schemaVersion, 1);
  const upgraded = upgradeMechanicsDocument(old);
  assert.equal(upgraded.schemaVersion, 2); assert.deepEqual(upgraded.rules, old.rules); assert.equal(JSON.stringify(old), before);
  assert.deepEqual(parse(upgraded), upgraded); assert.deepEqual(parse(old), old);
  assert.throws(() => parse({ schemaVersion: 1, rules: [get("resource")] }));
  assert.throws(() => parse(upgraded, 1));
  const future = { schemaVersion: 99, dataJson: ' { "schemaVersion":99,"unknown":true } ' };
  assert.equal(read(future).status, "unsupported"); assert.equal(future.dataJson, ' { "schemaVersion":99,"unknown":true } ');
});
test("all six v2 families round-trip detached without normalizing authored text", () => {
  const input = syntheticToolbox(), before = structuredClone(input);
  assert.deepEqual(parse(input), input); assert.deepEqual(parse(JSON.stringify(input)), input);
  assert.equal(read({ schemaVersion: 2, dataJson: JSON.stringify(input) }).status, "ready");
  const result = parse(input); result.rules[0].title = "Different"; assert.deepEqual(input, before);
  for (const kind of ["resource", "modifier", "interaction", "activated", "override", "choice"] as const) assert.throws(() => single(newV2Rule(kind)), /nonblank/);
});
test("Resource maxima, contributions and refill are bounded definitions without balance or formulas", () => {
  const rule = get("resource"); single(rule);
  for (const maximum of [{ kind: "fixed", amount: 0 }, { kind: "manual", guidance: "G.O.D. decides." }, { kind: "progression-threshold", threshold: 2, contribution: 1 }]) single({ ...rule, maximum });
  assert.deepEqual(parseDefinitionAmount({ kind: "fixed", amount: -2 }, "$", true), { kind: "fixed", amount: -2 });
  for (const maximum of [{ kind: "fixed", amount: -1 }, { kind: "fixed", amount: Infinity }, { kind: "fixed", amount: Number.MAX_SAFE_INTEGER + 1 }, { kind: "formula", expression: "2*x" }, { kind: "manual", guidance: " " }]) assert.throws(() => single({ ...rule, maximum }));
  for (const extra of [{ currentAmount: 3 }, { characterId: 1 }, { balance: 0 }, { formula: "sql" }]) assert.throws(() => single({ ...rule, ...extra }));
  assert.throws(() => single({ ...rule, recovery: [{ ...rule.recovery[0], event: "" }] }), /nonblank/);
});
test("Modifier uses all shared channels and exact targets, rejects formulas and Form body fields", () => {
  const rule = get("modifier");
  for (const channel of TEMPORARY_MODIFIER_CHANNELS) single({ ...rule, effect: { ...rule.effect, channel, targetKey: channel === "attribute" ? "STR" : channel === "skill" ? "skill:101" : channel === "movement" ? "movement:walk" : "self" } });
  for (const targetKey of MODIFIER_ATTRIBUTE_KEYS) single({ ...rule, effect: { ...rule.effect, channel: "attribute", targetKey } });
  for (const patch of [{ channel: "size" }, { amount: 0 }, { amount: 1.5 }, { amount: "1+2" }, { targetKey: "skill:2147483648" }, { targetKey: "skill:01" }, { targetKey: " skill:101" }, { anatomy: [] }, { naturalProtection: 4 }, { movementReplacement: 20 }]) assert.throws(() => single({ ...rule, effect: { ...rule.effect, ...patch } }));
});
test("shared duration and health timing validation are strict without scheduling anything", () => {
  for (const value of [{ kind: "until-removed" }, { kind: "scene", label: " Keep spacing " }, { kind: "combat-steps", value: 2 }, { kind: "combat-rounds", value: 1 }]) assert.deepEqual(parseDefinitionDuration(value, "$"), value);
  for (const value of [{ kind: "combat-rounds", value: 1.5 }, { kind: "combat-steps", value: 0 }, { kind: "scene", value: 4 }, { kind: "forever" }, { kind: "scene", currentRemaining: 4 }]) assert.throws(() => parseDefinitionDuration(value, "$"));
  const effect = { kind: "health.damage", amount: 3, application: "area", timing: { mode: "over-time", frequency: "combat-rounds", applications: 2, firstApplication: "next-interval" } };
  assert.deepEqual(parseIntrinsicEffect(effect, "$"), effect);
  for (const timing of [{ mode: "immediate", applications: 2 }, { ...effect.timing, frequency: "custom" }, { ...effect.timing, applications: 0 }, { ...effect.timing, formula: "2+3" }]) assert.throws(() => parseIntrinsicEffect({ ...effect, timing }, "$"));
});
test("Interaction acceptance agrees with shared rules; no independent percentage cap or unsafe identities", () => {
  const rule = get("interaction");
  for (const ruleType of INTERACTION_RULE_TYPES) for (const scope of ["damage", "condition", "mechanical-effect"] as const) for (const percentage of [null, 0, 25, 125]) {
    const interaction = { ...rule.interaction, ruleType, scope, percentage };
    let sharedValid = true;
    try { normalizeInteractionRuleProfile({ schemaVersion: 1, rules: [{ ...interaction, key: "x", name: "Synthetic", notes: "", sortOrder: 0 }] }, "race"); } catch { sharedValid = false; }
    if (sharedValid) single({ ...rule, interaction }); else assert.throws(() => single({ ...rule, interaction }));
  }
  for (const condition of [{ key: "x", kind: "item-tag", tagCanonicalId: "TAG_1" }, { key: "x", kind: "magical", magical: "true" }, { key: "x", kind: "source-kind", sourceKind: "spell", weaponFamily: "firearm" }, { key: "x", kind: "damage-type", damageType: " " }]) assert.throws(() => single({ ...rule, interaction: { ...rule.interaction, conditions: [condition] } }));
  const conditions = [{ key: "d", kind: "damage-type", damageType: "Synthetic" }, { key: "c", kind: "condition-name", conditionName: "Synthetic" }, { key: "s", kind: "source-kind", sourceKind: "weapon", weaponFamily: "firearm" }, { key: "e", kind: "mechanical-effect-kind", effectKind: "health.damage" }];
  single({ ...rule, interaction: { ...rule.interaction, conditions, match: "ANY" } });
});
test("Activated definitions support bounded activation, shared costs, limits, targets and all intrinsic effects", () => {
  const rule = { ...get("activated"), choiceKeys: [], costs: [] };
  for (const activationType of ["activated", "triggered", "reaction"]) single({ ...rule, activationType });
  assert.throws(() => single({ ...rule, activationType: "passive" }));
  assert.throws(() => single({ ...rule, trigger: "" }));
  for (const kind of DERIVED_ABILITY_COST_TYPES) single({ ...rule, costs: [{ key: "c", kind, amount: { kind: "fixed", amount: 2 }, notes: "", ...(kind === "resource" ? { resource: { kind: "manual", name: "Synthetic", guidance: "Identity manual." } } : {}) }] });
  for (const refreshScope of DERIVED_ABILITY_REFRESH_SCOPES) single({ ...rule, useLimits: [{ key: "l", maximumUses: 2, refreshScope, event: "Synthetic", notes: "" }] });
  for (const effect of [{ kind: "health.heal", amount: 2, scope: "area" }, { kind: "health.damage", amount: 2, application: "full-body" }, { kind: "condition.apply", name: "Synthetic", description: "Description", duration: { kind: "scene" } }, get("modifier").effect, rule.effects[0].effect]) single({ ...rule, effects: [{ key: "effect", effect }] });
  for (const extra of [{ characterId: 1 }, { usesRemaining: 1 }, { eventSubscription: true }, { runtimeSupported: true }]) assert.throws(() => single({ ...rule, ...extra }));
  assert.throws(() => single({ ...rule, target: { kind: "character", characterId: 4 } }));
});
test("unregistered Override slots and parameters reject; manual proposals remain nonexecuting", () => {
  assert.deepEqual(Object.keys(SPECIAL_ABILITY_OVERRIDE_SLOTS), []);
  single(get("override"));
  for (const slotKey of ["anything", "casting-cost", "__proto__", "toString"]) {
    assert.throws(() => requireRegisteredOverrideSlot(slotKey), /not registered/);
    assert.throws(() => single({ ...get("override"), override: { mode: "registered", slotKey, parameters: { bypass: true } } }), /not registered/);
  }
  assert.throws(() => single({ ...get("override"), override: { ...get("override").override, parameters: {} } }));
});
test("Choice candidates are exact bounded definitions, never Character bindings", () => {
  const rule = get("choice");
  for (const selection of [{ kind: "attribute", attributeKeys: ["STR", "CHR"] }, { kind: "skill", skillIds: [101] }, { kind: "manual", guidance: "Choose with G.O.D." }, rule.selection]) single({ ...rule, selection });
  for (const selection of [{ kind: "item", id: 1 }, { kind: "skill", skillIds: [1, 1] }, { kind: "attribute", attributeKeys: [] }, { kind: "attribute", attributeKeys: ["LCK"] }, { kind: "derived-ability", derivedAbilityIds: [-1] }, { ...rule.selection, chosenId: 202 }]) assert.throws(() => single({ ...rule, selection }));
  for (const extra of [{ selectedValue: 202 }, { characterId: 4 }, { maximum: 2 }, { minimum: 0 }, { minimum: 2 }, { reselection: "script" }]) assert.throws(() => single({ ...rule, ...extra }));
});
test("outcomes use stable same-rule effect identities and existing result vocabulary", () => {
  const rule = { ...get("activated"), costs: [], choiceKeys: [] };
  for (const kind of ["success", "failure", "critical-success", "critical-failure", "manual"]) single({ ...rule, outcomes: [{ ...rule.outcomes[0], kind, adjudication: "G.O.D. handling" }] });
  for (const patch of [{ kind: "fumble-formula" }, { roll: "1d100" }, { effectKeys: ["absent"] }, { effectKeys: ["effect", "effect"] }]) assert.throws(() => single({ ...rule, outcomes: [{ ...rule.outcomes[0], ...patch }] }));
  assert.throws(() => single({ ...get("override"), outcomes: rule.outcomes }), /missing intrinsic/);
});
test("local deletion rejects dangling links; rename/reorder retains reference identity and targeted deletion", () => {
  const doc = syntheticToolbox();
  for (const key of ["resource", "choice"]) assert.throws(() => parse({ ...doc, rules: doc.rules.filter(rule => rule.key !== key) }), /missing/);
  const reordered = { ...doc, rules: moveMechanicsChild(doc.rules.map(rule => ({ ...rule, title: "Renamed" })), 0, 1) };
  assert.deepEqual(parse(reordered), reordered); assert.deepEqual(doc.rules.map(rule => rule.key).sort(), reordered.rules.map(rule => rule.key).sort());
  const removed = { ...doc, rules: doc.rules.filter(rule => rule.key !== "modifier") };
  assert.deepEqual(parse(removed).rules.map(rule => rule.key), ["resource", "interaction", "choice", "activated", "override"]);
  assert.throws(() => parse({ ...doc, rules: [...doc.rules, doc.rules[0]] }), /Duplicate local key/);
  const activation = get("activated");
  assert.throws(() => parse({ ...doc, rules: doc.rules.map(rule => rule.kind === "activated" ? { ...activation, effects: [] } : rule) }), /missing intrinsic/);
});
test("all nested Skill and Derived identities feed the existing lifecycle reference contract", () => {
  const doc = syntheticToolbox(101, 202), activation = get("activated");
  doc.rules.push({ ...get("choice"), key: "skill-choice", selection: { kind: "skill", skillIds: [303] } });
  doc.rules = doc.rules.map(rule => rule.kind === "activated" ? { ...activation, effects: [{ key: "effect", effect: { ...get("modifier").effect, targetKey: "skill:404" } }] } : rule);
  assert.deepEqual(collectMechanicsReferences(parse(doc)), [{ kind: "derived-ability", derivedAbilityId: 202 }, { kind: "skill", skillId: 101 }, { kind: "skill", skillId: 303 }, { kind: "skill", skillId: 404 }]);
});
test("v2 projection is detached and manual with possession; ownerless previews stay unavailable", () => {
  const doc = syntheticToolbox(), source = { id: 1, name: "Synthetic", classification: "special ability", archived: false };
  const input = { source, stored: { schemaVersion: 2, dataJson: JSON.stringify(doc) }, owner: { possessedSkillIds: new Set([1]), possessedDerivedAbilityIds: new Set<number>(), savedAllocations: { skillAllocations: [] } } };
  const before = structuredClone(input), result = resolveSpecialAbilityMechanics(input);
  assert.equal(result.runtimeSupported, false); assert.ok(result.rules.every(rule => rule.status === "manual"));
  assert.ok(resolveSpecialAbilityMechanics({ ...input, owner: null }).rules.every(rule => rule.status === "unavailable"));
  result.rules[0].authored.title = "changed"; assert.deepEqual(input, before);
});
test("conditional family fields and definition preview retain ownership guidance and exact reference labels", () => {
  const doc = syntheticToolbox();
  for (const rule of doc.rules) {
    const html = renderToStaticMarkup(createElement(V2RuleEditor, { rule, rules: doc.rules, onChange() {}, references: null }));
    assert.match(html, new RegExp(`aria-label="${rule.kind} definition"`));
    if (rule.kind !== "resource") assert.doesNotMatch(html, /Resource grant definition/);
    if (rule.kind !== "activated") assert.doesNotMatch(html, /Activation type/);
    assert.doesNotMatch(html, /<button[^>]*>Execute|textarea[^>]*>\{/);
  }
  const html = renderToStaticMarkup(createElement(MechanicsPreview, { draft: draft(doc), references: { options: [{ kind: "skill", skillId: 101, name: "Exact Skill Candidate", archived: true }, { kind: "derived-ability", derivedAbilityId: 202, name: "Exact Derived Candidate", archived: false }] } }));
  assert.match(html, /Exact Skill Candidate \(Archived\)/); assert.match(html, /Exact Derived Candidate/); assert.match(html, /No Character has been evaluated/);
  assert.match(html, /skill target: Exact Skill Candidate/); assert.match(html, /duration: combat rounds \(2\)/);
  assert.match(html, /G.O.D. determines handling/); assert.match(html, /linked intrinsic effects: Manual/);
  assert.match(html, /Allowed Derived Abilities: Exact Derived Candidate/);
});
test("numeric progression amounts display as provisional without numerical authoring", () => {
  const html = renderToStaticMarkup(createElement(AmountEditor, { label: "Maximum", value: { kind: "progression-threshold", threshold: 4, contribution: 3 }, onChange() {} }));
  assert.match(html, /purchased-point interpretation not yet finalized/); assert.doesNotMatch(html, /type="number"/);
  const fresh = renderToStaticMarkup(createElement(AmountEditor, { label: "Maximum", value: { kind: "manual", guidance: "" }, onChange() {} }));
  assert.doesNotMatch(fresh, /value="progression-threshold"/);
});
