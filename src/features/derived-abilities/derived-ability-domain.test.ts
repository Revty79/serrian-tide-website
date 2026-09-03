import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  groupDerivedAbilityRequirements,
  normalizeDerivedAbilityAcquisitionType,
  normalizeDerivedAbilityActivationType,
  normalizeDerivedAbilityCost,
  normalizeDerivedAbilityCosts,
  normalizeDerivedAbilityRequirement,
  normalizeDerivedAbilityUseCondition,
  normalizeDerivedAbilityUseLimit,
} from "./derived-ability-domain";
import {
  DERIVED_ABILITY_ACQUISITION_TYPES,
  DERIVED_ABILITY_ACTIVATION_TYPES,
  type DerivedAbilityRequirementDefinition,
} from "./models";

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

test("all canonical acquisition and activation classifications normalize", () => {
  assert.deepEqual(
    DERIVED_ABILITY_ACQUISITION_TYPES.map(normalizeDerivedAbilityAcquisitionType),
    ["automatic", "learned", "awarded"],
  );
  assert.deepEqual(
    DERIVED_ABILITY_ACTIVATION_TYPES.map(normalizeDerivedAbilityActivationType),
    ["passive", "activated", "reaction", "triggered"],
  );
  assert.throws(
    () => normalizeDerivedAbilityAcquisitionType("purchased"),
    /Unsupported Derived Ability acquisition type/,
  );
  assert.throws(
    () => normalizeDerivedAbilityActivationType("automatic"),
    /Unsupported Derived Ability activation type/,
  );
});

test("attribute requirements represent live STR gte 40 and reject malformed combinations", () => {
  assert.deepEqual(normalizeDerivedAbilityRequirement(requirement()), requirement());
  assert.throws(
    () => normalizeDerivedAbilityRequirement(requirement({ attributeKey: "LCK" })),
    /must reference STR/,
  );
  assert.throws(
    () => normalizeDerivedAbilityRequirement(requirement({ requiredValue: null })),
    /finite number/,
  );
  assert.throws(
    () => normalizeDerivedAbilityRequirement(requirement({ operator: "possessed" })),
    /numeric comparison operator/,
  );
});

test("skill requirements reference arbitrary positive Skill IDs without tier assumptions", () => {
  for (const { skillId, illustrativeTier } of [
    { skillId: 1, illustrativeTier: 1 },
    { skillId: 123, illustrativeTier: 3 },
    { skillId: 4_004, illustrativeTier: 4 },
    { skillId: 5_005, illustrativeTier: 5 },
    { skillId: 8_008, illustrativeTier: 8 },
  ]) {
    const normalized = normalizeDerivedAbilityRequirement(requirement({
      requirementScope: "acquisition",
      requirementType: "skill",
      attributeKey: null,
      skillId,
      requiredValue: 100,
    }));
    assert.equal(normalized.skillId, skillId);
    assert.equal(
      "tier" in normalized,
      false,
      `Tier ${illustrativeTier} uses the same Skill-ID-only requirement shape.`,
    );
  }
  assert.throws(
    () => normalizeDerivedAbilityRequirement(requirement({
      requirementType: "skill",
      attributeKey: null,
      skillId: null,
    })),
    /Skill reference must be a positive whole number/,
  );
});

test("Derived Ability prerequisites support possession and reject direct self-reference or thresholds", () => {
  const prerequisite = requirement({
    requirementScope: "acquisition",
    requirementType: "derived-ability",
    attributeKey: null,
    requiredDerivedAbilityId: 22,
    operator: "possessed",
    requiredValue: null,
  });
  assert.equal(
    normalizeDerivedAbilityRequirement(prerequisite).requiredDerivedAbilityId,
    22,
  );
  assert.throws(
    () => normalizeDerivedAbilityRequirement({
      ...prerequisite,
      requiredDerivedAbilityId: 90,
    }),
    /cannot require itself/,
  );
  assert.throws(
    () => normalizeDerivedAbilityRequirement({
      ...prerequisite,
      requiredValue: 1,
    }),
    /Numeric threshold does not apply/,
  );
});

test("manual requirements preserve human-readable rules without machine targets", () => {
  const normalized = normalizeDerivedAbilityRequirement(requirement({
    requirementScope: "acquisition",
    requirementType: "manual",
    attributeKey: null,
    operator: null,
    requiredValue: null,
    notes: "  Must have completed training with the Order of Ash.  ",
  }));
  assert.equal(normalized.notes, "Must have completed training with the Order of Ash.");
  assert.equal(normalized.operator, null);
  assert.equal(normalized.requiredValue, null);
  assert.throws(
    () => normalizeDerivedAbilityRequirement({ ...normalized, notes: "" }),
    /Manual requirement text is required/,
  );
});

test("requirement groups are deterministic AND groups joined by OR", () => {
  const grouped = groupDerivedAbilityRequirements([
    requirement({
      id: 3,
      requirementScope: "acquisition",
      requirementType: "derived-ability",
      groupNumber: 1,
      attributeKey: null,
      requiredDerivedAbilityId: 27,
      operator: "possessed",
      requiredValue: null,
      sortOrder: 0,
      notes: "Gunslinger Training",
    }),
    requirement({
      id: 2,
      requirementScope: "acquisition",
      requirementType: "skill",
      attributeKey: null,
      skillId: 812,
      requiredValue: 75,
      sortOrder: 1,
      notes: "Pistol Mastery",
    }),
    requirement({
      id: 1,
      requirementScope: "acquisition",
      attributeKey: "DEX",
      requiredValue: 50,
      sortOrder: 0,
    }),
  ], "acquisition");

  assert.equal(grouped.operator, "or");
  assert.deepEqual(grouped.groups.map(({ groupNumber, operator }) => ({
    groupNumber,
    operator,
  })), [
    { groupNumber: 0, operator: "and" },
    { groupNumber: 1, operator: "and" },
  ]);
  assert.deepEqual(
    grouped.groups[0]?.requirements.map(({ requirementType }) => requirementType),
    ["attribute", "skill"],
  );
  assert.equal(grouped.groups[1]?.requirements[0]?.requiredDerivedAbilityId, 27);
  assert.deepEqual(groupDerivedAbilityRequirements([], "live"), {
    operator: "or",
    groups: [],
  });
});

test("multiple simultaneous costs retain decimal precision and deterministic positions", () => {
  const costs = normalizeDerivedAbilityCosts([
    {
      costType: "initiative",
      amount: 6,
      resourceKey: null,
      notes: "",
      sortOrder: 0,
    },
    {
      costType: "ammunition",
      amount: 2,
      resourceKey: "equipped-weapon",
      notes: "",
      sortOrder: 1,
    },
  ]);
  assert.deepEqual(costs.map(({ costType, amount }) => ({ costType, amount })), [
    { costType: "initiative", amount: 6 },
    { costType: "ammunition", amount: 2 },
  ]);
  assert.throws(
    () => normalizeDerivedAbilityCost({ ...costs[0]!, amount: 0 }),
    /use zero rows for no cost/,
  );
  assert.throws(
    () => normalizeDerivedAbilityCosts([
      costs[0]!,
      { ...costs[1]!, sortOrder: 0 },
    ]),
    /sort positions must be unique/,
  );
});

test("use limits represent round, encounter, and manual recharge definitions", () => {
  const limits = [
    normalizeDerivedAbilityUseLimit({
      maximumUses: 1,
      refreshScope: "round",
      refreshKey: null,
      notes: "",
      sortOrder: 0,
    }),
    normalizeDerivedAbilityUseLimit({
      maximumUses: 3,
      refreshScope: "encounter",
      refreshKey: null,
      notes: "",
      sortOrder: 1,
    }),
    normalizeDerivedAbilityUseLimit({
      maximumUses: 3,
      refreshScope: "manual",
      refreshKey: null,
      notes: "G.O.D.-defined recharge",
      sortOrder: 2,
    }),
  ];
  assert.deepEqual(limits.map(({ maximumUses, refreshScope }) => ({
    maximumUses,
    refreshScope,
  })), [
    { maximumUses: 1, refreshScope: "round" },
    { maximumUses: 3, refreshScope: "encounter" },
    { maximumUses: 3, refreshScope: "manual" },
  ]);
  assert.throws(
    () => normalizeDerivedAbilityUseLimit({ ...limits[0]!, maximumUses: 0 }),
    /positive whole number/,
  );
});

test("event use conditions preserve successful-parry without running combat logic", () => {
  assert.deepEqual(normalizeDerivedAbilityUseCondition({
    conditionType: "event",
    conditionKey: " successful-parry ",
    operator: null,
    numericValue: null,
    textValue: null,
    notes: "Reaction opportunity only",
    sortOrder: 0,
  }), {
    conditionType: "event",
    conditionKey: "successful-parry",
    operator: null,
    numericValue: null,
    textValue: null,
    notes: "Reaction opportunity only",
    sortOrder: 0,
  });
});

test("Pass 2 schema remains additive while Pass 3 retains V1 fallback storage", () => {
  const schema = readFileSync(
    path.resolve(process.cwd(), "src/db/derived-ability-schema.ts"),
    "utf8",
  );
  const runtime = readFileSync(
    path.resolve(
      process.cwd(),
      "src/features/derived-abilities/derived-ability-rules.ts",
    ),
    "utf8",
  );
  const mechanicalEffects = readFileSync(
    path.resolve(process.cwd(), "src/features/mechanical-effects/models.ts"),
    "utf8",
  );

  assert.match(schema, /export const derivedAbilityTrigger = pgTable/);
  assert.match(schema, /export const campaignAllowedDerivedAbility = pgTable/);
  assert.match(schema, /mechanicalEffect: text\("mechanical_effect"\)/);
  assert.doesNotMatch(schema, /character_derived_ability/);
  assert.match(runtime, /ability\.requirements\.length === 0/);
  assert.match(runtime, /evaluateLegacyV1Fallback\(ability, context\)/);
  assert.match(runtime, /evaluateDerivedAbilityLiveRequirements/);
  assert.doesNotMatch(mechanicalEffects, /derived-ability/);
});

test("migration 0017 adds only the generalized Derived Ability foundation", () => {
  const migration = readFileSync(
    path.resolve(
      process.cwd(),
      "drizzle/0017_expanded_derived_ability_domain.sql",
    ),
    "utf8",
  );

  assert.match(
    migration,
    /CREATE TYPE "public"\."derived_ability_acquisition_type" AS ENUM\('automatic', 'learned', 'awarded'\)/,
  );
  assert.match(
    migration,
    /CREATE TYPE "public"\."derived_ability_activation_type" AS ENUM\('passive', 'activated', 'reaction', 'triggered'\)/,
  );
  assert.match(
    migration,
    /ADD COLUMN "acquisition_type"[^;]+DEFAULT 'automatic' NOT NULL/,
  );
  assert.match(
    migration,
    /ADD COLUMN "activation_type"[^;]+DEFAULT 'passive' NOT NULL/,
  );
  for (const table of [
    "derived_ability_requirement",
    "derived_ability_use_condition",
    "derived_ability_cost",
    "derived_ability_use_limit",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(
    migration,
    /"skill_id"\) REFERENCES "public"\."skill"\("id"\) ON DELETE restrict/,
  );
  assert.match(
    migration,
    /"required_derived_ability_id"\) REFERENCES "public"\."derived_ability"\("id"\) ON DELETE restrict/,
  );
  assert.doesNotMatch(migration, /DROP|DELETE FROM|TRUNCATE|UPDATE "derived_ability"/);
  assert.doesNotMatch(migration, /derived_ability_trigger|campaign_allowed_derived_ability/);
});
