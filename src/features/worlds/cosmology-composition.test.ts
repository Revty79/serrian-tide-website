import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { emptyLore, fieldLabels, loreDraftSchema } from "./peoples";
import { getCreatorComposition, hasCreatorWorkshop } from "./creator-composition";
import { pilotFieldSection, pilotIssueMessage, pilotIssueSection, patchPilotField, principleCopy, principleSections } from "./pilot-composition";
import { cosmologyComposition, isRepairEFamily, repairEFamilies } from "./cosmology-composition";

test("all 54 remaining cosmic fields have reachable questions in four distinct workshops", () => {
  let count = 0;
  for (const family of repairEFamilies) {
    const composition = getCreatorComposition(family)!;
    assert.equal(composition, cosmologyComposition[family]);
    assert.deepEqual(Object.keys(composition.fields).sort(), Object.keys(fieldLabels[family]).sort());
    assert.equal(new Set(composition.sections.map(s => s.id)).size, composition.sections.length);
    assert.equal(new Set(Object.values(composition.fields).map(q => q.label)).size, Object.keys(composition.fields).length);
    for (const [key, question] of Object.entries(composition.fields)) {
      assert.ok(composition.sections.some(s => s.id === pilotFieldSection(family, key)));
      assert.ok(question.help.includes("Optional"));
      count++;
    }
  }
  assert.equal(count, 54);
  assert.equal(new Set(repairEFamilies.map(f => cosmologyComposition[f].sections.slice(0, -6).map(s => s.label).join("|"))).size, 4);
});

test("name-only cosmic creations never infer matter, chronology, participants or events", () => {
  for (const family of repairEFamilies) {
    const draft = loreDraftSchema.parse({ ...emptyLore(family), name: "An impossible creation" });
    assert.equal(draft.time.kind, "undated");
    assert.deepEqual(draft.participants, []);
    assert.deepEqual(draft.milestones, []);
    assert.ok(Object.values(draft.fields).every(value => value === ""));
    const uncertain = { ...draft, participants: [{ targetId: null, authoredReference: "A remembered realm", role: "possible reflection", account: "One witness" }] };
    assert.equal(loreDraftSchema.safeParse(uncertain).success, !cosmologyComposition[family].savedConnectionsOnly);
    assert.equal(loreDraftSchema.safeParse({ ...uncertain, participants: [{ ...uncertain.participants[0], targetId: randomUUID(), authoredReference: "" }] }).success, true);
  }
});

test("impossible properties and authored time stay independent from all saved historical depth", () => {
  for (const family of repairEFamilies) {
    const target = randomUUID();
    const draft = loreDraftSchema.parse({ ...emptyLore(family), name: "A moon of thoughts", fields: Object.fromEntries(Object.keys(fieldLabels[family]).map(key => [key, key === "time" ? "Time runs backward" : key === "mass" ? "Negative memories" : `Original ${key}`])), time: { version: 1, scale: "world-year", kind: "known", year: 50 }, participants: [{ targetId: target, authoredReference: "", role: "source and reflection", account: "First account" }, { targetId: target, authoredReference: "", role: "other destination", account: "Disagreement", protected: true }], periods: [{ id: randomUUID(), label: "Before time", status: "alleged and timeless", account: "Original account", perspective: "Dreamers", beginning: null, ending: null, protected: true }], historyRefs: [{ entityId: randomUUID(), versionId: randomUUID() }], sections: [{ id: randomUUID(), title: "Unusual detail", body: "Keep this secret", protected: true }], privateNotes: "Retained notes" });
    const key = Object.keys(fieldLabels[family]).at(-1)!;
    const expected = structuredClone(draft); expected.fields[key] = "One edited answer";
    assert.deepEqual(loreDraftSchema.parse({ ...draft, ...patchPilotField(draft, key, "One edited answer") }), expected);
    assert.deepEqual(expected.time, draft.time);
    assert.equal(expected.periods![0].ending, null);
  }
});

test("hidden access defaults remain protected and explicit saved protection choices survive edits", () => {
  for (const [family, key] of [["realm", "hiddenAccess"], ["cosmicConnection", "conditions"]] as const) {
    const original = loreDraftSchema.parse({ ...emptyLore(family), name: "A secret way", fields: { [key]: "Confidential route" } });
    assert.deepEqual(original.protectedFields, [key]);
    const explicit = { ...original, protectedFields: ["description"] };
    const edited = loreDraftSchema.parse({ ...explicit, ...patchPilotField(explicit, "classification", "Dream reflection") });
    assert.deepEqual(edited.protectedFields, ["description"]);
    assert.equal(edited.fields[key], "Confidential route");
  }
});

test("cosmic validation reveals supporting sections and the independent failing date endpoint", () => {
  for (const family of repairEFamilies) {
    for (const [root, section] of Object.entries({ participants: "connections", geographies: "places", periods: "periods", protectedFields: "private", historyRefs: "history", milestones: "history", calendarDate: "history", sections: "custom" })) assert.equal(pilotIssueSection(family, [root, 0, "account"]), section);
    const invalid = loreDraftSchema.safeParse({ ...emptyLore(family), name: "A changing realm", periods: [{ id: randomUUID(), label: "Unknown beginning", status: "disputed", beginning: null, ending: { version: 1, scale: "world-year", kind: "window", startYear: 10, endYear: 5 } }] });
    assert.equal(invalid.success, false);
    if (!invalid.success) assert.ok(invalid.error.issues.some(issue => issue.path.join(".") === "periods.0.ending.endYear"));
    assert.equal(pilotIssueMessage(family, { path: ["periods", 0, "status"], message: "Too small" }), "Describe this period's status, or write unknown.");
  }
  assert.match(pilotIssueMessage("cosmicConnection", { path: ["participants", 0, "targetId"], message: "Invalid input" }), /Keep uncertain cosmic claims/);
});

test("Cosmic Principle retains its A2 questions, sections and validation; Living Skies is not an E composition", () => {
  assert.equal(isRepairEFamily("cosmicPrinciple"), false);
  assert.equal(getCreatorComposition("cosmicPrinciple"), null);
  assert.deepEqual(principleSections.map(s => [s.id, s.label]), [["identity", "The rule"], ["scope", "Where it applies"], ["when", "Circumstances"], ["periods", "Through history"], ["exceptions", "Exceptions"], ["accounts", "Different accounts"], ["history", "History"], ["custom", "Original details"], ["private", "Private notes"]]);
  assert.deepEqual(Object.keys(principleCopy).sort(), Object.keys(fieldLabels.cosmicPrinciple).sort());
  assert.equal(principleCopy.statement.label, "What does the rule say?");
  assert.equal(pilotFieldSection("cosmicPrinciple", "exceptions"), "exceptions");
  assert.equal(pilotIssueMessage("cosmicPrinciple", { path: ["periods", 0, "status"], message: "Too small" }), "Describe the rule's state, or write unknown.");
  for (const family of ["individual", "cosmicPrinciple", "language", "relationship", "government", "appointment", "organization", "assignment", ...repairEFamilies]) assert.equal(hasCreatorWorkshop(family), true);
  for (const family of ["skyCycle", "skyObservation", "skyCalendarLink"]) assert.equal(isRepairEFamily(family), false);
});
