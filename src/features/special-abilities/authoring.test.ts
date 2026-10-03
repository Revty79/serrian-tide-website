import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SkillDraft } from "@/app/heavens/skills/actions";
import { changeSkillExtension } from "@/features/skills/skill-extension-draft";
import { MechanicsEditor } from "./mechanics-editor";
import { MechanicsPreview } from "./mechanics-preview";
import { MechanicsConditionsEditor } from "./mechanics-conditions-editor";
import { mechanicsDraftState, mechanicsValidationMessage, moveMechanicsChild, moveMechanicsCondition, newMechanicsCondition, newMechanicsKey, newMechanicsRule } from "./authoring";
import { emptySpecialAbilityMechanics, SPECIAL_ABILITY_MECHANICS_EXTENSION as type, type MechanicsConditions } from "./models";

const fresh = (): SkillDraft => ({ core: { name: "Synthetic future ability", classification: "special abilities", tier: null, primaryAttribute: null, secondaryAttribute: null, definition: "Authored prose stays prose.", sourceSystem: null, sourceExternalId: null }, relationships: [], extensions: [] });
test("definition-only rendering does not attach or invent rules and standard Skills cannot attach", () => {
  const draft = fresh(), before = structuredClone(draft);
  let changed = false;
  const render = (value: SkillDraft) => renderToStaticMarkup(createElement(MechanicsEditor, { draft: value, onChange: () => { changed = true; }, references: null }));
  assert.match(render(draft), /Add Structured Mechanics/);
  assert.doesNotMatch(render({ ...draft, core: { ...draft.core, classification: "standard" } }), /Add Structured Mechanics|Add Capability Rule/);
  assert.equal(changed, false); assert.deepEqual(draft, before);
  const attached = changeSkillExtension(draft, { operation: "upsert", extensionType: type, schemaVersion: 1, data: emptySpecialAbilityMechanics() });
  assert.equal(mechanicsDraftState(attached).kind, "editable");
  assert.match(render(attached), /valid empty document/);
  assert.equal(mechanicsDraftState(changeSkillExtension(attached, { operation: "remove", extensionType: type })).kind, "absent");
});
test("new rules remain unfinished until the author supplies fields and deliberately chooses qualification", () => {
  for (const kind of ["capability", "manual"] as const) {
    const rule = newMechanicsRule(kind);
    assert.ok(mechanicsValidationMessage({ schemaVersion: 1, rules: [rule] }));
    assert.equal(rule.title, ""); assert.equal(rule.when.mode, "requirements");
    const valid = { ...rule, title: "Synthetic", description: "Description", when: { mode: "always" }, ...(kind === "manual" ? { adjudication: "Author decides." } : {}) };
    assert.equal(mechanicsValidationMessage({ schemaVersion: 1, rules: [valid] }), null);
  }
});
test("rename, reorder, operator and reference edits preserve keys; moving a condition retains its key", () => {
  const a = newMechanicsRule("capability"), b = newMechanicsRule("manual");
  assert.notEqual(a.key, b.key);
  const renamed = { ...a, title: "New title" };
  assert.deepEqual(moveMechanicsChild([renamed, b], 0, 1).map(row => row.key), [b.key, a.key]);
  const c = newMechanicsCondition("skill-possession"); assert.equal(c.kind, "skill-possession");
  const edited = { ...c, skillId: 42, operator: "not-possessed" as const };
  const when: MechanicsConditions = { mode: "requirements", groups: [{ key: newMechanicsKey(), conditions: [edited] }, { key: newMechanicsKey(), conditions: [] }] };
  const moved = moveMechanicsCondition(when, c.key, when.groups[1].key);
  assert.equal(moved.mode, "requirements");
  if (moved.mode !== "requirements") throw new Error("Expected requirements");
  assert.deepEqual(moved.groups.map(row => row.key), when.groups.map(row => row.key));
  assert.deepEqual(moved.groups[1].conditions, [edited]); assert.equal(when.groups[0].conditions.length, 1);
});
test("unfinished authored edits stay editable with human-readable strict validation", () => {
  const draft = changeSkillExtension(fresh(), { operation: "upsert", extensionType: type, schemaVersion: 1, data: { schemaVersion: 1, rules: [newMechanicsRule("manual")] } });
  assert.equal(mechanicsDraftState(draft).kind, "editable");
  const html = renderToStaticMarkup(createElement(MechanicsEditor, { draft, onChange() {}, references: null }));
  assert.match(html, /Before saving: Rule 1 title/); assert.match(html, /Edit Rule/);
});
test("Current Special Ability Score can be selected and numerically edited within 0 to 100", () => {
  const when: MechanicsConditions = { mode: "requirements", groups: [{ key: "g", conditions: [{ key: "p", kind: "self-progression", operator: "gte", requiredValue: 10 }] }] };
  const html = renderToStaticMarkup(createElement(MechanicsConditionsEditor, { when, references: null, onChange() {} }));
  assert.match(html, /Current Special Ability Score/);
  assert.match(html, /type="number" min="0" max="100"/);
  assert.match(html, /option value="self-progression"/);
  for (const operator of ["gte", "gt", "lte", "lt", "eq", "neq"]) assert.ok(html.includes(`value="${operator}"`));
  assert.doesNotMatch(html, /provisional|not yet finalized/i);
});
test("historical out-of-range benchmarks can be reviewed and corrected without mutating the saved document", () => {
  const document = { schemaVersion: 1 as const, rules: [{ ...newMechanicsRule("capability"), title: "Historical", description: "Saved definition", when: { mode: "requirements" as const, groups: [{ key: "g", conditions: [{ key: "c", kind: "self-progression" as const, operator: "gte" as const, requiredValue: 150 }] }] } }] };
  const draft = { ...fresh(), extensions: [{ extensionType: type, schemaVersion: 1, data: document }] };
  const before = structuredClone(draft);
  const state = mechanicsDraftState(draft);
  assert.equal(state.kind, "editable");
  assert.match(mechanicsValidationMessage(document) ?? "", /0 to 100/);
  assert.deepEqual(draft, before);
});

test("invalid and newer saved mechanics never mount editable rule controls", () => {
  for (const readStatus of ["invalid", "unsupported"] as const) {
    const draft = { ...fresh(), extensions: [{ extensionType: type, schemaVersion: 99, data: null, readStatus, diagnostics: ["Synthetic protected content"] }] };
    const html = renderToStaticMarkup(createElement(MechanicsEditor, { draft, onChange() {}, references: null }));
    assert.match(html, /Synthetic protected content/); assert.match(html, /Detach Mechanics/);
    assert.doesNotMatch(html, /Add Capability Rule|Add Manual \/ G.O.D. Rule/);
  }
});
test("preview uses definition-only semantics with archived reference labels and Manual adjudication", () => {
  const rule = { ...newMechanicsRule("manual"), title: "Synthetic manual", description: "Human-authored", adjudication: "Determine context.", when: { mode: "always" as const }, references: [{ kind: "skill" as const, skillId: 42 }] };
  const draft = changeSkillExtension(fresh(), { operation: "upsert", extensionType: type, schemaVersion: 1, data: { schemaVersion: 1, rules: [rule] } });
  const html = renderToStaticMarkup(createElement(MechanicsPreview, { draft, references: { options: [{ kind: "skill", skillId: 42, name: "Historical reference", archived: true }] } }));
  assert.match(html, /No Character has been evaluated/); assert.match(html, /Historical reference \(Archived\)/); assert.match(html, /Determine context/);
  assert.doesNotMatch(html, /<button|>Active</);
});
