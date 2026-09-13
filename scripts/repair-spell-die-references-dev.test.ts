import assert from "node:assert/strict";
import { test } from "node:test";
import { repairDocument, repairs } from "./repair-spell-die-references-dev";

for (const repair of repairs) {
  test(`${repair.name}: exact text replacement preserves other data and can be repeated`, () => {
    const originalText = `Prefix. ${repair.replacements.map(([before]) => before).join(". ")}. Suffix.`;
    const expectedText = `Prefix. ${repair.replacements.map(([, after]) => after).join(". ")}. Suffix.`;
    const document = {
      id: "spell-428409735686242455d2",
      notes: repair.field ? "Unrelated notes containing 1d4" : originalText,
      modifiers: [{ id: "modifier-1", ruleId: "backlash", quantity: 5, description: repair.field ? originalText : "Keep 1d6 fixture" }],
      containers: [{ id: "container-1", effects: [{ ruleId: "damage", quantity: 10 }] }],
      calculationSnapshot: { total: 55 },
      hitLocationLabel: "Exact d10 Hit Location",
      rollLabel: "Percentile / d100",
    };
    const originalJson = JSON.stringify(document, null, 2);
    const expectedDocument = structuredClone(document);
    if (repair.field) expectedDocument.modifiers[0].description = expectedText;
    else expectedDocument.notes = expectedText;
    const result = repairDocument(originalJson, repair);
    assert.equal(result.before, originalText);
    assert.equal(result.after, expectedText);
    assert.deepEqual(JSON.parse(result.dataJson), expectedDocument);
    assert.equal(JSON.stringify(document, null, 2), originalJson);
    assert.equal(repairDocument(result.dataJson, repair).dataJson, result.dataJson);
  });
}

test("unexpected text, duplicate matches and missing fields are rejected", () => {
  const repair = repairs.find((candidate) => candidate.name === "Astral Step")!;
  assert.throws(() => repairDocument(JSON.stringify({ notes: "A different authoring decision." }), repair), /changed since review/);
  assert.throws(() => repairDocument(JSON.stringify({ notes: "1d4 vitality damage and 1d4 vitality damage" }), repair), /ambiguous/);
  assert.throws(() => repairDocument(JSON.stringify({ notes: 3 }), repair), /missing text/);
  assert.throws(() => repairDocument("{}", repairs.find((candidate) => candidate.field)!), /missing modifier/);
});

test("already repaired documents retain their exact serialization", () => {
  const repair = repairs.find((candidate) => candidate.name === "Astral Step")!;
  const json = '{ "notes": "If interrupted, caster suffers 3 damage." }';
  assert.equal(repairDocument(json, repair).dataJson, json);
});

test("the review targets only the expected 17 spells and 18 wording replacements", () => {
  assert.equal(repairs.length, 17);
  assert.equal(new Set(repairs.map((repair) => repair.id)).size, 17);
  assert.equal(repairs.reduce((count, repair) => count + repair.replacements.length, 0), 18);
});
