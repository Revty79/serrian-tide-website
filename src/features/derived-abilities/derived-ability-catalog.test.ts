import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { assembleDerivedAbilityCatalog } from "./derived-ability-catalog";

test("catalog assembly keeps triggerless definitions and independently ordered children", () => {
  const catalog = assembleDerivedAbilityCatalog({
    definitions: [{
      id: 8,
      name: "Triggerless",
      description: "",
      mechanicalEffect: "",
      acquisitionType: "automatic",
      activationType: "activated",
      sourceSystem: null,
      sourceExternalId: null,
    }],
    triggers: [],
    requirements: [
      {
        id: 2,
        derivedAbilityId: 8,
        requirementScope: "live",
        requirementType: "skill",
        groupNumber: 0,
        attributeKey: null,
        skillId: 500,
        requiredDerivedAbilityId: null,
        operator: "gte",
        requiredValue: 100,
        notes: "",
        sortOrder: 1,
      },
      {
        id: 1,
        derivedAbilityId: 8,
        requirementScope: "live",
        requirementType: "attribute",
        groupNumber: 0,
        attributeKey: "DEX",
        skillId: null,
        requiredDerivedAbilityId: null,
        operator: "gte",
        requiredValue: 50,
        notes: "",
        sortOrder: 0,
      },
    ],
    useConditions: [{
      id: 3,
      derivedAbilityId: 8,
      conditionType: "event",
      conditionKey: "successful-parry",
      operator: null,
      numericValue: null,
      textValue: null,
      notes: "",
      sortOrder: 0,
    }],
    costs: [{
      id: 4,
      derivedAbilityId: 8,
      costType: "initiative",
      amount: 6,
      resourceKey: null,
      notes: "",
      sortOrder: 0,
    }],
    useLimits: [{
      id: 5,
      derivedAbilityId: 8,
      maximumUses: 1,
      refreshScope: "round",
      refreshKey: null,
      notes: "",
      sortOrder: 0,
    }],
  });

  assert.equal(catalog.length, 1);
  assert.equal(catalog[0]?.triggers.length, 0);
  assert.deepEqual(
    catalog[0]?.requirements.map(({ id }) => id),
    [1, 2],
  );
  assert.equal(catalog[0]?.useConditions[0]?.conditionKey, "successful-parry");
  assert.equal(catalog[0]?.costs[0]?.amount, 6);
  assert.equal(catalog[0]?.useLimits[0]?.refreshScope, "round");
});

test("Character loading queries definitions and each child collection independently", () => {
  const action = readFileSync(
    path.resolve(process.cwd(), "src/app/characters/actions.ts"),
    "utf8",
  );
  assert.match(action, /\.from\(derivedAbility\)/);
  assert.match(action, /\.from\(derivedAbilityTrigger\)/);
  assert.match(action, /\.from\(derivedAbilityRequirement\)/);
  assert.match(action, /\.from\(derivedAbilityUseCondition\)/);
  assert.match(action, /\.from\(derivedAbilityCost\)/);
  assert.match(action, /\.from\(derivedAbilityUseLimit\)/);
  assert.match(action, /assembleDerivedAbilityCatalog/);
  assert.doesNotMatch(
    action,
    /\.from\(derivedAbility\)[\s\S]{0,300}\.innerJoin\(derivedAbilityTrigger/,
  );
});
