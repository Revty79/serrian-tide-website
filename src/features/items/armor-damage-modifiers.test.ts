import assert from "node:assert/strict";
import test from "node:test";
import { parseArmorSoakModifier, resolveWornArmorSoak } from "./armor-damage-modifiers";
import { normalizeArmorDamageTypes } from "./item-damage-types";

const row = (damageType = "Fire", modifier = "+2", id = 1) => ({ id, damageType, modifier, modifierText: "Fire -999", notes: "Descriptive only" });
test("armor Modifier requires a whole finite signed decimal, not a number extracted from prose", () => {
  for (const [value, number] of [["+2", 2], ["-2", -2], ["0", 0], [" -.25 ", -.25], ["2.5", 2.5]] as const) assert.equal(parseArmorSoakModifier(value), number);
  for (const value of ["", "Fire +2", "2 points", "50%", "Infinity", "NaN", "1e3", "0x10", "+", "9".repeat(400)]) assert.equal(parseArmorSoakModifier(value), null);
});
for (const [type, modifier, baseSoak, expected] of [["Fire", "+2", 5, 7], ["Piercing", "-2", 5, 3], ["Acid", "-5", 2, 0], ["Fire", "0", 5, 5], ["Cold", "+2", 5, 5]] as const) {
  test(`armor ${type} ${modifier}, Base ${baseSoak}, incoming ${type === "Cold" ? "Fire" : type} gives Soak ${expected}`, () => {
    assert.equal(resolveWornArmorSoak({ baseSoak, damageModifiers: [row(type, modifier)] }, type === "Cold" ? "Fire" : type).soak, expected);
  });
}
test("canonical type aliases work, prose is ignored, decimal arithmetic does not add damage", () => {
  assert.equal(resolveWornArmorSoak({ baseSoak: 5, damageModifiers: [row("Bludgeoning")] }, "Blunt").soak, 7);
  assert.equal(resolveWornArmorSoak({ baseSoak: .1, damageModifiers: [row("Fire", "+0.2")] }, "Fire").soak, .3);
  assert.equal(resolveWornArmorSoak({ baseSoak: 5, damageModifiers: [] }, null).soak, 5);
});
test("unsplit types execute only when every type has identical effective protection", () => {
  assert.equal(resolveWornArmorSoak({ baseSoak: 5, damageModifiers: [row("Fire")] }, "Fire / Cold").soak, null);
  assert.equal(resolveWornArmorSoak({ baseSoak: 5, damageModifiers: [row("Fire"), row("Cold", "+2", 2)] }, "Fire / Cold").soak, 7);
  assert.equal(resolveWornArmorSoak({ baseSoak: 2, damageModifiers: [row("Fire", "-3"), row("Cold", "-5", 2)] }, "Fire / Cold").soak, 0);
  assert.equal(resolveWornArmorSoak({ baseSoak: 5, damageModifiers: [row("Fire")] }, "Piercing / Cold").soak, 5);
  assert.equal(resolveWornArmorSoak({ baseSoak: 5, damageModifiers: [row("Fire / Cold")] }, "Fire").soak, null);
});
test("relevant malformed, unknown, duplicate and overflow definitions require a ruling", () => {
  for (const damageModifiers of [[row("Fire", "Fire +2")], [row("Physical")], [row(), row("Fire", "-2", 2)], [row("Fire / Cold")]]) {
    const result = resolveWornArmorSoak({ baseSoak: 5, damageModifiers }, "Fire");
    assert.equal(result.soak, null); assert.ok(result.issues.length);
  }
  assert.equal(resolveWornArmorSoak({ baseSoak: 5, damageModifiers: [row()] }, null).soak, null);
  assert.equal(resolveWornArmorSoak({ baseSoak: 5, damageModifiers: [row("Cold", "unknown")] }, "Fire").soak, 5);
  assert.equal(resolveWornArmorSoak({ baseSoak: Number.MAX_VALUE, damageModifiers: [row("Fire", "9".repeat(308))] }, "Fire").soak, null);
});
test("new numeric and canonical duplicate authoring rejects while unchanged legacy rows survive", () => {
  const legacy = row("Fire", "Fire +2");
  assert.deepEqual(normalizeArmorDamageTypes([legacy], [legacy]), [legacy]);
  assert.throws(() => normalizeArmorDamageTypes([legacy], []), /finite signed decimal/);
  assert.throws(() => normalizeArmorDamageTypes([legacy, legacy], [legacy]), /finite signed decimal/);
  assert.throws(() => normalizeArmorDamageTypes([row(), row("fire", "-2", 2)], []), /more than one/);
  assert.throws(() => normalizeArmorDamageTypes([row("Blunt"), row("Bludgeoning", "-2", 2)], []), /more than one/);
  const duplicates = [row(), row("Fire", "-2", 2)];
  assert.deepEqual(normalizeArmorDamageTypes(duplicates, duplicates), duplicates);
  assert.equal(normalizeArmorDamageTypes([row("Fire", "-2")], [legacy])[0].modifier, "-2");
});
