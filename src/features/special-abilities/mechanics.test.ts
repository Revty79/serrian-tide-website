import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MECHANICS_LIMITS, parseSpecialAbilityMechanics, readSpecialAbilityMechanics } from "./codec";
import { emptySpecialAbilityMechanics, type MechanicsCondition, type MechanicsRule, type SpecialAbilityMechanicsDocument } from "./models";
import { SPECIAL_ABILITY_PROGRESSION_CONTRACT, resolveSpecialAbilityProgression } from "./progression";
import { resolveSpecialAbilityMechanics } from "./resolution";
import { collectMechanicsReferences } from "./references";
import { changeSkillExtension } from "@/features/skills/skill-extension-draft";

const capability = (): Extract<MechanicsRule, { kind: "capability" }> => ({ key: "cap-one", kind: "capability", domain: "other", title: "Synthetic capability", description: "Authored test description.",
  when: { mode: "always" }, limitations: "", notes: "", references: [] });
const manual = (): Extract<MechanicsRule, { kind: "manual" }> => ({ key: "manual-one", kind: "manual", title: "Synthetic manual rule", description: "A new concept.",
  when: { mode: "always" }, limitations: "A test limitation.", notes: "", references: [], adjudication: "The G.O.D. chooses the interpretation." });
const doc = (...rules: MechanicsRule[]): SpecialAbilityMechanicsDocument => ({ schemaVersion: 1, rules });
const stored = (document: SpecialAbilityMechanicsDocument) => ({ schemaVersion: 1, dataJson: JSON.stringify(document) });
const source = { id: 7001, name: "Uncatalogued synthetic ability", classification: " Special Abilities ", archived: false };
const allocations = { skillAllocations: [{ draftId: 1, skillId: source.id, points: 3, parentDraftId: null }, { draftId: 2, skillId: source.id, points: 7, parentDraftId: null }] };
const owner = { possessedSkillIds: new Set([source.id]), possessedDerivedAbilityIds: new Set<number>(), savedAllocations: allocations };

test("empty, absent, authored and future documents remain distinct; reads retain input bytes", () => {
  assert.deepEqual(parseSpecialAbilityMechanics(emptySpecialAbilityMechanics()), doc());
  assert.equal(readSpecialAbilityMechanics(null).status, "absent");
  assert.equal(resolveSpecialAbilityMechanics({ source, stored: stored(doc()), owner }).empty, true);
  assert.deepEqual(parseSpecialAbilityMechanics(doc(capability(), manual())), doc(capability(), manual()));
  const future = { schemaVersion: 99, dataJson: ' { "schemaVersion": 99, "rules": [], "newConcept": { "value": 3 } } ' };
  const before = structuredClone(future);
  assert.equal(readSpecialAbilityMechanics(future).status, "unsupported");
  assert.deepEqual(future, before);
  assert.throws(() => parseSpecialAbilityMechanics(future.dataJson, 2));
  assert.equal(readSpecialAbilityMechanics({ schemaVersion: 1, dataJson: future.dataJson }).status, "invalid");
  assert.equal(readSpecialAbilityMechanics({ schemaVersion: 1, dataJson: "{" }).status, "invalid");
});

test("codec rejects extra fields, executable shortcuts, invalid shapes, duplicate identities and unfinished conditions", () => {
  const base = capability();
  const invalid: unknown[] = [
    { ...doc(base), sourceSkillId: 12 }, { schemaVersion: 0, rules: [] }, { schemaVersion: 1, rules: {} },
    doc({ ...base, title: " " }), doc({ ...base, description: "" }), doc(base, base),
    { schemaVersion: 1, rules: [{ ...base, kind: "resource", balance: 5 }] },
    { schemaVersion: 1, rules: [{ ...base, effect: { script: "anything" } }] },
    { schemaVersion: 1, rules: [{ ...base, domain: "new-runtime-mode" }] },
    { schemaVersion: 1, rules: [{ ...base, when: { mode: "always", groups: [] } }] },
    { schemaVersion: 1, rules: [{ ...base, when: { mode: "requirements", groups: [] } }] },
    { schemaVersion: 1, rules: [{ ...base, when: { mode: "requirements", groups: [{ key: "g", conditions: [] }] } }] },
    { schemaVersion: 1, rules: [{ ...base, references: [{ kind: "item", itemId: 1 }] }] },
    { schemaVersion: 1, rules: [{ ...base, references: [{ kind: "skill", skillId: 0 }] }] },
    { schemaVersion: 1, rules: [{ ...base, references: [{ kind: "skill", skillId: 1, name: "client label" }] }] },
    doc({ ...manual(), adjudication: " " }),
  ];
  const clause: MechanicsCondition = { key: "c", kind: "manual", notes: "Context required." };
  invalid.push(doc({ ...base, when: { mode: "requirements", groups: [{ key: "g", conditions: [clause, clause] }] } }),
    doc({ ...base, when: { mode: "requirements", groups: [{ key: "g", conditions: [clause] }, { key: "g", conditions: [{ ...clause, key: "c2" }] }] } }),
    doc({ ...base, when: { mode: "requirements", groups: [{ key: "g", conditions: [clause] }, { key: "g2", conditions: [clause] }] } }));
  for (const input of invalid) assert.throws(() => parseSpecialAbilityMechanics(input));
  assert.throws(() => parseSpecialAbilityMechanics(doc({ ...base, description: "x".repeat(MECHANICS_LIMITS.text + 1) })));
  assert.throws(() => parseSpecialAbilityMechanics({ schemaVersion: 1, rules: Array(MECHANICS_LIMITS.rules + 1).fill(base) }));
  assert.throws(() => parseSpecialAbilityMechanics(" ".repeat(MECHANICS_LIMITS.bytes + 1)));
});

test("numeric operators and typed possession conditions parse without normalizing meaning", () => {
  const clauses: MechanicsCondition[] = ["gte", "gt", "lte", "lt", "eq", "neq"].map((operator, index) => ({ key: String(index), kind: "self-progression", operator: operator as "gte", requiredValue: 1.5 }));
  clauses.push({ key: "s", kind: "skill-possession", skillId: 7002, operator: "possessed" },
    { key: "d", kind: "derived-ability-possession", derivedAbilityId: 7003, operator: "not-possessed" },
    { key: "m", kind: "manual", notes: "  Preserve these authored spaces.  " });
  const document = doc({ ...capability(), when: { mode: "requirements", groups: [{ key: "g", conditions: clauses }] } });
  assert.deepEqual(parseSpecialAbilityMechanics(JSON.stringify(document)), document);
  for (const value of [NaN, Infinity, -Infinity, -1, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = structuredClone(document);
    invalid.rules[0].when = { mode: "requirements", groups: [{ key: "g", conditions: [{ key: "n", kind: "self-progression", operator: "gte", requiredValue: value }] }] };
    assert.throws(() => parseSpecialAbilityMechanics(invalid));
  }
  const invalid = JSON.parse(JSON.stringify(document));
  invalid.rules[0].when.groups[0].conditions[0].operator = ">=";
  assert.throws(() => parseSpecialAbilityMechanics(invalid));
});

test("progression is an explicitly provisional saved source, maximum across paths, separate from racial possession", () => {
  const value = resolveSpecialAbilityProgression(source.id, allocations);
  assert.equal(value.value, 7);
  assert.equal(value.source, SPECIAL_ABILITY_PROGRESSION_CONTRACT);
  assert.equal(value.provisional, true);
  assert.equal(resolveSpecialAbilityProgression(source.id, null).value, null);
  const result = resolveSpecialAbilityMechanics({ source, stored: stored(doc(capability())), owner: { ...owner, savedAllocations: { skillAllocations: [] } } });
  assert.equal(result.possessed, true);
  assert.equal(result.progression.value, 0);
  assert.equal(result.rules[0].status, "matched");
});

test("possession is an outer gate; catalog views do not claim the conditions matched", () => {
  for (const facts of [null, { ...owner, possessedSkillIds: null }, { ...owner, possessedSkillIds: new Set<number>() }]) {
    const result = resolveSpecialAbilityMechanics({ source, stored: stored(doc(capability(), manual())), owner: facts });
    assert.ok(result.rules.every(rule => rule.status === "unavailable" && rule.groups.length === 0));
  }
  assert.equal(resolveSpecialAbilityMechanics({ source: { ...source, classification: "standard" }, stored: stored(doc(capability())), owner }).documentStatus, "invalid");
  assert.equal(resolveSpecialAbilityMechanics({ source, stored: stored(doc(manual())), owner }).rules[0].status, "manual");
});

const clause = (result: "satisfied" | "unsatisfied" | "manual", key: string): MechanicsCondition =>
  result === "manual" ? { key, kind: "manual", notes: "Needs context." }
    : { key, kind: "self-progression", operator: "gte", requiredValue: result === "satisfied" ? 7 : 8 };
test("AND and OR truth tables preserve unknowns and automatic failures", () => {
  const outcomes = ["satisfied", "unsatisfied", "manual"] as const;
  for (const a of outcomes) for (const b of outcomes) {
    const andDocument = doc({ ...capability(), when: { mode: "requirements", groups: [{ key: "g", conditions: [clause(a, "a"), clause(b, "b")] }] } });
    const orDocument = doc({ ...capability(), when: { mode: "requirements", groups: [{ key: "g1", conditions: [clause(a, "a")] }, { key: "g2", conditions: [clause(b, "b")] }] } });
    const andExpected = a === "unsatisfied" || b === "unsatisfied" ? "not-matched" : a === "manual" || b === "manual" ? "manual" : "matched";
    const orExpected = a === "satisfied" || b === "satisfied" ? "matched" : a === "manual" || b === "manual" ? "manual" : "not-matched";
    assert.equal(resolveSpecialAbilityMechanics({ source, stored: stored(andDocument), owner }).rules[0].status, andExpected);
    assert.equal(resolveSpecialAbilityMechanics({ source, stored: stored(orDocument), owner }).rules[0].status, orExpected);
  }
});

test("unknown/missing facts never satisfy negative possession; archived references retain known facts", () => {
  const document = doc({ ...capability(), when: { mode: "requirements", groups: [{ key: "g", conditions: [{ key: "c", kind: "skill-possession", skillId: 7002, operator: "not-possessed" }] }] } });
  for (const refStatus of ["missing", "unavailable"] as const) {
    assert.equal(resolveSpecialAbilityMechanics({ source, stored: stored(document), owner, references: [{ kind: "skill", skillId: 7002, name: null, status: refStatus }] }).rules[0].status, "manual");
  }
  const references = [{ kind: "skill" as const, skillId: 7002, name: "Saved target", status: "archived" as const }];
  assert.equal(resolveSpecialAbilityMechanics({ source, stored: stored(document), owner, references }).rules[0].status, "matched");
  assert.equal(resolveSpecialAbilityMechanics({ source, stored: stored(document), owner: { ...owner, possessedSkillIds: new Set([source.id, 7002]) }, references }).rules[0].status, "not-matched");
  const d = doc({ ...capability(), when: { mode: "requirements", groups: [{ key: "g", conditions: [{ key: "c", kind: "derived-ability-possession", derivedAbilityId: 7003, operator: "not-possessed" }] }] } });
  assert.equal(resolveSpecialAbilityMechanics({ source, stored: stored(d), owner: { ...owner, possessedDerivedAbilityIds: null }, references: [{ kind: "derived-ability", derivedAbilityId: 7003, name: "Synthetic derived", status: "available" }] }).rules[0].status, "manual");
});

test("references collect only identities, never recurse; output is detached and independent of ability names", () => {
  const document = doc({ ...capability(), references: [{ kind: "skill", skillId: source.id }, { kind: "derived-ability", derivedAbilityId: 7003 }] });
  assert.equal(collectMechanicsReferences(document).length, 2);
  const input = { source, stored: stored(document), owner, references: [{ kind: "skill" as const, skillId: source.id, name: source.name, status: "available" as const }, { kind: "derived-ability" as const, derivedAbilityId: 7003, name: "Synthetic", status: "available" as const }] };
  const before = structuredClone(input), first = resolveSpecialAbilityMechanics(input);
  assert.deepEqual(resolveSpecialAbilityMechanics(input), first);
  assert.deepEqual(input, before);
  assert.equal(resolveSpecialAbilityMechanics({ ...input, source: { ...source, name: "An unrelated future title" } }).rules[0].status, first.rules[0].status);
  first.rules[0].authored.title = "Changed output";
  assert.deepEqual(input, before);
  assert.equal(first.runtimeSupported, false);
  for (const file of ["resolution", "progression", "codec", "summaries", "references"]) {
    const code = readFileSync(`src/features/special-abilities/${file}.ts`, "utf8");
    assert.doesNotMatch(code, /from ["'][^"']*(?:service|@\/db(?:["']|\/)|next\/)/);
    assert.doesNotMatch(code, /\beval\s*\(|new Function\s*\(/);
  }
});

test("editor intent replaces only its pending family; omission never means detach", () => {
  const draft = { extensions: [{ extensionType: "future", schemaVersion: 9, data: null }] };
  const next = changeSkillExtension(draft, { operation: "upsert", extensionType: "spell-construction", schemaVersion: 6, data: { synthetic: true } });
  assert.equal(next.extensions[0], draft.extensions[0]);
  const removed = changeSkillExtension(next, { operation: "remove", extensionType: "spell-construction" });
  assert.deepEqual(removed.extensions, draft.extensions);
  assert.deepEqual(removed.extensionMutations, [{ operation: "remove", extensionType: "spell-construction" }]);
  assert.equal(draft.extensions.length, 1);
});
