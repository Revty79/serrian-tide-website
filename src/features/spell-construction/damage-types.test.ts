import assert from "node:assert/strict";
import test from "node:test";
import { calculateSpell } from "./engine/calculateSpell";
import { calculatePractitioner } from "./engine/calculatePractitioner";
import { calculateCastingCircumstance } from "./engine/calculateCastingCircumstance";
import { validateSpell } from "./engine/validateSpell";
import { PRACTITIONER_LEVELS } from "./models/rules";
import { RAW_CASTING_CIRCUMSTANCES } from "./data/rawCastingRules";
import { SPELL_SCHEMA_VERSION, type SpellDocument } from "./models/spell";
import { parseSpellDocument } from "./spellDocumentCodec";
import { createEmptySpell, createContainer, createModifierSelection, cloneContainerWithNewIds, cloneProgressiveDataWithNewIds } from "./utilities/spellFactory";
import { cloneProgressiveStructure, diffProgressiveStructures, resolveProgressiveSpellForLevel, progressiveStructureFromSpell } from "./engine/progressiveSpell";
import { adaptSpellToMechanicalEffects, spellEffectSourceMetadata } from "./mechanical-effects-adapter";
import { resolveItemPowerConstruction } from "@/features/items/item-powers";

function spell(): SpellDocument {
  return { ...createEmptySpell(), name: "Fire in the title does not assign a type", frameworkSkillId: 1, sphere: "Fire",
    containers: [{ ...createContainer(), id: "target", rangeRuleId: "short", effects: [
      { id: "damage", ruleId: "damage", quantity: 7, description: "Keep this exact effect description" },
    ] }] };
}

test("optional type round-trips with stable IDs and unrelated JSON, without a schema bump or inferred type", () => {
  const legacy = parseSpellDocument(spell());
  assert.equal(SPELL_SCHEMA_VERSION, 7);
  assert.equal(legacy.containers[0].effects[0].damageType, undefined);
  for (const [input, expected] of [["", ""], ["fire", "Fire"], ["supernatural / Fire / Fire", "Fire / Supernatural"], ["Bludgeoning", "Blunt"]]) {
    const doc = structuredClone(legacy); doc.containers[0].effects[0].damageType = input;
    const saved = parseSpellDocument(JSON.stringify(doc));
    assert.equal(saved.containers[0].effects[0].damageType, expected);
    delete saved.containers[0].effects[0].damageType;
    assert.deepEqual(saved, legacy);
  }
});

test("unapproved and malformed types are rejected in base, nested, added and replaced Progressive effects", () => {
  for (const value of ["Pow", "Fire / Rule", 42, null]) {
    const effect = { ...spell().containers[0].effects[0], damageType: value };
    for (const location of ["base", "nested", "add-effect", "set-effect", "add-container"] as const) {
      const doc = spell();
      if (location === "base") doc.containers[0].effects = [effect as never];
      else if (location === "nested") doc.containers[0].children = [{ ...createContainer(), effects: [effect as never] }];
      else doc.progressive.milestones[0].changes = location === "add-container"
        ? [{ kind: location, container: { ...createContainer(), effects: [effect as never] } }]
        : [{ kind: location, containerId: "target", effect: effect as never }];
      assert.throws(() => parseSpellDocument(doc), /Damage Type/);
    }
  }
  const heal = spell(); heal.containers[0].effects[0].ruleId = "healing";
  assert.doesNotThrow(() => parseSpellDocument(heal));
  heal.containers[0].effects[0].damageType = "Fire";
  assert.throws(() => parseSpellDocument(heal), /only.*Damage effect/);
});

for (const modifier of [null, "static-assignment", "per-success-assignment", "progressive-spell"] as const) {
  test(`Damage Type is calculation-neutral for ${modifier ?? "ordinary"} construction at every practitioner level`, () => {
    const original = spell();
    if (modifier) original.modifiers = [createModifierSelection(modifier)];
    const base = calculateSpell(original), validation = validateSpell(original);
    for (const type of ["", "Fire", "Fire / Supernatural"]) {
      const doc = structuredClone(original); doc.containers[0].effects[0].damageType = type;
      assert.deepEqual(calculateSpell(doc), base, "entire calculation including Mana, Mastery and both casting times");
      assert.deepEqual(validateSpell(doc), validation);
      for (const level of PRACTITIONER_LEVELS) {
        const baseline = resolveProgressiveSpellForLevel(original, level), typed = resolveProgressiveSpellForLevel(doc, level);
        assert.deepEqual(typed.castingCalculation, baseline.castingCalculation);
        assert.deepEqual(typed.resolvedConstructionCalculation, baseline.resolvedConstructionCalculation);
        const practitioner = (s: SpellDocument) => {
          const result = calculateSpell(s);
          return calculatePractitioner({ baseSpellManaCost: result.totalMana, baseSpellMastery: result.baseSpellMastery }, level).calculation;
        };
        assert.deepEqual(practitioner(doc), practitioner(original));
        for (const circumstance of RAW_CASTING_CIRCUMSTANCES) {
          assert.deepEqual(
            calculateCastingCircumstance(practitioner(doc), circumstance.id),
            calculateCastingCircumstance(practitioner(original), circumstance.id),
          );
        }
      }
    }
  });
}

test("Progressive inheritance, diff, set-effect, add-effect and cloning preserve per-effect types and original costs", () => {
  const doc = parseSpellDocument(spell()); doc.containers[0].effects[0].damageType = "Fire";
  doc.modifiers = [createModifierSelection("progressive-spell")]; doc.progressive.enabled = true;
  const first = PRACTITIONER_LEVELS[0], later = PRACTITIONER_LEVELS[1];
  const inherited = resolveProgressiveSpellForLevel(doc, first);
  assert.equal(inherited.resolvedSpell.containers[0].effects[0].damageType, "Fire");
  const structure = progressiveStructureFromSpell(doc), edited = cloneProgressiveStructure(structure);
  edited.containers[0].effects[0].damageType = "Cold";
  const changes = diffProgressiveStructures(structure, edited);
  assert.deepEqual(changes, [{ kind: "set-effect", containerId: "target", effect: { ...doc.containers[0].effects[0], damageType: "Cold" } }]);
  doc.progressive.milestones.find(tier => tier.level === later)!.changes = changes;
  const saved = parseSpellDocument(JSON.stringify(doc)), resolved = resolveProgressiveSpellForLevel(saved, later);
  assert.deepEqual(resolved.resolvedSpell.containers[0].effects[0], { ...doc.containers[0].effects[0], damageType: "Cold" });
  assert.equal(resolveProgressiveSpellForLevel(saved, first).resolvedSpell.containers[0].effects[0].damageType, "Fire");
  assert.deepEqual(resolved.castingCalculation, inherited.castingCalculation);
  assert.deepEqual(resolved.resolvedConstructionCalculation, inherited.resolvedConstructionCalculation);
  saved.progressive.milestones.find(tier => tier.level === later)!.changes.push({ kind: "add-effect", containerId: "target",
    effect: { id: "second", ruleId: "damage", quantity: 2, damageType: "Supernatural" } });
  const ids = new Map<string, string>();
  const copied = { ...saved, containers: saved.containers.map(c => cloneContainerWithNewIds(c, ids)), progressive: cloneProgressiveDataWithNewIds(saved.progressive, ids) };
  const effects = resolveProgressiveSpellForLevel(parseSpellDocument(copied), later).resolvedSpell.containers[0].effects;
  assert.deepEqual(effects.map(e => e.damageType), ["Cold", "Supernatural"]);
  assert.equal(effects[0].id, ids.get("damage")); assert.notEqual(effects[0].id, "damage");
  assert.equal(effects[0].quantity, 7); assert.equal(effects[0].description, doc.containers[0].effects[0].description);
});

test("adapter and Item Magic preserve exact effect-local metadata without changing universal damage amounts", () => {
  const doc = spell(); doc.containers[0].effects[0].damageType = "Fire";
  doc.containers[0].effects.push({ id: "cold", ruleId: "damage", quantity: 3, damageType: "Cold" });
  const result = adaptSpellToMechanicalEffects(doc); assert.equal(result.valid, true);
  assert.deepEqual(result.effects.map(e => [e.spellEffectId, e.damageType, e.definition.effect]), [
    ["damage", "Fire", { kind: "health.damage", amount: 7, application: "localized" }],
    ["cold", "Cold", { kind: "health.damage", amount: 3, application: "localized" }],
  ]);
  assert.deepEqual(result.effects.map(spellEffectSourceMetadata).map(e => e.damageType), ["Fire", "Cold"]);
  const magic = resolveItemPowerConstruction(parseSpellDocument(doc), null);
  assert.deepEqual(magic.adapter.effects.map(e => e.damageType), ["Fire", "Cold"]);
  doc.containers[0].effects[0].damageType = "Pow";
  assert.equal(adaptSpellToMechanicalEffects(doc).valid, false);
});
