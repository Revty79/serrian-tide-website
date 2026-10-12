import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { emptyLore, fieldLabels, loreDraftSchema } from "./peoples";
import { getCreatorComposition, hasCreatorWorkshop } from "./creator-composition";
import { pilotFieldSection, pilotIssueMessage, pilotIssueSection, patchPilotField } from "./pilot-composition";
import { politicsComposition, repairCFamilies } from "./politics-composition";

test("all 68 political fields are reachable once and retain their actual storage identity", () => {
  let total = 0;
  for (const family of repairCFamilies) {
    const composition = getCreatorComposition(family)!;
    assert.equal(composition, politicsComposition[family]);
    assert.equal(hasCreatorWorkshop(family), true);
    assert.deepEqual(Object.keys(composition.fields).sort(), Object.keys(fieldLabels[family]).sort());
    assert.equal(new Set(composition.sections.map(s => s.id)).size, composition.sections.length);
    assert.equal(new Set(Object.values(composition.fields).map(q => q.label)).size, Object.keys(composition.fields).length);
    for (const [key, question] of Object.entries(composition.fields)) {
      assert.ok(composition.sections.some(s => s.id === pilotFieldSection(family, key)));
      assert.ok(question.help.includes("Optional"));
      total++;
    }
  }
  assert.equal(total, 68);
  assert.equal(new Set(repairCFamilies.map(f => politicsComposition[f].sections.slice(0, -6).map(s => s.label).join("|"))).size, 8);
});

test("political uncertainty remains narrative while relationship connections require real identities", () => {
  for (const family of repairCFamilies) {
    const draft = loreDraftSchema.parse({ ...emptyLore(family), name: "A political idea" });
    assert.equal(draft.time.kind, "undated");
    assert.deepEqual(draft.participants, []);
    assert.deepEqual(draft.milestones, []);
    assert.ok(Object.values(draft.fields).every(value => value === ""));
    const unresolved = { ...draft, participants: [{ targetId: null, authoredReference: "A disputed source", role: "claimed connection", account: "Attributed prose" }] };
    assert.equal(loreDraftSchema.safeParse(unresolved).success, !politicsComposition[family].savedConnectionsOnly);
    assert.equal(loreDraftSchema.safeParse({ ...unresolved, participants: [{ ...unresolved.participants[0], targetId: randomUUID(), authoredReference: "" }] }).success, true);
  }
});

test("political field edits retain protected data, periods, source pins and unrelated answers", () => {
  for (const family of repairCFamilies) {
    const key = Object.keys(fieldLabels[family])[0];
    const draft = loreDraftSchema.parse({ ...emptyLore(family), name: "Retained political identity", fields: Object.fromEntries(Object.keys(fieldLabels[family]).map(k => [k, `Original ${k}`])), protectedFields: [key, "description"], periods: [{ id: randomUUID(), label: "The disputed years", status: "shared and contested", account: "Original attributed account", perspective: "Two witnesses", beginning: null, ending: null, protected: true }], historyRefs: [{ entityId: randomUUID(), versionId: randomUUID() }], sections: [{ id: randomUUID(), title: "Unusual tradition", body: "Retain this", protected: true }] });
    const expected = structuredClone(draft);
    expected.fields[key] = "Edited answer";
    assert.deepEqual(loreDraftSchema.parse({ ...draft, ...patchPilotField(draft, key, "Edited answer") }), expected);
  }
});

test("political supporting errors identify the right section and preserve unknown endpoints", () => {
  for (const family of repairCFamilies) {
    for (const [root, section] of Object.entries({ participants: "connections", geographies: "places", periods: "periods", protectedFields: "private", milestones: "history", historyRefs: "history", calendarDate: "history", sections: "custom" })) assert.equal(pilotIssueSection(family, [root, 0, "account"]), section);
    const period = { id: randomUUID(), label: "A contested phase", status: "original uncertain status", beginning: null, ending: { version: 1, scale: "world-year", kind: "approximate", year: 7 } };
    const draft = loreDraftSchema.parse({ ...emptyLore(family), name: "Period account", periods: [period] });
    assert.equal(draft.periods![0].beginning, null);
    assert.equal(draft.periods![0].status, period.status);
    const invalid = loreDraftSchema.safeParse({ ...draft, periods: [{ ...draft.periods![0], ending: { version: 1, scale: "world-year", kind: "window", startYear: 10, endYear: 5 } }] });
    assert.equal(invalid.success, false);
    if (!invalid.success) assert.ok(invalid.error.issues.some(issue => issue.path.join(".") === "periods.0.ending.endYear"));
    assert.equal(pilotIssueMessage(family, { path: ["periods", 0, "status"], message: "Too small" }), "Describe this period's status, or write unknown.");
  }
});

test("A2 and B compositions remain available; future families keep their current editors", () => {
  for (const family of ["individual", "cosmicPrinciple", "species", "language", "relationship"]) assert.equal(hasCreatorWorkshop(family), true);
  for (const family of ["skyCycle", "skyObservation", "skyCalendarLink"]) assert.equal(hasCreatorWorkshop(family), false);
});
