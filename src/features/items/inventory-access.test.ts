import assert from "node:assert/strict";
import test from "node:test";
import { availableLooseQuantity, containerAccessState, resolveInventoryAvailability, type InventoryAccessGraph } from "./inventory-access";
import { emptyContainerPhysicalProfile, normalizeContainerPhysicalProfile } from "./container-physics";

function graph(): InventoryAccessGraph {
  return { instances: [{ instanceId: 1, itemId: 10, containerInstanceId: null }, { instanceId: 2, itemId: 11, containerInstanceId: 1 }, { instanceId: 3, itemId: 12, containerInstanceId: 2 }],
    stacks: [{ itemId: 20, ownedQuantity: 20, looseQuantity: 7, allocations: [{ containerInstanceId: 2, quantity: 8 }] }],
    containers: [{ instanceId: 1, name: "Backpack", closureMode: "open-close", state: "open" }, { instanceId: 2, name: "Pouch", closureMode: "always-accessible", state: null }],
    attachments: [], exactCustody: [], stackCustody: [{ id: 1, itemId: 20, quantity: 5, status: "dropped", sceneId: 7, contextLabel: "Warehouse", note: "Under table" }] };
}
test("available root, contained exact and contained stack resolve independently", () => {
  const g = graph(); assert.equal(resolveInventoryAvailability(g, { instanceId: 1 }).usable, true);
  assert.deepEqual(resolveInventoryAvailability(g, { instanceId: 3 }).ancestors, [2, 1]);
  assert.equal(resolveInventoryAvailability(g, { itemId: 20, containerInstanceId: 2 }).accessible, true);
  assert.equal(availableLooseQuantity(g, 20), 7);
});
for (const state of ["closed", "locked", "sealed"]) test(`${state} ancestor blocks descendants but does not prevent moving the whole container`, () => {
  const g = graph(); g.containers[0].state = state;
  assert.equal(resolveInventoryAvailability(g, { instanceId: 1 }).usable, true);
  const inner = resolveInventoryAvailability(g, { instanceId: 3 }); assert.equal(inner.accessible, false); assert.equal(inner.blockingContainerId, 1); assert.match(inner.blocker!, new RegExp(state));
});
for (const status of ["dropped", "stolen", "lost"]) test(`${status} outer custody wins over descendant closure`, () => {
  const g = graph(); g.containers[0].state = "closed"; g.exactCustody.push({ instanceId: 1, status, sceneId: 7, contextLabel: "Warehouse", note: "Taken intact" });
  assert.equal(resolveInventoryAvailability(g, { instanceId: 3 }).custody, status);
  assert.match(resolveInventoryAvailability(g, { itemId: 20, containerInstanceId: 2 }).blocker!, new RegExp(status));
  assert.equal(resolveInventoryAvailability(g, { itemId: 20, containerInstanceId: null }).usable, true);
});
test("specific unavailable stack portion resolves separately from Loose remainder", () => {
  const g = graph(); assert.equal(resolveInventoryAvailability(g, { itemId: 20, containerInstanceId: null, custodyId: 1 }).custody, "dropped");
  assert.throws(() => resolveInventoryAvailability(g, { itemId: 21, containerInstanceId: null, custodyId: 1 }), /changed/);
  g.stackCustody[0].quantity = 13; assert.throws(() => availableLooseQuantity(g, 20), /exceed/);
});
test("attached magazine inherits its firearm assembly ancestry and is not an independent usable root", () => {
  const g = graph(); g.instances.push({ instanceId: 4, itemId: 13, containerInstanceId: null }); g.attachments.push({ weaponInstanceId: 3, magazineInstanceId: 4 });
  assert.deepEqual(resolveInventoryAvailability(g, { instanceId: 4 }).ancestors, [3, 2, 1]); assert.equal(resolveInventoryAvailability(g, { instanceId: 4 }).usable, false);
});
test("open-close copies begin closed while always-accessible ignores stale closure state", () => {
  const g = graph(); g.containers[0].state = null; g.containers[1].state = "locked";
  assert.equal(containerAccessState(g, 1), "closed"); assert.equal(containerAccessState(g, 2), "open");
});
test("cycles and missing ancestors fail closed", () => {
  const g = graph(); g.instances[0].containerInstanceId = 3;
  assert.throws(() => resolveInventoryAvailability(g, { instanceId: 3 }), /Circular/);
  g.instances[0].containerInstanceId = 999; assert.throws(() => resolveInventoryAvailability(g, { instanceId: 3 }), /changed/);
});
test("authored zero is preserved, blank is unresolved, and invalid Initiative amounts are rejected", () => {
  const p = emptyContainerPhysicalProfile(); assert.equal(p.closureMode, "always-accessible"); assert.equal(p.retrieveInitiativeCost, null);
  assert.equal(normalizeContainerPhysicalProfile({ ...p, retrieveInitiativeCost: 0 }).retrieveInitiativeCost, 0);
  for (const value of [-1, Infinity, NaN]) assert.throws(() => normalizeContainerPhysicalProfile({ ...p, retrieveInitiativeCost: value }), /finite|Initiative/);
});
