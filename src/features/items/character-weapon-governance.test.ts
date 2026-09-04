import assert from "node:assert/strict";
import test from "node:test";

import type { CharacterSkillReference } from "@/features/characters/models";
import { buildRollMechanicalSnapshot } from "@/features/tabletop-operations/roll-mechanical-snapshot";

import {
  resolveCharacterWeaponGovernance,
  type CharacterWeaponAllocation,
  type CharacterWeaponOneActionOverride,
  type PersistentCharacterWeaponOverride,
  type ResolveCharacterWeaponGovernanceInput,
} from "./character-weapon-governance";
import {
  validateCanonicalSkillPath,
  type CanonicalWeaponSkillOption,
} from "./weapon-skill-governance";
import type {
  WeaponSkillGovernanceReadModel,
  WeaponSkillGovernanceScopeView,
} from "./weapon-skill-governance-service";

const SKILLS: CharacterSkillReference[] = [
  skill(1, "Precision Ranged", 1, "DEX"),
  skill(2, "Firearm Mastery", 2, "DEX"),
  skill(3, "Handgun Mastery", 3, "DEX"),
  skill(4, "Rifle Mastery", 3, "DEX"),
  skill(5, "Focused Handgun Mastery", 4, "DEX"),
  skill(6, "Thrown Weapons", 1, "STR"),
  skill(7, "Spellcraft", 1, "WIS"),
  skill(8, "Flame Sphere", 2, "CHR"),
  skill(9, "Faith", 1, "DEX"),
  skill(10, "Mercy Sphere", 2, "CHR"),
  skill(11, "Handgun Mastery", 3, "DEX"),
];

const RELATIONSHIPS = [
  parent(2, 1, 1),
  parent(3, 2, 2),
  parent(4, 3, 2),
  parent(5, 4, 3),
  parent(8, 5, 7),
  parent(10, 6, 9),
];

function skill(
  id: number,
  name: string,
  tier: number,
  primaryAttribute: string | null,
): CharacterSkillReference {
  return {
    id,
    name,
    classification: "Skill",
    tier,
    primaryAttribute,
    secondaryAttribute: null,
    definition: "",
    spellLevel: null,
    manaCost: null,
    spellDocumentJson: null,
  };
}

function parent(skillId: number, id: number, relatedSkillId: number) {
  return { id, skillId, relatedSkillId, relationshipType: "parent", sortOrder: 0 };
}

function mapping(id: number, endpointSkillId: number, firingModeId: number | null = null): CanonicalWeaponSkillOption {
  return {
    id,
    firingModeId,
    endpointSkillId,
    reviewState: "approved",
    notes: "",
    sortOrder: id,
    path: validateCanonicalSkillPath(endpointSkillId, SKILLS, RELATIONSHIPS),
  };
}

function scope(
  options: readonly CanonicalWeaponSkillOption[],
  firingModeId: number | null = null,
  firingModeName: string | null = null,
): WeaponSkillGovernanceScopeView {
  return {
    firingModeId,
    firingModeName,
    status: options.length ? "approved" : "missing",
    options: options.map((entry) => ({
      ...entry,
      weaponProfileId: 20,
      endpointSkillName: SKILLS.find(({ id }) => id === entry.endpointSkillId)?.name ?? "Missing",
      updatedByUserId: "god",
      updatedByName: "G.O.D.",
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
    })),
    approvedOptions: options.map((entry) => ({
      ...entry,
      weaponProfileId: 20,
      endpointSkillName: SKILLS.find(({ id }) => id === entry.endpointSkillId)?.name ?? "Missing",
      updatedByUserId: "god",
      updatedByName: "G.O.D.",
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
    })),
    problems: [],
  };
}

function governance(
  defaults: readonly CanonicalWeaponSkillOption[],
  modeOptions: readonly CanonicalWeaponSkillOption[] = [],
): WeaponSkillGovernanceReadModel {
  const defaultScope = scope(defaults);
  const modeScope = scope(modeOptions, 30, "Explicit mode");
  return {
    itemId: 10,
    weaponCanonicalId: "ITEM-0010",
    weaponName: "Test weapon",
    weaponProfileId: 20,
    weaponDefault: defaultScope,
    modes: [{
      id: 30,
      name: "Explicit mode",
      sortOrder: 0,
      canonicalBehavior: modeOptions.length ? "mode-override" : "inherits-weapon-default",
      scope: modeScope,
      applicableApprovedOptions: (modeOptions.length ? modeScope : defaultScope).approvedOptions,
    }],
  };
}

function allocations(endpoint = true): CharacterWeaponAllocation[] {
  return [
    { id: 101, characterId: 50, skillId: 1, parentAllocationId: null, points: 20 },
    { id: 102, characterId: 50, skillId: 2, parentAllocationId: 101, points: 10 },
    ...(endpoint ? [{ id: 103, characterId: 50, skillId: 3, parentAllocationId: 102, points: 5 }] : []),
    { id: 104, characterId: 50, skillId: 4, parentAllocationId: 102, points: 40 },
    { id: 105, characterId: 50, skillId: 11, parentAllocationId: 102, points: 50 },
  ];
}

function input(overrides: Partial<ResolveCharacterWeaponGovernanceInput> = {}): ResolveCharacterWeaponGovernanceInput {
  return {
    context: {
      campaignId: 40,
      characterId: 50,
      isNpc: false,
      npcKind: "race",
      itemId: 10,
      weaponCanonicalId: "ITEM-0010",
      weaponName: "Test weapon",
      weaponProfileId: 20,
      firingModeId: null,
    },
    governance: governance([mapping(1, 3)]),
    attributes: { STR: 30, DEX: 50, CON: 25, INT: 40, WIS: 35, CHR: 20 },
    allocations: allocations(),
    skillCatalog: SKILLS,
    skillRelationships: RELATIONSHIPS,
    race: null,
    persistentOverride: null,
    oneActionOverride: null,
    ...overrides,
  };
}

function expectSuccess(result: ReturnType<typeof resolveCharacterWeaponGovernance>) {
  assert.notEqual(result.status, "needs-god-ruling");
  assert.notEqual(result.status, "override-invalid");
  if (result.status === "needs-god-ruling" || result.status === "override-invalid") {
    throw new Error("Expected successful resolution.");
  }
  return result;
}

test("exact lineage selects Handgun, never Rifle or a same-named different Skill ID", () => {
  const result = expectSuccess(resolveCharacterWeaponGovernance(input()));
  assert.equal(result.status, "resolved-normal");
  assert.equal(result.source.kind, "skill");
  if (result.source.kind !== "skill") return;
  assert.equal(result.source.allocationId, 103);
  assert.deepEqual(result.source.allocationPath.map(({ skillId }) => skillId), [1, 2, 3]);
  assert.equal(result.originalTarget, 10);
  assert.notEqual(result.source.allocationId, 104);
  assert.notEqual(result.source.skillId, 11);
});

test("deepest exact owned allocation falls upward without stacking alternatives", () => {
  const parent = expectSuccess(resolveCharacterWeaponGovernance(input({ allocations: allocations(false) })));
  assert.equal(parent.source.kind, "skill");
  if (parent.source.kind === "skill") {
    assert.equal(parent.source.allocationId, 102);
    assert.equal(parent.originalTarget, 15);
  }
  const root = expectSuccess(resolveCharacterWeaponGovernance(input({ allocations: allocations(false).slice(0, 1) })));
  assert.equal(root.source.kind, "skill");
  if (root.source.kind === "skill") assert.equal(root.source.allocationId, 101);
  const fallback = expectSuccess(resolveCharacterWeaponGovernance(input({ allocations: [] })));
  assert.equal(fallback.source.kind, "attribute");
  assert.equal(fallback.originalTarget, 50);
});

test("arbitrary depth uses a tier-four exact allocation", () => {
  const result = expectSuccess(resolveCharacterWeaponGovernance(input({
    governance: governance([mapping(2, 5)]),
    allocations: [
      ...allocations(),
      { id: 106, characterId: 50, skillId: 5, parentAllocationId: 103, points: 3 },
    ],
  })));
  assert.equal(result.source.kind, "skill");
  if (result.source.kind === "skill") {
    assert.equal(result.source.allocationId, 106);
    assert.deepEqual(result.source.allocationPath.map(({ skillId }) => skillId), [1, 2, 3, 5]);
    assert.equal(result.originalTarget, 7);
  }
});

test("uses existing calculated Skill target, not points, rank, or a second Attribute", () => {
  const result = expectSuccess(resolveCharacterWeaponGovernance(input()));
  assert.equal(result.source.kind, "skill");
  if (result.source.kind === "skill") {
    assert.equal(result.source.calculatedPercentage, 10);
    assert.notEqual(result.source.calculatedPercentage, 5);
    assert.notEqual(result.source.calculatedPercentage, 40);
    assert.notEqual(result.source.calculatedPercentage, -40);
  }
});

test("straight Attribute fallback is 100 minus the Pass 3 root fallback with no universal DEX", () => {
  const thrown = expectSuccess(resolveCharacterWeaponGovernance(input({
    governance: governance([mapping(3, 6)]),
    allocations: [],
  })));
  assert.equal(thrown.source.kind, "attribute");
  if (thrown.source.kind === "attribute") {
    assert.equal(thrown.source.attributeKey, "STR");
    assert.equal(thrown.originalTarget, 70);
  }
  const spellcraft = expectSuccess(resolveCharacterWeaponGovernance(input({
    governance: governance([mapping(4, 8)]),
    allocations: [],
  })));
  assert.equal(spellcraft.source.kind, "attribute");
  if (spellcraft.source.kind === "attribute") assert.equal(spellcraft.source.attributeKey, "INT");
  const faith = expectSuccess(resolveCharacterWeaponGovernance(input({
    governance: governance([mapping(5, 10)]),
    allocations: [],
  })));
  assert.equal(faith.source.kind, "attribute");
  if (faith.source.kind === "attribute") assert.equal(faith.source.attributeKey, "WIS");
});

test("same Skill ID on another allocation branch remains distinct and ambiguous exact duplicates require a ruling", () => {
  const siblingRoot = { id: 107, characterId: 50, skillId: 6, parentAllocationId: null, points: 50 };
  const wrongBranch = { id: 108, characterId: 50, skillId: 3, parentAllocationId: 107, points: 60 };
  const exact = expectSuccess(resolveCharacterWeaponGovernance(input({
    allocations: [...allocations(false), siblingRoot, wrongBranch],
  })));
  assert.equal(exact.source.kind, "skill");
  if (exact.source.kind === "skill") assert.equal(exact.source.allocationId, 102);

  const ambiguous = resolveCharacterWeaponGovernance(input({
    allocations: [
      { id: 201, characterId: 50, skillId: 1, parentAllocationId: null, points: 10 },
      { id: 202, characterId: 50, skillId: 1, parentAllocationId: null, points: 20 },
    ],
  }));
  assert.equal(ambiguous.status, "needs-god-ruling");
  if (ambiguous.status === "needs-god-ruling") {
    assert.equal(ambiguous.reason, "invalid-character-allocation-lineage");
  }
  const broken = resolveCharacterWeaponGovernance(input({
    allocations: [{ id: 203, characterId: 50, skillId: 3, parentAllocationId: 999, points: 10 }],
  }));
  assert.equal(broken.status, "needs-god-ruling");
  if (broken.status === "needs-god-ruling") {
    assert.equal(broken.reason, "invalid-character-allocation-lineage");
  }
});

test("all canonical paths remain visible, lowest target wins, and stable ties remain explicit", () => {
  const multi = expectSuccess(resolveCharacterWeaponGovernance(input({
    governance: governance([mapping(10, 3), mapping(11, 6)]),
    allocations: [...allocations(), { id: 109, characterId: 50, skillId: 6, parentAllocationId: null, points: 5 }],
  })));
  assert.equal(multi.normalResolution.status, "resolved");
  if (multi.normalResolution.status === "resolved") {
    assert.equal(multi.normalResolution.alternatives.length, 2);
    assert.equal(multi.normalResolution.selectedAlternative.canonicalMappingId, 10);
    assert.equal(multi.normalResolution.hasTie, false);
  }
  const tied = expectSuccess(resolveCharacterWeaponGovernance(input({
    governance: governance([mapping(12, 3), mapping(13, 3)]),
  })));
  assert.equal(tied.normalResolution.status, "resolved");
  if (tied.normalResolution.status === "resolved") {
    assert.equal(tied.normalResolution.selectedAlternative.canonicalMappingId, 12);
    assert.equal(tied.normalResolution.hasTie, true);
    assert.deepEqual(tied.normalResolution.tiedCanonicalMappingIds, [12, 13]);
  }
});

test("approved mode paths replace defaults and an empty mode inherits defaults", () => {
  const mode = expectSuccess(resolveCharacterWeaponGovernance(input({
    context: { ...input().context, firingModeId: 30 },
    governance: governance([mapping(20, 3)], [mapping(21, 6, 30)]),
  })));
  assert.equal(mode.canonicalMappingId, 21);
  const inherited = expectSuccess(resolveCharacterWeaponGovernance(input({
    context: { ...input().context, firingModeId: 30 },
    governance: governance([mapping(22, 3)]),
  })));
  assert.equal(inherited.canonicalMappingId, 22);
  const crossProfile = resolveCharacterWeaponGovernance(input({
    context: { ...input().context, firingModeId: 999 },
  }));
  assert.equal(crossProfile.status, "needs-god-ruling");
  assert.match(crossProfile.explanation, /firing mode/i);
});

test("missing and invalid canonical governance never guesses a Skill or Attribute", () => {
  const missing = resolveCharacterWeaponGovernance(input({ governance: governance([]) }));
  assert.equal(missing.status, "needs-god-ruling");
  if (missing.status === "needs-god-ruling") assert.equal(missing.reason, "missing-canonical-path");
  const invalidMapping = {
    ...mapping(30, 3),
    path: validateCanonicalSkillPath(999, SKILLS, RELATIONSHIPS),
  };
  const invalidGovernance = governance([invalidMapping]);
  const invalidScope = { ...invalidGovernance.weaponDefault, status: "invalid" as const };
  const invalid = resolveCharacterWeaponGovernance(input({
    governance: { ...invalidGovernance, weaponDefault: invalidScope },
  }));
  assert.equal(invalid.status, "needs-god-ruling");
  if (invalid.status === "needs-god-ruling") assert.equal(invalid.reason, "invalid-canonical-path");
});

function persistent(
  selection: PersistentCharacterWeaponOverride["selection"],
  firingModeId: number | null = null,
): PersistentCharacterWeaponOverride {
  return {
    id: 500,
    campaignId: 40,
    characterId: 50,
    itemId: 10,
    weaponProfileId: 20,
    firingModeId,
    selection,
    reason: "Campaign ruling",
    updatedByUserId: "god",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}

test("persistent exact Skill and Attribute overrides remain fixed while normal alternatives stay visible", () => {
  const skillOverride = expectSuccess(resolveCharacterWeaponGovernance(input({
    persistentOverride: persistent({ kind: "skill", allocationId: 101 }),
  })));
  assert.equal(skillOverride.status, "resolved-persistent-override");
  assert.equal(skillOverride.source.kind, "skill");
  if (skillOverride.source.kind === "skill") assert.equal(skillOverride.source.allocationId, 101);
  assert.equal(skillOverride.normalResolution.status, "resolved");

  const attributeOverride = expectSuccess(resolveCharacterWeaponGovernance(input({
    persistentOverride: persistent({ kind: "attribute", attributeKey: "STR" }),
  })));
  assert.equal(attributeOverride.source.kind, "attribute");
  assert.equal(attributeOverride.originalTarget, 70);
});

test("invalid persistent allocation is explicit and never silently falls back", () => {
  const invalid = resolveCharacterWeaponGovernance(input({
    persistentOverride: persistent({ kind: "skill", allocationId: 999 }),
  }));
  assert.equal(invalid.status, "override-invalid");
  assert.equal(invalid.normalResolution.status, "resolved");
  const noLongerOwned = resolveCharacterWeaponGovernance(input({
    allocations: allocations().map((entry) => entry.id === 101 ? { ...entry, points: 0 } : entry),
    persistentOverride: persistent({ kind: "skill", allocationId: 101 }),
  }));
  assert.equal(noLongerOwned.status, "override-invalid");
});

test("one-action override wins, requires a reason, and does not mutate persistent input", () => {
  const stored = persistent({ kind: "skill", allocationId: 101 });
  const oneAction: CharacterWeaponOneActionOverride = {
    kind: "manual",
    label: "Special table ruling",
    originalTarget: 37,
    reason: "This action has unusual footing.",
  };
  const result = expectSuccess(resolveCharacterWeaponGovernance(input({
    persistentOverride: stored,
    oneActionOverride: oneAction,
  })));
  assert.equal(result.status, "resolved-one-action-override");
  assert.equal(result.source.kind, "manual");
  assert.equal(result.originalTarget, 37);
  assert.deepEqual(stored.selection, { kind: "skill", allocationId: 101 });
  const invalid = resolveCharacterWeaponGovernance(input({
    oneActionOverride: { ...oneAction, reason: " " },
  }));
  assert.equal(invalid.status, "needs-god-ruling");
  if (invalid.status === "needs-god-ruling") assert.equal(invalid.reason, "invalid-one-action-override");
});

test("Race NPCs use Character rules while Creatures need an explicit manufactured-weapon ruling", () => {
  const raceNpc = expectSuccess(resolveCharacterWeaponGovernance(input({
    context: { ...input().context, isNpc: true, npcKind: "race" },
  })));
  assert.equal(raceNpc.status, "resolved-normal");
  const creature = resolveCharacterWeaponGovernance(input({
    context: { ...input().context, isNpc: true, npcKind: "creature" },
    allocations: [],
  }));
  assert.equal(creature.status, "needs-god-ruling");
  if (creature.status === "needs-god-ruling") {
    assert.equal(creature.reason, "unsupported-creature-governance");
  }
  const explicit = expectSuccess(resolveCharacterWeaponGovernance(input({
    context: { ...input().context, isNpc: true, npcKind: "creature" },
    allocations: [],
    oneActionOverride: {
      kind: "manual",
      label: "Manufactured weapon ruling",
      originalTarget: 44,
      reason: "Explicit Creature weapon ruling.",
    },
  })));
  assert.equal(explicit.status, "resolved-one-action-override");
});

test("resolver output creates a Pass 2 snapshot without losing exact allocation identity", () => {
  const result = expectSuccess(resolveCharacterWeaponGovernance(input()));
  const snapshot = buildRollMechanicalSnapshot(
    result.rollGoverningSourceSnapshot,
    50,
    [],
    "original-roll",
  );
  assert.equal(snapshot.governingSource.kind, "skill");
  if (snapshot.governingSource.kind === "skill") {
    assert.equal(snapshot.governingSource.allocationId, 103);
    assert.deepEqual(snapshot.governingSource.skillPath.map(({ allocationId }) => allocationId), [101, 102, 103]);
    assert.equal(snapshot.governingSource.calculatedPercentage, 10);
  }
});
