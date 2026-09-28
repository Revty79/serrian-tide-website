import assert from "node:assert/strict";
import test from "node:test";
import { evolutionDestinationLabel, normalizeEvolutionPath } from "./creature-evolutions";

const input = { sourceCreatureId: 11, destinationCreatureId: 22, name: " Grow ", description: " description ", notes: " notes " };
test("Evolution authoring normalizes text and retains exact saved definition IDs", () => {
  assert.deepEqual(normalizeEvolutionPath(input), { sourceCreatureId: 11, destinationCreatureId: 22, name: "Grow", description: "description", notes: "notes" });
  assert.throws(() => normalizeEvolutionPath({ ...input, destinationCreatureId: 11 }), /itself/);
  for (const id of [0, -1, 1.2, NaN, Infinity]) assert.throws(() => normalizeEvolutionPath({ ...input, destinationCreatureId: id }), /saved record/);
  assert.throws(() => normalizeEvolutionPath({ ...input, name: " " }), /name is required/);
  assert.throws(() => normalizeEvolutionPath({ ...input, id: 9 }), /version/);
});
test("destination labels disambiguate exact variants and retained archived definitions", () => {
  const label = evolutionDestinationLabel({ id: 22, canonicalId: "CREATURE-22", canonicalName: "Drake", parentCreatureId: 4, parentCreatureName: "Young Drake", archived: true });
  for (const text of ["Drake", "#22", "CREATURE-22", "Variant of Young Drake", "Archived"]) assert.ok(label.includes(text));
});
