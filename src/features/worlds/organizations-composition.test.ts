import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { emptyLore, fieldLabels, loreDraftSchema } from "./peoples";
import { getCreatorComposition, hasCreatorWorkshop } from "./creator-composition";
import { pilotFieldSection, pilotIssueMessage, pilotIssueSection, patchPilotField } from "./pilot-composition";
import { organizationsComposition, repairDFamilies } from "./organizations-composition";

test("all 46 organization fields retain their domain keys and have a reachable subject-specific question", () => {
  let count = 0;
  for (const family of repairDFamilies) {
    const composition = getCreatorComposition(family)!;
    assert.equal(composition, organizationsComposition[family]);
    assert.deepEqual(Object.keys(composition.fields).sort(), Object.keys(fieldLabels[family]).sort());
    assert.equal(new Set(composition.sections.map(s => s.id)).size, composition.sections.length);
    assert.equal(new Set(Object.values(composition.fields).map(q => q.label)).size, Object.keys(composition.fields).length);
    for (const [key, question] of Object.entries(composition.fields)) {
      assert.ok(composition.sections.some(s => s.id === pilotFieldSection(family, key)));
      assert.ok(question.help.includes("Optional"));
      count++;
    }
  }
  assert.equal(count, 46);
  assert.equal(new Set(repairDFamilies.map(f => organizationsComposition[f].sections.slice(0, -6).map(s => s.label).join("|"))).size, 5);
});

test("name-only organizations never invent a member, holder, hierarchy or historical event", () => {
  for (const family of repairDFamilies) {
    const draft = loreDraftSchema.parse({ ...emptyLore(family), name: "An original association" });
    assert.equal(draft.time.kind, "undated");
    assert.deepEqual(draft.participants, []);
    assert.deepEqual(draft.milestones, []);
    assert.ok(Object.values(draft.fields).every(value => value === ""));
    const unresolved = { ...draft, participants: [{ targetId: null, authoredReference: "A disputed affiliation", role: "possible connection", account: "Attributed prose" }] };
    assert.equal(loreDraftSchema.safeParse(unresolved).success, !organizationsComposition[family].savedConnectionsOnly);
    assert.equal(loreDraftSchema.safeParse({ ...unresolved, participants: [{ ...unresolved.participants[0], targetId: randomUUID(), authoredReference: "" }] }).success, true);
  }
});

test("confidential fields start protected but retained explicit protection choices are never overwritten", () => {
  const original = loreDraftSchema.parse({ ...emptyLore("organization"), name: "Public association", fields: { purpose: "Public study", confidentialGoals: "Private patron", secretOperations: "Private expedition" } });
  assert.deepEqual(original.protectedFields, ["confidentialGoals", "secretOperations"]);
  const explicitlyAuthored = { ...original, protectedFields: ["description", "purpose"] };
  const edited = loreDraftSchema.parse({ ...explicitlyAuthored, ...patchPilotField(explicitlyAuthored, "mission", "An original aim") });
  assert.deepEqual(edited.protectedFields, explicitlyAuthored.protectedFields);
  assert.equal(edited.fields.confidentialGoals, original.fields.confidentialGoals);
  assert.equal(loreDraftSchema.safeParse({ ...emptyLore("membership"), name: "Membership", protectedFields: ["confidentialGoals"] }).success, false);
});

test("joint assignments and overlapping networks retain independent accounts and unknown endpoints", () => {
  for (const family of repairDFamilies) {
    const target = randomUUID();
    const draft = loreDraftSchema.parse({ ...emptyLore(family), name: "Contested original account", fields: Object.fromEntries(Object.keys(fieldLabels[family]).map(key => [key, key === "classification" ? "" : `Original ${key}`])), participants: [{ targetId: target, authoredReference: "", role: "shared holder", account: "First meaning" }, { targetId: target, authoredReference: "", role: "independent partner", account: "Different meaning", protected: true }], periods: [{ id: randomUUID(), label: "The shared years", status: "contested and interrupted", account: "Original period", perspective: "One witness", beginning: null, ending: null, protected: true }, { id: randomUUID(), label: "Another account", status: "unknown", account: "Disagreeing witness", beginning: null, ending: null }], historyRefs: [{ entityId: randomUUID(), versionId: randomUUID() }], sections: [{ id: randomUUID(), title: "An unusual detail", body: "Retain this", protected: true }] });
    const key = Object.keys(fieldLabels[family]).at(-1)!;
    const expected = structuredClone(draft); expected.fields[key] = "An edited answer";
    assert.deepEqual(loreDraftSchema.parse({ ...draft, ...patchPilotField(draft, key, "An edited answer") }), expected);
    assert.equal(expected.periods![0].beginning, null);
    assert.equal(expected.periods![0].ending, null);
    assert.equal(expected.fields.classification, "");
  }
});

test("supporting validation reveals the correct section and nested endpoint without changing status", () => {
  for (const family of repairDFamilies) {
    for (const [root, section] of Object.entries({ participants: "connections", geographies: "places", periods: "periods", protectedFields: "private", milestones: "history", historyRefs: "history", calendarDate: "history", sections: "custom" })) assert.equal(pilotIssueSection(family, [root, 0, "account"]), section);
    const invalid = loreDraftSchema.safeParse({ ...emptyLore(family), name: "A dated account", periods: [{ id: randomUUID(), label: "An uncertain period", status: "disputed", beginning: null, ending: { version: 1, scale: "world-year", kind: "window", startYear: 10, endYear: 5 } }] });
    assert.equal(invalid.success, false);
    if (!invalid.success) assert.ok(invalid.error.issues.some(issue => issue.path.join(".") === "periods.0.ending.endYear"));
    assert.equal(pilotIssueMessage(family, { path: ["periods", 0, "status"], message: "Too small" }), "Describe this period's status, or write unknown.");
  }
});

test("A2 through D workshops remain available while future creators retain their established editors", () => {
  for (const family of ["individual", "cosmicPrinciple", "language", "relationship", "government", "appointment", ...repairDFamilies]) assert.equal(hasCreatorWorkshop(family), true);
  for (const family of ["calendar", "map", "character"]) assert.equal(hasCreatorWorkshop(family), false);
});
