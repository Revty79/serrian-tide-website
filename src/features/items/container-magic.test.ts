import assert from "node:assert/strict";
import test from "node:test";
import { calculateContainerPhysics, emptyContainerPhysicalProfile, normalizeContainerPhysicalProfile, resolveContainedElapsedTime, type ContainerPhysicalProfile, type PhysicalGraph, type PhysicalItem } from "./container-physics";
import { adjustSubstanceQuantity, emptyContainerSource } from "./container-rules";

const fixture = (rules: Partial<ContainerPhysicalProfile> = {}) => {
  const profile = { ...emptyContainerPhysicalProfile(), maxWeightLb: 5, volumeCapacityL: 5, ...rules };
  const definitions: PhysicalItem[] = [
    { itemId: 1, name: "Outer", weightLb: 3, volumeL: 2, longestDimensionCm: 10, container: profile },
    { itemId: 2, name: "Contents", weightLb: 10, volumeL: 10, longestDimensionCm: 20, category: "Food", recordType: "Item", physicalForm: "solid", isMagical: false, container: null },
  ];
  const graph: PhysicalGraph = { instances: [{ instanceId: 1, itemId: 1, containerInstanceId: null }], stacks: [{ itemId: 2, ownedQuantity: 1, looseQuantity: 0, allocations: [{ containerInstanceId: 1, quantity: 1 }] }] };
  return { definitions, graph, profile, calc: () => calculateContainerPhysics(graph, definitions), time: (elapsed = 100) => resolveContainedElapsedTime(graph, definitions, 1, elapsed, definitions[1]) };
};
for (const [weight, volume, problem] of [["unlimited", "normal", /volume capacity/], ["normal", "unlimited", /weight capacity/], ["unlimited", "unlimited", /^$/]] as const) {
  test(`independent ${weight} weight / ${volume} volume overrides only its own limit`, () => {
    const f = fixture({ weightCapacityMode: weight, volumeCapacityMode: volume });
    assert.match(f.calc().containers[0].problems.join(" "), problem);
    assert.equal(f.calc().containers[0].problems.length, weight === volume ? 0 : 1);
  });
}
test("weightless contents retain base weight, fixed behavior uses its explicit value even when empty", () => {
  const f = fixture({ containedWeightBehavior: "contents-weightless" }); assert.equal(f.calc().carriedWeight.known, 3);
  f.profile.containedWeightBehavior = "fixed"; f.profile.fixedLoadedWeightLb = 15; assert.equal(f.calc().carriedWeight.known, 15);
  f.graph.stacks = []; assert.equal(f.calc().carriedWeight.known, 15);
});
test("nested magical container contributes only resolved external weight and external volume", () => {
  const f = fixture({ maxWeightLb: 4, volumeCapacityL: 3 });
  f.definitions.push({ ...f.definitions[0], itemId: 3, name: "Inner", container: { ...emptyContainerPhysicalProfile(), weightCapacityMode: "unlimited", volumeCapacityMode: "unlimited", containedWeightBehavior: "contents-weightless" } });
  f.graph.instances.push({ instanceId: 3, itemId: 3, containerInstanceId: 1 }); f.graph.stacks[0].allocations[0].containerInstanceId = 3;
  const outer = f.calc().containers.find(row => row.instanceId === 1)!;
  assert.equal(outer.contentsWeight.known, 3); assert.equal(outer.usedVolume.known, 2); assert.deepEqual(outer.problems, []);
});
for (const restriction of ["any", "mundane-only", "magical-only"] as const) for (const magical of [false, true]) test(`${restriction} with isMagical=${magical}`, () => {
  const f = fixture({ magicalContentRestriction: restriction, weightCapacityMode: "unlimited", volumeCapacityMode: "unlimited" }); f.definitions[1].isMagical = magical;
  assert.equal(f.calc().containers[0].problems.length, restriction === "any" || (restriction === "magical-only") === magical ? 0 : 1);
});
test("unlimited capacity retains category, record type, liquid, dimension and nesting restrictions", () => {
  const f = fixture({ weightCapacityMode: "unlimited", volumeCapacityMode: "unlimited", allowedCategories: ["Other"], allowedRecordTypes: ["Other"], liquidOnly: true, maxItemDimensionCm: 1, allowsNestedContainers: false });
  f.definitions[1].container = emptyContainerPhysicalProfile(); const problems = f.calc().containers[0].problems.join(" ");
  for (const pattern of [/categories/, /record types/, /liquid-only/, /too long/, /nested containers/]) assert.match(problems, pattern);
});
for (const [mode, ratio, expected] of [["normal", null, 100], ["suspended", null, 0], ["slowed", 0.1, 10], ["accelerated", 10, 1000]] as const) test(`${mode} elapsed time`, () => {
  assert.equal(fixture({ timeBehavior: mode, timeMultiplier: ratio }).time().elapsed, expected);
});
test("ancestor time ratios multiply and an applicable suspension wins", () => {
  const f = fixture({ timeBehavior: "slowed", timeMultiplier: 0.1 });
  f.definitions.push({ ...f.definitions[0], itemId: 3, container: { ...emptyContainerPhysicalProfile(), timeBehavior: "accelerated", timeMultiplier: 20 } });
  f.graph.instances.push({ instanceId: 3, itemId: 3, containerInstanceId: 1 });
  assert.equal(resolveContainedElapsedTime(f.graph, f.definitions, 3, 100, {}).elapsed, 200);
  f.profile.timeBehavior = "suspended"; assert.equal(resolveContainedElapsedTime(f.graph, f.definitions, 3, 100, {}).elapsed, 0);
});
test("selective time uses explicit traits or exact category/type, never Item names", () => {
  const f = fixture({ timeBehavior: "suspended", timeAppliesTo: "perishables" }); assert.equal(f.time().elapsed, 0);
  f.definitions[1].category = "Weapon"; f.definitions[1].name = "Perishable food"; assert.equal(f.time().elapsed, 100);
  f.profile.timeAppliesTo = "living"; assert.equal(f.time().elapsed, 100);
  assert.equal(resolveContainedElapsedTime(f.graph, f.definitions, 1, 100, { living: true }).elapsed, 0);
  f.profile.timeAppliesTo = "categories-types"; f.profile.timeRecordTypes = ["item"]; assert.equal(f.time().elapsed, 0);
});
test("irrelevant unknown weight is ignored, but finite weight/volume/dimension still require data", () => {
  const f = fixture({ containedWeightBehavior: "contents-weightless", weightCapacityMode: "unlimited", volumeCapacityL: 20 }); f.definitions[1].weightLb = null;
  assert.deepEqual(f.calc().containers[0].problems, []); assert.deepEqual(f.calc().carriedWeight, { known: 3, unknown: [] });
  f.profile.weightCapacityMode = "normal"; assert.match(f.calc().containers[0].problems.join(" "), /weight data not authored/);
  f.profile.weightCapacityMode = "unlimited"; f.definitions[1].volumeL = null; assert.match(f.calc().containers[0].problems.join(" "), /volume data not authored/);
  f.profile.volumeCapacityMode = "unlimited"; f.profile.maxItemDimensionCm = 30; f.definitions[1].longestDimensionCm = null; assert.match(f.calc().containers[0].problems.join(" "), /dimension data not authored/);
});
test("loaded firearm assembly is calculated before magical external-weight suppression", () => {
  const f = fixture({ containedWeightBehavior: "contents-weightless", weightCapacityMode: "unlimited", volumeCapacityMode: "unlimited" });
  f.graph.stacks = []; f.graph.instances.push({ instanceId: 2, itemId: 2, containerInstanceId: 1 }, { instanceId: 3, itemId: 3, containerInstanceId: null });
  f.definitions.push({ ...f.definitions[1], itemId: 3, name: "Magazine", weightLb: 1 }, { ...f.definitions[1], itemId: 4, name: "Round", weightLb: 0.1 });
  const result = calculateContainerPhysics(f.graph, f.definitions, [{ instanceId: 3, ammunitionItemId: 4, rounds: 5 }], [{ weaponInstanceId: 2, magazineInstanceId: 3 }]);
  assert.equal(result.containers[0].contentsWeight.known, 11.5); assert.equal(result.carriedWeight.known, 3);
});
test("finite substance quantity uses authored density; missing density stays unknown", () => {
  const f = fixture({ maxWeightLb: 10, volumeCapacityL: 10, source: { ...emptyContainerSource(), maxQuantity: 2, substance: { ...emptyContainerSource().substance, id: "water", name: "Water", weightLbPerUnit: 2 } } }); f.graph.stacks = [];
  const bulk = [{ instanceId: 1, quantity: 1.3, substance: f.profile.source!.substance }];
  assert.equal(calculateContainerPhysics(f.graph, f.definitions, [], [], bulk).carriedWeight.known, 5.6);
  f.profile.source!.substance.weightLbPerUnit = null;
  assert.match(calculateContainerPhysics(f.graph, f.definitions, [], [], bulk).containers[0].problems.join(" "), /weight data not authored/);
});
test("infinite supply has explicit external weight and no quantity measurement", () => {
  const f = fixture({ containedWeightBehavior: "fixed", fixedLoadedWeightLb: 2, source: { ...emptyContainerSource(), mode: "infinite", substance: { ...emptyContainerSource().substance, id: "water", name: "Water" } } });
  f.graph.stacks = []; assert.deepEqual(f.calc().carriedWeight, { known: 2, unknown: [] });
  assert.equal(normalizeContainerPhysicalProfile(f.profile).source!.maxQuantity, null);
});
for (const invalid of [
  { containedWeightBehavior: "fixed" }, { timeBehavior: "slowed", timeMultiplier: 1 }, { timeBehavior: "accelerated", timeMultiplier: Infinity },
  { timeBehavior: "suspended", timeAppliesTo: "categories-types" }, { source: emptyContainerSource() },
  { source: { ...emptyContainerSource(), mode: "infinite", substance: { ...emptyContainerSource().substance, id: "water", name: "Water" } } },
] as Partial<ContainerPhysicalProfile>[]) test(`authoring rejects invalid rule ${JSON.stringify(invalid)}`, () => assert.throws(() => normalizeContainerPhysicalProfile({ ...emptyContainerPhysicalProfile(), ...invalid })));
test("old profiles gain normal defaults; null capacity never becomes unlimited", () => {
  const input = { classification: "generic", maxWeightLb: null, volumeCapacityL: null } as ContainerPhysicalProfile;
  const profile = normalizeContainerPhysicalProfile(input); assert.equal(profile.weightCapacityMode, "normal"); assert.equal(profile.timeBehavior, "normal"); assert.equal(profile.source, null);
});
test("decimal substance adjustments empty exactly and do not reject a full decimal maximum", () => {
  const remaining = adjustSubstanceQuantity(0.3, 0.1, "draw", null);
  assert.equal(adjustSubstanceQuantity(remaining, 0.2, "draw", null), 0);
  assert.equal(adjustSubstanceQuantity(0.1, 0.2, "add", 0.3), 0.3);
  assert.throws(() => adjustSubstanceQuantity(0.3, 0.31, "draw", null), /Not enough/);
});
test("substance precision does not erase tiny valid quantities or accept unrepresentable changes", () => {
  assert.equal(adjustSubstanceQuantity(1e-20, 5e-21, "draw", null), 5e-21);
  assert.throws(() => adjustSubstanceQuantity(1e20, 1, "add", 1e30), /precision/);
});
