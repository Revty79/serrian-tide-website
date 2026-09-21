import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AbilityConditionComparison } from "./comparison-editor";
import { abilityConditionFactType } from "./authoring";
import type { DerivedAbilityUseConditionDefinition } from "@/features/derived-abilities/models";

const condition = (change: Partial<DerivedAbilityUseConditionDefinition>): DerivedAbilityUseConditionDefinition => ({
  conditionType: "state", conditionKey: null, operator: null, numericValue: null, textValue: null, notes: "", sortOrder: 0, ...change,
});
const render = (value: DerivedAbilityUseConditionDefinition) => renderToStaticMarkup(createElement(AbilityConditionComparison, { condition: value, onChange: () => undefined }));

test("registered and exact Item/Condition facts expose the appropriate comparison type", () => {
  for (const value of [condition({ conditionType: "equipment", conditionKey: "equipment.armor-worn" }),
    condition({ conditionType: "equipment", conditionKey: "equipment.item:EXACT-ID:wielded" }), condition({ conditionKey: "state.dead" }),
    condition({ conditionKey: "state.condition:Enraged" })]) {
    assert.equal(abilityConditionFactType(value), "boolean");
    const html = render(value);
    assert.match(html, /Required State/); assert.match(html, /value="possessed">Present/); assert.match(html, /value="not-possessed">Not present/);
    assert.doesNotMatch(html, /Number to Compare|Text to Compare/);
  }
  assert.equal(abilityConditionFactType(condition({ conditionKey: "state.condition:" })), null);
  assert.equal(abilityConditionFactType(condition({ conditionKey: "equipment.armor-worn" })), null);
});

test("number and text facts have plain-English comparisons without irrelevant inputs", () => {
  const number = render(condition({ conditionKey: "state.hp-percent", operator: "gte", numericValue: 50 }));
  assert.match(number, /Greater than or equal to/); assert.match(number, /Number to Compare/); assert.doesNotMatch(number, /Text to Compare/);
  const text = render(condition({ conditionKey: "state.movement-mode", operator: "eq", textValue: "Flying" }));
  assert.match(text, /Equal to/); assert.match(text, /Not equal to/); assert.match(text, /Text to Compare/);
  assert.doesNotMatch(text, /Number to Compare|Greater than|Present/);
});

test("Events need no operator; Manual conditions keep saved fields only in details", () => {
  const event = render(condition({ conditionType: "event", conditionKey: "combat.attack-targeted" }));
  assert.match(event, /Exact Event/); assert.doesNotMatch(event, /<select|<input/);
  const manual = render(condition({ conditionType: "manual", conditionKey: "old.key", operator: "eq", numericValue: 17, textValue: "old-text" }));
  assert.match(manual, /Saved Condition Details/); assert.match(manual, /old.key/); assert.match(manual, /old-text/); assert.match(manual, /value="17"/);
  assert.doesNotMatch(manual, /Both a number and text are saved/);
});

test("custom keys and ambiguous comparisons retain editable original values", () => {
  const legacy = condition({ conditionKey: "legacy.hp", operator: "eq", numericValue: 17, textValue: "old-text" });
  assert.match(render(legacy), /Advanced Comparison/); assert.match(render(legacy), /until a matching authoritative fact exists/);
  const known = render({ ...legacy, conditionKey: "state.hp-percent" });
  assert.match(known, /Both a number and text are saved/); assert.match(known, /Saved Text to Compare/); assert.match(known, /old-text/);
  assert.match(render({ ...legacy, conditionKey: "state.hp-percent", operator: "gte" }), /A saved text value makes this numeric comparison require a G.O.D. ruling/);
  assert.deepEqual(legacy, condition({ conditionKey: "legacy.hp", operator: "eq", numericValue: 17, textValue: "old-text" }));
});
