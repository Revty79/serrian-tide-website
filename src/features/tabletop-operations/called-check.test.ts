import assert from "node:assert/strict";
import test from "node:test";

import type { CharacterSkillReference } from "@/features/characters/models";
import type { CharacterSkillLineageInput } from "@/features/items/character-weapon-governance";

import {
  evaluateCalledCheck,
  getCalledCheckSkillPathAlternatives,
  resolveCalledCheckSource,
  resolveHighLow,
  summarizeCalledCheckBatch,
} from "./called-check";

function skill(id: number, name: string, tier: number, primaryAttribute: string | null): CharacterSkillReference {
  return { id, name, tier, primaryAttribute, secondaryAttribute: null, classification: "Skill", definition: "", spellLevel: null, manaCost: null, spellDocumentJson: null };
}

const skills = [
  skill(1, "Precision Ranged", 1, "DEX"),
  skill(2, "Firearm Mastery", 2, "DEX"),
  skill(3, "Handgun Mastery", 3, "DEX"),
  skill(4, "Rifle Mastery", 3, "DEX"),
  skill(5, "Handgun Mastery", 3, "DEX"),
  skill(6, "Spellcraft", 1, "WIS"),
  skill(7, "Flame Sphere", 2, "CHR"),
  skill(8, "Talismanism", 1, "CHR"),
  skill(9, "Inscription", 2, "STR"),
  skill(10, "Faith", 1, "DEX"),
  skill(11, "Mercy Sphere", 2, "CHR"),
  skill(12, "Awareness", 1, null),
  skill(13, "Notice Fine Detail", 2, "DEX"),
  skill(14, "Ambiguous Technique", 3, "DEX"),
];

const relationships = [
  { skillId: 2, relatedSkillId: 1, relationshipType: "parent", sortOrder: 0 },
  { skillId: 3, relatedSkillId: 2, relationshipType: "parent", sortOrder: 0 },
  { skillId: 4, relatedSkillId: 2, relationshipType: "parent", sortOrder: 1 },
  { skillId: 5, relatedSkillId: 2, relationshipType: "parent", sortOrder: 2 },
  { skillId: 7, relatedSkillId: 6, relationshipType: "parent", sortOrder: 0 },
  { skillId: 9, relatedSkillId: 8, relationshipType: "parent", sortOrder: 0 },
  { skillId: 11, relatedSkillId: 10, relationshipType: "parent", sortOrder: 0 },
  { skillId: 13, relatedSkillId: 12, relationshipType: "parent", sortOrder: 0 },
  { skillId: 14, relatedSkillId: 3, relationshipType: "parent", sortOrder: 0 },
  { skillId: 14, relatedSkillId: 4, relationshipType: "parent", sortOrder: 1 },
];

function lineage(overrides: Partial<CharacterSkillLineageInput> = {}): CharacterSkillLineageInput {
  return {
    context: { characterId: 50, npcKind: "race" },
    attributes: { STR: 30, DEX: 40, CON: 25, INT: 35, WIS: 45, CHR: 20 },
    allocations: [
      { id: 101, characterId: 50, skillId: 1, parentAllocationId: null, points: 20 },
      { id: 102, characterId: 50, skillId: 2, parentAllocationId: 101, points: 10 },
      { id: 103, characterId: 50, skillId: 3, parentAllocationId: 102, points: 5 },
      { id: 104, characterId: 50, skillId: 4, parentAllocationId: 102, points: 60 },
      { id: 105, characterId: 50, skillId: 5, parentAllocationId: 102, points: 80 },
    ],
    skillCatalog: skills,
    skillRelationships: relationships,
    race: null,
    ...overrides,
  };
}

function resolved(value: ReturnType<typeof resolveCalledCheckSource>) {
  if (value.status !== "resolved") throw new Error(value.explanation);
  assert.equal(value.status, "resolved");
  return value;
}

test("Attribute Called Checks freeze the straight 100 minus Attribute target", () => {
  const result = resolved(resolveCalledCheckSource(lineage(), { kind: "attribute", attributeKey: "STR" }));
  assert.equal(result.source.kind, "attribute");
  assert.equal(result.originalTarget, 70);
  assert.equal(result.finalTarget, 70);
  assert.equal(result.governingSnapshot.kind, "attribute");
});

test("missing Attributes require a structured ruling and never guess another key", () => {
  const result = resolveCalledCheckSource(lineage({ attributes: { DEX: 40 } }), { kind: "attribute", attributeKey: "WIS" });
  assert.equal(result.status, "requires-god-ruling");
  if (result.status === "requires-god-ruling") assert.equal(result.reason, "missing-character-source");
});

test("exact Skill allocation ancestry chooses the deepest endpoint and never a sibling or duplicate name", () => {
  const result = resolved(resolveCalledCheckSource(lineage(), { kind: "skill", endpointSkillId: 3, rootToEndpointSkillIds: [1, 2, 3] }));
  assert.equal(result.source.kind, "skill");
  if (result.source.kind === "skill") {
    assert.equal(result.source.allocationId, 103);
    assert.deepEqual(result.source.allocationPath.map(({ skillId }) => skillId), [1, 2, 3]);
    assert.notEqual(result.source.allocationId, 104);
    assert.notEqual(result.source.allocationId, 105);
  }
});

test("an absent descendant falls to its exact owned parent and then exact root", () => {
  const parent = resolved(resolveCalledCheckSource(lineage({ allocations: lineage().allocations.slice(0, 2) }), { kind: "skill", endpointSkillId: 3, rootToEndpointSkillIds: [1, 2, 3] }));
  assert.equal(parent.source.kind, "skill");
  if (parent.source.kind === "skill") assert.equal(parent.source.allocationId, 102);
  const root = resolved(resolveCalledCheckSource(lineage({ allocations: lineage().allocations.slice(0, 1) }), { kind: "skill", endpointSkillId: 3, rootToEndpointSkillIds: [1, 2, 3] }));
  assert.equal(root.source.kind, "skill");
  if (root.source.kind === "skill") assert.equal(root.source.allocationId, 101);
});

test("a missing exact Skill lineage falls to its authored root Attribute", () => {
  const result = resolved(resolveCalledCheckSource(lineage({ allocations: [] }), { kind: "skill", endpointSkillId: 3, rootToEndpointSkillIds: [1, 2, 3] }));
  assert.equal(result.source.kind, "attribute");
  if (result.source.kind === "attribute") {
    assert.equal(result.source.attributeKey, "DEX");
    assert.equal(result.originalTarget, 60);
  }
});

test("Spellcraft and Talismanism use INT while Faith uses WIS despite descendant metadata", () => {
  const cases = [
    { endpointSkillId: 7, path: [6, 7], attribute: "INT" },
    { endpointSkillId: 9, path: [8, 9], attribute: "INT" },
    { endpointSkillId: 11, path: [10, 11], attribute: "WIS" },
  ] as const;
  for (const expected of cases) {
    const result = resolved(resolveCalledCheckSource(lineage({ allocations: [] }), { kind: "skill", endpointSkillId: expected.endpointSkillId, rootToEndpointSkillIds: expected.path }));
    assert.equal(result.source.kind, "attribute");
    if (result.source.kind === "attribute") assert.equal(result.source.attributeKey, expected.attribute);
  }
});

test("Awareness and its exact descendant fall to straight WIS when no allocation is owned", () => {
  const awareness = resolved(resolveCalledCheckSource(lineage({ allocations: [] }), { kind: "skill", endpointSkillId: 12, rootToEndpointSkillIds: [12] }));
  const descendant = resolved(resolveCalledCheckSource(lineage({ allocations: [] }), { kind: "skill", endpointSkillId: 13, rootToEndpointSkillIds: [12, 13] }));
  for (const result of [awareness, descendant]) {
    assert.equal(result.source.kind, "attribute");
    if (result.source.kind === "attribute") assert.equal(result.source.attributeKey, "WIS");
    assert.equal(result.originalTarget, 55);
  }
});

test("broad ambiguous Skill ancestry exposes exact alternatives and requires selection", () => {
  const alternatives = getCalledCheckSkillPathAlternatives(14, skills, relationships);
  assert.equal(alternatives.filter(({ valid }) => valid).length, 2);
  assert.deepEqual(alternatives.map(({ rootToEndpoint }) => rootToEndpoint.map(({ id }) => id)), [[1, 2, 3, 14], [1, 2, 4, 14]]);
  const unresolved = resolveCalledCheckSource(lineage(), { kind: "skill", endpointSkillId: 14, rootToEndpointSkillIds: [] });
  assert.equal(unresolved.status, "requires-god-ruling");
  if (unresolved.status === "requires-god-ruling") assert.equal(unresolved.reason, "ambiguous-skill-path");
});

test("selected ambiguous branch is exact and cannot substitute the other branch", () => {
  const result = resolved(resolveCalledCheckSource(lineage(), { kind: "skill", endpointSkillId: 14, rootToEndpointSkillIds: [1, 2, 3, 14] }));
  assert.equal(result.source.kind, "skill");
  if (result.source.kind === "skill") assert.equal(result.source.allocationId, 103);
});

test("named modifiers preserve original/final targets and shared percentile evaluation", () => {
  const modifiers = [
    { kind: "bonus" as const, label: "Prepared", magnitude: 10 },
    { kind: "penalty" as const, label: "Rain", magnitude: 5 },
  ];
  const source = resolved(resolveCalledCheckSource(lineage(), { kind: "attribute", attributeKey: "STR" }, modifiers));
  assert.equal(source.originalTarget, 70);
  assert.equal(source.finalTarget, 65);
  const result = evaluateCalledCheck(source, 75);
  assert.equal(result.succeeded, true);
  assert.equal(result.totalSuccesses, 2);
  assert.deepEqual(result.modifiers, modifiers);
});

test("Called Check criticals retain the shared ruling boundary and apply no consequences", () => {
  const source = resolved(resolveCalledCheckSource(lineage(), { kind: "attribute", attributeKey: "STR" }));
  const one = evaluateCalledCheck(source, 1);
  const hundred = evaluateCalledCheck(source, 100);
  assert.equal(one.criticalFailure, true);
  assert.equal(one.requiresGodRuling, true);
  assert.equal(hundred.doubleOtt, true);
  assert.equal(hundred.requiresGodRuling, true);
  for (const result of [one, hundred]) {
    assert.equal("damage" in result, false);
    assert.equal("initiative" in result, false);
    assert.equal("condition" in result, false);
    assert.equal("narrativeConsequence" in result, false);
  }
});

test("High/Low boundaries report side without normal percentile success counts", () => {
  for (const result of [1, 25, 50]) assert.equal(resolveHighLow(result, null).rolledSide, "low");
  for (const result of [51, 75, 100]) assert.equal(resolveHighLow(result, null).rolledSide, "high");
  const neutral = resolveHighLow(74, null);
  assert.equal(neutral.calledSide, null);
  assert.equal(neutral.matchedCall, null);
  assert.equal("totalSuccesses" in neutral, false);
});

test("High/Low match and mismatch use the locked call", () => {
  assert.equal(resolveHighLow(50, "low").matchedCall, true);
  assert.equal(resolveHighLow(51, "low").matchedCall, false);
  assert.equal(resolveHighLow(99, "high").matchedCall, true);
});

test("High/Low preserves 01 and 100 critical facts and calls for G.O.D. interpretation", () => {
  const one = resolveHighLow(1, "low");
  assert.equal(one.rolledSide, "low");
  assert.equal(one.matchedCall, true);
  assert.equal(one.criticalFailure, true);
  assert.equal(one.requiresGodRuling, true);
  assert.ok(one.rulingReasons.includes("called-side-critical-interaction"));
  const hundred = resolveHighLow(100, "high");
  assert.equal(hundred.rolledSide, "high");
  assert.equal(hundred.matchedCall, true);
  assert.equal(hundred.criticalSuccess, true);
  assert.equal(hundred.doubleOtt, true);
  assert.equal(hundred.requiresGodRuling, true);
});

test("batch summaries remain individual and never manufacture a collective result", () => {
  const summary = summarizeCalledCheckBatch(["pending", "resolved", "requires-god-ruling", "cancelled", "superseded"]);
  assert.deepEqual(summary, { total: 5, pending: 1, resolved: 1, requiresGodRuling: 1, cancelled: 1, rerolled: 1, complete: false });
  assert.equal("collectiveOutcome" in summary, false);
});

test("direct negative Creature participant identities never enter Character resolution", () => {
  const result = resolveCalledCheckSource(lineage({ context: { characterId: -8, npcKind: "creature" } }), { kind: "attribute", attributeKey: "STR" });
  assert.equal(result.status, "requires-god-ruling");
  if (result.status === "requires-god-ruling") assert.equal(result.reason, "unsupported-creature-source");
});
