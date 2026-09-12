import assert from "node:assert/strict";
import test from "node:test";
import { isFirearmWeaponType } from "./firearm-classification";

test("firearm classification uses explicit weapon families, not the presence of ammunition", () => {
  for (const type of ["Firearm", "Handgun", " Rifle ", "Pistol", "Shotgun"]) assert.equal(isFirearmWeaponType(type), true);
  for (const type of ["Bow", "Crossbow", "Sling", "Explosive", "Energy Weapon", "Chemical", "", "Longsword"]) assert.equal(isFirearmWeaponType(type), false);
});
