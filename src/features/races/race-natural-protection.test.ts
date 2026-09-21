import assert from "node:assert/strict";
import test from "node:test";
import { NATURAL_PROTECTION_LOCATIONS, normalizeRaceNaturalProtection, type RaceNaturalProtection } from "./race-natural-protection";
const entry: RaceNaturalProtection = { key: "scales", name: "Scaled Hide", naturalSoak: 1, coverage: { kind: "all" }, sortOrder: 0 };
test("Race protection normalizes names, coverage and order without changing source keys", () => {
  assert.deepEqual(normalizeRaceNaturalProtection([]), []);
  assert.equal(NATURAL_PROTECTION_LOCATIONS.length, 10);
  assert.equal(NATURAL_PROTECTION_LOCATIONS[9].name, "Chest");
  const rows = normalizeRaceNaturalProtection([entry, { ...entry, key: "shell", name: " Shell ", sortOrder: 40, coverage: { kind: "locations", locationKeys: ["9", "7", "8"] } }]);
  assert.deepEqual(rows[1], { ...entry, key: "shell", name: "Shell", sortOrder: 1, coverage: { kind: "locations", locationKeys: ["7", "8", "9"] } });
});
test("Race amounts accept zero/fractions but reject negatives, nonnumbers and nonfinite values", () => {
  for (const naturalSoak of [0, 0.5]) assert.equal(normalizeRaceNaturalProtection([{ ...entry, naturalSoak }])[0].naturalSoak, naturalSoak);
  for (const value of [-1, NaN, Infinity, -Infinity, null, "2"]) {
    assert.throws(() => normalizeRaceNaturalProtection([{ ...entry, naturalSoak: value } as RaceNaturalProtection]), /zero or greater/);
  }
});

test("old Armor input cannot become a second reduction or be added into Soak", () => {
  const staleInput = { ...entry, naturalArmor: 90 };
  assert.deepEqual(normalizeRaceNaturalProtection([staleInput]), [entry]);
});
test("Race protection rejects missing names, duplicate identity and unsupported or empty coverage", () => {
  assert.throws(() => normalizeRaceNaturalProtection([{ ...entry, name: " " }]), /Name/);
  assert.throws(() => normalizeRaceNaturalProtection([entry, entry]), /identity/);
  for (const locationKeys of [[], ["torso"], ["10"], ["9", "9"]]) assert.throws(() => normalizeRaceNaturalProtection([{ ...entry, coverage: { kind: "locations", locationKeys } }]), /Coverage|Coverage location/);
});
