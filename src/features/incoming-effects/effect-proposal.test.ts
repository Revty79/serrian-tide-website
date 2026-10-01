import assert from "node:assert/strict";
import test from "node:test";
import type { InteractionRule } from "@/features/interaction-rules/interaction-rules";
import type { ActionEffectProposal, FrozenActionSourceSnapshot } from "@/features/tabletop-operations/action-effect-bridge";
import { buildProtectionLayers } from "@/features/protection/protection-layers";
import type { IncomingEffectTarget } from "./models";
import { resolveIncomingEffectProposal, storedIncomingResolution, recalculateFrozenIncoming } from "./effect-proposal";
import { incomingFactsFromFrozenSource, projectileIncomingFacts } from "./source-facts";
import { playerIncomingAuthoredValue, playerIncomingFinalValue } from "./public-evidence";
import { incomingFactsForEffect } from "./source-facts";

const rule = (ruleType: InteractionRule["ruleType"], percentage: number | null = null): InteractionRule => ({ key: "rule", name: "Secret rule", ruleType, percentage,
  conditions: [{ key: "magic", kind: "magical", magical: true }], scope: "damage", match: "ALL", notes: "Private G.O.D. notes", sortOrder: 0 });
const target = (rules: InteractionRule[] = []): IncomingEffectTarget => ({ ruleSource: { kind: "race", id: "race:1", name: "Target Race" }, interactionRules: { schemaVersion: 1, rules },
  protection: buildProtectionLayers({ target: { kind: "character", characterId: 1 } }), applicationLocations: [{ number: 0, name: "Body", poolKey: "body" }] });
const source = (kind: FrozenActionSourceSnapshot["kind"] = "spell") => ({ kind, displayName: "Structured source", authoredData: {} });
const proposal = (amount = 12): ActionEffectProposal => ({ effectKey: "damage", effectType: "health.damage", targetParticipantId: 1,
  authoredValue: { effect: { kind: "health.damage", amount, application: "localized" } }, calculatedValue: amount,
  finalValue: { effect: { kind: "health.damage", amount, application: "localized" }, application: { hitLocationNumber: 0, poolKey: "body" } },
  applicationSupported: true, godReviewRequired: false, status: "calculated", amendmentReason: "", unit: "Health", resource: "" });

for (const [type, percentage, status, damage, healing] of [
  ["requirement", null, "resolved", 12, 0], ["immunity", null, "prevented", 0, 0], ["resistance", 50, "resolved", 6, 0],
  ["vulnerability", 50, "resolved", 18, 0], ["absorption", 50, "absorbed", 0, 6],
] as const) test(`exact Spell effect Fire reaches ${type} without contaminating another effect or global source`, () => {
  const fireRule = { ...rule(type, percentage), conditions: [{ key: "fire", kind: "damage-type" as const, damageType: "Fire" }] };
  const global = { ...source(), incomingSourceFacts: incomingFactsFromFrozenSource(source()) };
  const before = structuredClone(global);
  const input = (damageType: string) => ({ ...proposal(), authoredValue: { effect: (proposal().authoredValue as { effect: unknown }).effect,
    instruction: { spellEffectId: damageType, ruleId: "damage", damageType } } });
  const fire = resolveIncomingEffectProposal(input("Fire"), global, target([fireRule]));
  const result = storedIncomingResolution(fire.authoredValue)!;
  assert.equal(result.input.source.damageType, "Fire"); assert.equal(result.status, status);
  assert.equal(result.finalEffect?.damage, damage); assert.equal(result.finalEffect?.healing, healing);
  const cold = storedIncomingResolution(resolveIncomingEffectProposal(input("Cold"), global, target([fireRule])).authoredValue)!;
  assert.equal(cold.input.source.damageType, "Cold");
  assert.equal(cold.finalEffect?.damage, type === "requirement" ? 0 : 12);
  assert.deepEqual(global, before); assert.equal(global.incomingSourceFacts.damageType, null);
});

test("mixed Spell damage requires a ruling for an unsplit percentage defense; unspecified stays unknown", () => {
  const fireRule = { ...rule("resistance", 50), conditions: [{ key: "fire", kind: "damage-type" as const, damageType: "Fire" }] };
  for (const damageType of ["Blunt / Fire", ""]) {
    const input = { ...proposal(), authoredValue: { instruction: { spellEffectId: "one", ruleId: "damage", damageType } } };
    const result = resolveIncomingEffectProposal(input, source(), target([fireRule]));
    assert.equal(result.status, "requires-god-ruling"); assert.equal(result.applicationSupported, false);
    assert.equal(storedIncomingResolution(result.authoredValue)!.input.source.damageType, damageType || null);
  }
  const legacy = storedIncomingResolution(resolveIncomingEffectProposal(proposal(), source(), target()).authoredValue)!;
  assert.equal(legacy.input.source.damageType, null); assert.equal(legacy.finalEffect?.damage, 12);
});

test("Item Spell damage overrides only its own type and ordinary effects retain source facts", () => {
  const facts = incomingFactsFromFrozenSource({ kind: "item", authoredData: { damageType: "Blunt" } });
  const effect = { kind: "health.damage" as const, amount: 12, application: "localized" as const };
  assert.equal(incomingFactsForEffect(facts, effect, { spellEffectId: "fire", ruleId: "damage", damageType: "Fire" }).damageType, "Fire");
  assert.equal(incomingFactsForEffect(facts, effect, { spellEffectId: "unknown", ruleId: "damage", damageType: "" }).damageType, null);
  assert.equal(incomingFactsForEffect(facts, effect, { damageType: "Fire" }).damageType, "Blunt");
  assert.equal(incomingFactsForEffect(facts, { kind: "condition.apply", name: "Burning", description: "", duration: { kind: "scene" } }, { spellEffectId: "fire", ruleId: "damage", damageType: "Fire" }).damageType, "Blunt");
  assert.equal(facts.damageType, "Blunt");
});

for (const [type, percentage, status, damage, healing] of [
  ["requirement", null, "resolved", 12, 0], ["immunity", null, "prevented", 0, 0], ["resistance", 25, "resolved", 9, 0],
  ["vulnerability", 25, "resolved", 15, 0], ["absorption", 50, "absorbed", 0, 6],
] as const) test(`effect workflow maps ${type} without applying Health`, () => {
  const result = resolveIncomingEffectProposal(proposal(), source(), target([rule(type, percentage)]));
  const resolution = storedIncomingResolution(result.authoredValue)!;
  assert.equal(resolution.status, status); assert.equal(resolution.finalEffect?.damage, damage); assert.equal(resolution.finalEffect?.healing, healing);
  assert.equal(result.status, status === "prevented" ? "declined" : "calculated");
  if (status === "absorbed") assert.deepEqual(result.finalValue, { effect: { kind: "health.heal", scope: "area", amount: 6 }, application: { hitLocationNumber: 0, poolKey: "body" } });
});
test("Absorption retains calculated healing and asks for a pool when it cannot resolve one", () => {
  const result = resolveIncomingEffectProposal({ ...proposal(), finalValue: { effect: { kind: "health.damage", amount: 12, application: "full-body" }, application: {} } }, source(), target([rule("absorption", 50)]));
  assert.equal(result.status, "requires-god-ruling"); assert.equal(result.applicationSupported, false);
  assert.equal(storedIncomingResolution(result.authoredValue)?.finalEffect?.healing, 6);
});
test("missing projectile inheritance never turns into nonmagical or empty properties", () => {
  const facts = projectileIncomingFacts("Piercing", true);
  assert.equal(facts.weaponFamily, "firearm"); assert.equal(facts.magical, null); assert.equal(facts.itemProperties, null); assert.equal(facts.itemTags, null);
  const result = resolveIncomingEffectProposal(proposal(), { ...source("weapon"), incomingSourceFacts: facts }, target([rule("requirement")]));
  assert.equal(result.status, "requires-god-ruling"); assert.equal(result.applicationSupported, false);
});
test("Creature magic is explicit and legacy identity does not infer qualifiers", () => {
  assert.equal(incomingFactsFromFrozenSource({ kind: "creature-ability", authoredData: { abilityName: "Magic Fire Demon" } }).magical, null);
  assert.equal(incomingFactsFromFrozenSource({ kind: "creature-attack", authoredData: { authoring: { magical: false } } }).magical, false);
  assert.equal(incomingFactsFromFrozenSource({ kind: "creature-ability", authoredData: { authoring: { magic: { document: {} } } } }).magical, true);
  assert.equal(incomingFactsFromFrozenSource({ kind: "derived-ability", authoredData: {} }).magical, null);
});
test("unknown non-damage harmfulness matters only for potentially relevant interactions", () => {
  const effect = { kind: "condition.apply", name: "Marked", description: "", duration: { kind: "scene" } };
  const input = { ...proposal(), effectType: "condition.apply", finalValue: { effect, application: {} }, authoredValue: { effect } };
  assert.equal(resolveIncomingEffectProposal(input, source(), target()).status, "calculated");
  assert.equal(resolveIncomingEffectProposal(input, source(), target([rule("resistance", 50)])).status, "calculated");
  const immunity = { ...rule("immunity"), scope: "condition" as const };
  assert.equal(resolveIncomingEffectProposal(input, source(), target([immunity])).status, "requires-god-ruling");
  const harmful = { ...input, authoredValue: { effect, instruction: { harmful: true } } };
  assert.equal(resolveIncomingEffectProposal(harmful, source(), target([immunity])).status, "declined");
});
test("recalculating optional gross damage uses frozen target facts and preserves the original trace", () => {
  const live = target([rule("resistance", 50)]);
  const result = resolveIncomingEffectProposal(proposal(), source(), live);
  live.interactionRules!.rules[0].percentage = 99;
  const revised = recalculateFrozenIncoming(result, 10)!;
  assert.equal((revised.finalValue as { effect: { amount: number } }).effect.amount, 5);
  assert.equal(storedIncomingResolution(revised.authoredValue)?.input.effect.amount, 12);
  assert.equal(storedIncomingResolution(revised.authoredValue)?.input.target.interactionRules?.rules[0].percentage, 50);
  assert.equal(recalculateFrozenIncoming(proposal(), 10), null, "historical plans keep their original executor");
});
test("Player evidence does not expose private rule text or frozen target records", () => {
  const result = resolveIncomingEffectProposal(proposal(), source(), target([rule("immunity")]));
  const json = JSON.stringify(playerIncomingAuthoredValue(result.authoredValue));
  assert.doesNotMatch(json, /Secret rule|Private G.O.D.|ruleSource|interactionRules|incomingEffectResolution/);
  assert.match(json, /prevented/);
});

test("a target's Player cannot inspect private source authoring in new or historical evidence", () => {
  const original = { source: { requirements: "Private Creature requirements", specialEffect: "Private special effect" }, roll: { succeeded: true } };
  assert.deepEqual(playerIncomingAuthoredValue(original, false), { roll: { succeeded: true } });
  assert.deepEqual(playerIncomingAuthoredValue(original), original, "the source owner retains authorized source details");
});

test("Player final outcomes retain amount and location without embedded private ruling notes", () => {
  const original = { effect: { kind: "health.damage", amount: 3 }, application: { poolKey: "head", hitLocationNumber: 0, ordinaryAttack: { declarationId: 12, ruling: { reason: "Private G.O.D. reason", finalDamage: 3 } } } };
  assert.deepEqual(playerIncomingFinalValue(original), { effect: original.effect, application: { poolKey: "head", hitLocationNumber: 0, ordinaryAttack: { declarationId: 12 } } });
  assert.equal(original.application.ordinaryAttack.ruling.reason, "Private G.O.D. reason", "immutable historical evidence stays unchanged");
});
