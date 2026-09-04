import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  evaluateFirearmReadiness,
  planFirearmAmmunitionTransition,
  resolveFirearmPreparationTiming,
  type FirearmReadinessInput,
} from "./firearm-readiness";

function ready(overrides: Partial<FirearmReadinessInput> = {}): FirearmReadinessInput {
  return {
    initialized: true,
    exactOwnerValid: true,
    itemInstancePresent: true,
    weaponProfilePresent: true,
    firingModeValid: true,
    firingModeMechanicsResolved: true,
    drawn: true,
    readied: true,
    loadedRounds: 6,
    capacityRounds: 12,
    readinessRelationshipResolved: true,
    ammunitionRelationshipResolved: true,
    ammunitionRequired: true,
    ammunitionCompatible: true,
    roundsRequiredForSelectedDelivery: 1,
    requiresCycling: false,
    requiresRecoilRecovery: false,
    pendingPreparation: null,
    requiredPreparationInitiativeCostKnown: true,
    staleCanonicalRuntimeDivergence: false,
    directCreatureManufacturedFirearm: false,
    ...overrides,
  };
}

const authored = {
  drawInitiativeCost: 1,
  readyInitiativeCost: 2,
  reloadInitiativeCost: 4,
  unloadInitiativeCost: 3,
  firingModeChangeInitiativeCost: 1,
  selectedMode: {
    id: 8,
    name: "Single",
    sortOrder: 0,
    baseCyclingInitiativeCost: 2,
    baseRecoilResetInitiativeCost: 3,
    deliveryCadence: "per-trigger" as const,
    roundsPerCadence: 1,
    mechanicsReviewRequired: false,
    timing: {
      effectiveCyclingInitiativeCost: 2,
      effectiveRecoilResetInitiativeCost: 3,
      followUpPreparationInitiativeCost: 5,
      totalThroughNextTriggerPullInitiativeCost: 6,
    },
  },
};

test("owned alone is not ready and missing runtime is never guessed", () => {
  const result = evaluateFirearmReadiness(ready({ initialized: false, drawn: false, readied: false, loadedRounds: 0 }));
  assert.equal(result.status, "requires-god-ruling");
  assert.deepEqual(result.blockers.map(({ code }) => code), ["runtime-uninitialized", "not-drawn", "not-readied", "no-ammunition"]);
});

test("fully valid exact firearm state is ready", () => {
  assert.deepEqual(evaluateFirearmReadiness(ready()), { status: "ready", blockers: [] });
});

test("exact identity and canonical divergence failures are invalid", () => {
  const result = evaluateFirearmReadiness(ready({ exactOwnerValid: false, itemInstancePresent: false, weaponProfilePresent: false, firingModeValid: false, staleCanonicalRuntimeDivergence: true }));
  assert.equal(result.status, "invalid-state");
  assert.deepEqual(result.blockers.map(({ code }) => code), ["wrong-owner", "missing-item-instance", "missing-weapon-profile", "invalid-firing-mode", "stale-canonical-runtime-divergence"]);
});

test("missing capacity and exact ammunition relationship require rulings", () => {
  const result = evaluateFirearmReadiness(ready({ capacityRounds: null, ammunitionRelationshipResolved: false }));
  assert.equal(result.status, "requires-god-ruling");
  assert.deepEqual(result.blockers.map(({ code }) => code), ["missing-capacity", "incompatible-ammunition"]);
});

test("a missing draw-to-ready relationship requires a ruling", () => {
  const result = evaluateFirearmReadiness(ready({ readinessRelationshipResolved: false, readied: false }));
  assert.equal(result.status, "requires-god-ruling");
  assert.deepEqual(result.blockers.map(({ code }) => code), ["missing-readiness-relationship", "not-readied"]);
});

test("unresolved firing mechanics and missing preparation timing explain rulings", () => {
  const result = evaluateFirearmReadiness(ready({ firingModeMechanicsResolved: false, requiredPreparationInitiativeCostKnown: false }));
  assert.equal(result.status, "requires-god-ruling");
  assert.deepEqual(result.blockers.map(({ code }) => code), ["invalid-firing-mode", "missing-initiative-cost"]);
});

test("empty, incompatible, insufficient, cycling, and recoil blockers remain distinct", () => {
  assert.equal(evaluateFirearmReadiness(ready({ loadedRounds: 0 })).blockers[0]?.code, "no-ammunition");
  assert.equal(evaluateFirearmReadiness(ready({ ammunitionCompatible: false })).blockers[0]?.code, "incompatible-ammunition");
  assert.equal(evaluateFirearmReadiness(ready({ loadedRounds: 2, roundsRequiredForSelectedDelivery: 3 })).blockers[0]?.code, "insufficient-rounds");
  assert.deepEqual(evaluateFirearmReadiness(ready({ requiresCycling: true, requiresRecoilRecovery: true })).blockers.map(({ code }) => code), ["cycling-required", "recoil-recovery-required"]);
});

test("pending, interrupted, and ruling-required preparation states classify explicitly", () => {
  assert.equal(evaluateFirearmReadiness(ready({ pendingPreparation: { operation: "reload", status: "pending" } })).status, "preparation-pending");
  assert.equal(evaluateFirearmReadiness(ready({ pendingPreparation: { operation: "draw", status: "interrupted" } })).blockers.at(-1)?.code, "preparation-interrupted");
  assert.equal(evaluateFirearmReadiness(ready({ pendingPreparation: { operation: "cycle", status: "requires-god-ruling" } })).status, "requires-god-ruling");
});

test("direct Creature manufactured firearm compatibility never becomes Character readiness", () => {
  const result = evaluateFirearmReadiness(ready({ directCreatureManufacturedFirearm: true }));
  assert.equal(result.status, "requires-god-ruling");
  assert.equal(result.blockers[0]?.code, "unsupported-creature-firearm");
});

test("authored preparation timing preserves zero and distinct cycling/recoil costs", () => {
  assert.deepEqual(resolveFirearmPreparationTiming({ operation: "draw", authored: { ...authored, drawInitiativeCost: 0 } }), {
    status: "resolved", initiativeCost: 0, source: "canonical", reason: "",
  });
  assert.equal(resolveFirearmPreparationTiming({ operation: "cycle", authored }).initiativeCost, 2);
  assert.equal(resolveFirearmPreparationTiming({ operation: "recover-recoil", authored }).initiativeCost, 3);
});

test("missing timing requires a reasoned G.O.D. value and never defaults to zero", () => {
  const missing = { ...authored, reloadInitiativeCost: null };
  assert.equal(resolveFirearmPreparationTiming({ operation: "reload", authored: missing }).status, "requires-god-ruling");
  assert.throws(() => resolveFirearmPreparationTiming({ operation: "reload", authored: missing, godInitiativeCost: 0 }), /requires a reason/);
  assert.deepEqual(resolveFirearmPreparationTiming({ operation: "reload", authored: missing, godInitiativeCost: 0, godReason: "Table ruling" }), {
    status: "resolved", initiativeCost: 0, source: "god-ruling", reason: "Table ruling",
  });
});

test("load uses exact ammunition identity and changes only modeled quantities", () => {
  assert.deepEqual(planFirearmAmmunitionTransition({ operation: "load", loadedRounds: 0, inventoryRounds: 20, capacityRounds: 12, requestedRounds: 6, loadedAmmunitionItemId: null, requestedAmmunitionItemId: 30, canonicalAmmunitionItemId: 30 }), {
    loadedRounds: 6, inventoryRounds: 14, retainedRounds: 0, discardedRounds: 0,
  });
  assert.throws(() => planFirearmAmmunitionTransition({ operation: "load", loadedRounds: 0, inventoryRounds: 20, capacityRounds: 12, requestedRounds: 6, loadedAmmunitionItemId: null, requestedAmmunitionItemId: 31, canonicalAmmunitionItemId: 30 }), /Incompatible ammunition/);
});

test("names cannot substitute for exact ammunition or capacity relationships", () => {
  assert.throws(() => planFirearmAmmunitionTransition({ operation: "load", loadedRounds: 0, inventoryRounds: 20, capacityRounds: null, requestedRounds: 6, loadedAmmunitionItemId: null, requestedAmmunitionItemId: 30, canonicalAmmunitionItemId: 30 }), /capacity requires a G.O.D. ruling/);
  assert.throws(() => planFirearmAmmunitionTransition({ operation: "load", loadedRounds: 0, inventoryRounds: 20, capacityRounds: 12, requestedRounds: 6, loadedAmmunitionItemId: null, requestedAmmunitionItemId: 30, canonicalAmmunitionItemId: null }), /no exact canonical ammunition/);
});

test("loading above capacity and spending below zero are rejected", () => {
  assert.throws(() => planFirearmAmmunitionTransition({ operation: "load", loadedRounds: 0, inventoryRounds: 20, capacityRounds: 5, requestedRounds: 6, loadedAmmunitionItemId: null, requestedAmmunitionItemId: 30, canonicalAmmunitionItemId: 30 }), /above.*capacity/);
  assert.throws(() => planFirearmAmmunitionTransition({ operation: "load", loadedRounds: 0, inventoryRounds: 2, capacityRounds: 5, requestedRounds: 3, loadedAmmunitionItemId: null, requestedAmmunitionItemId: 30, canonicalAmmunitionItemId: 30 }), /not contain enough/);
});

test("partial reload never guesses replacement or disposition", () => {
  const shared = { loadedRounds: 3, inventoryRounds: 9, capacityRounds: 10, requestedRounds: 4, loadedAmmunitionItemId: 30, requestedAmmunitionItemId: 30, canonicalAmmunitionItemId: 30 };
  assert.deepEqual(planFirearmAmmunitionTransition({ operation: "reload", ...shared }), { loadedRounds: 7, inventoryRounds: 5, retainedRounds: 0, discardedRounds: 0 });
  assert.throws(() => planFirearmAmmunitionTransition({ operation: "reload", ...shared, replaceCurrentLoad: true }), /explicit retain or discard/);
  assert.deepEqual(planFirearmAmmunitionTransition({ operation: "reload", ...shared, replaceCurrentLoad: true, disposition: "retain" }), { loadedRounds: 4, inventoryRounds: 8, retainedRounds: 3, discardedRounds: 0 });
  assert.throws(() => planFirearmAmmunitionTransition({ operation: "reload", ...shared, loadedRounds: 0, replaceCurrentLoad: true, disposition: "discard" }), /no partial load/);
});

test("unload retains or deliberately discards the complete exact load", () => {
  const shared = { operation: "unload" as const, loadedRounds: 5, inventoryRounds: 9, capacityRounds: 10, loadedAmmunitionItemId: 30, requestedAmmunitionItemId: null, canonicalAmmunitionItemId: 30 };
  assert.throws(() => planFirearmAmmunitionTransition(shared), /explicit retain or discard/);
  assert.deepEqual(planFirearmAmmunitionTransition({ ...shared, disposition: "retain" }), { loadedRounds: 0, inventoryRounds: 14, retainedRounds: 5, discardedRounds: 0 });
  assert.deepEqual(planFirearmAmmunitionTransition({ ...shared, disposition: "discard" }), { loadedRounds: 0, inventoryRounds: 9, retainedRounds: 0, discardedRounds: 5 });
});

test("the Pass 9 pure runtime exposes no attack Roll, bullet allocation, or damage operation", () => {
  const source = [evaluateFirearmReadiness, planFirearmAmmunitionTransition, resolveFirearmPreparationTiming].map(String).join("\n");
  assert.doesNotMatch(source, /Math\.random|rollAttack|applyDamage|allocateBullet|consumeFired/i);
});

test("Pass 9 persistence is additive, exact, restrictive, and follows immutable 0027", () => {
  const migration = readFileSync(path.join(process.cwd(), "drizzle/0028_firearm_readiness_ammunition_runtime.sql"), "utf8");
  const journal = JSON.parse(readFileSync(path.join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as { entries: Array<{ idx: number; tag: string }> };
  assert.equal(journal.entries.length, 30);
  assert.deepEqual(journal.entries[28], { idx: 28, version: "7", when: 1788542229363, tag: "0028_firearm_readiness_ammunition_runtime", breakpoints: true });
  assert.match(migration, /campaign_character_firearm_state_owned_instance_fk/);
  assert.match(migration, /campaign_character_firearm_state_mode_profile_fk/);
  assert.match(migration, /campaign_character_firearm_state_readied_relationship_valid/);
  assert.match(migration, /campaign_character_firearm_preparation_one_open_uq/);
  assert.match(migration, /ON DELETE restrict/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|DELETE|TRUNCATE|UPDATE)\b/im);
});

test("Tabletop owns Character firearm controls without duplicating global authoring or Pass 10 attacks", () => {
  const workspace = readFileSync(path.join(process.cwd(), "src/app/heavens/tabletop/firearm-readiness-workspace.tsx"), "utf8");
  const actions = readFileSync(path.join(process.cwd(), "src/app/heavens/tabletop/firearm-readiness-actions.ts"), "utf8");
  const service = readFileSync(path.join(process.cwd(), "src/features/tabletop-operations/firearm-readiness-service.ts"), "utf8");
  assert.match(workspace, /Review canonical Equipment/);
  assert.match(workspace, /Canonical authored/);
  assert.match(workspace, /Frozen runtime/);
  assert.match(workspace, /Current inventory/);
  assert.match(workspace, /does not roll attacks, consume fired rounds, allocate bullets, or apply damage/);
  assert.match(actions, /requireGod/);
  assert.match(actions, /lockOwnedEncounterRuntimeInTransaction/);
  assert.match(service, /firearm-preparation:/);
  assert.doesNotMatch(service, /Math\.random|rollAttack|applyDamage|allocateBullet|consumeFired/i);
});
