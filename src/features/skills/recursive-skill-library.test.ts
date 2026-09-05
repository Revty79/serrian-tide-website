import assert from "node:assert/strict";
import test from "node:test";

import { getCalledCheckSkillPathAlternatives } from "@/features/tabletop-operations/called-check";
import { validateCanonicalSkillPath as validateWeaponSkillPath } from "@/features/items/weapon-skill-governance";

import {
  REVIEW_REQUIRED_ATTRIBUTE_KEY,
  buildRecursiveSkillLibrary,
  getRecursiveSkillChildren,
  getRecursiveSkillPath,
  previewSkillStructureChange,
  searchRecursiveSkillLibrary,
  validateCanonicalSkillPath,
  type CanonicalSkillParentRelationship,
  type RecursiveSkillDefinition,
} from "./recursive-skill-library";

function skill(
  id: number,
  name: string,
  primaryAttribute: string | null = null,
  tier: number | null = 1,
  secondaryAttribute: string | null = null,
): RecursiveSkillDefinition {
  return {
    id,
    name,
    classification: "standard",
    tier,
    primaryAttribute,
    secondaryAttribute,
  };
}

function parent(
  id: number,
  childId: number,
  parentId: number,
  sortOrder = 0,
): CanonicalSkillParentRelationship {
  return {
    id,
    skillId: childId,
    relatedSkillId: parentId,
    relationshipType: "parent",
    sortOrder,
  };
}

test("ordinary roots govern Attribute grouping while descendant metadata stays visible", () => {
  const library = buildRecursiveSkillLibrary(
    [skill(1, "Athletics", "STR"), skill(2, "Balance", "DEX", 2)],
    [parent(10, 2, 1)],
  );

  assert.deepEqual(library.attributeGroups.map(({ key }) => key), ["STR"]);
  assert.deepEqual(library.attributeGroups[0]?.rootSkillIds, [1]);
  const childPath = library.paths.find(({ endpointSkillId }) => endpointSkillId === 2);
  assert.equal(childPath?.effectiveAttribute, "STR");
  assert.deepEqual(childPath?.rootToEndpointIds, [1, 2]);
  assert.equal(library.skills.find(({ id }) => id === 2)?.primaryAttribute, "DEX");
  assert.ok(library.skills.find(({ id }) => id === 2)?.reviewReasons.some(({ code }) => code === "descendant-attribute-difference"));
});

test("Spellcraft and Talismanism remain INT while Faith remains WIS", () => {
  const library = buildRecursiveSkillLibrary([
    skill(1, "Spellcraft", "CHA"),
    skill(2, "Talismanism", null),
    skill(3, "Faith", "STR"),
  ], []);

  assert.deepEqual(
    library.roots.map(({ name, effectiveAttribute }) => [name, effectiveAttribute]),
    [["Faith", "WIS"], ["Spellcraft", "INT"], ["Talismanism", "INT"]],
  );
});

test("a missing ordinary root Attribute stays discoverable in Review Required", () => {
  const library = buildRecursiveSkillLibrary([skill(1, "Unknown Discipline")], []);
  assert.equal(library.roots[0]?.attributeGroupKey, REVIEW_REQUIRED_ATTRIBUTE_KEY);
  assert.equal(library.attributeGroups[0]?.label, "Review Required / Missing Attribute");
  assert.ok(library.reviewReasons.some(({ code }) => code === "missing-root-attribute"));
});

test("recursive traversal exceeds three levels and preserves authored child order", () => {
  const skills = [
    skill(1, "Root", "WIS", 1),
    skill(2, "Second", "WIS", 2),
    skill(3, "Third", "WIS", 3),
    skill(4, "Fourth", "WIS", 4),
    skill(5, "Fifth", "WIS", 5),
    skill(6, "Alphabetical First", "WIS", 2),
  ];
  const library = buildRecursiveSkillLibrary(skills, [
    parent(10, 2, 1, 8),
    parent(11, 6, 1, 2),
    parent(12, 3, 2),
    parent(13, 4, 3),
    parent(14, 5, 4),
  ]);

  assert.equal(library.maximumDepth, 5);
  const rootPath = getRecursiveSkillPath(library, [1]);
  assert.ok(rootPath);
  assert.deepEqual(getRecursiveSkillChildren(library, rootPath).map(({ endpointSkillId }) => endpointSkillId), [6, 2]);
  assert.deepEqual(getRecursiveSkillPath(library, [1, 2, 3, 4, 5])?.endpointToRootIds, [5, 4, 3, 2, 1]);
});

test("fallback ordering is deterministic when authored order ties", () => {
  const library = buildRecursiveSkillLibrary(
    [skill(1, "Root", "DEX"), skill(2, "Zulu", "DEX", 2), skill(3, "Alpha", "DEX", 2), skill(4, "Alpha", "DEX", 2)],
    [parent(10, 2, 1), parent(11, 4, 1), parent(12, 3, 1)],
  );
  const root = getRecursiveSkillPath(library, [1])!;
  assert.deepEqual(getRecursiveSkillChildren(library, root).map(({ endpointSkillId }) => endpointSkillId), [3, 4, 2]);
});

test("shared names never merge distinct Skill identities", () => {
  const library = buildRecursiveSkillLibrary(
    [skill(1, "Root A", "STR"), skill(2, "Root B", "DEX"), skill(3, "Focus", "STR", 2), skill(4, "Focus", "DEX", 2)],
    [parent(10, 3, 1), parent(11, 4, 2)],
  );
  assert.deepEqual(library.duplicateNames, [{ normalizedName: "focus", name: "Focus", skillIds: [3, 4] }]);
  const results = searchRecursiveSkillLibrary(library, "Focus");
  assert.deepEqual(results.map(({ skill }) => skill.id), [3, 4]);
  assert.notEqual(results[0]?.lineageLabel, results[1]?.lineageLabel);
});

test("duplicate identities, duplicate edges, and broken references produce structured review reasons", () => {
  const library = buildRecursiveSkillLibrary(
    [skill(1, "First", "STR"), skill(1, "Duplicate", "DEX"), skill(2, "Child", "STR", 2)],
    [parent(10, 2, 1), parent(11, 2, 1), parent(12, 2, 999), parent(13, 888, 1)],
  );
  assert.ok(library.reviewReasons.some(({ code }) => code === "duplicate-skill-identity"));
  assert.ok(library.reviewReasons.some(({ code }) => code === "duplicate-relationship"));
  assert.ok(library.reviewReasons.some(({ code }) => code === "broken-parent"));
  assert.ok(library.reviewReasons.some(({ code }) => code === "broken-child"));
  assert.equal(library.paths.filter(({ endpointSkillId }) => endpointSkillId === 2).length, 1);
});

test("genuinely different parents preserve every exact root-to-endpoint vector", () => {
  const library = buildRecursiveSkillLibrary(
    [skill(1, "Root A", "STR"), skill(2, "Root B", "DEX"), skill(3, "Shared", "WIS", 2)],
    [parent(10, 3, 1), parent(11, 3, 2)],
  );
  assert.deepEqual(
    library.paths.filter(({ endpointSkillId }) => endpointSkillId === 3).map(({ rootToEndpointIds }) => rootToEndpointIds),
    [[1, 3], [2, 3]],
  );
  assert.ok(library.skills.find(({ id }) => id === 3)?.reviewReasons.some(({ code }) => code === "multiple-parents"));
  assert.ok(library.skills.find(({ id }) => id === 3)?.reviewReasons.some(({ code }) => code === "conflicting-governing-roots"));
});

test("cycles remain visible in Review Required without unbounded traversal", () => {
  const library = buildRecursiveSkillLibrary(
    [skill(1, "Cycle A", "STR"), skill(2, "Cycle B", "STR", 2)],
    [parent(10, 1, 2), parent(11, 2, 1)],
  );
  assert.ok(library.reviewReasons.filter(({ code }) => code === "cycle").length >= 2);
  assert.ok(library.attributeGroups.some(({ key }) => key === REVIEW_REQUIRED_ATTRIBUTE_KEY));
  assert.ok(library.maximumDepth <= 2);
});

test("search returns an exact deep identity and breadcrumbs for its actual lineage", () => {
  const library = buildRecursiveSkillLibrary(
    [skill(1, "Root", "INT"), skill(2, "Branch", "INT", 2), skill(3, "Endpoint", "INT", 3)],
    [parent(10, 2, 1), parent(11, 3, 2)],
  );
  const [result] = searchRecursiveSkillLibrary(library, "#3");
  assert.equal(result?.skill.id, 3);
  assert.equal(result?.lineageLabel, "Root (#1) → Branch (#2) → Endpoint (#3)");
  assert.deepEqual(result?.path.rootToEndpointNames, ["Root", "Branch", "Endpoint"]);
});

test("root and child creation derive automatic placement from canonical relationships", () => {
  const emptyLibrary = buildRecursiveSkillLibrary([], []);
  const rootPreview = previewSkillStructureChange(emptyLibrary, {
    skillName: "Previewed Root",
    proposedParentIds: [],
    proposedSkill: skill(-1, "Previewed Root", "DEX"),
  });
  assert.equal(rootPreview.proposedPaths[0]?.attributeGroupKey, "DEX");

  const rootCreated = buildRecursiveSkillLibrary([skill(1, "Created Root", "CON")], []);
  assert.deepEqual(rootCreated.attributeGroups[0]?.rootSkillIds, [1]);

  const childCreated = buildRecursiveSkillLibrary(
    [skill(1, "Created Root", "CON"), skill(2, "Created Child", "DEX", 9)],
    [parent(10, 2, 1)],
  );
  assert.deepEqual(childCreated.attributeGroups[0]?.rootSkillIds, [1]);
  assert.deepEqual(getRecursiveSkillPath(childCreated, [1, 2])?.rootToEndpointIds, [1, 2]);
});

test("changing a governing root Attribute previews the moved group and requires confirmation", () => {
  const library = buildRecursiveSkillLibrary(
    [skill(1, "Root", "STR"), skill(2, "Child", "DEX", 2)],
    [parent(10, 2, 1)],
  );
  const preview = previewSkillStructureChange(library, {
    skillId: 1,
    skillName: "Root",
    proposedParentIds: [],
    proposedSkill: skill(1, "Root", "WIS"),
  });
  assert.equal(preview.oldPaths[0]?.attributeGroupKey, "STR");
  assert.equal(preview.proposedPaths[0]?.attributeGroupKey, "WIS");
  assert.deepEqual(preview.affectedSkillIds, [1, 2]);
  assert.equal(preview.requiresConfirmation, true);
});

test("reparent preview shows old and proposed paths, descendants, and confirmation", () => {
  const library = buildRecursiveSkillLibrary(
    [skill(1, "Old Root", "STR"), skill(2, "New Root", "DEX"), skill(3, "Branch", "STR", 2), skill(4, "Leaf", "STR", 3)],
    [parent(10, 3, 1), parent(11, 4, 3)],
  );
  const preview = previewSkillStructureChange(library, {
    skillId: 3,
    skillName: "Branch",
    proposedParentIds: [2],
  });
  assert.deepEqual(preview.oldPaths.map(({ rootToEndpointIds }) => rootToEndpointIds), [[1, 3]]);
  assert.deepEqual(preview.proposedPaths.map(({ rootToEndpointIds }) => rootToEndpointIds), [[2, 3]]);
  assert.deepEqual(preview.affectedSkillIds, [3, 4]);
  assert.equal(preview.requiresConfirmation, true);
});

test("cycle preview rejects making a Skill its own ancestor", () => {
  const library = buildRecursiveSkillLibrary(
    [skill(1, "Root", "STR"), skill(2, "Child", "STR", 2), skill(3, "Leaf", "STR", 3)],
    [parent(10, 2, 1), parent(11, 3, 2)],
  );
  const preview = previewSkillStructureChange(library, {
    skillId: 1,
    skillName: "Root",
    proposedParentIds: [3],
  });
  assert.ok(preview.validationErrors.some((message) => message.includes("cycle")));
});

test("Character Builder compatibility preserves exact recursive paths independent of tier labels", () => {
  const library = buildRecursiveSkillLibrary(
    [skill(10, "Root", "WIS", 8), skill(20, "Child", "DEX", null), skill(30, "Grandchild", "CON", 42)],
    [parent(1, 20, 10), parent(2, 30, 20)],
  );
  assert.deepEqual(getRecursiveSkillPath(library, [10, 20, 30])?.rootToEndpointIds, [10, 20, 30]);
  assert.deepEqual(library.skills.find(({ id }) => id === 30)?.parentIds, [20]);
});

test("weapon governance and Called Checks consume the same exact canonical traversal", () => {
  const skills = [skill(1, "Spellcraft", null), skill(2, "Sphere", "CHA", 9)];
  const relationships = [parent(10, 2, 1)];
  const shared = validateCanonicalSkillPath(2, skills, relationships);
  const weapon = validateWeaponSkillPath(2, skills, relationships);
  const called = getCalledCheckSkillPathAlternatives(2, skills.map((entry) => ({
    ...entry,
    definition: "",
    spellLevel: null,
    manaCost: null,
    spellDocumentJson: null,
  })), relationships);
  assert.deepEqual(weapon, shared);
  assert.deepEqual(called.map((path) => ({
    endpointSkillId: path.endpointSkillId,
    rootToEndpointIds: path.rootToEndpoint.map(({ id }) => id),
    fallbackAttribute: path.fallbackAttribute,
    problems: path.problems,
  })), [{
    endpointSkillId: shared.endpointSkillId,
    rootToEndpointIds: shared.rootToEndpoint.map(({ id }) => id),
    fallbackAttribute: shared.fallbackAttribute,
    problems: shared.problems,
  }]);
  assert.equal(shared.fallbackAttribute, "INT");
});

test("building the hierarchy is non-destructive to Race and allocation identity inputs", () => {
  const raceLinks = Object.freeze([{ raceId: 7, skillId: 2, linkType: "granted" }]);
  const allocations = Object.freeze([{ id: 50, skillId: 2, parentAllocationId: 40 }]);
  buildRecursiveSkillLibrary(
    [skill(1, "Root", "STR"), skill(2, "Child", "STR", 2)],
    [parent(10, 2, 1)],
  );
  assert.deepEqual(raceLinks, [{ raceId: 7, skillId: 2, linkType: "granted" }]);
  assert.deepEqual(allocations, [{ id: 50, skillId: 2, parentAllocationId: 40 }]);
});
