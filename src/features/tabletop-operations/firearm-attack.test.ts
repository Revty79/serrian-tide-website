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

function defense(reactionId: number, defenseTotalSuccesses: number | null, applicable: boolean | null, rulingReasons: readonly string[] = []) {
  return {
    reactionId,
    defenderParticipantId: reactionId + 100,
    defenseRollId: defenseTotalSuccesses === null ? null : reactionId + 200,
    defenseTotalSuccesses,
    applicable,
    rulingReasons,
  };
}

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
  const allocation = allocateFirearmBullets({ delivery: single, resolution, calledShot: false, defenses: [] });
  assert.deepEqual({ hits: allocation.initialBulletHits, survives: allocation.survivingBulletHits, overflow: allocation.overflowDamage }, { hits: 1, survives: 1, overflow: 0 });
  const damage = calculateFirearmBulletDamage({ authoredBulletDamage: 8, calledShot: false, deliveryKind: "single", dexDamageModifier: 4, additionalSuccesses: resolution.additionalSuccesses, armor: 0, soak: 0, protectionSupported: true });
  assert.equal(damage.grossDamage, 8);
  const miss = allocateFirearmBullets({ delivery: single, resolution: resolvePercentileCheck({ resultTotal: 20, originalTarget: 50 }), calledShot: false, defenses: [] });
  assert.deepEqual({ roundsFired: miss.roundsFired, hits: miss.initialBulletHits }, { roundsFired: 1, hits: 0 });
});

test("single-shot Called Shot adds DEX and additional successes exactly once", () => {
  const resolution = resolvePercentileCheck({ resultTotal: 85, originalTarget: 55 });
  assert.equal(resolution.additionalSuccesses, 3);
  const damage = calculateFirearmBulletDamage({ authoredBulletDamage: 8, calledShot: true, deliveryKind: "single", dexDamageModifier: 2, additionalSuccesses: resolution.additionalSuccesses, armor: 3, soak: 1, protectionSupported: true });
  assert.deepEqual({ gross: damage.grossDamage, dex: damage.calledShotDexModifier, extra: damage.calledShotAdditionalSuccessDamage, net: damage.netDamage }, { gross: 13, dex: 2, extra: 3, net: 9 });
});

test("one successful defense contributes every Pass 1 success and cancellation caps at available bullets", () => {
  const burst = planFirearmDelivery({ deliveryCadence: "per-trigger", roundsPerCadence: 3, loadedRounds: 3, targetCount: 1 });
  const allocation = allocateFirearmBullets({
    delivery: burst,
    resolution: resolvePercentileCheck({ resultTotal: 65, originalTarget: 45 }),
    calledShot: false,
    defenses: [defense(10, 3, true)],
  });
  assert.deepEqual({ roundsFired: allocation.roundsFired, initial: allocation.initialBulletHits, defenseSuccesses: allocation.defenseSuccesses, cancelled: allocation.bulletsCancelled, surviving: allocation.survivingBulletHits }, { roundsFired: 3, initial: 3, defenseSuccesses: 3, cancelled: 3, surviving: 0 });
  assert.deepEqual(allocation.defenseContributions[0], {
    reactionId: 10,
    defenderParticipantId: 110,
    defenseRollId: 210,
    defenseTotalSuccesses: 3,
    applicable: true,
    bulletsBefore: 3,
    bulletsCancelled: 3,
    bulletsAfter: 0,
    rulingReasons: [],
  });
  assert.equal(allocation.overflowDamage, 0);
});

test("failed, successful, and ruling-required defenses remain separately and deterministically attributed", () => {
  const burst = planFirearmDelivery({ deliveryCadence: "per-trigger", roundsPerCadence: 3, loadedRounds: 3, targetCount: 1 });
  const allocation = allocateFirearmBullets({
    delivery: burst,
    resolution: resolvePercentileCheck({ resultTotal: 65, originalTarget: 45 }),
    calledShot: false,
    defenses: [
      defense(13, 9, true),
      defense(11, 4, false),
      defense(12, 5, null, ["critical-defense-ruling"]),
    ],
  });
  assert.deepEqual(allocation.defenseContributions.map(({ reactionId, applicable, bulletsBefore, bulletsCancelled, bulletsAfter }) => ({ reactionId, applicable, bulletsBefore, bulletsCancelled, bulletsAfter })), [
    { reactionId: 11, applicable: false, bulletsBefore: 3, bulletsCancelled: 0, bulletsAfter: 3 },
    { reactionId: 12, applicable: null, bulletsBefore: 3, bulletsCancelled: 0, bulletsAfter: 3 },
    { reactionId: 13, applicable: true, bulletsBefore: 3, bulletsCancelled: 3, bulletsAfter: 0 },
  ]);
  assert.equal(allocation.defenseContributions[0]?.defenseTotalSuccesses, 4);
  assert.equal(allocation.defenseContributions[1]?.defenseTotalSuccesses, 5);
  assert.equal(allocation.defenseContributions[1]?.bulletsCancelled, 0);
  assert.deepEqual(allocation.defenseContributions[1]?.rulingReasons, ["critical-defense-ruling"]);
  assert.equal(allocation.requiresGodRuling, true);
  assert.deepEqual(allocation.applicableDefenseReactionIds, [13]);
  assert.equal(allocation.bulletsCancelled, 3);
});

test("ordinary burst discards overflow damage while Called burst preserves eligible overflow", () => {
  const burst = planFirearmDelivery({ deliveryCadence: "per-trigger", roundsPerCadence: 3, loadedRounds: 3, targetCount: 1 });
  const resolution = resolvePercentileCheck({ resultTotal: 85, originalTarget: 45 });
  const ordinary = allocateFirearmBullets({ delivery: burst, resolution, calledShot: false, defenses: [] });
  const called = allocateFirearmBullets({ delivery: burst, resolution, calledShot: true, defenses: [] });
  assert.deepEqual({ initial: ordinary.initialBulletHits, overflowSuccesses: ordinary.overflowSuccesses, overflowDamage: ordinary.overflowDamage }, { initial: 3, overflowSuccesses: 2, overflowDamage: 0 });
  assert.deepEqual({ initial: called.initialBulletHits, overflowSuccesses: called.overflowSuccesses, overflowDamage: called.overflowDamage }, { initial: 3, overflowSuccesses: 2, overflowDamage: 2 });
  const partlyDefended = allocateFirearmBullets({ delivery: burst, resolution, calledShot: true, defenses: [defense(20, 1, true)] });
  assert.deepEqual({ cancelled: partlyDefended.bulletsCancelled, surviving: partlyDefended.survivingBulletHits, overflowDamage: partlyDefended.overflowDamage }, { cancelled: 1, surviving: 2, overflowDamage: 2 });
  const fullyDefended = allocateFirearmBullets({ delivery: burst, resolution, calledShot: true, defenses: [defense(20, 3, true)] });
  assert.deepEqual({ cancelled: fullyDefended.bulletsCancelled, surviving: fullyDefended.survivingBulletHits, overflowDamage: fullyDefended.overflowDamage }, { cancelled: 3, surviving: 0, overflowDamage: 0 });
});

test("ordinary automatic fire has no overflow damage while Called automatic fire retains it", () => {
  const automatic = planFirearmDelivery({ deliveryCadence: "sustained-per-initiative", roundsPerCadence: 3, firingDurationInitiative: 1, loadedRounds: 3, targetCount: 1 });
  const resolution = resolvePercentileCheck({ resultTotal: 85, originalTarget: 45 });
  assert.equal(allocateFirearmBullets({ delivery: automatic, resolution, calledShot: false, defenses: [] }).overflowDamage, 0);
  assert.equal(allocateFirearmBullets({ delivery: automatic, resolution, calledShot: true, defenses: [] }).overflowDamage, 2);
  const damage = calculateFirearmBulletDamage({ authoredBulletDamage: 8, calledShot: true, deliveryKind: "sustained", dexDamageModifier: 4, additionalSuccesses: 2, armor: 2, soak: 1, protectionSupported: true });
  assert.deepEqual({ gross: damage.grossDamage, dexPerBullet: damage.calledShotDexModifier, successDamagePerBullet: damage.calledShotAdditionalSuccessDamage, ruling: damage.requiresGodRuling }, { gross: 8, dexPerBullet: 0, successDamagePerBullet: 0, ruling: false });
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
  const criticalFailure = allocateFirearmBullets({ delivery: single, resolution: resolvePercentileCheck({ resultTotal: 1, originalTarget: -10 }), calledShot: false, defenses: [] });
  const criticalSuccess = allocateFirearmBullets({ delivery: single, resolution: resolvePercentileCheck({ resultTotal: 100, originalTarget: 120 }), calledShot: false, defenses: [] });
  assert.deepEqual({ hits: criticalFailure.initialBulletHits, critical: criticalFailure.criticalFailure, ruling: criticalFailure.requiresGodRuling }, { hits: 0, critical: true, ruling: true });
  assert.deepEqual({ impossible: criticalSuccess.rulingReasons.includes("double-ott-impossible-target-collision"), critical: criticalSuccess.criticalSuccess }, { impossible: true, critical: true });
});
