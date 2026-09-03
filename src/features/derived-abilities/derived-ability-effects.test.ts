import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DerivedAbilityEffectsEditor } from "../../app/heavens/derived-abilities/derived-ability-effects-editor";
import { getCharacterSkillPointsById } from "../characters/character-rules";
import {
  MECHANICAL_EFFECT_SCHEMA_VERSION,
  planMechanicalEffect,
  type MechanicalEffect,
  type RuntimeDuration,
} from "../mechanical-effects";
import { createDefaultDerivedAbilityDraft } from "./derived-ability-authoring";
import {
  adaptDerivedAbilityToMechanicalEffects,
  decodeDerivedAbilityEffectRows,
  decodeDerivedAbilityEffects,
  encodeDerivedAbilityEffects,
  formatDerivedAbilityMechanicalEffectSummary,
  getDerivedAbilityMechanicalEffectSource,
  normalizeDerivedAbilityEffects,
} from "./derived-ability-effects";
import { evaluateDerivedAbilityAcquisitionRequirements } from "./derived-ability-rules";
import type { DerivedAbilityRequirementDefinition } from "./models";

const root = process.cwd();

function source(file: string): string {
  return readFileSync(path.resolve(root, file), "utf8");
}

const hamstringEffects: MechanicalEffect[] = [
  {
    kind: "condition.apply",
    name: "Hamstrung",
    description: "The target's leg is impaired.",
    duration: { kind: "combat-rounds", value: 2 },
  },
  {
    kind: "modifier.apply",
    label: "Hamstring movement penalty",
    channel: "movement",
    targetKey: "movement:Land",
    amount: -10,
    duration: { kind: "combat-rounds", value: 2 },
  },
  {
    kind: "manual",
    title: "Anatomy ruling",
    description: "G.O.D. determines whether the target has anatomy that can be hamstrung.",
  },
];

test("Derived Ability persistence uses the shared codec and normalizes ordered positions", () => {
  const effects: MechanicalEffect[] = [
    { kind: "health.heal", amount: 10, scope: "full-body" },
    { kind: "health.damage", amount: 8, application: "localized" },
    ...hamstringEffects,
  ];
  const encoded = encodeDerivedAbilityEffects(effects);
  assert.deepEqual(encoded.map(({ sortOrder }) => sortOrder), [0, 1, 2, 3, 4]);
  assert.ok(encoded.every(({ schemaVersion }) =>
    schemaVersion === MECHANICAL_EFFECT_SCHEMA_VERSION));
  assert.deepEqual(decodeDerivedAbilityEffects([...encoded].reverse()), effects);
  assert.deepEqual(encodeDerivedAbilityEffects([]), []);
  assert.deepEqual(decodeDerivedAbilityEffects([]), []);

  const grouped = decodeDerivedAbilityEffectRows(
    encoded.map((row, index) => ({
      ...row,
      id: index + 1,
      derivedAbilityId: 77,
    })).reverse(),
  );
  assert.ok(grouped.every(({ derivedAbilityId }) => derivedAbilityId === 77));
  assert.deepEqual(grouped.map(({ effect }) => effect), effects);
});

test("Derived Ability effect decoding and server normalization reject malformed data", () => {
  assert.throws(
    () => normalizeDerivedAbilityEffects([
      { kind: "health.heal", amount: 0, scope: "full-body" },
    ]),
    /finite number greater than zero/,
  );
  assert.throws(
    () => normalizeDerivedAbilityEffects({}),
    /ordered list/,
  );
  assert.throws(
    () => normalizeDerivedAbilityEffects([{
      kind: "manual",
      title: "",
      description: "",
    }]),
    /title must contain meaningful text/,
  );
  assert.throws(
    () => decodeDerivedAbilityEffects([
      {
        schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION,
        effectJson: { kind: "manual", title: "One", description: "First." },
        sortOrder: 0,
      },
      {
        schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION,
        effectJson: { kind: "manual", title: "Two", description: "Second." },
        sortOrder: 0,
      },
    ]),
    /duplicate sort order/,
  );
  assert.throws(
    () => decodeDerivedAbilityEffects([{
      schemaVersion: 999,
      effectJson: { kind: "manual", title: "Future", description: "Unknown." },
      sortOrder: 0,
    }]),
    /Unsupported Mechanical Effect schema version/,
  );
});

test("all shared durations and Modifier target channels round-trip unchanged", () => {
  const durations: RuntimeDuration[] = [
    { kind: "until-removed", value: null },
    { kind: "combat-steps", value: 3 },
    { kind: "combat-rounds", value: 2, label: "two rounds" },
    { kind: "scene", value: null },
  ];
  const durationEffects: MechanicalEffect[] = durations.map((duration, index) => ({
    kind: "condition.apply",
    name: `Condition ${index + 1}`,
    description: "Shared duration validation.",
    duration,
  }));
  const modifierEffects: MechanicalEffect[] = [
    ["attribute", "STR"],
    ["skill", "skill:123"],
    ["movement", "movement:Land"],
    ["initiative", "self"],
    ["soak", "self"],
    ["damage", "self"],
  ].map(([channel, targetKey], index) => ({
    kind: "modifier.apply",
    label: `Modifier ${index + 1}`,
    channel: channel as Extract<MechanicalEffect, { kind: "modifier.apply" }>["channel"],
    targetKey: targetKey!,
    amount: index % 2 ? -5 : 5,
    duration: durations[index % durations.length]!,
  }));
  const effects = [...durationEffects, ...modifierEffects];
  assert.deepEqual(
    decodeDerivedAbilityEffects(encodeDerivedAbilityEffects(effects)),
    effects,
  );

  for (const invalid of [
    { ...durationEffects[1]!, duration: { kind: "combat-steps", value: 0 } },
    { ...durationEffects[2]!, duration: { kind: "combat-rounds", value: 1.5 } },
    { ...durationEffects[3]!, duration: { kind: "scene", value: 2 } },
    { ...modifierEffects[1]!, targetKey: "Pistol Mastery" },
    { ...modifierEffects[3]!, targetKey: "initiative" },
    { ...modifierEffects[0]!, amount: 0 },
  ]) {
    assert.throws(() => normalizeDerivedAbilityEffects([invalid]));
  }
});

test("Derived Ability source identity is stable and the shared planner preserves it", () => {
  const sourceIdentity = getDerivedAbilityMechanicalEffectSource({ id: 42, name: " Riposte " });
  assert.deepEqual(sourceIdentity, {
    kind: "derived-ability",
    id: 42,
    name: "Riposte",
  });
  const plan = planMechanicalEffect({
    effect: { kind: "health.heal", amount: 10, scope: "full-body" },
    source: sourceIdentity,
  });
  assert.equal(plan.status, "needs-selection");
  assert.deepEqual(plan.source, sourceIdentity);
  assert.throws(
    () => getDerivedAbilityMechanicalEffectSource({ id: 0, name: "Unsaved" }),
    /positive saved ID/,
  );
});

test("the adapter prefers structured effects, falls back to Rules Text, and omits emptiness", () => {
  const structured = adaptDerivedAbilityToMechanicalEffects({
    id: 17,
    name: "Hamstring",
    mechanicalEffect: "Complete human-facing table rule.",
    effects: hamstringEffects,
  });
  assert.deepEqual(
    structured.effects.map(({ definition }) => definition.effect),
    hamstringEffects,
  );
  assert.ok(structured.effects.every(({ compatibilityFallback }) => !compatibilityFallback));
  assert.ok(structured.effects.every(({ definition }) =>
    definition.source?.kind === "derived-ability" &&
    definition.source.id === 17));

  const fallback = adaptDerivedAbilityToMechanicalEffects({
    id: 18,
    name: "Riposte",
    mechanicalEffect: "Counterattack after a successful parry.",
    effects: [],
  });
  assert.equal(fallback.effects.length, 1);
  assert.equal(fallback.effects[0]?.compatibilityFallback, true);
  assert.deepEqual(fallback.effects[0]?.definition.effect, {
    kind: "manual",
    title: "Riposte",
    description: "Counterattack after a successful parry.",
  });

  assert.deepEqual(adaptDerivedAbilityToMechanicalEffects({
    id: 19,
    name: "Silent",
    mechanicalEffect: "  ",
    effects: [],
  }).effects, []);
});

test("effect summaries keep complex ordered definitions readable", () => {
  assert.equal(
    formatDerivedAbilityMechanicalEffectSummary({
      kind: "health.heal",
      amount: 10,
      scope: "full-body",
    }),
    "HEAL · 10 · FULL BODY",
  );
  assert.equal(
    formatDerivedAbilityMechanicalEffectSummary({
      kind: "health.damage",
      amount: 8,
      application: "localized",
    }),
    "DAMAGE · 8 · LOCALIZED",
  );
  assert.equal(formatDerivedAbilityMechanicalEffectSummary(hamstringEffects[0]!),
    "CONDITION · Hamstrung · 2 rounds");
  assert.equal(formatDerivedAbilityMechanicalEffectSummary(hamstringEffects[1]!),
    "MODIFIER · Movement -10 · 2 rounds");
  assert.equal(formatDerivedAbilityMechanicalEffectSummary(hamstringEffects[2]!),
    "MANUAL · Anatomy ruling");
});

test("Skill modifiers never change stored Skill points or unlock eligibility", () => {
  const requirement: DerivedAbilityRequirementDefinition = {
    derivedAbilityId: 81,
    requirementScope: "acquisition",
    requirementType: "skill",
    groupNumber: 0,
    attributeKey: null,
    skillId: 123,
    requiredDerivedAbilityId: null,
    operator: "gte",
    requiredValue: 100,
    notes: "",
    sortOrder: 0,
  };
  const skillModifier: MechanicalEffect = {
    kind: "modifier.apply",
    label: "Pistol focus",
    channel: "skill",
    targetKey: "skill:123",
    amount: 50,
    duration: { kind: "combat-rounds", value: 3 },
  };
  const points99 = getCharacterSkillPointsById({
    skillAllocations: [{
      draftId: 1,
      skillId: 123,
      parentDraftId: null,
      points: 99,
    }],
  });
  const pointsSnapshot = [...points99];
  const contextWithCalculatedRankAndModifier = {
    attributes: {},
    skillPoints: points99,
    calculatedRank: 149,
    plannedEffect: planMechanicalEffect({
      effect: skillModifier,
      application: { targetCharacterId: 7 },
    }),
  };
  assert.equal(contextWithCalculatedRankAndModifier.plannedEffect.status, "ready");
  assert.equal(
    evaluateDerivedAbilityAcquisitionRequirements(
      { requirements: [requirement] },
      contextWithCalculatedRankAndModifier,
    ),
    "unsatisfied",
  );
  assert.deepEqual([...points99], pointsSnapshot);
  for (const points of [100, 120]) {
    assert.equal(evaluateDerivedAbilityAcquisitionRequirements(
      { requirements: [requirement] },
      { attributes: {}, skillPoints: new Map([[123, points]]) },
    ), "satisfied");
  }
});

test("the additive migration creates only definition-owned effect persistence", () => {
  const schema = source("src/db/derived-ability-schema.ts");
  const migration = source("drizzle/0019_derived_ability_mechanical_effects.sql");
  for (const field of [
    "derivedAbilityId",
    "schemaVersion",
    "effectJson",
    "sortOrder",
    "createdAt",
    "updatedAt",
  ]) assert.ok(schema.includes(field), `missing schema field ${field}`);
  assert.match(schema, /derived_ability_effect/);
  assert.match(schema, /onDelete: "cascade"/);
  assert.match(schema, /derived_ability_effect_order_uq/);
  assert.match(schema, /derived_ability_effect_schema_version_valid/);
  assert.match(schema, /derived_ability_effect_sort_order_valid/);
  assert.match(schema, /derived_ability_effect_json_object/);
  assert.match(migration, /^CREATE TABLE "derived_ability_effect"/);
  assert.match(migration, /ON DELETE cascade/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM|UPDATE "derived_ability"|INSERT INTO/);
  assert.doesNotMatch(migration, /derived_ability_requirement|campaign_character|campaign_allowed/);
});

test("the server loads effects independently and replaces them inside the definition transaction", () => {
  const action = source("src/app/heavens/derived-abilities/actions.ts");
  const characterAction = source("src/app/characters/actions.ts");
  assert.match(action, /function loadEffectRows/);
  assert.match(action, /decodeDerivedAbilityEffects\(effectRows\)/);
  assert.match(action, /encodeDerivedAbilityEffects\(ownedDefinition\.effects\)/);
  assert.match(action, /db\.transaction/);
  assert.match(action, /delete\(derivedAbilityEffect\)/);
  assert.match(action, /insert\(derivedAbilityEffect\)/);
  assert.match(characterAction, /\.from\(derivedAbilityEffect\)\.orderBy/);
  assert.match(characterAction, /decodeDerivedAbilityEffectRows\(derivedAbilityEffectRows\)/);
  assert.doesNotMatch(action, /JSON\.parse\(|JSON\.stringify\(/);
});

test("the constructor presents progressive shared fields without raw JSON", () => {
  const draft = createDefaultDerivedAbilityDraft();
  draft.effects = [
    { kind: "health.heal", amount: 10, scope: "full-body" },
    { kind: "health.damage", amount: 8, application: "localized" },
    {
      kind: "condition.apply",
      name: "Focused",
      description: "Maintains concentration.",
      duration: { kind: "combat-steps", value: 3 },
    },
    {
      kind: "modifier.apply",
      label: "Pistol Mastery focus",
      channel: "skill",
      targetKey: "skill:123",
      amount: 10,
      duration: { kind: "scene", value: null },
    },
    { kind: "manual", title: "Knockback", description: "G.O.D. determines distance." },
  ];
  const html = renderToStaticMarkup(createElement(DerivedAbilityEffectsEditor, {
    draft,
    references: {
      skills: [{ id: 123, name: "Pistol Mastery", tier: 5, classification: "Combat" }],
      abilities: [],
    },
    onChange: () => undefined,
  }));
  for (const text of [
    "Mechanical Effects",
    "Add Effect",
    "Move Up",
    "Move Down",
    "Remove",
    "Heal",
    "Damage",
    "Apply Condition",
    "Apply Modifier",
    "Manual",
    "Amount",
    "Scope",
    "Localized",
    "Condition Name",
    "Duration Count",
    "Modifier Channel",
    "Skill Target",
    "Pistol Mastery",
    "skill:&lt;positive-id&gt;",
    "Knockback",
    "Manual Requirements",
  ]) assert.ok(html.includes(text), `missing effect editor content ${text}`);
  assert.doesNotMatch(html, /effectJson|schemaVersion|\{&quot;kind&quot;/);
  const editor = source("src/app/heavens/derived-abilities/derived-ability-effects-editor.tsx");
  assert.doesNotMatch(editor, /JSON\.parse|JSON\.stringify|effectJson|schemaVersion/);
  assert.match(editor, /setEffects\(\[\.\.\.draft\.effects, createEffect\("health\.heal"\)\]\)/);
  assert.match(editor, /\[effects\[index\], effects\[target\]\] = \[effects\[target\]!, effects\[index\]!\]/);
  assert.match(editor, /draft\.effects\.filter\(\(_, position\) => position !== index\)/);
});

test("canonical definitions remain zero-effect compatible and Pass 5 adds no use runtime", () => {
  const baseline = source("drizzle/0000_serrian_tide_baseline.sql");
  const migration = source("drizzle/0019_derived_ability_mechanical_effects.sql");
  const canonicalNames = [
    "Durable Muscles",
    "Ambidexterity",
    "Poison Resistance",
    "Eidetic Memory",
    "Indomitable Will",
    "Likeable",
  ];
  canonicalNames.forEach((name, index) => {
    assert.ok(baseline.includes(name));
    assert.equal(adaptDerivedAbilityToMechanicalEffects({
      id: index + 1,
      name,
      mechanicalEffect: "",
      effects: [],
    }).effects.length, 0);
    assert.equal(migration.includes(name), false);
  });
  const action = source("src/app/heavens/derived-abilities/actions.ts");
  const schema = source("src/db/derived-ability-schema.ts");
  assert.doesNotMatch(`${action}\n${schema}`, /characterDerivedAbility|campaignCharacterDerivedAbility/);
  assert.doesNotMatch(action, /deduct|consume|spendXp|useCounter|reactionWindow|executeCombat|applyMechanicalEffect/);
});
