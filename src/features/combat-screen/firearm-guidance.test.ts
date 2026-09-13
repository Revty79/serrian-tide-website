import assert from "node:assert/strict";
import { describe, it } from "node:test";
function matches(actual: object, expected: object) { for (const [key, value] of Object.entries(expected)) assert.deepEqual((actual as Record<string, unknown>)[key], value); }
import { firearmGuidance } from "./firearm-guidance";
import type { FirearmInstanceView } from "@/features/tabletop-operations/firearm-readiness-service";

const ready: FirearmInstanceView = {
  itemInstanceId: 2, itemId: 1, itemName: "Rifle", canonicalId: "RIFLE", weaponProfileId: 1, equipmentState: "wielded",
  canonical: { handedness: "Two-Handed", reloadType: "Magazine", ammunitionItemId: 155, ammunitionName: "5.56 cartridge", capacityRounds: 30,
    legacyCapacityText: "30", readinessMode: "separate-ready-action", drawInitiativeCost: 1, readyInitiativeCost: 1, reloadInitiativeCost: 3, unloadInitiativeCost: 1, firingModeChangeInitiativeCost: 1 },
  modes: [{ id: 1, name: "Semi", sortOrder: 0, baseCyclingInitiativeCost: 0, baseRecoilResetInitiativeCost: 0, deliveryCadence: "per-trigger", roundsPerCadence: 1, mechanicsReviewRequired: false,
    timing: { effectiveCyclingInitiativeCost: 0, effectiveRecoilResetInitiativeCost: 0, followUpPreparationInitiativeCost: 0, totalThroughNextTriggerPullInitiativeCost: 1 } }],
  state: { selectedFiringModeId: 1, loadedAmmunitionItemId: 155, loadedAmmunitionName: "5.56 cartridge", loadedRounds: 5, capacityRounds: 5, capacitySource: "magazine", readinessMode: "separate-ready-action", readinessModeSource: "canonical", readied: true, requiresCycling: false, requiresRecoilRecovery: false, version: 1, updatedAt: "" },
  inventoryAmmunitionQuantity: 40, magazines: [], attachedMagazineInstanceId: 3, readiness: { status: "ready", blockers: [] }, preparation: null, history: [],
};

describe("firearm next-step guidance", () => {
  it("identifies missing item mechanics without pretending legacy text configures firing", () => {
    const f: FirearmInstanceView = { ...ready, canonical: { ...ready.canonical, reloadType: null, capacityRounds: null, readinessMode: null },
      state: { ...ready.state!, capacityRounds: null, capacitySource: null, readinessMode: null, loadedRounds: 0, readied: false },
      modes: [{ ...ready.modes[0], timing: null, deliveryCadence: null, roundsPerCadence: null }], readiness: { status: "requires-god-ruling", blockers: [] } };
    const result = firearmGuidance(f);
    assert.equal(result.canFire, false);
    assert.equal(result.next, "Complete weapon setup");
    assert.ok(result.setup.join(" ").includes("Legacy capacity text"));
    assert.ok(result.setup.join(" ").includes("Reload Type"));
    assert.ok(result.setup.join(" ").includes("cycling cost"));
  });
  it("offers catalog adoption for an initialized copy without treating it as loaded or ready", () => {
    const f = { ...ready, state: { ...ready.state!, readinessMode: null, readied: false, loadedRounds: 0 }, readiness: { status: "not-ready" as const, blockers: [] } };
    matches(firearmGuidance(f), { catalogUpdate: true, canFire: false });
    assert.equal(f.state.loadedRounds, 0);
    assert.equal(f.state.readied, false);
  });
  it("uses a magazine's capacity and guides an empty magazine-fed weapon toward loading", () => {
    matches(firearmGuidance(ready), { canFire: true, catalogUpdate: false, next: "Ready to fire" });
    const f = { ...ready, canonical: { ...ready.canonical, capacityRounds: null }, state: { ...ready.state!, loadedRounds: 0, capacityRounds: null }, readiness: { status: "not-ready" as const, blockers: [] } };
    matches(firearmGuidance(f), { canFire: false, next: "Load a magazine", operation: "reload", setup: [] });
  });
  it("routes a selected mode change through preparation before firing", () => {
    const f = { ...ready, modes: [...ready.modes, { ...ready.modes[0], id: 2, name: "Burst", roundsPerCadence: 3 }] };
    matches(firearmGuidance(f, 2), { canFire: false, operation: "change-mode", next: "Change firing mode" });
  });
  it("does not allow firing past pending preparation or recoil recovery", () => {
    const f = { ...ready, state: { ...ready.state!, requiresRecoilRecovery: true }, readiness: { status: "not-ready" as const, blockers: [] } };
    matches(firearmGuidance(f), { canFire: false, next: "Prepare next shot", operation: "recover-recoil" });
    assert.equal(firearmGuidance({ ...ready, readiness: { status: "preparation-pending", blockers: [] } }).canFire, false);
  });
  it("keeps an already loaded and readied copy prepared when only mode authoring is missing", () => {
    const f = { ...ready, modes: [{ ...ready.modes[0], timing: null, deliveryCadence: null, roundsPerCadence: null }],
      readiness: { status: "requires-god-ruling" as const, blockers: [] } };
    matches(firearmGuidance(f), { canFire: false, next: "Complete weapon setup", needsPreparation: false });
    assert.equal(firearmGuidance(f).setup.length, 1);
  });
});
