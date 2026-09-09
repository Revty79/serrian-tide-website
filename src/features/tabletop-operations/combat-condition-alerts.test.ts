import assert from "node:assert/strict";
import test from "node:test";
import { combatConditionAlerts } from "./combat-condition-alerts";
import { limbDamageIncapacitates } from "./combat-limb-state";
import { wholeBodyDamageCondition } from "./combat-condition-state";

test("limb incapacity starts at 0 HP, persists below 0, and excludes non-limbs and exceptional anatomy", () => {
  const arm = { poolKey: "leftArm", name: "Left Arm" };
  const input = { poolKey: arm.poolKey, poolName: arm.name, maximumHp: 5, poolDamage: 5, locations: [arm] };
  assert.equal(limbDamageIncapacitates(input), true);
  assert.equal(limbDamageIncapacitates({ ...input, poolDamage: 4 }), false);
  assert.equal(limbDamageIncapacitates({ ...input, poolDamage: 12 }), true);
  assert.equal(limbDamageIncapacitates({ ...input, maximumHp: null }), false);
  for (const name of ["Head", "Body", "Torso", "Neck", "Tail"]) assert.equal(limbDamageIncapacitates({ ...input, poolName: name, locations: [{ ...arm, name }] }), false);
  assert.equal(limbDamageIncapacitates({ ...input, locations: [{ ...arm, specialEffect: "Special limb restoration" }] }), false);
  assert.equal(limbDamageIncapacitates({ ...input, locations: [arm, { name: "Torso", poolKey: arm.poolKey }] }), false);
  for (const name of ["Left Leg", "Right Foreleg", "Left Hindleg", "Wing", "Tentacle"]) assert.equal(limbDamageIncapacitates({ ...input, poolName: name, locations: [{ ...arm, name }] }), true);
});

test("all ten Slime hit locations share one Body: 0 HP incapacitates and -1 kills", () => {
  const input = { poolKey: "slime-body", poolCount: 1, poolDamage: 10, maximumHp: 10, totalMaximumHp: 10,
    locations: Array.from({ length: 10 }, () => ({ name: "Body", poolKey: "slime-body" })) };
  assert.equal(wholeBodyDamageCondition({ ...input, poolDamage: 9 }), null);
  assert.equal(wholeBodyDamageCondition(input), "incapacitated");
  assert.equal(wholeBodyDamageCondition({ ...input, poolDamage: 11 }), "dead");
  assert.equal(wholeBodyDamageCondition({ ...input, poolDamage: 15 }), "dead");
  assert.equal(wholeBodyDamageCondition({ ...input, poolCount: 2 }), null);
  assert.equal(wholeBodyDamageCondition({ ...input, maximumHp: 3 }), null);
  assert.equal(wholeBodyDamageCondition({ ...input, locations: [{ name: "Head", poolKey: "head" }] }), null);
});

test("G.O.D. receives every condition alert, Players receive only their own; receipts are stable after refresh and healing", () => {
  const limb = { poolKey: "leftArm", name: "Left Arm", sourceEffectId: 44, incapacitatedAt: "2026-09-09T12:00:00Z" };
  const actors = [
    { participantId: 1, name: "Ysra", local: { limbConditions: [limb] } },
    { participantId: -10, name: "Bull", local: { combatCondition: { status: "dead", history: [{ request: { status: "dead", requestKey: "death-1", reason: "Head HP reached -1." }, recordedAt: "2026-09-09T12:01:00Z" }] } } },
    { participantId: 2, name: "Other Player", local: { combatCondition: { status: "incapacitated", history: [{ request: { status: "incapacitated", requestKey: "head-0", reason: "Head HP reached 0.", evidence: { unconscious: true } } }] } } },
  ];
  const god = combatConditionAlerts(actors, { authority: "god-owner" });
  assert.equal(god.length, 3); assert.ok(god.some((entry) => entry.title === "Unconscious"));
  assert.deepEqual(combatConditionAlerts(actors, { authority: "god-owner" }), god);
  const own = combatConditionAlerts(actors, { authority: "player", characterId: 1 });
  assert.equal(own.length, 1); assert.equal(own[0].actorName, "Ysra");
  const recovered = combatConditionAlerts([{ ...actors[0], local: { limbConditions: [{ ...limb, recoveredAt: "2026-09-09T12:02:00Z" }] } }], { authority: "player", characterId: 1 });
  assert.equal(recovered[0].id, own[0].id); assert.match(recovered[0].detail, /since recovered/);
  assert.deepEqual(combatConditionAlerts(actors, { authority: "player", characterId: 99 }), []);
});
