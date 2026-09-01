import assert from "node:assert/strict";
import test from "node:test";

import { calculateCastingCircumstance } from "./engine/calculateCastingCircumstance";
import { calculatePractitioner } from "./engine/calculatePractitioner";
import { calculateSpell } from "./engine/calculateSpell";
import {
  cloneProgressiveStructure,
  diffProgressiveStructures,
  resolveProgressiveSpellForLevel,
} from "./engine/progressiveSpell";
import { validateSpell } from "./engine/validateSpell";
import type {
  ProgressiveSpellStructure,
  SpellContainer,
  SpellDocument,
} from "./models/spell";
import { parseSpellDocument } from "./spellDocumentCodec";
import {
  createContainer,
  createEmptySpell,
  createModifierSelection,
  withCalculationSnapshot,
} from "./utilities/spellFactory";

let sequence = 0;

function effect(ruleId: string, quantity = 1) {
  sequence += 1;
  return { id: `effect-${sequence}`, ruleId, quantity, description: "" };
}

function addOn(ruleId: string, quantity: number) {
  sequence += 1;
  return { id: `addon-${sequence}`, ruleId, quantity, description: "" };
}

function spellWith(...containers: SpellContainer[]): SpellDocument {
  return {
    ...createEmptySpell(),
    name: "Integration Spell",
    frameworkSkillId: 1,
    sphere: "Charm",
    containers,
  };
}

test("current simple Target, Damage, and Range calculation matches the final source", () => {
  const target = {
    ...createContainer("target"),
    effects: [effect("damage", 3)],
    rangeRuleId: "short",
  };
  const spell = spellWith(target);
  const result = calculateSpell(spell);

  assert.equal(result.totalMana, 12);
  assert.equal(result.baseSpellMastery, "Novice");
  assert.equal(result.baseCombatCastingTime, 6);
  assert.equal(result.baseOutOfCombatCastingTimeSeconds, 12);
  assert.equal(validateSpell(spell, undefined, result).status, "VALID");
});

test("AoE shape and fixed Combat Round behavior match the final source", () => {
  const area = {
    ...createContainer("aoe"),
    effects: [effect("damage")],
    shape: addOn("radius", 2),
    durations: [addOn("combat-round", 0)],
  };
  const spell = spellWith(area);
  const result = calculateSpell(spell);

  assert.equal(result.totalMana, 17);
  assert.equal(result.totals.addons, 12);
  assert.equal(validateSpell(spell, undefined, result).status, "VALID");
});

test("deeply nested containers calculate recursively", () => {
  const first = { ...createContainer("target"), effects: [effect("damage")] };
  const spell = spellWith(first);
  let parent = first;
  for (let depth = 0; depth < 15; depth += 1) {
    const child = { ...createContainer("target"), effects: [effect("damage")] };
    parent.children = [child];
    parent = child;
  }

  const result = calculateSpell(spell);
  assert.equal(result.totalMana, 16 * 4);
  assert.equal(Math.max(...result.breakdown.map((line) => line.depth)), 16);
});

test("Practitioner and Raw Casting layers match the confirmed rules", () => {
  const practitioner = calculatePractitioner(
    { baseSpellManaCost: 35, baseSpellMastery: "Master" },
    "High Master",
  );
  assert.equal(practitioner.calculation.adjustedManaCost, 28);
  assert.equal(practitioner.calculation.combatCastingTime, 14);

  const raw = calculateCastingCircumstance(
    practitioner.calculation,
    "no-open-framework-slot",
  );
  assert.equal(raw.finalCastingMana, 49);
  assert.equal(raw.finalCombatCastingTime, 25);
});

test("higher Progressive tiers retain the original Apprentice casting cost", () => {
  const spell = createEmptySpell();
  spell.name = "Growing Tide Bolt";
  spell.frameworkSkillId = 1;
  spell.sphere = "Water";
  spell.containers[0]!.effects = [effect("damage")];
  spell.containers[0]!.rangeRuleId = "melee-reach";
  spell.modifiers = [createModifierSelection("progressive-spell")];

  const inherited = resolveProgressiveSpellForLevel(
    spell,
    "Apprentice",
  ).resolvedStructure;
  const stronger: ProgressiveSpellStructure = cloneProgressiveStructure(inherited);
  stronger.containers[0]!.effects[0]!.quantity = 5;
  stronger.containers[0]!.rangeRuleId = "long";
  spell.progressive.milestones.find(({ level }) => level === "Novice")!.changes =
    diffProgressiveStructures(inherited, stronger);

  const original = calculateSpell(spell);
  const novice = resolveProgressiveSpellForLevel(spell, "Novice");
  assert.ok(
    novice.resolvedConstructionCalculation.baseSpellManaCost >
      original.baseSpellManaCost,
  );
  assert.equal(
    novice.castingCalculation.baseSpellManaCost,
    original.baseSpellManaCost,
  );
  assert.equal(
    novice.castingCalculation.combatCastingTime,
    original.combatCastingTime,
  );
});

test("versioned construction documents and snapshots round-trip", () => {
  const spell = createEmptySpell();
  spell.name = "Archive Test";
  spell.frameworkSkillId = 1;
  spell.sphere = "Charm";
  spell.containers[0]!.effects = [effect("damage", 3)];
  const saved = withCalculationSnapshot(spell);
  const parsed = parseSpellDocument(JSON.stringify(saved));

  assert.equal(parsed.name, "Archive Test");
  assert.equal(parsed.schemaVersion, 7);
  assert.equal(parsed.calculation?.ruleProfileId, saved.calculation?.ruleProfileId);
  assert.equal(calculateSpell(parsed).totalMana, calculateSpell(spell).totalMana);
});

test("legacy sphere traditions migrate into the tied shared pool", () => {
  for (const tradition of ["Spellcraft", "Talismanism", "Faith"] as const) {
    const legacy = {
      ...createEmptySpell(),
      schemaVersion: 5,
      tradition,
      frameworkSkillId: undefined,
      sphere: "Charm",
    };
    const parsed = parseSpellDocument(legacy);
    assert.equal(parsed.tradition, "Spellcraft/Talismanism/Faith");
    assert.equal(parsed.sphere, "Charm");
    assert.equal(parsed.frameworkSkillId, undefined);
  }
});

test("future unsupported document schemas are rejected", () => {
  assert.throws(
    () => parseSpellDocument({ ...createEmptySpell(), schemaVersion: 999 }),
    /newer than this application supports/i,
  );
});
