import assert from "node:assert/strict";
import test from "node:test";

import { resolvePercentileCheck } from "./percentile-resolution";
import {
  aimIdentityChanged,
  allocateFirearmBullets,
  calculateFirearmBulletDamage,
  firearmDeclarationModifiers,
  getCalledShotTargetModifier,
  parseAuthoredBulletDamage,
  planFirearmDelivery,
  postShotReadinessFromAuthoredTiming,
} from "./firearm-attack";

const single = planFirearmDelivery({
  deliveryCadence: "per-trigger",
  roundsPerCadence: 1,
  loadedRounds: 10,
  targetCount: 1,
});

test("Aim uses the shared modifier model at exactly minus two target per Initiative", () => {
  const modifiers = firearmDeclarationModifiers({
    aimInitiative: 3,
    calledShot: { declared: true, penalty: 8, reason: "Small exposed target." },
    other: [{ label: "Clear firing lane", value: 2 }, { label: "Smoke", value: -4 }],
  });
  assert.deepEqual(modifiers, [
    { kind: "bonus", label: "Aim (3 Initiative at -2 target each)", magnitude: 6 },
    { kind: "penalty", label: "Called Shot", magnitude: 8 },
    { kind: "bonus", label: "Clear firing lane", magnitude: 2 },
    { kind: "penalty", label: "Smoke", magnitude: 4 },
  ]);
  assert.equal(resolvePercentileCheck({ resultTotal: 60, originalTarget: 50, modifiers }).finalTarget, 54);
});

test("Called Shot penalties are pre-roll G.O.D. rulings with reasons", () => {
  assert.throws(() => getCalledShotTargetModifier({ declared: true, penalty: 5, reason: "" }), /requires a G\.O\.D\. reason/);
  assert.throws(() => getCalledShotTargetModifier({ declared: true, penalty: null, reason: "Hard shot" }), /requires a nonnegative/);
});

test("changing exact target, firearm, Profile, mode, or Called Shot objective cancels Aim identity", () => {
  const original = { targetParticipantId: 2, itemInstanceId: 3, weaponProfileId: 4, firingModeId: 5, calledShotObjective: "left hand" };
  assert.equal(aimIdentityChanged(original, { ...original }), false);
  for (const changed of [
    { ...original, targetParticipantId: 9 },
    { ...original, itemInstanceId: 9 },
    { ...original, weaponProfileId: 9 },
    { ...original, firingModeId: 9 },
    { ...original, calledShotObjective: "right hand" },
  ]) assert.equal(aimIdentityChanged(original, changed), true);
});

test("delivery uses only authored cadence and blocks insufficient ammunition", () => {
  assert.deepEqual(single, {
    kind: "single",
    deliveryCadence: "per-trigger",
    roundsPerCadence: 1,
    firingDurationInitiative: 1,
    declaredRounds: 1,
    requiresGodRuling: false,
    rulingReasons: [],
  });
  assert.equal(planFirearmDelivery({ deliveryCadence: "per-trigger", roundsPerCadence: 3, loadedRounds: 3, targetCount: 1 }).kind, "burst");
  assert.throws(
    () => planFirearmDelivery({ deliveryCadence: "per-trigger", roundsPerCadence: 3, loadedRounds: 2, targetCount: 1 }),
    /requires 3 rounds, but only 2/,
  );
  const sustained = planFirearmDelivery({ deliveryCadence: "sustained-per-initiative", roundsPerCadence: 5, firingDurationInitiative: 3, loadedRounds: 20, targetCount: 1 });
  assert.equal(sustained.declaredRounds, 15);
  assert.equal(sustained.kind, "sustained");
  assert.equal(planFirearmDelivery({ deliveryCadence: "sustained-per-initiative", roundsPerCadence: 5, firingDurationInitiative: 3, loadedRounds: 12, targetCount: 1 }).declaredRounds, 12);
  assert.throws(
    () => planFirearmDelivery({ deliveryCadence: "sustained-per-initiative", roundsPerCadence: 5, firingDurationInitiative: 3, loadedRounds: 0, targetCount: 1 }),
    /requires at least one loaded round/,
  );
  assert.equal(planFirearmDelivery({ deliveryCadence: "sustained-per-initiative", roundsPerCadence: 5, firingDurationInitiative: 2, loadedRounds: 10, targetCount: 2 }).requiresGodRuling, true);
});

test("ordinary single shots consume one level as one hit and add neither success nor DEX damage", () => {
  const resolution = resolvePercentileCheck({ resultTotal: 99, originalTarget: 50 });
  const allocation = allocateFirearmBullets({ delivery: single, resolution, applicableDefenses: [] });
  assert.deepEqual({ hits: allocation.initialBulletHits, survives: allocation.survivingBulletHits, overflow: allocation.overflowDamage }, { hits: 1, survives: 1, overflow: 0 });
  const damage = calculateFirearmBulletDamage({ authoredBulletDamage: 8, calledShot: false, deliveryKind: "single", dexDamageModifier: 4, additionalSuccesses: resolution.additionalSuccesses, armor: 0, soak: 0, protectionSupported: true });
  assert.equal(damage.grossDamage, 8);
  const miss = allocateFirearmBullets({ delivery: single, resolution: resolvePercentileCheck({ resultTotal: 20, originalTarget: 50 }), applicableDefenses: [] });
  assert.deepEqual({ roundsFired: miss.roundsFired, hits: miss.initialBulletHits }, { roundsFired: 1, hits: 0 });
});

test("single-shot Called Shot adds DEX and additional successes exactly once", () => {
  const resolution = resolvePercentileCheck({ resultTotal: 85, originalTarget: 55 });
  assert.equal(resolution.additionalSuccesses, 3);
  const damage = calculateFirearmBulletDamage({ authoredBulletDamage: 8, calledShot: true, deliveryKind: "single", dexDamageModifier: 2, additionalSuccesses: resolution.additionalSuccesses, armor: 3, soak: 1, protectionSupported: true });
  assert.deepEqual({ gross: damage.grossDamage, dex: damage.calledShotDexModifier, extra: damage.calledShotAdditionalSuccessDamage, net: damage.netDamage }, { gross: 13, dex: 2, extra: 3, net: 9 });
});

test("burst hits cap at fired rounds, overflow remains separate, and defenses cancel bullets independently", () => {
  const burst = planFirearmDelivery({ deliveryCadence: "per-trigger", roundsPerCadence: 3, loadedRounds: 3, targetCount: 1 });
  const allocation = allocateFirearmBullets({
    delivery: burst,
    resolution: resolvePercentileCheck({ resultTotal: 95, originalTarget: 45 }),
    applicableDefenses: [
      { reactionId: 10, defenseSucceeded: true },
      { reactionId: 11, defenseSucceeded: false },
      { reactionId: 12, defenseSucceeded: true },
      { reactionId: 13, defenseSucceeded: true },
      { reactionId: 14, defenseSucceeded: true },
    ],
  });
  assert.deepEqual({ roundsFired: allocation.roundsFired, initial: allocation.initialBulletHits, cancelled: allocation.bulletsCancelled, surviving: allocation.survivingBulletHits, overflow: allocation.overflowSuccesses }, { roundsFired: 3, initial: 3, cancelled: 3, surviving: 0, overflow: 3 });
  assert.equal(allocation.overflowDamage, 0);
  assert.deepEqual(allocation.applicableDefenseReactionIds, [10, 12, 13, 14]);
});

test("armor and soak process a bullet independently and net damage never becomes negative", () => {
  const stopped = calculateFirearmBulletDamage({ authoredBulletDamage: 5, calledShot: false, deliveryKind: "burst", dexDamageModifier: 9, additionalSuccesses: 8, armor: 3, soak: 4, protectionSupported: true });
  assert.equal(stopped.netDamage, 0);
  const unresolved = calculateFirearmBulletDamage({ authoredBulletDamage: 5, calledShot: false, deliveryKind: "burst", dexDamageModifier: 0, additionalSuccesses: 0, armor: null, soak: 0, protectionSupported: false });
  assert.equal(unresolved.netDamage, null);
  assert.equal(unresolved.requiresGodRuling, true);
});

test("numeric authored bullet damage is objective while dice and zero remain ruling boundaries", () => {
  assert.equal(parseAuthoredBulletDamage("8.0"), 8);
  assert.equal(parseAuthoredBulletDamage(12), 12);
  assert.equal(parseAuthoredBulletDamage("2d8"), null);
  assert.equal(parseAuthoredBulletDamage("0.0"), null);
});

test("post-shot cycling and recoil blockers come only from authored effective timing", () => {
  assert.deepEqual(postShotReadinessFromAuthoredTiming({ effectiveCyclingInitiativeCost: 2, effectiveRecoilResetInitiativeCost: 0 }), { requiresCycling: true, requiresRecoilRecovery: false });
  assert.throws(() => postShotReadinessFromAuthoredTiming({ effectiveCyclingInitiativeCost: null, effectiveRecoilResetInitiativeCost: 0 }), /requires authored/);
});

test("shared Pass 1 critical, impossible, automatic, and tie facts remain unchanged in bullet allocation", () => {
  const criticalFailure = allocateFirearmBullets({ delivery: single, resolution: resolvePercentileCheck({ resultTotal: 1, originalTarget: -10 }), applicableDefenses: [] });
  const criticalSuccess = allocateFirearmBullets({ delivery: single, resolution: resolvePercentileCheck({ resultTotal: 100, originalTarget: 120 }), applicableDefenses: [] });
  assert.deepEqual({ hits: criticalFailure.initialBulletHits, critical: criticalFailure.criticalFailure, ruling: criticalFailure.requiresGodRuling }, { hits: 0, critical: true, ruling: true });
  assert.deepEqual({ impossible: criticalSuccess.rulingReasons.includes("double-ott-impossible-target-collision"), critical: criticalSuccess.criticalSuccess }, { impossible: true, critical: true });
});
