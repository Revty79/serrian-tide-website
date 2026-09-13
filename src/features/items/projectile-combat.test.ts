import assert from "node:assert/strict";
import { test } from "node:test";
import { isFirearmWeaponType, isSupportedAmmunitionWeaponType, projectileWeaponFamily } from "./firearm-classification";
import { ammunitionSelectionInitiativeCost, rangedShotInitiativeCost, resolveAmmunitionWeaponMode } from "./projectile-combat";
import type { FirearmFiringModeDraft } from "./firearm-timing";

const single: FirearmFiringModeDraft = { id: 12, name: "Single", sortOrder: 0, baseCyclingInitiativeCost: null,
  baseRecoilResetInitiativeCost: null, deliveryCadence: null, roundsPerCadence: null, mechanicsReviewRequired: true };

test("bows and crossbows are supported without classifying other projectiles as firearms", () => {
  for (const type of ["Bow", " Crossbow "]) {
    assert.equal(isSupportedAmmunitionWeaponType(type), true);
    assert.equal(isFirearmWeaponType(type), false);
  }
  for (const type of ["Sling", "Energy Weapon", "Crossbow-like", "Elbow"]) {
    assert.equal(isSupportedAmmunitionWeaponType(type), false);
    assert.equal(projectileWeaponFamily(type), null);
  }
});

test("bow preparation is paid once with the shot; crossbow release is separate", () => {
  const bow = { weaponType: "Bow", reloadInitiativeCost: 1.5 };
  const crossbow = { weaponType: "Crossbow", reloadInitiativeCost: 4 };
  assert.equal(ammunitionSelectionInitiativeCost(bow), 0);
  assert.equal(rangedShotInitiativeCost(bow), 1.5);
  assert.equal(ammunitionSelectionInitiativeCost(crossbow), 4);
  assert.equal(rangedShotInitiativeCost(crossbow), 1);
  for (const cost of [null, 0, -1, NaN, Infinity]) assert.throws(() => rangedShotInitiativeCost({ ...bow, reloadInitiativeCost: cost }), /positive/);
});

test("Single projectile modes retain identity without firearm cycling, recoil or burst delivery", () => {
  for (const type of ["Bow", "Crossbow"]) {
    const mode = resolveAmmunitionWeaponMode(type, single, 8, 9);
    assert.equal(mode.id, 12);
    assert.equal(mode.roundsPerCadence, 1);
    assert.equal(mode.deliveryCadence, "per-trigger");
    assert.equal(mode.timing?.followUpPreparationInitiativeCost, 0);
    assert.equal(resolveAmmunitionWeaponMode(type, { ...single, name: "Burst" }).timing, null);
  }
  assert.equal(resolveAmmunitionWeaponMode("Handgun", single).timing, null);
});
