import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { getEffectiveCampaignSystems } from "@/features/campaigns/campaign-systems";

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
    acquisitionType: "automatic",
    activationType: "passive",
    sourceSystem: "test",
    sourceExternalId: `DA-${id}`,
    triggers: [{
      triggerType: "attribute",
      attributeKey,
      minimumScore,
      sortOrder: 0,
    }],
    requirements: [{
      derivedAbilityId: id,
      requirementScope: "live",
      requirementType: "attribute",
      groupNumber: 0,
      attributeKey,
      skillId: null,
      requiredDerivedAbilityId: null,
      operator: "gte",
      requiredValue: minimumScore,
      notes: "",
      sortOrder: 0,
    }],
    useConditions: [],
    costs: [],
    useLimits: [],
  };
}

const durableMuscles = ability(1, "Durable Muscles", "STR");
const ambidexterity = ability(2, "Ambidexterity", "DEX");
const poisonResistance = ability(3, "Poison Resistance", "CON");
const eideticMemory = ability(4, "Eidetic Memory", "INT");
const indomitableWill = ability(5, "Indomitable Will", "WIS");
const likeable = ability(6, "Likeable", "CHR");
const canonicalAbilities = [
  durableMuscles,
  ambidexterity,
  poisonResistance,
  eideticMemory,
  indomitableWill,
  likeable,
] as const;
const derivedAbilitiesEnabled = ["Derived Abilities"] as const;
const derivedAbilitiesDisabled = ["Tier 1"] as const;

test("Campaign-enabled Durable Muscles activates at STR 40 and remains active above it", () => {
  const trigger = durableMuscles.triggers[0]!;
  assert.equal(evaluateDerivedAbilityTrigger(trigger, { attributes: { STR: 39 } }), false);
  assert.equal(evaluateDerivedAbilityTrigger(trigger, { attributes: { STR: 40 } }), true);
  assert.equal(evaluateDerivedAbilityTrigger(trigger, { attributes: { STR: 50 } }), true);

  for (const [score, expectedNames] of [
    [39, []],
    [40, ["Durable Muscles"]],
    [50, ["Durable Muscles"]],
  ] as const) {
    assert.deepEqual(
      getActiveDerivedAbilities(
        [durableMuscles],
        { attributes: { STR: score } },
        derivedAbilitiesEnabled,
      ).map(({ name }) => name),
      expectedNames,
    );
  }
});

test("Campaign system availability gates the canonical catalog before generalized requirements", () => {
  const context = { attributes: { STR: 50 } };
  assert.deepEqual(
    getActiveDerivedAbilities([durableMuscles], context, derivedAbilitiesDisabled),
    [],
  );
  assert.deepEqual(
    getActiveDerivedAbilities(
      [durableMuscles],
      context,
      derivedAbilitiesEnabled,
    ).map(({ name }) => name),
    ["Durable Muscles"],
  );
});

test("legacy Campaign intent enables catalog-wide V1 resolution without restoring its allowlist", () => {
  const historicallySelectedAbilities = [durableMuscles];
  const effectiveSystems = getEffectiveCampaignSystems([], {
    hasLegacyDerivedAbilityConfiguration: historicallySelectedAbilities.length > 0,
    legacyDerivedAbilityCompatibilityResolved: false,
  });

  assert.deepEqual(
    getActiveDerivedAbilities(
      [durableMuscles, ambidexterity],
      { attributes: { STR: 39, DEX: 39 } },
      effectiveSystems,
    ),
    [],
  );
  assert.deepEqual(
    getActiveDerivedAbilities(
      [durableMuscles, ambidexterity],
      { attributes: { STR: 40, DEX: 39 } },
      effectiveSystems,
    ).map(({ name }) => name),
    ["Durable Muscles"],
  );
  assert.deepEqual(
    getActiveDerivedAbilities(
      [durableMuscles, ambidexterity],
      { attributes: { STR: 39, DEX: 40 } },
      effectiveSystems,
    ).map(({ name }) => name),
    ["Ambidexterity"],
  );
});

test("multiple enabled abilities resolve independently against matching Attributes", () => {
  const active = getActiveDerivedAbilities(
    [durableMuscles, ambidexterity],
    { attributes: { STR: 45, DEX: 42 } },
    derivedAbilitiesEnabled,
  );
  assert.deepEqual(active.map(({ name }) => name), ["Durable Muscles", "Ambidexterity"]);
  assert.deepEqual(
    getActiveDerivedAbilities(
      [ambidexterity],
      { attributes: { STR: 50, DEX: 39 } },
      derivedAbilitiesEnabled,
    ),
    [],
  );
});

test("Attribute advancement, reduction, and Campaign system removal change live resolution without grants", () => {
  assert.deepEqual(
    getActiveDerivedAbilities(
      [indomitableWill],
      { attributes: { WIS: 39 } },
      derivedAbilitiesEnabled,
    ),
    [],
  );
  assert.deepEqual(
    getActiveDerivedAbilities(
      [indomitableWill],
      { attributes: { WIS: 40 } },
      derivedAbilitiesEnabled,
    ).map(({ name }) => name),
    ["Indomitable Will"],
  );
  assert.deepEqual(
    getActiveDerivedAbilities(
      [indomitableWill],
      { attributes: { WIS: 38 } },
      derivedAbilitiesEnabled,
    ),
    [],
  );
  assert.deepEqual(
    getActiveDerivedAbilities(
      [indomitableWill],
      { attributes: { WIS: 50 } },
      derivedAbilitiesDisabled,
    ),
    [],
  );
});

test("a Character created above a threshold resolves the ability without a purchase step", () => {
  const active = getActiveDerivedAbilities(
    [ambidexterity],
    { attributes: { DEX: 42 } },
    derivedAbilitiesEnabled,
  );
  assert.equal(active[0]?.name, "Ambidexterity");
  assert.equal(getDerivedAbilityRequirementSummary(active[0]!), "DEX 40+");
});

test("all six canonical generalized requirements preserve exact 40-point Live behavior", () => {
  for (const canonical of canonicalAbilities) {
    const requirement = canonical.requirements[0]!;
    const attributeKey = requirement.attributeKey!;
    assert.deepEqual(
      getActiveDerivedAbilities(
        [canonical],
        { attributes: { [attributeKey]: 39 } },
        derivedAbilitiesEnabled,
      ),
      [],
    );
    assert.equal(
      getActiveDerivedAbilities(
        [canonical],
        { attributes: { [attributeKey]: 40 } },
        derivedAbilitiesEnabled,
      )[0]?.name,
      canonical.name,
    );
    assert.equal(getDerivedAbilityRequirementSummary(canonical), `${attributeKey} 40+`);
  }
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
  assert.match(sheet, /aggregate\.campaign\.allowedSystems/);
  assert.match(sheet, />Derived Abilities</);
  assert.match(sheet, /character-sheet__derived-abilities/);
  assert.match(sheet, /skillSections\.map/);
  assert.match(printRules, /getActiveDerivedAbilities/);
  assert.match(printRules, /aggregate\.campaign\.allowedSystems/);
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
