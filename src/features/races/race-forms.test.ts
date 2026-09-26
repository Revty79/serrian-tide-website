import assert from "node:assert/strict";
import test from "node:test";
import { emptyRaceForm, normalizeRaceForms, type RaceForm } from "./race-forms";

test("zero Forms represent the normal Race without an inferred base Form", () => {
  assert.deepEqual(normalizeRaceForms([]), []);
  assert.deepEqual(emptyRaceForm("wolf"), { key: "wolf", name: "", description: "", notes: "", sortOrder: 0 });
});

test("20 independently authored Forms retain keys and text while array order determines sort order", () => {
  const forms = Array.from({ length: 20 }, (_, index) => ({ ...emptyRaceForm(`form-${index}`), name: `State ${index}`, description: `Description\n${index}`, notes: `Notes ${index}`, sortOrder: 99 }));
  const result = normalizeRaceForms([...forms].reverse());
  assert.equal(result.length, 20);
  assert.deepEqual(result, [...forms].reverse().map((form, sortOrder) => ({ ...form, sortOrder })));
  assert.equal(forms[0].sortOrder, 99, "normalization does not mutate drafts");
});

test("blank, duplicate, malformed identities and blank names reject without coercion", () => {
  const form = { ...emptyRaceForm("wolf"), name: "Wolf" };
  for (const invalid of [null, {}, [null], [{ ...form, key: " " }], [{ ...form, key: 123 }], [form, { ...form, key: " wolf " }], [{ ...form, name: "\n " }], [{ ...form, description: null }], [{ ...form, notes: [] }]]) {
    assert.throws(() => normalizeRaceForms(invalid as RaceForm[]));
  }
  assert.deepEqual(normalizeRaceForms([{ ...form, name: " Wolf ", description: " Snow\ncoat ", notes: " " }]), [{ ...form, description: "Snow\ncoat" }]);
});

test("names need not be unique and client database ownership or future mechanics are not accepted", () => {
  const form = { ...emptyRaceForm("wolf"), name: "Wolf", id: 1, raceId: 999, parentFormId: 3, size: "Large" };
  const normalized = normalizeRaceForms([form, { ...form, key: "other" }]);
  assert.deepEqual(normalized, [
    { ...emptyRaceForm("wolf"), name: "Wolf" },
    { ...emptyRaceForm("other"), name: "Wolf", sortOrder: 1 },
  ]);
});
