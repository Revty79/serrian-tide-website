import assert from "node:assert/strict";
import test from "node:test";
import { calculateContainerPhysics, emptyContainerPhysicalProfile, normalizeContainerPhysicalProfile, weightInLb, type PhysicalGraph, type PhysicalItem } from "./container-physics";

const model = (itemId: number, name: string, weightLb: number | null, volumeL: number | null, container = false): PhysicalItem => ({ itemId, name, weightLb, volumeL, longestDimensionCm: 10,
  container: container ? { ...emptyContainerPhysicalProfile(), maxWeightLb: 30, volumeCapacityL: 35, maxItemDimensionCm: 50 } : null });
const definitions = [model(1, "Backpack", 3, 10, true), model(2, "Pouch", 2, 3, true), model(3, "Supplies", 1, 0.5)];
const graph: PhysicalGraph = { instances: [{ instanceId: 12, itemId: 1, containerInstanceId: null }, { instanceId: 18, itemId: 2, containerInstanceId: 12 }],
  stacks: [{ itemId: 3, ownedQuantity: 10, looseQuantity: 2, allocations: [{ containerInstanceId: 12, quantity: 5 }, { containerInstanceId: 18, quantity: 3 }] }] };

test("nested weight includes empty child weight and all contents exactly once", () => {
  const physics = calculateContainerPhysics(graph, definitions), backpack = physics.containers.find(row => row.instanceId === 12)!;
  assert.deepEqual(backpack.contentsWeight, { known: 10, unknown: [] });
  assert.equal(backpack.loadedWeight.known, 13);
  assert.equal(physics.carriedWeight.known, 15);
  assert.equal(backpack.remainingWeightLb, 20);
});
test("parent volume counts the child exterior, not its contents", () => {
  const physics = calculateContainerPhysics(graph, definitions);
  assert.equal(physics.containers.find(row => row.instanceId === 12)!.usedVolume.known, 5.5);
  assert.equal(physics.containers.find(row => row.instanceId === 18)!.usedVolume.known, 1.5);
  assert.equal(physics.containers.find(row => row.instanceId === 12)!.remainingVolumeL, 29.5);
});
test("partial allocations count only the quantity at each location", () => {
  const input = structuredClone(graph); input.stacks[0].allocations[0].quantity = 2; input.stacks[0].looseQuantity = 5;
  const physics = calculateContainerPhysics(input, definitions);
  assert.equal(physics.containers.find(row => row.instanceId === 12)!.contentsWeight.known, 7);
  assert.equal(physics.carriedWeight.known, 15);
});
for (const [field, value, message] of [["maxWeightLb", 9, /weight capacity/], ["volumeCapacityL", 5, /volume capacity/], ["maxItemDimensionCm", 9, /too long/]] as const) {
  test(`${field} produces a readable failure naming the offending container`, () => {
    const models = structuredClone(definitions); models[0].container![field] = value;
    const load = calculateContainerPhysics(graph, models).containers.find(row => row.instanceId === 12)!;
    assert.match(load.problems.join(" "), message); assert.match(load.problems.join(" "), /Backpack #12/);
  });
}
test("unknown measurements remain unknown, including zero numeric values with unknown units", () => {
  assert.equal(weightInLb(null, "lb"), null); assert.equal(weightInLb(0, "stone-ish"), null);
  const models = structuredClone(definitions); models[2].weightLb = null; models[2].volumeL = null; models[2].longestDimensionCm = null;
  const load = calculateContainerPhysics(graph, models).containers.find(row => row.instanceId === 12)!;
  assert.equal(load.remainingWeightLb, null); assert.equal(load.remainingVolumeL, null);
  assert.match(load.problems.join(" "), /weight data not authored/); assert.match(load.problems.join(" "), /volume data not authored/); assert.match(load.problems.join(" "), /dimension data not authored/);
});
test("supported units normalize without mixing incompatible free-text units", () => {
  assert.equal(weightInLb(16, " OZ "), 1); assert.equal(weightInLb(0.45359237, "kg"), 1); assert.equal(weightInLb(453.59237, "grams"), 1);
  assert.equal(weightInLb(5, "LB"), 5); assert.equal(weightInLb(1, "ton"), null); assert.equal(weightInLb(Infinity, "lb"), null);
});
test("exact loaded container external weight is empty weight plus contents", () => {
  const input: PhysicalGraph = { instances: [{ instanceId: 12, itemId: 1, containerInstanceId: null }], stacks: [{ itemId: 3, ownedQuantity: 20, looseQuantity: 0, allocations: [{ containerInstanceId: 12, quantity: 20 }] }] };
  assert.equal(calculateContainerPhysics(input, definitions).carriedWeight.known, 23);
});
test("attached magazine and specialized rounds contribute once without general allocations", () => {
  const input: PhysicalGraph = { instances: [{ instanceId: 1, itemId: 4, containerInstanceId: 12 }, { instanceId: 2, itemId: 5, containerInstanceId: null }, { instanceId: 12, itemId: 1, containerInstanceId: null }], stacks: [] };
  const physics = calculateContainerPhysics(input, [...definitions, model(4, "Rifle", 7, 4), model(5, "Magazine", 1, 0.2), model(6, "Rounds", 0.1, null)], [{ instanceId: 2, ammunitionItemId: 6, rounds: 10 }], [{ weaponInstanceId: 1, magazineInstanceId: 2 }]);
  assert.equal(physics.containers[0].contentsWeight.known, 9); assert.equal(physics.carriedWeight.known, 12);
});
test("unknown specialized ammunition weight makes the loaded weight unknown", () => {
  const physics = calculateContainerPhysics(graph, definitions, [{ instanceId: 18, ammunitionItemId: 99, rounds: 1 }]);
  assert.ok(physics.carriedWeight.unknown.length); assert.match(physics.containers.find(row => row.instanceId === 12)!.problems.join(" "), /ammunition/);
});
test("specialized attachment overrides an old general location without duplicate weight or volume", () => {
  const input: PhysicalGraph = { instances: [{ instanceId: 1, itemId: 4, containerInstanceId: 12 }, { instanceId: 2, itemId: 5, containerInstanceId: 18 }, { instanceId: 12, itemId: 1, containerInstanceId: null }, { instanceId: 18, itemId: 2, containerInstanceId: null }], stacks: [] };
  const physics = calculateContainerPhysics(input, [...definitions, model(4, "Rifle", 7, 4), model(5, "Magazine", 1, 0.2), model(6, "Rounds", 0.1, null)], [{ instanceId: 2, ammunitionItemId: 6, rounds: 10 }], [{ weaponInstanceId: 1, magazineInstanceId: 2 }]);
  assert.equal(physics.containers.find(row => row.instanceId === 12)!.contentsWeight.known, 9);
  assert.equal(physics.containers.find(row => row.instanceId === 18)!.contentsWeight.known, 0);
  assert.equal(physics.containers.find(row => row.instanceId === 18)!.usedVolume.known, 0);
  assert.equal(physics.carriedWeight.known, 14);
});
test("legacy unconfigured profiles preserve unknown data without inventing limits", () => {
  const models = definitions.map(item => ({ ...item, weightLb: null, volumeL: null, container: item.container ? emptyContainerPhysicalProfile() : null }));
  const physics = calculateContainerPhysics(graph, models);
  assert.ok(physics.carriedWeight.unknown.length); assert.ok(physics.containers.every(row => row.problems.length === 0));
});
test("cycle protection also terminates recursive physical calculations", () => {
  const input = structuredClone(graph); input.instances[0].containerInstanceId = 18;
  assert.throws(() => calculateContainerPhysics(input, definitions), /Circular/);
});
test("physical fields reject negative, nonfinite, and invalid classification values", () => {
  for (const value of [-1, NaN, Infinity, -Infinity]) assert.throws(() => normalizeContainerPhysicalProfile({ ...emptyContainerPhysicalProfile(), maxWeightLb: value }), /finite/);
  assert.throws(() => normalizeContainerPhysicalProfile({ ...emptyContainerPhysicalProfile(), classification: "magic" as "generic" }), /classification/);
});

test("ordinary content restrictions and nesting use saved physical metadata", () => {
  const models = structuredClone(definitions);
  models[0].container!.allowsNestedContainers = false;
  assert.match(calculateContainerPhysics(graph, models).containers.find(row => row.instanceId === 12)!.problems.join(" "), /nested containers/);
  models[0].container!.allowsNestedContainers = true;
  models[0].container!.allowedCategories = ["Food"];
  models[0].container!.allowedRecordTypes = ["Ammunition"];
  const problems = calculateContainerPhysics(graph, models).containers.find(row => row.instanceId === 12)!.problems.join(" ");
  assert.match(problems, /allowed categories/); assert.match(problems, /allowed record types/);
  models.forEach(item => { item.category = "food"; item.recordType = "ammunition"; });
  assert.equal(calculateContainerPhysics(graph, models).containers.find(row => row.instanceId === 12)!.problems.length, 0);
});

test("liquid-only storage requires explicit physical form and unsupported weight behaviors are rejected", () => {
  const models = structuredClone(definitions), input = structuredClone(graph);
  input.instances[1].containerInstanceId = null;
  models[0].container!.liquidOnly = true;
  assert.match(calculateContainerPhysics(input, models).containers.find(row => row.instanceId === 12)!.problems.join(" "), /Liquid physical form/);
  models[2].physicalForm = "liquid";
  assert.equal(calculateContainerPhysics(input, models).containers.find(row => row.instanceId === 12)!.problems.length, 0);
  assert.equal(calculateContainerPhysics(input, models).carriedWeight.known, 15);
  assert.throws(() => normalizeContainerPhysicalProfile({ ...emptyContainerPhysicalProfile(), containedWeightBehavior: "weightless" as "normal" }), /contained weight behavior/);
});
