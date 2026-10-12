import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { emptyLore, fieldLabels, loreDraftSchema } from "./peoples";
import { blankCycle, projectCycle, type SkyCycle } from "./astronomy";
import { astronomyComposition, astronomyInputIssues, astronomyIssuePath, astronomySaveIssue, repairFFamilies } from "./astronomy-composition";
import { getCreatorComposition, hasCreatorWorkshop } from "./creator-composition";
import { patchPilotField, pilotIssueSection, pilotIssueMessage } from "./pilot-composition";

test("three distinct sky workshops reach all 17 typed fields and structured sources", () => {
  let count = 0;
  for (const family of repairFFamilies) {
    const c = getCreatorComposition(family)!;
    assert.equal(c, astronomyComposition[family]);
    assert.deepEqual(Object.keys(c.fields).sort(), Object.keys(fieldLabels[family]).sort());
    assert.equal(new Set(c.sections.map(s => s.id)).size, c.sections.length);
    assert.equal(c.savedConnectionsOnly, true);
    for (const [key, q] of Object.entries(c.fields)) { assert.equal(pilotIssueSection(family, ["fields", key]), q.section); assert.match(q.help, /Optional/); count++; }
    assert.equal(pilotIssueSection(family, ["calendarBindings", 0, "calendarVersionId"]), "calendars");
  }
  assert.equal(count, 17);
  assert.equal(new Set(repairFFamilies.map(f => astronomyComposition[f].sections[0].label)).size, 3);
  assert.equal(pilotIssueSection("skyCycle", ["cycle", "phases", 0, "duration"]), "cycle");
  for (const family of ["individual", "cosmicPrinciple", "language", "relationship", "government", "appointment", "organization", "membership", "realm", "cosmicConnection", ...repairFFamilies]) assert.equal(hasCreatorWorkshop(family), true);
  for (const family of ["calendar", "map", "character"]) assert.equal(hasCreatorWorkshop(family), false);
});
test("name-only sky accounts invent no model, calendar, observer or event", () => {
  for (const family of repairFFamilies) {
    const d = loreDraftSchema.parse({ ...emptyLore(family), name: "An impossible sky" });
    assert.equal(d.cycle ?? null, null); assert.deepEqual(d.calendarBindings ?? [], []);
    assert.deepEqual(d.participants, []); assert.deepEqual(d.milestones, []); assert.equal(d.time.kind, "undated");
    assert.equal(loreDraftSchema.safeParse({ ...d, participants: [{ targetId: null, role: "claimed observer", authoredReference: "An uncertain witness", account: "" }] }).success, false);
    assert.match(pilotIssueMessage(family, { path: ["participants", 0, "targetId"], message: "Invalid" }), /saved creation/);
  }
});
test("all narrative edits preserve exact rules, phases, retained revisions and projections", () => {
  const cycle = { ...blankCycle(), scale: "world-year" as const, unit: "year" as const, period: "7/3", anchor: "-10", offset: "-1/3", window: "1/3", beginning: "-20", ending: "30", approximate: true, phases: [{ id: randomUUID(), name: "Silver awakening", duration: "1/3", description: "An attributed color" }, { id: randomUUID(), name: "Listening dark", duration: "2", description: "A longer phase" }] };
  for (const family of repairFFamilies) {
    let draft = loreDraftSchema.parse({ ...emptyLore(family), name: "An exact account", ...(family === "skyCycle" ? { cycle } : {}), calendarBindings: [{ id: randomUUID(), calendarVersionId: randomUUID(), revision: 9, role: "ceremonial month", account: "A disputed meaning", protected: true }], periods: [{ id: randomUUID(), label: "Disputed years", status: "unknown", account: "One observer", perspective: "Sailors", beginning: null, ending: null }], privateNotes: "Keep original notes" });
    const original = structuredClone(draft);
    for (const key of Object.keys(fieldLabels[family])) draft = loreDraftSchema.parse({ ...draft, ...patchPilotField(draft, key, `Original ${key}`) });
    assert.deepEqual({ ...draft, fields: original.fields }, original);
    if (draft.cycle) assert.deepEqual(projectCycle(draft.cycle, draft.cycle.anchor, "-20", "30"), projectCycle(original.cycle!, original.cycle!.anchor, "-20", "30"));
  }
});
test("cross-field cycle validation resolves the real failing control without changing domain errors", () => {
  const base = { ...blankCycle(), scale: "world-year" as const, unit: "year" as const, period: "2", anchor: "0" };
  for (const [value, expected] of [[{ window: "3" }, "cycle.window"], [{ beginning: "5", ending: "4" }, "cycle.ending"], [{ ending: "1000000000001" }, "cycle.ending"], [{ phases: [{ id: randomUUID(), name: "First", duration: "1", description: "" }] }, "cycle.phases.0.duration"]] as [Partial<SkyCycle>, string][]) {
    const d = { ...emptyLore("skyCycle"), name: "Invalid model", cycle: { ...base, ...value } };
    const parsed = loreDraftSchema.safeParse(d); assert.equal(parsed.success, false);
    if (!parsed.success) { const issue = parsed.error.issues.find(issue => issue.path.join(".") === "cycle")!; assert.ok(issue); assert.equal(astronomyIssuePath(d, issue.path, issue.message).join("."), expected); }
  }
  assert.equal(astronomySaveIssue("Establish this World's shared day reference in Calendars before using an elapsed-day anchor.")?.path.join("."), "cycle.anchor");
  assert.equal(astronomySaveIssue("Hour/minute periods require a saved anchored calendar version with explicit day units.")?.path.join("."), "cycle.unit");
  assert.equal(astronomySaveIssue("Choose a calendar version in this World.")?.path.join("."), "calendarBindings");
});

test("incomplete exact-number and position inputs become focused issues before throwing refinements", () => {
  const invalid = { ...emptyLore("skyCycle"), name: "A draft", cycle: { ...blankCycle(), period: "7/0", offset: "1e3", window: "-1", anchor: "", beginning: "1.2", phases: [{ id: randomUUID(), name: "A phase", duration: "0/0", description: "" }] } };
  assert.deepEqual(astronomyInputIssues(invalid).map(issue => issue.path.join(".")), ["cycle.period", "cycle.offset", "cycle.window", "cycle.phases.0.duration", "cycle.anchor", "cycle.beginning"]);
  assert.deepEqual(astronomyInputIssues({ ...invalid, cycle: { ...blankCycle(), period: "7/3", offset: "-1/3", anchor: "-10" } }), []);
  assert.deepEqual(astronomyInputIssues({ ...emptyLore("cosmicPrinciple"), name: "The original pilot" }), []);
});
