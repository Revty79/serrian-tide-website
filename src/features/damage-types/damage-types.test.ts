import assert from "node:assert/strict";
import test from "node:test";
import { DAMAGE_TYPES, normalizeDamageTypes, normalizeAuthoredDamageTypes, matchDamageType } from "./damage-types";
import { normalizeWeaponDamageType, normalizeArmorDamageTypes } from "@/features/items/item-damage-types";

test("approved types serialize consistently, including Ballistic and combined attacks", () => {
  assert.equal(DAMAGE_TYPES.length, 12);
  for (const type of DAMAGE_TYPES) assert.equal(normalizeDamageTypes(type.toLowerCase()), type);
  assert.equal(normalizeDamageTypes(" Fire / ballistic / Fire ", { multiple: true }), "Ballistic / Fire");
  assert.equal(normalizeDamageTypes("Bludgeoning"), "Blunt");
  assert.equal(normalizeDamageTypes(""), "");
  assert.throws(() => normalizeDamageTypes("", { required: true }), /required/);
  for (const value of ["pow damage", "Physical", "Firearm/Piercing", "Rule", "Special", "Variable", "Control", "Fire /"]) {
    assert.throws(() => normalizeDamageTypes(value, { multiple: true }), /unapproved/);
  }
});

test("weapon saves reject arbitrary text, retain an unresolved saved value, and accept unfinished drafts", () => {
  assert.equal(normalizeWeaponDamageType({ damageType: "" }, null), "");
  assert.equal(normalizeWeaponDamageType({ damageType: "bludgeoning / fire" }, null), "Blunt / Fire");
  assert.throws(() => normalizeWeaponDamageType({ damageType: "pow damage" }, null), /unapproved/);
  assert.throws(() => normalizeWeaponDamageType({ damageType: "Control" }, { damageType: "Special" }), /unapproved/);
  assert.equal(normalizeWeaponDamageType({ damageType: "Special" }, { damageType: "Special" }), "Special");
  assert.equal(normalizeWeaponDamageType({ damageType: "Ballistic / Fire" }, { damageType: "Special" }), "Ballistic / Fire");
});

test("armor permits multiple approved types and cannot add, alter, or duplicate a legacy rule", () => {
  const row = { damageType: "Physical", modifier: "-1", modifierText: "physical -1", notes: "Needs review" };
  assert.deepEqual(normalizeArmorDamageTypes([row], [row]), [row]);
  assert.throws(() => normalizeArmorDamageTypes([row], []), /unapproved/);
  assert.throws(() => normalizeArmorDamageTypes([row, row], [row]), /unapproved/);
  assert.throws(() => normalizeArmorDamageTypes([{ ...row, modifier: "-2" }], [row]), /unapproved/);
  assert.equal(normalizeArmorDamageTypes([{ ...row, damageType: "Fire / Cold" }], [])[0].damageType, "Fire / Cold");
  assert.equal(normalizeArmorDamageTypes([{ ...row, damageType: "Bludgeoning" }], [])[0].damageType, "Blunt");
  assert.equal(normalizeArmorDamageTypes([{ ...row, damageType: "Ballistic" }], [row])[0].modifier, "-1");
});

test("nested Forms and defenses preserve legacy rows by identity and block new arbitrary types", () => {
  const stored = { forms: [{ key: "beast", attacks: [{ canonicalId: "bite", damageType: "Variable", notes: "legacy" }, { canonicalId: "claw", damageType: "Slashing" }],
    interactionRules: { rules: [{ key: "ward", conditions: [{ key: "heat", kind: "damage-type", damageType: "Fire" }] }] } }] };
  const draft = structuredClone(stored); draft.forms[0].attacks.reverse();
  draft.forms[0].interactionRules.rules[0].conditions[0].damageType = "cold / fire";
  assert.equal(normalizeAuthoredDamageTypes(draft, stored).forms[0].attacks[1].damageType, "Variable");
  assert.equal(normalizeAuthoredDamageTypes(draft, stored).forms[0].interactionRules.rules[0].conditions[0].damageType, "Fire / Cold");
  draft.forms[0].attacks[1].canonicalId = "new-attack";
  assert.throws(() => normalizeAuthoredDamageTypes(draft, stored), /unapproved/);
  draft.forms[0].attacks[1].damageType = "Piercing";
  draft.forms[0].interactionRules.rules[0].conditions[0].damageType = "";
  assert.throws(() => normalizeAuthoredDamageTypes(draft, stored), /required/);
  assert.equal(stored.forms[0].attacks[0].damageType, "Variable");
});

test("defenses compare approved aliases without rewriting facts or guessing mixed damage splits", () => {
  assert.equal(matchDamageType("Bludgeoning", "Blunt"), true);
  assert.equal(matchDamageType("Blunt", "bludgeoning"), true);
  assert.equal(matchDamageType("Ballistic", "Piercing"), false);
  assert.equal(matchDamageType("Ballistic / Fire", "Fire"), null);
  assert.equal(matchDamageType("Ballistic / Fire", "Cold"), false);
  assert.equal(matchDamageType("Fire", "Fire / Cold"), null, "A multi-type defense needs its matching interpretation ruled first");
  assert.equal(matchDamageType("Physical", "Blunt"), null);
  assert.equal(matchDamageType(null, "Ballistic"), null);
});
