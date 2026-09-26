import assert from "node:assert/strict";
import test from "node:test";
import { accessFixture as access, accessRequirement as req } from "../../../scripts/form-access-fixture";
import { creatureDraftFixture, creatureFormFixture } from "../../../scripts/creature-form-fixture";
import { evaluateFormAccess as evaluate, normalizeFormAccess, type FormAccessContext } from "./form-access";
import { creatureFormAccessContext } from "./form-access-context";
import { projectCreatureFormDefinition } from "@/features/creatures/creature-forms";
import { resolveEffectiveCreatureStatistics } from "@/features/creatures/creature-size-rules";

const context = (): FormAccessContext => ({ owner: "race", attributes: { STR: 35, DEX: 40, CON: 30, INT: 25, WIS: 30, CHR: 20 }, possessedSkillIds: new Set([1]), skillPoints: new Map([[1, 10]]), possessedDerivedAbilityIds: new Set([2]) });
const skill = req("skill", { skillId: 1, referenceName: "Shift Forms", skillClassification: "Special Ability" });
const attribute = req("attribute", { attributeKey: "STR", requiredValue: 40 });
const manual = req("manual", { notes: "Complete First Awakening" });

test("legacy and explicit Unrestricted Forms are Available; malformed metadata fails closed", () => {
  for (const value of [undefined, { mode: "unrestricted" as const, requirements: [] }]) assert.equal(evaluate(value, context()).status, "available");
  assert.equal(evaluate({ mode: "requirements", requirements: [] }, context()).status, "locked");
  assert.throws(() => normalizeFormAccess({ mode: "unrestricted", requirements: [skill] }, "race"), /Only those who meet specific requirements/);
});
test("Skill/Special Ability possession, absence and useful classifications", () => {
  const result = evaluate(access(skill), context()); assert.equal(result.status, "available"); assert.match(result.groups[0].requirements[0].explanation, /Shift Forms · Special Ability must be present/);
  assert.equal(evaluate(access({ ...skill, skillId: 9 }), context()).status, "locked");
  assert.equal(evaluate(access({ ...skill, operator: "not-possessed" }), context()).status, "locked");
  assert.equal(evaluate(access({ ...skill, skillId: 9, operator: "not-possessed" }), context()).status, "available");
});
for (const [operator, value, expected] of [["gte", 10, "available"], ["gt", 10, "locked"], ["lte", 10, "available"], ["lt", 10, "locked"], ["eq", 10, "available"], ["neq", 10, "locked"], ["gt", 9, "available"], ["lt", 11, "available"]] as const) test(`purchased Skill point comparison ${operator} ${value}`, () => {
  assert.equal(evaluate(access({ ...skill, operator, requiredValue: value }), context()).status, expected);
});
test("Normal Attribute thresholds use the same comparison vocabulary", () => {
  assert.equal(evaluate(access(attribute), context()).status, "locked");
  assert.equal(evaluate(access({ ...attribute, requiredValue: 35 }), context()).status, "available");
  assert.equal(evaluate(access({ ...attribute, operator: "gt", requiredValue: 35 }), context()).status, "locked");
  assert.equal(evaluate(access(attribute), { ...context(), attributes: {} }).status, "manual-review");
});
test("Derived Ability requirements consume resolved possession, including not-possessed", () => {
  const row = req("derived-ability", { requiredDerivedAbilityId: 2 });
  assert.equal(evaluate(access(row), context()).status, "available");
  assert.equal(evaluate(access({ ...row, operator: "not-possessed" }), context()).status, "locked");
  assert.equal(evaluate(access({ ...row, requiredDerivedAbilityId: 3 }), context()).status, "locked");
});
test("AND automatic failure dominates manual; OR passing group dominates manual; unresolved alternative survives failed alternatives", () => {
  assert.equal(evaluate(access(manual), context()).status, "manual-review");
  assert.equal(evaluate(access(skill, { ...manual, sortOrder: 1 }), context()).status, "manual-review");
  assert.equal(evaluate(access(attribute, { ...manual, sortOrder: 1 }), context()).status, "locked");
  assert.equal(evaluate(access(skill, { ...attribute, sortOrder: 1 }), context()).status, "locked");
  assert.equal(evaluate(access(skill, { ...manual, groupNumber: 1 }), context()).status, "available");
  assert.equal(evaluate(access(attribute, { ...manual, groupNumber: 1 }), context()).status, "manual-review");
  assert.equal(evaluate(access(attribute, { ...skill, groupNumber: 1 }), context()).status, "available");
});
test("strict owner/type/reference/operator/group validation uses shared requirement primitives", () => {
  for (const row of [{ ...attribute, attributeKey: "Strength" }, { ...skill, skillId: -1 }, { ...attribute, requiredValue: Infinity }, { ...manual, notes: " " }, { ...skill, requiredValue: 1 }, { ...attribute, skillId: 1 }, { ...skill, groupNumber: -1 }]) assert.throws(() => normalizeFormAccess(access(row as typeof skill), "race"));
  assert.throws(() => normalizeFormAccess(access(skill, skill), "race"), /could not be identified/);
  assert.throws(() => normalizeFormAccess(access(skill, { ...manual, key: "another" }), "race"), /order of these requirements/);
  assert.throws(() => normalizeFormAccess(access(req("creature-ability", { requiredCreatureAbilityCanonicalId: "ABL-1" })), "race"), /Choose a requirement/);
  assert.throws(() => normalizeFormAccess(access(req("derived-ability", { requiredDerivedAbilityId: 1 })), "creature"), /Choose a requirement/);
});
test("Creature Skill presence uses native links and never parses textual ranks", () => {
  const normal = creatureDraftFixture(); normal.skillLinks = [{ skillId: 1, skillName: "Lore", skillClassification: "standard", rank: "Master, 40+", notes: "", sortOrder: 0 }];
  assert.equal(evaluate(access(skill), creatureFormAccessContext(normal)).status, "available");
  assert.equal(evaluate(access({ ...skill, skillId: 9 }), creatureFormAccessContext(normal)).status, "locked");
  assert.throws(() => normalizeFormAccess(access({ ...skill, operator: "gte", requiredValue: 10 }), "creature"), /Creature Skill ranks/);
});
test("Creature Attribute checks reuse native Normal effective statistics and unknown data requires review", () => {
  const normal = creatureDraftFixture(); normal.core.size = "Large";
  const effective = resolveEffectiveCreatureStatistics(normal).attributeValues.Strength!;
  assert.equal(evaluate(access({ ...attribute, requiredValue: effective }), creatureFormAccessContext(normal)).status, "available");
  assert.equal(evaluate(access({ ...attribute, requiredValue: effective + 1 }), creatureFormAccessContext(normal)).status, "locked");
  normal.attributes[0].value = null;
  const unknown = evaluate(access(attribute), creatureFormAccessContext(normal)); assert.equal(unknown.status, "manual-review"); assert.match(unknown.groups[0].requirements[0].explanation, /has not been recorded/);
});
test("Creature Ability uses stable canonical identity, never a matching name", () => {
  const normal = creatureDraftFixture(); normal.abilities = creatureFormFixture().mechanics.abilities.rows;
  const row = req("creature-ability", { requiredCreatureAbilityCanonicalId: normal.abilities[0].canonicalId });
  assert.equal(evaluate(access(row), creatureFormAccessContext(normal)).status, "available");
  assert.equal(evaluate(access({ ...row, requiredCreatureAbilityCanonicalId: normal.abilities[0].abilityName }), creatureFormAccessContext(normal)).status, "locked");
  assert.equal(evaluate(access({ ...row, operator: "not-possessed" }), creatureFormAccessContext(normal)).status, "locked");
});
test("Creature Form overrides, Skill additions and Abilities cannot self-unlock; pure evaluation leaves both definitions untouched", () => {
  const normal = creatureDraftFixture(), form = creatureFormFixture(1);
  form.mechanics.attributes.rows[0].value = 1000;
  const definitions = [access(attribute), access(skill), access(req("creature-ability", { requiredCreatureAbilityCanonicalId: form.mechanics.abilities.rows[0].canonicalId }))];
  const before = structuredClone({ normal, form, definitions });
  const projected = projectCreatureFormDefinition(normal, form.mechanics);
  assert.ok(resolveEffectiveCreatureStatistics(projected).attributeValues.Strength! > 40);
  for (const definition of definitions) assert.equal(evaluate(definition, creatureFormAccessContext(normal)).status, "locked");
  assert.deepEqual({ normal, form, definitions }, before);
  assert.equal(evaluate(access(manual), creatureFormAccessContext(normal)).status, "manual-review");
  assert.equal(evaluate(access(attribute, { ...manual, sortOrder: 1 }), creatureFormAccessContext(normal)).status, "locked");
  assert.equal(evaluate(access(attribute, { ...manual, groupNumber: 1 }), creatureFormAccessContext(normal)).status, "manual-review");
});
