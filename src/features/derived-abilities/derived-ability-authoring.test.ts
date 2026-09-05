import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DerivedAbilityConstructor } from "../../app/heavens/derived-abilities/derived-ability-constructor";
import {
  createDefaultDerivedAbilityDraft,
  definitionToDerivedAbilityDraft,
  normalizeDerivedAbilityAuthoringDraft,
  type DerivedAbilityAuthoringDraft,
} from "./derived-ability-authoring";
import { assembleDerivedAbilityCatalog } from "./derived-ability-catalog";
import {
  getDerivedAbilityRequirementOrigin,
  getDerivedAbilityRequirementSummary,
  getLegacyTriggerMirrorForDefinition,
} from "./derived-ability-rules";
import type { DerivedAbilityDefinition } from "./models";

const root = process.cwd();

function source(file: string): string {
  return readFileSync(path.resolve(root, file), "utf8");
}

function complexDraft(): DerivedAbilityAuthoringDraft {
  return {
    id: 90,
    core: {
      name: "  Double Tap  ",
      description: "  A practiced firearm technique.  ",
      mechanicalEffect: "  Fire two controlled shots.  ",
      sourceSystem: null,
      sourceExternalId: null,
    },
    acquisitionType: "learned",
    activationType: "activated",
    requirements: [
      {
        requirementScope: "acquisition",
        requirementType: "skill",
        groupNumber: 8,
        attributeKey: null,
        skillId: 123,
        requiredDerivedAbilityId: null,
        operator: "gte",
        requiredValue: 100,
        notes: "",
        sortOrder: 5,
      },
      {
        requirementScope: "live",
        requirementType: "attribute",
        groupNumber: 10,
        attributeKey: "DEX",
        skillId: null,
        requiredDerivedAbilityId: null,
        operator: "gte",
        requiredValue: 50,
        notes: "",
        sortOrder: 4,
      },
      {
        requirementScope: "live",
        requirementType: "skill",
        groupNumber: 10,
        attributeKey: null,
        skillId: 123,
        requiredDerivedAbilityId: null,
        operator: "gte",
        requiredValue: 75,
        notes: "",
        sortOrder: 9,
      },
      {
        requirementScope: "live",
        requirementType: "derived-ability",
        groupNumber: 20,
        attributeKey: null,
        skillId: null,
        requiredDerivedAbilityId: 25,
        operator: "possessed",
        requiredValue: null,
        notes: "",
        sortOrder: 3,
      },
      {
        requirementScope: "live",
        requirementType: "manual",
        groupNumber: 30,
        attributeKey: null,
        skillId: null,
        requiredDerivedAbilityId: null,
        operator: null,
        requiredValue: null,
        notes: "  Order of Ash approval.  ",
        sortOrder: 7,
      },
    ],
    useConditions: [
      { conditionType: "equipment", conditionKey: "firearm-equipped", operator: null, numericValue: null, textValue: null, notes: "", sortOrder: 8 },
      { conditionType: "event", conditionKey: "successful-parry", operator: null, numericValue: null, textValue: null, notes: "", sortOrder: 12 },
      { conditionType: "state", conditionKey: "target-distance", operator: "lte", numericValue: 30, textValue: "feet", notes: "", sortOrder: 15 },
      { conditionType: "manual", conditionKey: null, operator: null, numericValue: null, textValue: null, notes: "G.O.D. confirms anatomy.", sortOrder: 20 },
    ],
    costs: [
      { costType: "initiative", amount: 6, resourceKey: null, notes: "", sortOrder: 4 },
      { costType: "ammunition", amount: 2, resourceKey: "firearm-ammunition", notes: "", sortOrder: 9 },
    ],
    useLimits: [
      { maximumUses: 1, refreshScope: "round", refreshKey: null, notes: "", sortOrder: 1 },
      { maximumUses: 3, refreshScope: "encounter", refreshKey: null, notes: "", sortOrder: 2 },
      { maximumUses: 2, refreshScope: "scene", refreshKey: null, notes: "", sortOrder: 3 },
      { maximumUses: 3, refreshScope: "manual", refreshKey: null, notes: "G.O.D. managed", sortOrder: 4 },
      { maximumUses: 1, refreshScope: "never", refreshKey: null, notes: "", sortOrder: 5 },
      { maximumUses: 1, refreshScope: "event", refreshKey: "successful-rest", notes: "", sortOrder: 6 },
    ],
    effects: [
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
    ],
    legacyTriggers: [],
  };
}

test("new drafts retain the safe Automatic Passive STR 40 Live default", () => {
  const draft = createDefaultDerivedAbilityDraft();
  assert.equal(draft.acquisitionType, "automatic");
  assert.equal(draft.activationType, "passive");
  assert.deepEqual(draft.costs, []);
  assert.deepEqual(draft.effects, []);
  assert.deepEqual(draft.requirements, [{
    requirementScope: "live",
    requirementType: "attribute",
    groupNumber: 0,
    attributeKey: "STR",
    skillId: null,
    requiredDerivedAbilityId: null,
    operator: "gte",
    requiredValue: 40,
    notes: "",
    sortOrder: 0,
  }]);
});

test("Riposte definition fields persist without adding reaction runtime behavior", () => {
  const riposte = normalizeDerivedAbilityAuthoringDraft({
    core: {
      name: "Riposte",
      description: "A practiced counterattack.",
      mechanicalEffect: "Counterattack after a successful parry.",
      sourceSystem: null,
      sourceExternalId: null,
    },
    acquisitionType: "learned",
    activationType: "reaction",
    requirements: [{
      requirementScope: "acquisition",
      requirementType: "skill",
      groupNumber: 0,
      attributeKey: null,
      skillId: 456,
      requiredDerivedAbilityId: null,
      operator: "gte",
      requiredValue: 100,
      notes: "",
      sortOrder: 0,
    }],
    useConditions: [{
      conditionType: "event",
      conditionKey: "successful-parry",
      operator: null,
      numericValue: null,
      textValue: null,
      notes: "",
      sortOrder: 0,
    }],
    costs: [{
      costType: "initiative",
      amount: 5,
      resourceKey: null,
      notes: "",
      sortOrder: 0,
    }],
    useLimits: [],
    effects: [],
    legacyTriggers: [],
  });
  assert.equal(riposte.acquisitionType, "learned");
  assert.equal(riposte.activationType, "reaction");
  assert.equal(riposte.requirements[0]?.skillId, 456);
  assert.equal(riposte.requirements[0]?.requiredValue, 100);
  assert.equal(riposte.useConditions[0]?.conditionKey, "successful-parry");
  assert.equal(riposte.costs[0]?.amount, 5);
  assert.equal(getLegacyTriggerMirrorForDefinition(riposte), null);
});

test("full constructor normalization preserves complex meaning and deterministic positions", () => {
  const normalized = normalizeDerivedAbilityAuthoringDraft(complexDraft());
  assert.equal(normalized.core.name, "Double Tap");
  assert.equal(normalized.core.mechanicalEffect, "Fire two controlled shots.");
  assert.deepEqual(
    normalized.requirements.map((entry) => [
      entry.requirementScope,
      entry.groupNumber,
      entry.sortOrder,
      entry.requirementType,
    ]),
    [
      ["acquisition", 0, 0, "skill"],
      ["live", 0, 0, "attribute"],
      ["live", 0, 1, "skill"],
      ["live", 1, 0, "derived-ability"],
      ["live", 2, 0, "manual"],
    ],
  );
  assert.deepEqual(
    normalized.useConditions.map(({ conditionType, sortOrder }) => [conditionType, sortOrder]),
    [["equipment", 0], ["event", 1], ["state", 2], ["manual", 3]],
  );
  assert.deepEqual(normalized.costs.map(({ costType, amount }) => [costType, amount]), [
    ["initiative", 6],
    ["ammunition", 2],
  ]);
  assert.deepEqual(
    normalized.useLimits.map(({ refreshScope }) => refreshScope),
    ["round", "encounter", "scene", "manual", "never", "event"],
  );
  assert.deepEqual(
    normalized.effects.map(({ kind }) => kind),
    ["condition.apply", "modifier.apply", "manual"],
  );
});

test("a normalized complex save/reload reconstruction preserves every meaningful collection", () => {
  const normalized = normalizeDerivedAbilityAuthoringDraft(complexDraft());
  const [definition] = assembleDerivedAbilityCatalog({
    definitions: [{
      id: normalized.id!,
      name: normalized.core.name,
      description: normalized.core.description,
      mechanicalEffect: normalized.core.mechanicalEffect,
      acquisitionType: normalized.acquisitionType,
      activationType: normalized.activationType,
      sourceSystem: normalized.core.sourceSystem,
      sourceExternalId: normalized.core.sourceExternalId,
    }],
    requirements: normalized.requirements.map((entry) => ({
      ...entry,
      derivedAbilityId: normalized.id!,
    })),
    useConditions: normalized.useConditions.map((entry) => ({
      ...entry,
      derivedAbilityId: normalized.id!,
    })),
    costs: normalized.costs.map((entry) => ({
      ...entry,
      derivedAbilityId: normalized.id!,
    })),
    useLimits: normalized.useLimits.map((entry) => ({
      ...entry,
      derivedAbilityId: normalized.id!,
    })),
    effects: normalized.effects.map((effect, sortOrder) => ({
      derivedAbilityId: normalized.id!,
      sortOrder,
      effect,
    })),
  });
  const reloaded = definitionToDerivedAbilityDraft(definition!);
  assert.equal(reloaded.acquisitionType, normalized.acquisitionType);
  assert.equal(reloaded.activationType, normalized.activationType);
  assert.equal(reloaded.core.mechanicalEffect, normalized.core.mechanicalEffect);
  assert.deepEqual(reloaded.requirements, normalized.requirements);
  assert.deepEqual(reloaded.useConditions, normalized.useConditions);
  assert.deepEqual(reloaded.costs, normalized.costs);
  assert.deepEqual(reloaded.useLimits, normalized.useLimits);
  assert.deepEqual(reloaded.effects, normalized.effects);
});

test("server normalization rejects direct self-reference and invalid child definitions", () => {
  const selfReferencing = complexDraft();
  selfReferencing.requirements[3]!.requiredDerivedAbilityId = selfReferencing.id!;
  assert.throws(
    () => normalizeDerivedAbilityAuthoringDraft(selfReferencing),
    /cannot require itself/,
  );
  const invalidCost = complexDraft();
  invalidCost.costs[0]!.amount = 0;
  assert.throws(
    () => normalizeDerivedAbilityAuthoringDraft(invalidCost),
    /greater than zero/,
  );
  const invalidManual = complexDraft();
  invalidManual.requirements[4]!.notes = "";
  assert.throws(
    () => normalizeDerivedAbilityAuthoringDraft(invalidManual),
    /Manual requirement text is required/,
  );
  const invalidEffect = complexDraft();
  invalidEffect.effects[1] = {
    ...invalidEffect.effects[1] as Extract<DerivedAbilityAuthoringDraft["effects"][number], { kind: "modifier.apply" }>,
    amount: 0,
  };
  assert.throws(
    () => normalizeDerivedAbilityAuthoringDraft(invalidEffect),
    /non-zero whole number/,
  );
});

test("legacy mirrors survive only for the exact clean V1-compatible generalized shape", () => {
  const durable: DerivedAbilityDefinition = {
    id: 1,
    name: "Durable Muscles",
    description: "",
    mechanicalEffect: "",
    acquisitionType: "automatic",
    activationType: "passive",
    sourceSystem: "canon",
    sourceExternalId: "DA-STR-40",
    triggers: [],
    requirements: createDefaultDerivedAbilityDraft().requirements,
    useConditions: [],
    costs: [],
    useLimits: [],
    effects: [],
  };
  assert.deepEqual(getLegacyTriggerMirrorForDefinition(durable), {
    triggerType: "attribute",
    attributeKey: "STR",
    minimumScore: 40,
    sortOrder: 0,
  });
  for (const attributeKey of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) {
    assert.deepEqual(getLegacyTriggerMirrorForDefinition({
      ...durable,
      requirements: [{
        ...durable.requirements[0]!,
        attributeKey,
      }],
    }), {
      triggerType: "attribute",
      attributeKey,
      minimumScore: 40,
      sortOrder: 0,
    });
  }
  assert.equal(getLegacyTriggerMirrorForDefinition({
    ...durable,
    acquisitionType: "learned",
  }), null);
  assert.equal(getLegacyTriggerMirrorForDefinition({
    ...durable,
    requirements: [{ ...durable.requirements[0]!, operator: "gt" }],
  }), null);
  assert.equal(getLegacyTriggerMirrorForDefinition({
    ...durable,
    requirements: [{ ...durable.requirements[0]!, requiredValue: 40.5 }],
  }), null);
  assert.equal(getLegacyTriggerMirrorForDefinition({
    ...durable,
    costs: [{ costType: "initiative", amount: 1, resourceKey: null, notes: "", sortOrder: 0 }],
  }), null);
});

test("generalized summaries resolve names and express AND/OR logic without V1 errors", () => {
  const normalized = normalizeDerivedAbilityAuthoringDraft(complexDraft());
  const ability = {
    requirements: normalized.requirements.filter((entry) => entry.requirementScope === "live"),
    triggers: [],
  };
  const summary = getDerivedAbilityRequirementSummary(ability, {
    skillNames: new Map([[123, "Pistol Mastery"]]),
    derivedAbilityNames: new Map([[25, "Gunslinger Training"]]),
  });
  assert.equal(
    summary,
    "(DEX 50+ AND Pistol Mastery # 75+) OR Requires Gunslinger Training OR Manual: Order of Ash approval.",
  );
  assert.doesNotMatch(summary, /Invalid V1/);
  assert.equal(getDerivedAbilityRequirementOrigin(ability), "MIXED");
  assert.equal(
    getDerivedAbilityRequirementSummary({
      triggers: [],
      requirements: [normalized.requirements[0]!],
    }, { skillNames: new Map([[123, "Pistol Mastery"]]) }),
    "Acquire: Pistol Mastery # 100+",
  );
});

test("library and loader use definitions as primary rows with matching filters and no trigger gate", () => {
  const action = source("src/app/heavens/derived-abilities/actions.ts");
  assert.match(action, /acquisitionType\?: DerivedAbilityAcquisitionType/);
  assert.match(action, /activationType\?: DerivedAbilityActivationType/);
  assert.match(action, /eq\(derivedAbility\.acquisitionType, filters\.acquisitionType\)/);
  assert.match(action, /eq\(derivedAbility\.activationType, filters\.activationType\)/);
  assert.match(action, /select\(\{ value: count\(\) \}\)\.from\(derivedAbility\)\.where\(where\)/);
  assert.equal(action.match(/\.where\(where\)/g)?.length, 2);
  assert.match(action, /assembleDerivedAbilityCatalog/);
  assert.doesNotMatch(action, /\.innerJoin\(derivedAbilityTrigger/);
  assert.doesNotMatch(action, /V1 Derived Abilities must have exactly one/);
  for (const loader of [
    "loadRequirementRows([id])",
    "loadConditionRows([id])",
    "loadCostRows([id])",
    "loadLimitRows([id])",
    "loadEffectRows([id])",
  ]) assert.ok(action.includes(loader));
});

test("full saves normalize and transactionally replace only definition-owned child rows", () => {
  const action = source("src/app/heavens/derived-abilities/actions.ts");
  assert.match(action, /normalizeDerivedAbilityAuthoringDraft\(input\)/);
  assert.match(action, /normalizeDerivedAbilityAuthoringDraft\(\{[\s\S]*?\.\.\.normalized,[\s\S]*?id,[\s\S]*?\}\)/);
  assert.match(action, /db\.transaction/);
  for (const table of [
    "derivedAbilityRequirement",
    "derivedAbilityUseCondition",
    "derivedAbilityCost",
    "derivedAbilityUseLimit",
    "derivedAbilityEffect",
  ]) {
    assert.match(action, new RegExp(`delete\\(${table}\\)`));
    assert.match(action, new RegExp(`insert\\(${table}\\)`));
  }
  assert.match(action, /getLegacyTriggerMirrorForDefinition\(ownedDefinition\)/);
  assert.match(action, /encodeDerivedAbilityEffects\(ownedDefinition\.effects\)/);
  assert.match(action, /decodeDerivedAbilityEffects\(effectRows\)/);
  assert.match(action, /delete\(derivedAbilityTrigger\)/);
  assert.match(action, /insert\(derivedAbilityTrigger\)/);
  assert.match(action, /sourceSystem: null/);
  assert.match(action, /Canonical Derived Ability source identity cannot be changed/);
});

test("constructor exposes all generalized controls and removes Milestone-first V1 language", () => {
  const workspace = source("src/app/heavens/derived-abilities/derived-ability-workspace.tsx");
  const constructor = source("src/app/heavens/derived-abilities/derived-ability-constructor.tsx");
  assert.match(workspace, /Derived Ability Library/);
  assert.doesNotMatch(workspace, />Milestones</);
  assert.doesNotMatch(workspace, /Canonical milestone|Custom milestone|V1 abilities activate/);
  assert.match(workspace, /entry\.acquisitionType/);
  assert.match(workspace, /entry\.activationType/);
  assert.match(workspace, /entry\.requirementOrigin/);
  for (const label of [
    "Acquisition Requirements",
    "Live Requirements",
    "Add OR Group",
    "Required Skill #",
    "Uses actual stored points in this Skill, not calculated Rank.",
    "Use Conditions",
    "Resource Costs",
    "Use Limits / Recharge",
    "Mechanical Effects",
    "Rules Text",
    "Legacy Campaign References",
  ]) assert.ok(constructor.includes(label), `missing constructor label: ${label}`);
  assert.doesNotMatch(constructor, /getSkillRank|skillRank|calculatedSkillRank/);
  assert.match(constructor, /entry\.id !== draftId/);
  assert.match(constructor, /Automatic ability has no Live requirements/);
});

test("constructor component renders complex fields and Automatic warnings", () => {
  const references = {
    skills: [{
      id: 123,
      name: "Pistol Mastery",
      tier: 5,
      classification: "Combat",
    }],
    abilities: [
      { id: 25, name: "Gunslinger Training" },
      { id: 90, name: "Self Ability" },
    ],
  };
  const complexHtml = renderToStaticMarkup(createElement(
    DerivedAbilityConstructor,
    { draft: complexDraft(), references, onChange: () => undefined },
  ));
  for (const text of [
    "Acquisition Requirements",
    "Live Requirements",
    "Pistol Mastery",
    "Tier 5",
    "Required Skill #",
    "Gunslinger Training",
    "successful-parry",
    "Use Conditions",
    "Resource Costs",
    "Use Limits / Recharge",
    "Mechanical Effects",
    "Hamstrung",
    "Hamstring movement penalty",
    "Anatomy ruling",
    "Rules Text",
  ]) assert.match(complexHtml, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(complexHtml, /Self Ability/);

  const automaticWithoutLive = createDefaultDerivedAbilityDraft();
  automaticWithoutLive.requirements = [];
  const warningHtml = renderToStaticMarkup(createElement(
    DerivedAbilityConstructor,
    { draft: automaticWithoutLive, references, onChange: () => undefined },
  ));
  assert.match(warningHtml, /This Automatic ability has no Live requirements/);
});

test("central lifecycle previews explain prerequisite, legacy, and protected-record blockers", () => {
  const lifecycle = source("src/features/lifecycle/lifecycle-service.ts");
  assert.match(lifecycle, /Other Derived Ability prerequisites/);
  assert.match(lifecycle, /Legacy Campaign allowlists/);
  assert.match(lifecycle, /Canonical, imported, system-owned, and ambiguous legacy records are protected/);
});

test("Pass 6 protects owned classifications and keeps combat-window ownership separate", () => {
  const action = source("src/app/heavens/derived-abilities/actions.ts");
  const lifecycle = source("src/features/lifecycle/lifecycle-service.ts");
  assert.match(action, /characterDerivedAbility/);
  assert.match(lifecycle, /Character ownership history/);
  assert.match(lifecycle, /character_derived_ability/);
  assert.match(action, /assertAcyclicDerivedAbilityGraph/);
  assert.doesNotMatch(action + lifecycle, /reactionWindow/);
  assert.match(source("drizzle/meta/_journal.json"), /0020_derived_ability_character_runtime/);
});
