import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getCharacterSkillPointsById,
  getSkillRank,
} from "@/features/characters/character-rules";

import {
  buildV1MirrorRequirement,
  canV1EditorSynchronizeRequirements,
  evaluateDerivedAbilityAcquisitionRequirements,
  evaluateDerivedAbilityLiveRequirements,
  evaluateDerivedAbilityRequirement,
  evaluateDerivedAbilityRequirementGroup,
  evaluateDerivedAbilityRequirementScope,
  getActiveDerivedAbilities,
} from "./derived-ability-rules";
import type {
  DerivedAbilityDefinition,
  DerivedAbilityRequirementDefinition,
  DerivedAbilityRequirementOperator,
} from "./models";

const enabled = ["Derived Abilities"] as const;

function requirement(
  overrides: Partial<DerivedAbilityRequirementDefinition> = {},
): DerivedAbilityRequirementDefinition {
  return {
    derivedAbilityId: 90,
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
    ...overrides,
  };
}

function definition(
  overrides: Partial<DerivedAbilityDefinition> = {},
): DerivedAbilityDefinition {
  return {
    id: 90,
    name: "Synthetic Ability",
    description: "",
    mechanicalEffect: "",
    acquisitionType: "automatic",
    activationType: "passive",
    sourceSystem: "test",
    sourceExternalId: "DA-TEST-90",
    triggers: [],
    requirements: [],
    useConditions: [],
    costs: [],
    useLimits: [],
    ...overrides,
  };
}

test("all numeric operators evaluate Attribute requirements", () => {
  const cases: Array<[
    DerivedAbilityRequirementOperator,
    number,
    number,
    "satisfied" | "unsatisfied",
  ]> = [
    ["gte", 40, 40, "satisfied"],
    ["gt", 40, 40, "unsatisfied"],
    ["lte", 39, 40, "satisfied"],
    ["lt", 40, 40, "unsatisfied"],
    ["eq", 40, 40, "satisfied"],
    ["neq", 41, 40, "satisfied"],
  ];
  for (const [operator, current, requiredValue, expected] of cases) {
    assert.equal(
      evaluateDerivedAbilityRequirement(
        requirement({ operator, requiredValue }),
        { attributes: { STR: current } },
      ),
      expected,
    );
  }
});

test("Skill requirements use only arbitrary Skill IDs and stored Skill points", () => {
  const mastersRiposte = definition({
    acquisitionType: "learned",
    requirements: [requirement({
      requirementScope: "acquisition",
      requirementType: "skill",
      attributeKey: null,
      skillId: 123,
      requiredValue: 100,
    })],
  });
  for (const [points, expected] of [
    [99, "unsatisfied"],
    [100, "satisfied"],
    [120, "satisfied"],
  ] as const) {
    const skillPoints = getCharacterSkillPointsById({
      skillAllocations: [{
        draftId: 1,
        skillId: 123,
        parentDraftId: null,
        points,
      }],
    });
    assert.equal(
      evaluateDerivedAbilityAcquisitionRequirements(mastersRiposte, {
        attributes: {},
        skillPoints,
      }),
      expected,
    );
  }

  const belowThresholdPoints = getCharacterSkillPointsById({
    skillAllocations: [{
      draftId: 1,
      skillId: 123,
      parentDraftId: null,
      points: 99,
    }],
  });
  const calculatedRanks = [
    getSkillRank(99, 25, null, 1),
    getSkillRank(99, 0, 140, 5),
  ];
  for (const calculatedRank of calculatedRanks) {
    assert.ok(calculatedRank > 100);
    const gameplayContextWithUnrelatedRank = {
      attributes: {},
      skillPoints: belowThresholdPoints,
      calculatedRank,
    };
    assert.equal(
      evaluateDerivedAbilityAcquisitionRequirements(
        mastersRiposte,
        gameplayContextWithUnrelatedRank,
      ),
      "unsatisfied",
    );
  }

  const tierFiveSkillId = 500;
  assert.equal(
    evaluateDerivedAbilityRequirement(
      requirement({
        requirementType: "skill",
        attributeKey: null,
        skillId: tierFiveSkillId,
        requiredValue: 100,
      }),
      {
        attributes: {},
        skillPoints: new Map([[tierFiveSkillId, 100]]),
      },
    ),
    "satisfied",
  );
});

test("Derived Ability prerequisites inspect supplied possession state without recursion", () => {
  for (const [operator, possessed, expected] of [
    ["possessed", false, "unsatisfied"],
    ["not-possessed", false, "satisfied"],
    ["possessed", true, "satisfied"],
    ["not-possessed", true, "unsatisfied"],
  ] as const) {
    assert.equal(
      evaluateDerivedAbilityRequirement(
        requirement({
          requirementType: "derived-ability",
          attributeKey: null,
          requiredDerivedAbilityId: 25,
          operator,
          requiredValue: null,
        }),
        {
          attributes: {},
          possessedDerivedAbilityIds: new Set(possessed ? [25] : []),
        },
      ),
      expected,
    );
  }
});

test("Manual requirements remain manual through AND and yield to a satisfied OR group", () => {
  const automatic = requirement({ attributeKey: "STR", requiredValue: 40, sortOrder: 0 });
  const manual = requirement({
    requirementType: "manual",
    attributeKey: null,
    operator: null,
    requiredValue: null,
    notes: "Must have completed training with the Order of Ash.",
    sortOrder: 1,
  });
  assert.equal(
    evaluateDerivedAbilityRequirement(manual, { attributes: {} }),
    "manual",
  );
  assert.equal(
    evaluateDerivedAbilityRequirementGroup([automatic, manual], {
      attributes: { STR: 40 },
    }),
    "manual",
  );
  assert.equal(
    evaluateDerivedAbilityRequirementGroup([automatic, manual], {
      attributes: { STR: 39 },
    }),
    "unsatisfied",
  );
  assert.equal(
    evaluateDerivedAbilityRequirementScope([
      automatic,
      manual,
      requirement({
        groupNumber: 1,
        attributeKey: "DEX",
        requiredValue: 10,
        sortOrder: 0,
      }),
    ], "live", { attributes: { STR: 40, DEX: 10 } }),
    "satisfied",
  );
  assert.equal(
    evaluateDerivedAbilityRequirementScope([
      manual,
      requirement({
        groupNumber: 1,
        attributeKey: "DEX",
        requiredValue: 10,
      }),
    ], "live", { attributes: { DEX: 9 } }),
    "manual",
  );
  assert.equal(
    evaluateDerivedAbilityRequirementScope([
      automatic,
      requirement({
        groupNumber: 1,
        attributeKey: "DEX",
        requiredValue: 10,
      }),
    ], "live", { attributes: { STR: 39, DEX: 9 } }),
    "unsatisfied",
  );
});

test("empty acquisition and Live scopes are explicitly satisfied", () => {
  assert.equal(
    evaluateDerivedAbilityRequirementScope([], "acquisition", { attributes: {} }),
    "satisfied",
  );
  assert.equal(
    evaluateDerivedAbilityRequirementScope([], "live", { attributes: {} }),
    "satisfied",
  );
});

test("generalized requirements are authoritative over conflicting legacy triggers", () => {
  const trigger = {
    triggerType: "attribute",
    attributeKey: "STR",
    minimumScore: 40,
    sortOrder: 0,
  };
  const generalizedFails = definition({
    triggers: [trigger],
    requirements: [requirement({ attributeKey: "DEX", requiredValue: 50 })],
  });
  assert.deepEqual(
    getActiveDerivedAbilities(
      [generalizedFails],
      { attributes: { STR: 100, DEX: 49 } },
      enabled,
    ),
    [],
  );

  const generalizedPasses = definition({
    triggers: [{ ...trigger, minimumScore: 100 }],
    requirements: [requirement({ attributeKey: "DEX", requiredValue: 50 })],
  });
  assert.equal(
    getActiveDerivedAbilities(
      [generalizedPasses],
      { attributes: { STR: 1, DEX: 50 } },
      enabled,
    )[0]?.id,
    generalizedPasses.id,
  );
});

test("legacy fallback accepts one valid V1 trigger and safely rejects malformed shapes", () => {
  const validFallback = definition({
    triggers: [{
      triggerType: "attribute",
      attributeKey: "STR",
      minimumScore: 40,
      sortOrder: 0,
    }],
  });
  assert.equal(
    getActiveDerivedAbilities(
      [validFallback],
      { attributes: { STR: 40 } },
      enabled,
    ).length,
    1,
  );
  assert.deepEqual(
    getActiveDerivedAbilities(
      [definition({ triggers: [
        validFallback.triggers[0]!,
        { ...validFallback.triggers[0]!, sortOrder: 1 },
      ] })],
      { attributes: { STR: 100 } },
      enabled,
    ),
    [],
  );
  assert.deepEqual(
    getActiveDerivedAbilities(
      [definition({ triggers: [{
        triggerType: "unsupported",
        attributeKey: null,
        minimumScore: null,
        sortOrder: 0,
      }] })],
      { attributes: { STR: 100 } },
      enabled,
    ),
    [],
  );
});

test("automatic definitions need satisfied Live rules while Learned and Awarded never auto-grant", () => {
  const acquisitionRequirement = requirement({
    requirementScope: "acquisition",
    requirementType: "skill",
    attributeKey: null,
    skillId: 123,
    requiredValue: 100,
  });
  const context = {
    attributes: {},
    skillPoints: new Map([[123, 120]]),
  };
  for (const acquisitionType of ["learned", "awarded"] as const) {
    const ability = definition({
      acquisitionType,
      requirements: [acquisitionRequirement],
    });
    assert.equal(
      evaluateDerivedAbilityAcquisitionRequirements(ability, context),
      "satisfied",
    );
    assert.deepEqual(getActiveDerivedAbilities([ability], context, enabled), []);
  }

  const unrestrictedAutomatic = definition({ activationType: "reaction" });
  assert.equal(
    evaluateDerivedAbilityLiveRequirements(unrestrictedAutomatic, context),
    "satisfied",
  );
  assert.equal(
    getActiveDerivedAbilities([unrestrictedAutomatic], context, enabled).length,
    1,
  );
  assert.deepEqual(
    getActiveDerivedAbilities([unrestrictedAutomatic], context, ["Tier 1"]),
    [],
  );
});

test("Manual Live rules do not auto-activate and use metadata is not executed", () => {
  const manualAbility = definition({
    requirements: [requirement({
      requirementType: "manual",
      attributeKey: null,
      operator: null,
      requiredValue: null,
      notes: "G.O.D. judgment required.",
    })],
  });
  assert.equal(
    evaluateDerivedAbilityLiveRequirements(manualAbility, { attributes: {} }),
    "manual",
  );
  assert.deepEqual(getActiveDerivedAbilities([manualAbility], { attributes: {} }, enabled), []);

  const metadataOnly = definition({
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
      amount: 6,
      resourceKey: null,
      notes: "",
      sortOrder: 0,
    }],
    useLimits: [{
      maximumUses: 1,
      refreshScope: "round",
      refreshKey: null,
      notes: "",
      sortOrder: 0,
    }],
  });
  assert.equal(getActiveDerivedAbilities([metadataOnly], { attributes: {} }, enabled).length, 1);
});

test("temporary V1 mirroring is exact and complex generalized requirements are protected", () => {
  const mirror = buildV1MirrorRequirement({
    triggerType: "attribute",
    attributeKey: "CON",
    minimumScore: 55,
    sortOrder: 0,
  }, 90);
  assert.deepEqual(mirror, requirement({
    attributeKey: "CON",
    requiredValue: 55,
  }));
  const trigger = {
    triggerType: "attribute",
    attributeKey: "CON",
    minimumScore: 55,
    sortOrder: 0,
  } as const;
  assert.equal(canV1EditorSynchronizeRequirements([], [trigger]), true);
  assert.equal(canV1EditorSynchronizeRequirements([mirror], [trigger]), true);
  assert.equal(canV1EditorSynchronizeRequirements([
    mirror,
    { ...mirror, sortOrder: 1 },
  ], [trigger]), false);
  assert.equal(
    canV1EditorSynchronizeRequirements([{ ...mirror, notes: "Do not erase" }], [trigger]),
    false,
  );
  assert.equal(canV1EditorSynchronizeRequirements([requirement({
    requirementType: "skill",
    attributeKey: null,
    skillId: 123,
  })], [trigger]), false);
  assert.equal(
    canV1EditorSynchronizeRequirements(
      [{ ...mirror, attributeKey: "STR" }],
      [trigger],
    ),
    false,
  );
  assert.equal(canV1EditorSynchronizeRequirements([mirror], [trigger, trigger]), false);

  const action = readFileSync(
    path.resolve(process.cwd(), "src/app/heavens/derived-abilities/actions.ts"),
    "utf8",
  );
  assert.match(action, /canV1EditorSynchronizeRequirements\(requirementRows, triggerRows\)/);
  assert.match(action, /legacy or generalized requirements the temporary V1 editor cannot safely change/);
  assert.match(action, /insert\(derivedAbilityTrigger\)/);
  assert.match(action, /insert\(derivedAbilityRequirement\)/);
  assert.match(action, /update\(derivedAbilityRequirement\)/);
  assert.match(action, /db\.transaction/);
  assert.doesNotMatch(action, /delete\(derivedAbilityRequirement\)/);
});
