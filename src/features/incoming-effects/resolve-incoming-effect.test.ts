import assert from "node:assert/strict";
import test from "node:test";
import type { InteractionCondition, InteractionRule } from "@/features/interaction-rules/interaction-rules";
import { buildProtectionLayers, type WornProtection } from "@/features/protection/protection-layers";
import type { IncomingEffectInput } from "./models";
import { resolveIncomingEffect } from "./resolve-incoming-effect";

const fire: InteractionCondition = { key: "fire", kind: "damage-type", damageType: "Fire" };
const magic: InteractionCondition = { key: "magic", kind: "magical", magical: true };
const silver: InteractionCondition = { key: "silver", kind: "item-property", propertyName: "Material", value: "Silver" };
const rule = (ruleType: InteractionRule["ruleType"], percentage: number | null = null, overrides: Partial<InteractionRule> = {}): InteractionRule => ({ key: "rule", name: `Fire ${ruleType}`, ruleType, percentage, conditions: [fire], scope: "damage", match: "ALL", notes: "", sortOrder: 0, ...overrides });
const worn = (baseSoak = 3): WornProtection => ({ ownershipKey: "stack:1", instanceId: null, itemId: 1, itemName: "Breastplate", activeQuantity: 1, baseSoak, coverage: "Chest", coveredLocationKeys: ["9"], armorType: "Plate", rulesText: "", damageModifiersSourceText: "", damageModifiers: [] });
function input(rules: InteractionRule[] = [], amount = 12): IncomingEffectInput {
  return { effect: { label: "Incoming Fire", amount, harmful: null }, source: { damageType: "Fire", magical: false, sourceKind: "weapon", weaponFamily: "none", itemProperties: [{ name: "Material", value: "Steel" }], itemTags: [], mechanicalEffectKind: "health.damage", conditionName: null },
    target: { ruleSource: { kind: "race", id: "race:1", name: "Test Race" }, interactionRules: { schemaVersion: 1, rules }, protection: buildProtectionLayers({ target: { kind: "character", characterId: 1 } }) }, hitLocationKey: "9" };
}
function natural(value: IncomingEffectInput, armor = 2, soak = 1) {
  value.target.protection.natural.push({ source: { kind: "race", id: "race:1:hide", name: "Test Race" }, name: "Scales", coverage: { kind: "all" }, armor, soak });
}
function temporary(value: IncomingEffectInput, amount = 1, targetKey = "self") {
  value.target.protection.temporary.push({ id: `ward:${value.target.protection.temporary.length}`, name: "Ward", channel: "soak", targetKey, amount, coverage: targetKey === "self" ? { kind: "all" } : { kind: "unresolved" }, modifier: { source: { name: "Ward Spell" }, duration: { kind: "scene" } } });
}
test("approved complete stage example keeps full precision and rounds up only at the end", () => {
  const value = input([rule("resistance", 25)]);
  value.target.protection.worn = [worn()]; natural(value); temporary(value);
  const before = structuredClone(value), result = resolveIncomingEffect(value);
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.stages.map(({ key, damageAfter }) => [key, damageAfter]), [["source", 12], ["worn", 9], ["interaction", 6.75], ["natural", 3.75], ["temporary", 2.75], ["final", 3]]);
  assert.equal(result.finalEffect?.damage, 3);
  assert.match(result.explanation.join("\n"), /Breastplate: 12 - 3 = 9/);
  assert.match(result.explanation.join("\n"), /Natural Soak: 4.75 - 1 = 3.75/);
  assert.deepEqual(value, before, "pure calculation never changes caller facts");
  value.target.interactionRules!.rules[0].percentage = 99;
  assert.equal(result.input.target.interactionRules!.rules[0].percentage, 25, "the plan owns its snapshot");
  assert.deepEqual(resolveIncomingEffect(JSON.parse(JSON.stringify(before))), result);
});
for (const [material, expected] of [["Steel", "prevented"], ["Silver", "resolved"]] as const) test(`Werewolf Requirement with ${material}`, () => {
  const value = input([rule("requirement", null, { name: "Silver required", conditions: [silver] })]);
  value.source.itemProperties![0].value = material;
  const result = resolveIncomingEffect(value);
  assert.equal(result.status, expected); assert.equal(result.finalEffect?.damage, material === "Steel" ? 0 : 12);
  assert.match(result.explanation.join("\n"), material === "Steel" ? /Requirement not satisfied.*Material = Silver/ : /Requirement satisfied.*Material = Silver/);
});
for (const magical of [false, true]) test(`Spectre Requirement with Magical=${magical}`, () => {
  const value = input([rule("requirement", null, { conditions: [magic] })]); value.source.magical = magical;
  assert.equal(resolveIncomingEffect(value).status, magical ? "resolved" : "prevented");
});
test("ALL Magical + Fire and ANY Silver OR Magical stay within each independent gate", () => {
  const value = input([rule("requirement", null, { conditions: [magic, fire] })]);
  assert.equal(resolveIncomingEffect(value).status, "prevented");
  value.source.magical = true; assert.equal(resolveIncomingEffect(value).status, "resolved");
  value.source.damageType = "Ice"; assert.equal(resolveIncomingEffect(value).status, "prevented");
  value.target.interactionRules!.rules = [rule("requirement", null, { match: "ANY", conditions: [silver, magic] })];
  assert.equal(resolveIncomingEffect(value).status, "resolved");
  value.source.magical = false; assert.equal(resolveIncomingEffect(value).status, "prevented");
  value.source.itemProperties![0].value = "Silver"; assert.equal(resolveIncomingEffect(value).status, "resolved");
  value.target.interactionRules!.rules.push(rule("requirement", null, { key: "second", sortOrder: 1, conditions: [magic] }));
  assert.equal(resolveIncomingEffect(value).status, "prevented", "passing one gate cannot bypass a different Requirement");
  value.source.magical = true; assert.equal(resolveIncomingEffect(value).status, "resolved");
});
test("Requirements execute after worn protection and prevention skips later numerical stages", () => {
  const value = input([rule("requirement", null, { conditions: [silver] })]); value.target.protection.worn = [worn()]; natural(value); temporary(value, -100);
  const result = resolveIncomingEffect(value);
  assert.equal(result.stages[1].damageAfter, 9); assert.equal(result.stages[2].damageAfter, 0);
  assert.equal(result.stages[3].status, "skipped"); assert.equal(result.finalEffect?.damage, 0);
});
for (const [kind, scope, condition] of [
  ["health.damage", "damage", fire],
  ["condition.apply", "condition", { key: "burn", kind: "condition-name", conditionName: "Burning" }],
  ["modifier.apply", "mechanical-effect", { key: "mod", kind: "mechanical-effect-kind", effectKind: "modifier.apply" }],
] as const) test(`Immunity prevents ${scope} effects; duplicates remain traced`, () => {
  const value = input([rule("immunity", null, { scope, conditions: [condition] }), rule("immunity", null, { key: "duplicate", sortOrder: 1, scope, conditions: [condition] })]);
  value.source.mechanicalEffectKind = kind; value.source.conditionName = "Burning"; value.effect.harmful = true;
  if (kind !== "health.damage") { value.effect.amount = null; value.hitLocationKey = null; }
  const result = resolveIncomingEffect(value);
  assert.equal(result.status, "prevented"); assert.equal(result.matchedRules.length, 2); assert.equal(result.finalEffect?.damage, 0);
});
test("non-damage Requirement applies only to harmful effects and receives no armor math", () => {
  const value = input([rule("requirement", null, { scope: "mechanical-effect", conditions: [magic] })]);
  value.source.mechanicalEffectKind = "manual"; value.effect.amount = null; value.effect.harmful = true; value.hitLocationKey = null;
  value.target.protection.worn = [worn(), worn()]; natural(value); natural(value); temporary(value, 1, "unknown");
  assert.equal(resolveIncomingEffect(value).status, "prevented");
  value.source.magical = true; assert.equal(resolveIncomingEffect(value).status, "resolved");
  value.effect.harmful = false; value.source.magical = false; assert.equal(resolveIncomingEffect(value).status, "resolved");
  value.effect.harmful = null; assert.equal(resolveIncomingEffect(value).issues[0].code, "unknown-harmfulness");
});
const percentages: Array<[string, InteractionRule[], number, number]> = [
  ["25% Resistance", [rule("resistance", 25)], 8, 6],
  ["50% Vulnerability", [rule("vulnerability", 50)], 8, 12],
  ["multiple Resistances", [rule("resistance", 20), rule("resistance", 25, { key: "r2", sortOrder: 1 })], 10, 6],
  ["multiple Vulnerabilities", [rule("vulnerability", 50), rule("vulnerability", 50, { key: "v2", sortOrder: 1 })], 8, 18],
  ["mixed multiplication", [rule("resistance", 20), rule("vulnerability", 50, { key: "v2", sortOrder: 1 })], 10, 12],
  ["no intermediate rounding", [rule("resistance", 25), rule("resistance", 25, { key: "r2", sortOrder: 1 })], 3, 2],
  ["Resistance above 100 floors to zero", [rule("resistance", 150)], 10, 0],
  ["Vulnerability above 100 uncapped", [rule("vulnerability", 150)], 10, 25],
];
for (const [name, rules, amount, expected] of percentages) test(name, () => {
  const result = resolveIncomingEffect(input(rules, amount)); assert.equal(result.status, "resolved"); assert.equal(result.finalEffect?.damage, expected); assert.equal(result.finalEffect?.healing, 0);
});
test("stable authored order, not array order, governs each percentage trace", () => {
  const result = resolveIncomingEffect(input([rule("vulnerability", 50, { key: "v", sortOrder: 9 }), rule("resistance", 20, { key: "r", sortOrder: 2 })], 10));
  assert.deepEqual(result.stages[2].entries.filter(({ operation }) => operation === "percentage-candidate").map(({ sourceId, before, after }) => [sourceId, before, after]), [["r", 10, 8], ["v", 8, 12]]);
});
for (const [amount, percentage, expected] of [[6, 50, 3], [6, 100, 6], [10, 150, 15], [1, 25, 1]]) test(`Absorption ${percentage}% of ${amount} converts to ${expected} healing`, () => {
  const value = input([rule("absorption", percentage)], amount); natural(value, 100, 100); natural(value, 100, 100); temporary(value, 100, "unknown");
  value.health = { currentHp: 8, maximumHp: 10 };
  const result = resolveIncomingEffect(value);
  assert.equal(result.status, "absorbed"); assert.equal(result.finalEffect?.damage, 0); assert.equal(result.finalEffect?.healing, expected); assert.equal(result.finalEffect?.cappedHealing, Math.min(2, expected));
  assert.equal(result.finalEffect?.healingBeforeRounding, amount * percentage / 100);
  assert.deepEqual(result.stages.slice(3, 5).map(({ status }) => status), ["skipped", "skipped"]); assert.deepEqual(result.issues, []);
});
test("Absorption uses the post-worn amount", () => {
  const value = input([rule("absorption", 50)], 9); value.target.protection.worn = [worn()];
  assert.equal(resolveIncomingEffect(value).finalEffect?.healing, 3);
});
for (const type of ["immunity", "resistance", "vulnerability", "absorption"] as const) test(`Absorption + ${type} requires a ruling and preserves all candidates`, () => {
  const value = input([rule("absorption", 50), rule(type, type === "immunity" ? null : 25, { key: "other", sortOrder: 1 })], 6);
  const result = resolveIncomingEffect(value);
  assert.equal(result.status, "requires-god-ruling"); assert.equal(result.finalEffect, null); assert.equal(result.input.effect.amount, 6);
  assert.equal(result.matchedRules.length, 2); assert.ok(result.candidates.length >= 2); assert.equal(result.candidates[0].basisDamage, 6);
  assert.ok(result.candidates.some(({ ruleKeys, healing }) => ruleKeys[0] === "rule" && healing === 3));
  assert.ok(result.issues.some(({ code }) => code.includes("absorption")));
});
test("single/no worn, exact coverage and zero floors", () => {
  const value = input([], 2); assert.equal(resolveIncomingEffect(value).finalEffect?.damage, 2);
  value.target.protection.worn = [worn(3)]; assert.equal(resolveIncomingEffect(value).finalEffect?.damage, 0);
  value.hitLocationKey = "0"; assert.equal(resolveIncomingEffect(value).finalEffect?.damage, 2);
});
test("multiple worn sources, unknown coverage, values and metadata remain explicit rulings", () => {
  const value = input(); value.target.protection.worn = [worn(3), { ...worn(5), ownershipKey: "stack:2" }];
  let result = resolveIncomingEffect(value); assert.equal(result.issues[0].code, "multiple-worn"); assert.equal(result.finalEffect, null);
  assert.deepEqual(result.stages[1].entries.map(({ value }) => value), [3, 5]);
  value.target.protection.worn = [{ ...worn(), coveredLocationKeys: [] }]; assert.equal(resolveIncomingEffect(value).issues[0].code, "worn-coverage");
  value.target.protection.worn = [{ ...worn(), baseSoak: null }]; assert.equal(resolveIncomingEffect(value).issues[0].code, "worn-value");
  value.target.protection.worn = [{ ...worn(), damageModifiersSourceText: "Fire +2" }]; assert.equal(resolveIncomingEffect(value).issues[0].code, "armor-damage-metadata");
  value.target.protection.worn = [{ ...worn(), damageModifiers: [{ id: 1, damageType: "Fire", modifier: "+2", modifierText: "", notes: "" }] }];
  result = resolveIncomingEffect(value); assert.equal(result.issues[0].code, "armor-damage-metadata");
});
test("Race and exact Creature natural sources subtract both Armor and Soak", () => {
  const value = input([], 8); natural(value); assert.equal(resolveIncomingEffect(value).finalEffect?.damage, 5);
  value.target.protection = buildProtectionLayers({ target: { kind: "encounter-participant", campaignId: 1, encounterId: 2, participantId: -8 }, creature: { identity: "occurrence:-8", snapshot: { core: { canonicalName: "Scales" }, hitLocations: [{ hitLocationNumber: 9, locationName: "Chest", naturalArmor: 2, soak: 1 }] } } });
  assert.equal(resolveIncomingEffect(value).finalEffect?.damage, 5);
  value.effect.amount = 1; assert.equal(resolveIncomingEffect(value).finalEffect?.damage, 0);
});
test("overlapping natural definitions and unsupported authored values require rulings", () => {
  const value = input(); natural(value); natural(value, 4, 2);
  assert.equal(resolveIncomingEffect(value).issues[0].code, "multiple-natural");
  value.target.protection.natural.splice(1); value.target.protection.natural[0].armor = null;
  assert.equal(resolveIncomingEffect(value).issues[0].code, "natural-value");
});
test("temporary Soak sums signed values before its floor and skips ended/expired", () => {
  const value = input([], 8); natural(value); temporary(value, 10); temporary(value, -8); temporary(value, 500); temporary(value, 500);
  value.target.protection.temporary[2].modifier.endedAt = "ended"; value.target.protection.temporary[3].modifier.expiredAt = "expired";
  const result = resolveIncomingEffect(value); assert.equal(result.finalEffect?.damage, 3); assert.equal(result.stages[4].damageBefore, 5);
  temporary(value, 500); assert.equal(resolveIncomingEffect(value).finalEffect?.damage, 0);
});
test("unknown temporary applicability and amount are explicit issues", () => {
  const value = input(); temporary(value, 1, "chest"); assert.equal(resolveIncomingEffect(value).issues[0].code, "temporary-coverage");
  value.target.protection.temporary[0].coverage = { kind: "all" }; value.target.protection.temporary[0].amount = null;
  assert.equal(resolveIncomingEffect(value).issues[0].code, "temporary-value");
});
test("location is required only for location-dependent damage protection", () => {
  const value = input(); value.hitLocationKey = null; assert.equal(resolveIncomingEffect(value).status, "resolved");
  natural(value); assert.equal(resolveIncomingEffect(value).status, "resolved");
  value.target.protection.worn = [worn()]; assert.equal(resolveIncomingEffect(value).issues[0].code, "hit-location-required");
  value.hitLocationKey = "not-anatomy"; assert.equal(resolveIncomingEffect(value).issues[0].code, "hit-location-required");
});
test("only applicable protection defects block, not unrelated location projection issues", () => {
  const value = input(); value.target.protection = buildProtectionLayers({ target: { kind: "character", characterId: 1 }, creature: { identity: "npc:1", snapshot: { core: {}, hitLocations: [{ hitLocationNumber: 9, naturalArmor: 2, soak: 1 }, { hitLocationNumber: 0, naturalArmor: "unknown", soak: 0 }] } } });
  assert.ok(value.target.protection.issues.length); assert.equal(resolveIncomingEffect(value).finalEffect?.damage, 9);
});
test("missing matched facts need ruling, explicit false and empty collections do not", () => {
  const value = input([rule("requirement", null, { conditions: [magic] })]); value.source.magical = null;
  assert.equal(resolveIncomingEffect(value).issues[0].code, "unknown-source-fact");
  value.source.magical = false; assert.equal(resolveIncomingEffect(value).status, "prevented");
});
test("known health healing bypasses harmful rules and numerical protection; rounds and caps once", () => {
  const value = input([rule("immunity", null, { scope: "mechanical-effect", conditions: [magic] })], 2.5);
  value.source.mechanicalEffectKind = "health.heal"; value.source.magical = true; value.hitLocationKey = null;
  natural(value, 999, 999); temporary(value, 10, "unknown"); value.health = { currentHp: 9, maximumHp: 10 };
  const result = resolveIncomingEffect(value); assert.equal(result.status, "resolved"); assert.equal(result.finalEffect?.healing, 3); assert.equal(result.finalEffect?.cappedHealing, 1);
});
test("malformed numbers, percentage scope, duplicate sort order and contradictory harmfulness are invalid", () => {
  for (const amount of [-1, NaN, Infinity, null]) { const value = input(); value.effect.amount = amount; assert.equal(resolveIncomingEffect(value).status, "invalid"); }
  assert.equal(resolveIncomingEffect(input([rule("resistance", 20, { scope: "condition" })])).status, "invalid");
  assert.equal(resolveIncomingEffect(input([rule("resistance", 20), rule("resistance", 20, { key: "duplicate-order" })])).status, "invalid");
  const value = input(); value.effect.harmful = false; assert.equal(resolveIncomingEffect(value).status, "invalid");
});
test("numeric overflow remains an unresolved serializable plan instead of infinite HP", () => {
  const result = resolveIncomingEffect(input([rule("vulnerability", 1e308)], 1e308));
  assert.equal(result.status, "requires-god-ruling"); assert.equal(result.finalEffect, null); assert.ok(result.issues.some(({ code }) => code === "numeric-overflow"));
  assert.equal(JSON.stringify(result).includes("Infinity"), false);
});
test("decimal percentage boundaries never invent an extra HP from floating-point noise", () => {
  for (const [type, percentage, expected] of [["resistance", 70, 30], ["vulnerability", 10, 110], ["absorption", 55, 55]] as const) {
    const result = resolveIncomingEffect(input([rule(type, percentage)], 100));
    assert.equal(type === "absorption" ? result.finalEffect?.healing : result.finalEffect?.damage, expected);
  }
  const value = input([], 0.3); natural(value, 0.1, 0.2);
  assert.equal(resolveIncomingEffect(value).finalEffect?.damage, 0);
});
test("exact decimal state survives below double precision and rounds a real positive remainder upward", () => {
  const value = input([rule("vulnerability", 1e-16)], 1);
  const result = resolveIncomingEffect(value);
  assert.equal(result.finalEffect?.exactDamageBeforeRounding, "1.000000000000000001");
  assert.equal(result.finalEffect?.damage, 2, "epsilon rounding would wrongly discard a real authored remainder");
  const tiny = resolveIncomingEffect(input([rule("resistance", 99.99999999999999)], 1));
  assert.equal(tiny.finalEffect?.damage, 1);
  assert.equal(tiny.finalEffect?.exactDamageBeforeRounding, "0.0000000000000001");
});
test("signed temporary Soak retains a small term through large cancellation", () => {
  const value = input([], 5); temporary(value, 1e16); temporary(value, 1); temporary(value, -1e16);
  assert.equal(resolveIncomingEffect(value).finalEffect?.damage, 4);
});
test("hypothetical candidate overflow cannot defeat Immunity or a finite actual percentage sequence", () => {
  const huge = rule("vulnerability", 1e308, { key: "huge", sortOrder: 1 });
  const immune = resolveIncomingEffect(input([rule("immunity"), huge], 1e308));
  assert.equal(immune.status, "prevented"); assert.equal(immune.finalEffect?.damage, 0);
  const resistant = resolveIncomingEffect(input([rule("resistance", 100), huge], 1e308));
  assert.equal(resistant.status, "resolved"); assert.equal(resistant.finalEffect?.damage, 0);
  assert.equal(resistant.candidates[1].damage, null, "unrepresentable numeric candidate keeps its exact decimal string");
  assert.ok(resistant.candidates[1].exactDamage);
});

function assertDecisivePrevention(result: ReturnType<typeof resolveIncomingEffect>) {
  assert.equal(result.status, "prevented");
  assert.equal(result.finalEffect?.disposition, "prevented");
  assert.equal(result.finalEffect.damage, 0);
  assert.equal(result.finalEffect.healing, 0);
  assert.deepEqual(result.issues, [], "irrelevant uncertainty must never enter the blocking issues collection");
  assert.deepEqual(result.candidates, [], "unreached percentage/Absorption rules perform no candidate math");
  assert.equal(result.stages[2].status, "completed");
  assert.equal(result.stages[2].entries.some(({ operation }) => operation === "percentage-candidate" || operation === "absorb"), false);
  assert.deepEqual(result.stages.slice(3, 5).map(({ status }) => status), ["skipped", "skipped"]);
  assert.doesNotMatch(result.explanation.join("\n"), /G\.O\.D\. review:/);
}

test("failed Silver Requirement prevents despite unknown Fire Resistance, retaining informational uncertainty", () => {
  const value = input([rule("requirement", null, { key: "gate", conditions: [silver] }), rule("resistance", 25, { key: "resistance", sortOrder: 1 })]);
  value.source.damageType = null;
  const result = resolveIncomingEffect(value);
  assertDecisivePrevention(result);
  assert.equal(result.ruleMatches.find(({ rule }) => rule.key === "resistance")?.outcome, "unknown");
  assert.ok(result.stages[2].entries.some(({ operation, sourceId }) => operation === "skip-rule" && sourceId === "resistance"));
  assert.match(result.explanation.join("\n"), /Requirement not satisfied:.*Material = Silver/);
  assert.match(result.explanation.join("\n"), /not applied because a Requirement gate already prevented/);
});

const downstreamCases: Array<[string, InteractionRule[]]> = [
  ["matching Resistance", [rule("resistance", 25)]],
  ["matching Vulnerability", [rule("vulnerability", 50)]],
  ["matching Absorption", [rule("absorption", 50)]],
  ["Absorption + Resistance conflict", [rule("absorption", 50), rule("resistance", 25, { key: "resistance", sortOrder: 1 })]],
  ["Absorption + Vulnerability conflict", [rule("absorption", 50), rule("vulnerability", 50, { key: "vulnerability", sortOrder: 1 })]],
  ["Immunity + multiple Absorptions", [rule("absorption", 50), rule("absorption", 100, { key: "absorption2", sortOrder: 1 }), rule("immunity", null, { key: "immunity", sortOrder: 2 })]],
];
for (const [label, downstream] of downstreamCases) test(`failed Magical Requirement prevents before ${label}`, () => {
  const value = input([...downstream, rule("requirement", null, { key: "gate", sortOrder: 9, conditions: [magic] })]);
  const result = resolveIncomingEffect(value);
  assertDecisivePrevention(result);
  assert.equal(result.matchedRules.length, downstream.length, "retain every downstream match without executing it");
  assert.ok(result.stages[2].entries.some(({ operation }) => operation === "skip-rule"));
});

test("one failed Requirement prevents despite another unknown Requirement", () => {
  const value = input([rule("requirement", null, { key: "silver", conditions: [silver] }), rule("requirement", null, { key: "magic", sortOrder: 1, conditions: [magic] })]);
  value.source.magical = null;
  const result = resolveIncomingEffect(value);
  assertDecisivePrevention(result);
  assert.deepEqual(result.ruleMatches.map(({ outcome }) => outcome), ["no-match", "unknown"]);
});

test("failed Requirement prevents before potential Absorption and Immunity matches", () => {
  const value = input([rule("requirement", null, { key: "gate", conditions: [silver] }), rule("absorption", 50, { key: "absorption", sortOrder: 1, conditions: [magic] }), rule("immunity", null, { key: "immunity", sortOrder: 2, conditions: [magic] })]);
  value.source.magical = null;
  const result = resolveIncomingEffect(value);
  assertDecisivePrevention(result);
  assert.deepEqual(result.ruleMatches.map(({ outcome }) => outcome), ["no-match", "unknown", "unknown"]);
});

for (const type of ["resistance", "vulnerability"] as const) {
  for (const outcome of ["match", "unknown"] as const) test(`matching Immunity prevents despite ${outcome} ${type}`, () => {
    const value = input([rule("immunity", null, { key: "immunity" }), rule(type, 50, { key: type, sortOrder: 1, conditions: [magic] })]);
    value.source.magical = outcome === "match" ? true : null;
    const result = resolveIncomingEffect(value);
    assertDecisivePrevention(result);
    assert.equal(result.ruleMatches.find(({ rule }) => rule.key === type)?.outcome, outcome);
    assert.ok(result.stages[2].entries.some(({ operation, sourceId }) => operation === "skip-rule" && sourceId === type));
  });
}

test("Immunity makes both outcomes of an unknown Requirement identical when Absorption cannot match", () => {
  const value = input([rule("requirement", null, { key: "gate", conditions: [magic] }), rule("immunity", null, { key: "immunity", sortOrder: 1 }), rule("absorption", 50, { key: "absorption", sortOrder: 2, conditions: [silver] })]);
  value.source.magical = null;
  const result = resolveIncomingEffect(value);
  assertDecisivePrevention(result);
  assert.deepEqual(result.ruleMatches.map(({ outcome }) => outcome), ["unknown", "match", "no-match"]);
});

test("unknown Requirement stays blocking when passing could permit Absorption healing", () => {
  const value = input([rule("requirement", null, { key: "gate", conditions: [magic] }), rule("absorption", 50, { key: "absorption", sortOrder: 1 })]);
  value.source.magical = null;
  const result = resolveIncomingEffect(value);
  assert.equal(result.status, "requires-god-ruling"); assert.equal(result.finalEffect, null);
  assert.ok(result.issues.some(({ code, sourceIds }) => code === "unknown-source-fact" && sourceIds.includes("gate")));
});

test("matching Immunity cannot override unknown Absorption that could create a conflict", () => {
  const value = input([rule("immunity", null, { key: "immunity" }), rule("absorption", 50, { key: "absorption", sortOrder: 1, conditions: [magic] })]);
  value.source.magical = null;
  const result = resolveIncomingEffect(value);
  assert.equal(result.status, "requires-god-ruling"); assert.equal(result.finalEffect, null);
  assert.ok(result.issues.some(({ code, sourceIds }) => code === "unknown-source-fact" && sourceIds.includes("absorption")));
  assert.match(result.explanation.join("\n"), /possible Absorption match could conflict with Immunity/);
  assert.equal(result.ruleMatches.find(({ rule }) => rule.key === "absorption")?.outcome, "unknown");
});

const earlierBlockers: Array<[string, (value: IncomingEffectInput) => void]> = [
  ["multiple-worn", (value) => { value.target.protection.worn = [worn(), { ...worn(5), ownershipKey: "stack:2" }]; }],
  ["worn-coverage", (value) => { value.target.protection.worn = [{ ...worn(), coveredLocationKeys: [] }]; }],
  ["worn-value", (value) => { value.target.protection.worn = [{ ...worn(), baseSoak: null }]; }],
  ["armor-damage-metadata", (value) => { value.target.protection.worn = [{ ...worn(), damageModifiersSourceText: "Fire +2" }]; }],
  ["hit-location-required", (value) => { value.target.protection.worn = [worn()]; value.hitLocationKey = null; }],
];
for (const [code, setup] of earlierBlockers) test(`failed Requirement preserves earlier ${code} blocker`, () => {
  const value = input([rule("requirement", null, { conditions: [silver] })]); setup(value);
  const result = resolveIncomingEffect(value);
  assert.equal(result.status, "requires-god-ruling"); assert.equal(result.finalEffect, null);
  assert.ok(result.issues.some((issue) => issue.stage === "worn" && issue.code === code));
  assert.equal(result.stages[2].status, "blocked");
  assert.equal(result.stages[2].entries.some(({ operation }) => operation === "prevent"), false);
});

test("failed Requirement cannot hide invalid source data or unknown harmfulness", () => {
  const value = input([rule("requirement", null, { conditions: [silver], scope: "mechanical-effect" })]);
  value.effect.amount = -1;
  assert.equal(resolveIncomingEffect(value).status, "invalid");
  value.source.mechanicalEffectKind = "condition.apply"; value.effect.amount = null;
  const result = resolveIncomingEffect(value);
  assert.equal(result.status, "requires-god-ruling"); assert.equal(result.finalEffect, null);
  assert.equal(result.issues[0].code, "unknown-harmfulness");
});
