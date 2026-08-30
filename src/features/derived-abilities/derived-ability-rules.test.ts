import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  evaluateDerivedAbilityTrigger,
  getActiveDerivedAbilities,
  getDerivedAbilityRequirementSummary,
  normalizeV1DerivedAbilityTrigger,
} from "./derived-ability-rules";
import type {
  DerivedAbilityAttributeKey,
  DerivedAbilityDefinition,
} from "./models";

function ability(
  id: number,
  name: string,
  attributeKey: DerivedAbilityAttributeKey,
  minimumScore = 40,
): DerivedAbilityDefinition {
  return {
    id,
    name,
    description: "",
    mechanicalEffect: "",
    sourceSystem: "test",
    sourceExternalId: `DA-${id}`,
    triggers: [{
      triggerType: "attribute",
      attributeKey,
      minimumScore,
      sortOrder: 0,
    }],
  };
}

const durableMuscles = ability(1, "Durable Muscles", "STR");
const ambidexterity = ability(2, "Ambidexterity", "DEX");
const indomitableWill = ability(5, "Indomitable Will", "WIS");

test("Attribute thresholds activate at the required score and remain active above it", () => {
  const trigger = durableMuscles.triggers[0]!;
  assert.equal(evaluateDerivedAbilityTrigger(trigger, { attributes: { STR: 39 } }), false);
  assert.equal(evaluateDerivedAbilityTrigger(trigger, { attributes: { STR: 40 } }), true);
  assert.equal(evaluateDerivedAbilityTrigger(trigger, { attributes: { STR: 41 } }), true);
});

test("Campaign gating comes from the enabled ability list", () => {
  const context = { attributes: { STR: 50 } };
  assert.deepEqual(getActiveDerivedAbilities([], context), []);
  assert.deepEqual(
    getActiveDerivedAbilities([durableMuscles], context).map(({ name }) => name),
    ["Durable Muscles"],
  );
});

test("multiple enabled abilities resolve independently against matching Attributes", () => {
  const active = getActiveDerivedAbilities(
    [durableMuscles, ambidexterity],
    { attributes: { STR: 45, DEX: 42 } },
  );
  assert.deepEqual(active.map(({ name }) => name), ["Durable Muscles", "Ambidexterity"]);
  assert.deepEqual(
    getActiveDerivedAbilities([ambidexterity], { attributes: { STR: 50, DEX: 39 } }),
    [],
  );
});

test("Attribute advancement, reduction, and Campaign removal change live resolution without grants", () => {
  assert.deepEqual(
    getActiveDerivedAbilities([indomitableWill], { attributes: { WIS: 39 } }),
    [],
  );
  assert.deepEqual(
    getActiveDerivedAbilities([indomitableWill], { attributes: { WIS: 40 } }).map(({ name }) => name),
    ["Indomitable Will"],
  );
  assert.deepEqual(
    getActiveDerivedAbilities([indomitableWill], { attributes: { WIS: 38 } }),
    [],
  );
  assert.deepEqual(
    getActiveDerivedAbilities([], { attributes: { WIS: 50 } }),
    [],
  );
});

test("a Character created above a threshold resolves the ability without a purchase step", () => {
  const active = getActiveDerivedAbilities(
    [ambidexterity],
    { attributes: { DEX: 42 } },
  );
  assert.equal(active[0]?.name, "Ambidexterity");
  assert.equal(getDerivedAbilityRequirementSummary(active[0]!), "DEX 40+");
});

test("V1 trigger validation rejects invalid keys, thresholds, missing data, and future trigger types", () => {
  const valid = durableMuscles.triggers[0]!;
  assert.equal(normalizeV1DerivedAbilityTrigger(valid).attributeKey, "STR");
  assert.throws(
    () => normalizeV1DerivedAbilityTrigger({ ...valid, attributeKey: "LCK" }),
    /Attribute must be STR/,
  );
  assert.throws(
    () => normalizeV1DerivedAbilityTrigger({ ...valid, minimumScore: -1 }),
    /non-negative whole number/,
  );
  assert.throws(
    () => normalizeV1DerivedAbilityTrigger({ ...valid, minimumScore: 39.5 }),
    /non-negative whole number/,
  );
  assert.throws(
    () => normalizeV1DerivedAbilityTrigger({ ...valid, minimumScore: null }),
    /non-negative whole number/,
  );
  assert.throws(
    () => normalizeV1DerivedAbilityTrigger({ ...valid, triggerType: "skill" }),
    /only Attribute triggers/,
  );
});

test("Character Sheet and print use the shared resolver and keep Derived Abilities separate", () => {
  const sheet = readFileSync(
    path.resolve(process.cwd(), "src/app/characters/character-sheet.tsx"),
    "utf8",
  );
  const printRules = readFileSync(
    path.resolve(process.cwd(), "src/features/characters/character-print.ts"),
    "utf8",
  );
  const printable = readFileSync(
    path.resolve(process.cwd(), "src/app/characters/printable-character-sheet.tsx"),
    "utf8",
  );
  assert.match(sheet, /getActiveDerivedAbilities/);
  assert.match(sheet, />Derived Abilities</);
  assert.match(sheet, /character-sheet__derived-abilities/);
  assert.match(sheet, /skillSections\.map/);
  assert.match(printRules, /getActiveDerivedAbilities/);
  assert.match(printable, /function SupplementalDerivedAbilities/);
  assert.match(printable, /title="Derived Abilities"/);
});

test("migration seeds exactly the six neutral canonical Attribute milestones", () => {
  const migration = readFileSync(
    path.resolve(process.cwd(), "drizzle/0000_serrian_tide_baseline.sql"),
    "utf8",
  );
  for (const [name, key] of [
    ["Durable Muscles", "STR"],
    ["Ambidexterity", "DEX"],
    ["Poison Resistance", "CON"],
    ["Eidetic Memory", "INT"],
    ["Indomitable Will", "WIS"],
    ["Likeable", "CHR"],
  ]) {
    assert.match(migration, new RegExp(name));
    assert.match(migration, new RegExp(`'DA-${key}-40`));
  }
  assert.equal((migration.match(/serrian-tide-derived-ability-canon', 'DA-/g) ?? []).length, 6);
});
