import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CharacterSpecialAbilityReference } from "./character-reference";
import { resolveSpecialAbilityMechanics } from "./resolution";
import { syntheticToolbox } from "./v2-fixtures";
import type { CharacterSpecialAbility, CharacterSpecialAbilityView } from "./character-models";
import { emptySpecialAbilityMechanics, type StoredMechanics } from "./models";
import { newMechanicsRule } from "./authoring";
import { PaperCharacterSheet } from "@/app/characters/paper-character-sheet";
import { DEFAULT_PRINT_SELECTION, printPresetSelection } from "@/features/characters/character-print-options";
import type { PaperCharacterData } from "@/features/characters/paper-character";

const source = { id: 1, name: "Synthetic owned Special Ability", classification: "special ability", archived: false };
const owner = { possessedSkillIds: new Set([1]), possessedDerivedAbilityIds: new Set([202]), savedAllocations: { skillAllocations: [] } };
function ability(stored: StoredMechanics | null, racial = true): CharacterSpecialAbility {
  return { definition: "Ordinary Definition remains readable.", possession: { purchased: !racial, racial }, mechanics: resolveSpecialAbilityMechanics({ source, stored, owner,
    references: [{ kind: "skill", skillId: 101, name: "Exact archived Skill", status: "archived" }, { kind: "derived-ability", derivedAbilityId: 202, name: "Exact Derived", status: "available" }] }) };
}
const view = (...abilities: CharacterSpecialAbility[]): CharacterSpecialAbilityView => ({ characterId: 1, context: "saved-normal", abilities, runtimeSupported: false });
const render = (data: CharacterSpecialAbilityView, print = false) => renderToStaticMarkup(<CharacterSpecialAbilityReference view={data} print={print} />);

test("all document states preserve the ordinary Definition without claiming failed acquisition", () => {
  for (const [stored, message] of [
    [null, /Definition only/], [{ schemaVersion: 1, dataJson: JSON.stringify(emptySpecialAbilityMechanics()) }, /currently contain no rules/],
    [{ schemaVersion: 2, dataJson: "{" }, /could not be read safely/], [{ schemaVersion: 99, dataJson: '{"schemaVersion":99,"future":true}' }, /newer format and remain preserved/],
  ] as const) for (const print of [false, true]) {
    const html = render(view(ability(stored)), print); assert.match(html, message); assert.match(html, /Ordinary Definition remains readable/);
    assert.doesNotMatch(html, /<button|data_json|skill_extension/);
  }
});
test("v1 statuses preserve zero-purchase racial possession and provisional qualification semantics", () => {
  const base = { ...newMechanicsRule("capability"), title: "Always example", description: "Synthetic", when: { mode: "always" as const } };
  const gated = { ...base, key: "gated", title: "Threshold example", when: { mode: "requirements" as const, groups: [{ key: "g", conditions: [{ key: "c", kind: "self-progression" as const, operator: "gte" as const, requiredValue: 1 }] }] } };
  const manual = { ...newMechanicsRule("manual"), title: "Manual example", description: "Synthetic", adjudication: "G.O.D. decides.", when: { mode: "always" as const } };
  const result = ability({ schemaVersion: 1, dataJson: JSON.stringify({ schemaVersion: 1, rules: [base, gated, manual] }) });
  assert.deepEqual(result.mechanics.rules.map(rule => rule.status), ["matched", "not-matched", "manual"]);
  const html = render(view(result));
  for (const pattern of [/current Race grant/, /Saved purchased progression: 0/, /Provisional/, /Matched qualification/, /Qualification not matched/, /Manual \/ G.O.D./, /known saved Character facts/]) assert.match(html, pattern);
  assert.match(html, /requires at least 1/); assert.doesNotMatch(html, /requires gte/);
});
test("v2 presentation includes all definitions, local names, timing, outcomes and readable targets", () => {
  const doc = syntheticToolbox();
  const activated = doc.rules.find(rule => rule.kind === "activated")!;
  if (activated.kind !== "activated") throw new Error("Fixture");
  activated.effects.push({ key: "health", effect: { kind: "health.damage", amount: 3, application: "area", timing: { mode: "over-time", frequency: "combat-rounds", applications: 2, firstApplication: "next-interval" } } });
  const data = view(ability({ schemaVersion: 2, dataJson: JSON.stringify(doc) })), before = structuredClone(data);
  for (const print of [false, true]) {
    const html = render(data, print);
    for (const pattern of [/Maximum: 7.5/, /Full refill definition/, /skill target: Exact archived Skill/, /Archived/, /resistance/, /ALL \(AND\)/, /triggered/, /Synthetic resource cost: 2/, /Synthetic choice/, /linked intrinsic effects/, /next interval/, /Manual \/ G.O.D. override intent/, /Allowed Derived Abilities: Exact Derived/, /Choice required when this ability is fully supported/, /No Character selection/]) assert.match(html, pattern);
    assert.doesNotMatch(html, /<button|<input|<select|skill:101|derived-ability:202|Current balance|remaining points/);
    if (print) assert.doesNotMatch(html, /<details|<summary/); else assert.match(html, /<details/);
  }
  assert.deepEqual(data, before);
});
test("missing and unsupported owner facts remain visible without exposing internal identity strings", () => {
  const item = ability({ schemaVersion: 2, dataJson: JSON.stringify(syntheticToolbox()) });
  item.mechanics.references[0] = { kind: "derived-ability", derivedAbilityId: 202, name: null, status: "missing" };
  item.mechanics.diagnostics.push({ code: "reference-missing", path: "derived-ability:202", message: "derived-ability:202: missing" });
  const html = render(view(item)); assert.match(html, /Derived Ability reference missing/); assert.doesNotMatch(html, /derived-ability:202/);
  assert.match(render({ ...view(), context: "native-creature-unavailable" }), /Fixed Creature Skill Rank is not Character purchased progression/);
  assert.match(html, /temporary active Form-granted abilities are not evaluated/);
});
test("optional print reference expands all abilities; Quick Print never opts into detailed mechanics", () => {
  const data = { characterId: 1, name: "Synthetic print", recordedAt: "2026-09-30T12:00:00Z", skills: [], spells: [], abilities: [], inventory: [], gear: [], story: [],
    specialAbilityMechanics: view(ability(null), { ...ability({ schemaVersion: 2, dataJson: JSON.stringify(syntheticToolbox()) }), mechanics: { ...ability({ schemaVersion: 2, dataJson: JSON.stringify(syntheticToolbox()) }).mechanics, source: { ...source, id: 2, name: "Second synthetic ability" } } }) } as unknown as PaperCharacterData;
  assert.deepEqual(printPresetSelection("quick", data, DEFAULT_PRINT_SELECTION), DEFAULT_PRINT_SELECTION);
  assert.ok(printPresetSelection("full", data, DEFAULT_PRINT_SELECTION).references.includes("specialAbilities"), "zero-purchase Race abilities can get references");
  const html = renderToStaticMarkup(<PaperCharacterSheet data={data} selection={{ front: false, backs: [], books: [], references: ["specialAbilities"] }} />);
  assert.match(html, /Synthetic owned Special Ability/); assert.match(html, /Second synthetic ability/); assert.match(html, /Maximum: 7.5/); assert.doesNotMatch(html, /<button|<details/);
});
