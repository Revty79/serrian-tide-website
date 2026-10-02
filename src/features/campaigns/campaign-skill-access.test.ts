import assert from "node:assert/strict";
import test from "node:test";
import { buildRecursiveSkillLibrary, type RecursiveSkillDefinition } from "@/features/skills/recursive-skill-library";
import { allocationSkillPath, assertCampaignSkillAllocationChanges, createCampaignSkillAccess, validateCampaignSkillExclusions, type SkillPathAllocation } from "./campaign-skill-access";

const systems = ["Tier 1", "Tier 2", "Tier 3", "Spellcraft", "Talismanism", "Faith", "Psyonics", "Bardic Resonance", "Special Abilities"] as const;
const node = (id: number, name = `Skill ${id}`, tier: number | null = id): RecursiveSkillDefinition => ({ id, name, tier, classification: "standard", primaryAttribute: "INT", secondaryAttribute: null });
const edge = (skillId: number, relatedSkillId: number, id = skillId) => ({ id, skillId, relatedSkillId, relationshipType: "parent", sortOrder: 0 });
const library = buildRecursiveSkillLibrary([1, 2, 3, 4, 5, 6].map(id => node(id)), [edge(2, 1), edge(3, 2), edge(4, 3), edge(5, 4), edge(6, 1)]);
const chain: SkillPathAllocation[] = [1, 2, 3, 4, 5].map(id => ({ id: id * 10, skillId: id, parentAllocationId: id === 1 ? null : (id - 1) * 10, points: 25 }));

test("five-level paths have no structural tier ceiling and reconstruct allocation ancestry", () => {
  assert.equal(library.maximumDepth, 5);
  const access = createCampaignSkillAccess(library, systems);
  assert.equal(access.resolve("1>2>3>4>5").allowed, true);
  assert.deepEqual(allocationSkillPath(50, chain), [1, 2, 3, 4, 5]);
  assert.doesNotThrow(() => assertCampaignSkillAllocationChanges(access, [], chain));
  assert.throws(() => assertCampaignSkillAllocationChanges(access, [], [{ ...chain[1], parentAllocationId: null }]), /path/);
});

test("cycles, missing parents, duplicate identities and forged paths fail closed", () => {
  const cyclic = buildRecursiveSkillLibrary([node(1), node(2)], [edge(2, 1), edge(1, 2)]);
  assert.equal(createCampaignSkillAccess(cyclic, systems).resolve("1>2>1").allowed, false);
  assert.equal(allocationSkillPath(10, [{ ...chain[0], parentAllocationId: 20 }, chain[1]]), null);
  assert.equal(allocationSkillPath(10, [{ ...chain[0], parentAllocationId: 999 }]), null);
  assert.equal(createCampaignSkillAccess(library, systems).resolve("1>5").allowed, false);
  assert.throws(() => validateCampaignSkillExclusions(library, [{ skillId: 4, pathKey: "1>2" }]), /invalid/);
  assert.throws(() => assertCampaignSkillAllocationChanges(createCampaignSkillAccess(library, systems), chain, [...chain, chain[0]]), /Duplicate/);
});

test("ancestor cascade preserves explicit children, siblings, and future defaults", () => {
  const child = { skillId: 4, pathKey: "1>2>3>4" };
  const parent = { skillId: 2, pathKey: "1>2" };
  const exclusions = validateCampaignSkillExclusions(library, [child, parent]);
  const off = createCampaignSkillAccess(library, systems, exclusions);
  assert.equal(off.resolve("1>2>3>4>5").blockedPathKey, "1>2");
  assert.equal(off.resolve("1>6").allowed, true);
  const on = createCampaignSkillAccess(library, systems, exclusions.filter(row => row !== exclusions[1]));
  assert.equal(on.resolve("1>2>3").allowed, true);
  assert.equal(on.resolve("1>2>3>4>5").blockedPathKey, child.pathKey);
  const expanded = buildRecursiveSkillLibrary([...library.skills, node(7)], [...library.relationships, edge(7, 6)]);
  assert.equal(createCampaignSkillAccess(expanded, systems, exclusions).resolve("1>6>7").allowed, true);
  assert.equal(createCampaignSkillAccess(library, systems).resolve(child.pathKey).allowed, true, "another Campaign is independent");
  assert.deepEqual(exclusions, [child, parent], "cascade never materializes descendants");
});

test("shared Sphere availability follows Spellcraft, Talismanism and Faith paths independently", () => {
  const shared = buildRecursiveSkillLibrary([node(1, "Spellcraft", 1), node(2, "Talismanism", 1), node(3, "Faith", 1), { ...node(4, "Life", 2), classification: "sphere" }], [edge(4, 1, 1), edge(4, 2, 2), edge(4, 3, 3)]);
  const access = createCampaignSkillAccess(shared, ["Tier 1", "Talismanism", "Faith"], [{ skillId: 4, pathKey: "2>4" }]);
  assert.equal(access.resolve("1>4").kind, "system");
  assert.equal(access.resolve("2>4").kind, "exclusion");
  assert.equal(access.resolve("3>4").allowed, true);
  assert.equal(access.canGrant(4), true);
  const allocations = [{ id: 10, skillId: 1, parentAllocationId: null, points: 1 }, { id: 20, skillId: 3, parentAllocationId: null, points: 1 }];
  assert.throws(() => assertCampaignSkillAllocationChanges(access, allocations, [...allocations, { id: -1, skillId: 4, parentAllocationId: 10, points: 1 }]), /systems/);
  assert.doesNotThrow(() => assertCampaignSkillAllocationChanges(access, allocations, [...allocations, { id: -1, skillId: 4, parentAllocationId: 20, points: 1 }]));
});

test("support names use exact legitimate systems and checked paths never override systems", () => {
  for (const [name, enabled] of [["Channeling", "Talismanism"], ["Meditation", "Spellcraft"], ["Prayer", "Faith"], ["Devotion", "Faith"], ["Psionic Focus", "Psyonics"], ["Psionic Meditation", "Psyonics"], ["Psionic Channeling", "Psyonics"], ["Resonant Performance", "Bardic Resonance"], ["Resonance Attunement", "Bardic Resonance"], ["Harmonic Awareness", "Bardic Resonance"]] as const) {
    const support = buildRecursiveSkillLibrary([node(1, name)], []);
    assert.equal(createCampaignSkillAccess(support, ["Tier 1"]).resolve("1").kind, "system", name);
    assert.equal(createCampaignSkillAccess(support, ["Tier 1", enabled]).resolve("1").allowed, true, name);
  }
  const access = createCampaignSkillAccess(library, ["Tier 1"], [{ skillId: 2, pathKey: "1>2" }]);
  assert.equal(access.resolve("1>2").kind, "exclusion", "starting Tier permissions do not disable deeper branch exclusions");
  assert.equal(createCampaignSkillAccess(library, ["Tier 1"]).resolve("1>2>3").allowed, true);
});

test("historical allocations are retained but frozen against new investment, removal and refund", () => {
  const access = createCampaignSkillAccess(library, systems, [{ skillId: 2, pathKey: "1>2" }]);
  const original = structuredClone(chain);
  assert.doesNotThrow(() => assertCampaignSkillAllocationChanges(access, chain, chain));
  assert.throws(() => assertCampaignSkillAllocationChanges(access, chain, chain.slice(0, -1)), /preserved/);
  for (const points of [0, 26]) assert.throws(() => assertCampaignSkillAllocationChanges(access, chain, chain.map(row => row.id === 50 ? { ...row, points } : row)), /preserved/);
  assert.deepEqual(chain, original);
});
