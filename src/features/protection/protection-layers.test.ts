import assert from "node:assert/strict";
import test from "node:test";
import { buildProtectionLayers, protectionAtLocation, type WornProtection } from "./protection-layers";

const snapshot = { core: { canonicalName: "Dragonkin" }, hitLocations: [
  { hitLocationNumber: 9, locationName: "Scales", naturalArmor: 3, soak: 2 },
  { hitLocationNumber: 0, locationName: "Head", naturalArmor: null, soak: null },
] };
const race = { id: 12, name: "Scaled folk", protections: [{ key: "hide", name: "Scaled Hide", naturalSoak: 1, coverage: { kind: "all" as const }, sortOrder: 0 },
  { key: "shell", name: "Shell", naturalSoak: 2, coverage: { kind: "locations" as const, locationKeys: ["8", "9"] }, sortOrder: 1 }] };
const worn: WornProtection = { ownershipKey: "stack:5", instanceId: null, itemId: 5, itemName: "Breastplate", activeQuantity: 1, baseSoak: 5,
  coverage: "Chest", coveredLocationKeys: ["9"], armorType: "Plate", rulesText: "Authored armor", damageModifiersSourceText: "Fire +2", damageModifiers: [{ id: 7, damageType: "Fire", modifier: "+2", modifierText: "Fire +2", notes: "Keep descriptive" }] };
const ward = { label: "Temporary Ward", channel: "soak", targetKey: "self", amount: 1, effectPlanEffectId: 44, sourceIdentity: { name: "Ward spell" }, duration: { kind: "scene" } };

test("direct Creature uses exact frozen anatomy, preserves values and has no worn layer", () => {
  const before = structuredClone(snapshot);
  const profile = buildProtectionLayers({ target: { kind: "encounter-participant", campaignId: 1, encounterId: 2, participantId: -1 }, creature: { snapshot, identity: "occurrence:1" } });
  const location = protectionAtLocation(profile, "9");
  assert.equal(location.natural[0].armor, 3); assert.equal(location.natural[0].soak, 2); assert.deepEqual(location.worn, []);
  assert.equal(location.natural[0].source.name, "Dragonkin"); assert.equal(profile.locations[0].name, "Scales");
  assert.deepEqual(snapshot, before);
});
test("Character Race natural protection remains separate from worn armor and respects coverage", () => {
  const unarmored = buildProtectionLayers({ target: { kind: "character", characterId: 1 }, race });
  assert.equal(unarmored.worn.length, 0); assert.equal(unarmored.natural.length, 2);
  const profile = buildProtectionLayers({ target: { kind: "character", characterId: 1 }, race, worn: [worn] });
  assert.equal(protectionAtLocation(profile, "9").worn[0].baseSoak, 5);
  assert.deepEqual(protectionAtLocation(profile, "9").natural.map(({ soak }) => soak), [1, 2]);
  assert.ok(profile.natural.every((entry) => !("armor" in entry)));
  assert.equal(protectionAtLocation(profile, "0").worn.length, 0); assert.equal(protectionAtLocation(profile, "0").natural.length, 1);
  assert.equal("armor" in profile, false); assert.equal("total" in profile, false);
  assert.deepEqual(profile.worn[0].damageModifiers, worn.damageModifiers);
});
test("Creature NPC has its snapshot protection and worn equipment simultaneously", () => {
  const profile = buildProtectionLayers({ target: { kind: "character", characterId: 3 }, creature: { snapshot: JSON.stringify(snapshot), identity: "npc:3" }, worn: [worn], modifiers: [ward] });
  const location = protectionAtLocation(profile, "9");
  assert.deepEqual([location.natural[0].armor, location.worn[0].baseSoak, location.temporary[0].amount], [3, 5, 1]);
  assert.equal(location.temporary[0].modifier.sourceIdentity && (location.temporary[0].modifier.sourceIdentity as { name: string }).name, "Ward spell");
});
test("temporary sources retain negative values, expiry, identity and unknown coverage without inference", () => {
  const profile = buildProtectionLayers({ target: { kind: "character", characterId: 1 }, modifiers: [ward, { ...ward, amount: -2, effectPlanEffectId: 45 },
    { ...ward, expiredAt: "2026-01-01" }, { ...ward, endedAt: "2026-01-01" }, { ...ward, channel: "damage" }, { ...ward, targetKey: "unknown" }] });
  assert.deepEqual(protectionAtLocation(profile, "9").temporary.map(({ amount }) => amount), [1, -2]);
  assert.equal(protectionAtLocation(profile, "9").unresolvedTemporary.length, 1);
  assert.equal(profile.temporary[0].id, "44");
});
test("old snapshots need no new profile; blank natural protection follows the established blank-as-none ruling", () => {
  const profile = buildProtectionLayers({ target: { kind: "character", characterId: 3 }, creature: { snapshot, identity: "npc:3" } });
  assert.deepEqual(protectionAtLocation(profile, "0").natural[0].authored, { naturalArmor: null, soak: null });
  assert.equal(protectionAtLocation(profile, "0").natural[0].armor, 0);
  const invalid = buildProtectionLayers({ target: profile.target, creature: { snapshot: { hitLocations: [{ hitLocationNumber: 0, naturalArmor: -1, soak: "unknown" }] }, identity: "old" } });
  assert.equal(invalid.natural[0].armor, null); assert.equal(invalid.issues.length, 1);
});
test("no Race or Race with no protection works; unknown locations and mixed anatomy are rejected", () => {
  for (const input of [{}, { race: { ...race, protections: [] } }]) {
    const profile = buildProtectionLayers({ target: { kind: "character", characterId: 2 }, ...input });
    assert.deepEqual(profile.natural, []); assert.equal(profile.locations.length, 10);
    assert.throws(() => protectionAtLocation(profile, "10"), /anatomy/);
  }
  assert.throws(() => buildProtectionLayers({ target: { kind: "character", characterId: 2 }, race, creature: { snapshot, identity: "npc" } }), /authoritative/);
});
