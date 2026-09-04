import assert from "node:assert/strict";
import test from "node:test";

import {
  selectApplicableCanonicalWeaponSkillPaths,
  validateCanonicalSkillPath,
  type CanonicalSkillDefinition,
  type CanonicalSkillParentRelationship,
  type CanonicalWeaponSkillOption,
} from "./weapon-skill-governance";

function skill(
  id: number,
  name: string,
  tier: number | null,
  primaryAttribute: string | null = "DEX",
  secondaryAttribute: string | null = null,
): CanonicalSkillDefinition {
  return { id, name, classification: "standard", tier, primaryAttribute, secondaryAttribute };
}

function parent(id: number, childId: number, parentId: number): CanonicalSkillParentRelationship {
  return { id, skillId: childId, relatedSkillId: parentId, relationshipType: "parent", sortOrder: 0 };
}

test("exact endpoint identity survives duplicate names and never crosses to a sibling", () => {
  const skills = [
    skill(1, "Precision Ranged", 1),
    skill(2, "Firearm Mastery", 2),
    skill(3, "Handgun Mastery", 3),
    skill(4, "Handgun Mastery", 3),
    skill(5, "Rifle Mastery", 3),
  ];
  const result = validateCanonicalSkillPath(3, skills, [
    parent(1, 2, 1),
    parent(2, 3, 2),
    parent(3, 4, 5),
    parent(4, 5, 2),
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.endpointSkillId, 3);
  assert.deepEqual(result.rootToEndpoint.map(({ id }) => id), [1, 2, 3]);
  assert.equal(result.rootToEndpoint.some(({ id }) => id === 5), false);
});

test("arbitrary-depth traversal follows authored relationships rather than tiers", () => {
  const skills = [
    skill(10, "Root", 8, "WIS"),
    skill(11, "Branch 1", 2, "WIS"),
    skill(12, "Branch 2", 99, "WIS"),
    skill(13, "Branch 3", 1, "WIS"),
    skill(14, "Branch 4", 5, "WIS"),
    skill(15, "Endpoint", 3, "WIS"),
  ];
  const result = validateCanonicalSkillPath(15, skills, [
    parent(1, 11, 10), parent(2, 12, 11), parent(3, 13, 12), parent(4, 14, 13), parent(5, 15, 14),
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.rootToEndpoint.map(({ id }) => id), [10, 11, 12, 13, 14, 15]);
  assert.deepEqual(result.endpointToRoot.map(({ id }) => id), [15, 14, 13, 12, 11, 10]);
  assert.equal(result.fallbackAttribute, "WIS");
});

test("fallback follows the exact root branch rule and ignores descendant Attribute differences", () => {
  const wis = validateCanonicalSkillPath(2, [skill(1, "Root", 1, "WIS"), skill(2, "Child", 2, "WIS")], [parent(1, 2, 1)]);
  assert.equal(wis.valid, true);
  assert.equal(wis.fallbackAttribute, "WIS");

  const missing = validateCanonicalSkillPath(2, [skill(1, "Root", 1, null), skill(2, "Child", 2, null)], [parent(1, 2, 1)]);
  assert.deepEqual(missing.problems.map(({ code }) => code), ["missing-attribute"]);

  const mixed = validateCanonicalSkillPath(2, [skill(1, "Root", 1, "STR"), skill(2, "Child", 2, "DEX", "CHR")], [parent(1, 2, 1)]);
  assert.equal(mixed.valid, true);
  assert.equal(mixed.fallbackAttribute, "STR");

  const specialBranches = [
    { name: "Spellcraft", rootAttribute: "WIS", expected: "INT" },
    { name: "Talismanism", rootAttribute: "DEX", expected: "INT" },
    { name: "Faith", rootAttribute: "INT", expected: "WIS" },
  ];
  for (const branch of specialBranches) {
    const result = validateCanonicalSkillPath(2, [
      skill(1, branch.name, 1, branch.rootAttribute, "CHR"),
      skill(2, "Sphere", 2, "CON", "DEX"),
    ], [parent(1, 2, 1)]);
    assert.equal(result.valid, true);
    assert.equal(result.fallbackAttribute, branch.expected);
  }
});

test("cycles, broken parents, and ambiguous parentage stop without guessing", () => {
  const skills = [skill(1, "One", 1), skill(2, "Two", 2), skill(3, "Three", 2)];
  const cycle = validateCanonicalSkillPath(2, skills, [parent(1, 2, 1), parent(2, 1, 2)]);
  assert.equal(cycle.problems[0]?.code, "cycle");

  const broken = validateCanonicalSkillPath(2, skills, [parent(1, 2, 99)]);
  assert.equal(broken.problems[0]?.code, "broken-parent");

  const ambiguous = validateCanonicalSkillPath(2, skills, [parent(1, 2, 1), parent(2, 2, 3)]);
  assert.equal(ambiguous.problems[0]?.code, "ambiguous-parent");
  assert.equal(ambiguous.rootToEndpoint.length, 1);
});

test("mode-approved options override defaults while unapproved modes inherit", () => {
  const validPath = validateCanonicalSkillPath(1, [skill(1, "Root", 1)], []);
  const option = (
    id: number,
    firingModeId: number | null,
    reviewState: CanonicalWeaponSkillOption["reviewState"],
  ): CanonicalWeaponSkillOption => ({
    id, firingModeId, endpointSkillId: 1, reviewState, sortOrder: 0, notes: "", path: validPath,
  });
  const weapon = { firingModeId: null, options: [option(1, null, "approved")] };
  const modes = [
    { firingModeId: 8, options: [option(2, 8, "review-required")] },
    { firingModeId: 9, options: [option(3, 9, "approved")] },
  ];
  assert.equal(selectApplicableCanonicalWeaponSkillPaths(weapon, modes, 8).source, "weapon-default");
  assert.equal(selectApplicableCanonicalWeaponSkillPaths(weapon, modes, 9).source, "firing-mode");
  assert.throws(() => selectApplicableCanonicalWeaponSkillPaths(weapon, modes, 99), /does not belong/);
});
