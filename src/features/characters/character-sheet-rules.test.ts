import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CharacterHitLocationChart } from "@/app/characters/character-hit-location-chart";
import {
  getCharacterEncumbrance,
  getCharacterWeaponDamage,
  getCharacterWeaponDamageSummary,
} from "./character-sheet-rules";
import type { CharacterAuthorizedItem, CharacterOwnedItem } from "./models";

function ownedItem(
  overrides: Partial<CharacterOwnedItem>,
): CharacterOwnedItem {
  return {
    characterId: 1,
    itemId: 1,
    canonicalId: "ITEM-TEST",
    name: "Test Item",
    catalogScope: "equipment",
    equipmentGroup: "general",
    recordType: "Equipment",
    category: "Gear",
    quantity: 1,
    unitCostCredits: 1,
    weight: 1,
    weightUnit: "lb",
    acquiredAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function weapon(overrides: Partial<CharacterAuthorizedItem>): CharacterAuthorizedItem {
  return {
    id: 1,
    canonicalId: "ITEM-TEST",
    name: "Test Weapon",
    catalogScope: "equipment",
    equipmentGroup: "weapon",
    recordType: "Weapon",
    category: "Weapon",
    credits: 1,
    priceBasis: "Each",
    description: "",
    weight: null,
    weightUnit: "",
    size: "Medium",
    durability: null,
    isMagical: false,
    effectCount: 0,
    runtimeProfile: {
      useMode: "none",
      quantityPerUse: null,
      maximumCharges: null,
      chargesPerUse: null,
      rechargeNotes: "",
      activationLabel: "Use",
      useNotes: "",
    },
    weaponType: "Sword",
    handedness: "One-Handed",
    damageSource: "Weapon",
    damage: "8",
    damageType: "Slashing",
    ammunitionItemId: null,
    ammunitionItemName: null,
    ammunitionDamage: null,
    ammunitionDamageType: null,
    rangeText: null,
    reachText: "5 ft",
    weaponRulesText: null,
    armorType: null,
    coverage: null,
    baseSoak: null,
    armorDamageModifiers: null,
    armorRulesText: null,
    ...overrides,
  };
}

const attributes = { STR: 40, DEX: 30, CON: 25, INT: 25, WIS: 25, CHR: 25 };

test("Encumbrance totals all owned Equipment and Inventory by quantity", () => {
  assert.deepEqual(getCharacterEncumbrance([
    ownedItem({ quantity: 3, weight: 2 }),
    ownedItem({
      itemId: 2,
      catalogScope: "inventory",
      equipmentGroup: null,
      quantity: 4,
      weight: 0.5,
      weightUnit: "LB",
    }),
  ]), {
    totals: [{ weight: 8, unit: "lb" }],
    unknownQuantity: 0,
  });
});

test("Encumbrance reports missing weights and keeps mixed units separate", () => {
  assert.deepEqual(getCharacterEncumbrance([
    ownedItem({ quantity: 2, weight: null, weightUnit: "" }),
    ownedItem({ itemId: 2, weight: 3, weightUnit: "kg" }),
    ownedItem({ itemId: 3, weight: 5, weightUnit: "lb" }),
  ]), {
    totals: [
      { weight: 3, unit: "kg" },
      { weight: 5, unit: "lb" },
    ],
    unknownQuantity: 2,
  });
});

test("melee weapon damage applies Strength", () => {
  assert.deepEqual(getCharacterWeaponDamageSummary(weapon({}), attributes), {
    modifier: "STR +3",
    totalDamage: "11",
  });
});

test("ranged weapon damage applies Dexterity", () => {
  assert.deepEqual(
    getCharacterWeaponDamageSummary(
      weapon({ weaponType: "Bow", rangeText: "120 ft", reachText: null }),
      attributes,
    ),
    { modifier: "DEX +1", totalDamage: "9" },
  );
});

test("ammunition-fed weapons resolve damage from their linked Ammunition Item", () => {
  const firearm = weapon({
    weaponType: "Rifle",
    damageSource: "Ammunition",
    damage: null,
    damageType: null,
    ammunitionItemId: 2001,
    ammunitionItemName: "5.56×45 mm Cartridge",
    ammunitionDamage: "10",
    ammunitionDamageType: "Piercing",
    rangeText: "300 ft",
    reachText: null,
  });

  assert.deepEqual(getCharacterWeaponDamage(firearm), {
    damage: "10",
    damageType: "Piercing",
    sourceName: "5.56×45 mm Cartridge",
  });
  assert.deepEqual(getCharacterWeaponDamageSummary(firearm, attributes), {
    modifier: "DEX +1",
    totalDamage: "11",
  });
});

test("an Ammunition Item keeps its own damage when it does not reference other ammunition", () => {
  assert.deepEqual(
    getCharacterWeaponDamage(weapon({
      catalogScope: "inventory",
      equipmentGroup: null,
      recordType: "Ammunition",
      weaponType: "Cartridge",
      damageSource: "Ammunition",
      damage: "8",
      damageType: "Piercing",
    })),
    { damage: "8", damageType: "Piercing", sourceName: null },
  );
});

test("hybrid weapons show melee and ranged damage", () => {
  assert.deepEqual(
    getCharacterWeaponDamageSummary(
      weapon({ weaponType: "Axe", rangeText: "15 ft" }),
      attributes,
    ),
    { modifier: "STR +3 / DEX +1", totalDamage: "M 11 / R 9" },
  );
});

test("the printable body target renders every 0-9 result and shared HP pool", () => {
  const markup = renderToStaticMarkup(
    createElement(CharacterHitLocationChart, { totalHp: 51 }),
  );
  assert.match(markup, /51 Total HP/);
  for (let result = 0; result <= 9; result += 1) {
    assert.match(markup, new RegExp(`Result ${result}:`));
  }
  for (const pool of ["Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg", "Torso"]) {
    assert.match(markup, new RegExp(pool));
  }
});
