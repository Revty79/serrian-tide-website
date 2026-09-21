import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAbilityUseCondition, type AbilityFact } from "./facts";
import type { DerivedAbilityUseConditionDefinition } from "@/features/derived-abilities/models";

const condition = (operator: DerivedAbilityUseConditionDefinition["operator"], numericValue: number | null = null, textValue: string | null = null): DerivedAbilityUseConditionDefinition => ({
  conditionType: "state", conditionKey: "fact", operator, numericValue, textValue, notes: "", sortOrder: 0,
});
const fact = (value: number | string | boolean): AbilityFact => ({ key: "fact", label: "Fact", category: "state", source: "Test authoritative state", explanation: "Fixture",
  ...(typeof value === "number" ? { type: "number", value } as const : typeof value === "boolean" ? { type: "boolean", value } as const : { type: "text", value } as const) });
for (const [operator, value, expected, satisfied] of [
  ["gte", 50, 50, true], ["gt", 50, 50, false], ["gt", 51, 50, true], ["lte", 50, 50, true], ["lt", 50, 50, false], ["lt", 49, 50, true],
  ["eq", 2, 2, true], ["neq", 2, 2, false], ["neq", 2, 3, true], ["eq", "flying", "flying", true], ["neq", "walking", "flying", true],
] as const) test(`${operator}: typed ${value} against ${expected}`, () => {
  assert.equal(evaluateAbilityUseCondition(condition(operator, typeof expected === "number" ? expected : null, typeof expected === "string" ? expected : null), new Map([["fact", fact(value)]])), satisfied ? "satisfied" : "unsatisfied");
});
test("presence distinguishes explicit false from missing", () => {
  assert.equal(evaluateAbilityUseCondition(condition("possessed"), new Map([["fact", fact(false)]])), "unsatisfied");
  assert.equal(evaluateAbilityUseCondition(condition("not-possessed"), new Map([["fact", fact(false)]])), "satisfied");
  assert.equal(evaluateAbilityUseCondition(condition("possessed"), new Map([["fact", fact(true)]])), "satisfied");
  for (const operator of ["possessed", "not-possessed"] as const) assert.equal(evaluateAbilityUseCondition(condition(operator), new Map()), "manual");
});
test("ambiguous, missing and wrong-type operands never coerce", () => {
  for (const candidate of [condition("eq", 3, "3"), condition("neq"), condition("gte", 3), condition("eq", 3)])
    assert.equal(evaluateAbilityUseCondition(candidate, new Map([["fact", fact("3")]])), "manual");
  assert.equal(evaluateAbilityUseCondition(condition("eq", null, "Flying"), new Map([["fact", fact("flying")]])), "unsatisfied");
});
test("Manual and unproduced events require a ruling", () => {
  assert.equal(evaluateAbilityUseCondition({ ...condition("possessed"), conditionType: "manual" }, new Map([["fact", fact(true)]])), "manual");
  assert.equal(evaluateAbilityUseCondition({ ...condition(null), conditionType: "event" }, new Map()), "manual");
  assert.equal(evaluateAbilityUseCondition({ ...condition(null), conditionType: "event" }, new Map([["fact", { ...fact(true), category: "event" }]])), "satisfied");
});
