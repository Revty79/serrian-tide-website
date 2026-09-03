import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { canMutateActiveHealth } from "@/features/active-state/authorization";

import {
  getDerivedAbilityDependencyOrder,
  resolveCharacterDerivedAbilities,
} from "./character-derived-ability-resolver";
import {
  evaluateDerivedAbilityUseCondition,
  getDerivedAbilityOpportunities,
  planDerivedAbilityUse,
  type DerivedAbilityRechargeLedgerEntry,
  type DerivedAbilityUseLedgerEntry,
} from "./derived-ability-use";
import type {
  CharacterDerivedAbilityOwnership,
  CharacterDerivedAbilityStatus,
  DerivedAbilityDefinition,
  DerivedAbilityRequirementDefinition,
} from "./models";

function ability(
  id: number,
  overrides: Partial<DerivedAbilityDefinition> = {},
): DerivedAbilityDefinition {
  return {
    id,
    name: `Ability ${id}`,
    description: "",
    mechanicalEffect: "",
    acquisitionType: "learned",
    activationType: "activated",
    sourceSystem: null,
    sourceExternalId: null,
    triggers: [],
    requirements: [],
    useConditions: [],
    costs: [],
    useLimits: [],
    effects: [],
    ...overrides,
  };
}

function requirement(
  overrides: Partial<DerivedAbilityRequirementDefinition> = {},
): DerivedAbilityRequirementDefinition {
  return {
    requirementScope: "acquisition",
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

function ownership(
  id: number,
  derivedAbilityId: number,
  overrides: Partial<CharacterDerivedAbilityOwnership> = {},
): CharacterDerivedAbilityOwnership {
  return {
    id,
    characterId: 9,
    derivedAbilityId,
    acquisitionMethod: "learned",
    acquiredByUserId: "player",
    acquisitionNotes: "",
    acquiredAt: "2026-09-03T10:00:00.000Z",
    revokedAt: null,
    revokedByUserId: null,
    revocationNotes: "",
    ...overrides,
  };
}

function availableStatus(abilityId: number): CharacterDerivedAbilityStatus {
  return {
    abilityId,
    status: "owned-available",
    ownershipId: 1,
    acquisitionMethod: "learned",
    acquisitionResult: "satisfied",
    liveResult: "satisfied",
    possessed: true,
    available: true,
  };
}

const enabled = ["Derived Abilities"] as const;

test("resolver separates persistent ownership from acquisition and Live requirements", () => {
  const acquisitionOnly = ability(1, {
    requirements: [requirement({ requirementType: "skill", skillId: 20, attributeKey: null, requiredValue: 100 })],
  });
  const acquisitionAndLive = ability(2, {
    requirements: [
      requirement({ requirementType: "skill", skillId: 20, attributeKey: null, requiredValue: 100 }),
      requirement({ requirementScope: "live", requirementType: "skill", skillId: 20, attributeKey: null, requiredValue: 100 }),
    ],
  });
  const result = resolveCharacterDerivedAbilities({
    catalog: [acquisitionOnly, acquisitionAndLive],
    ownerships: [ownership(1, 1), ownership(2, 2)],
    attributes: {},
    skillPoints: new Map([[20, 80]]),
    allowedSystems: enabled,
  });
  assert.equal(result.statuses[0]?.status, "owned-available");
  assert.equal(result.statuses[0]?.acquisitionResult, "unsatisfied");
  assert.equal(result.statuses[1]?.status, "owned-unavailable");
  assert.equal(result.statuses[1]?.possessed, true);
  assert.deepEqual(result.effectiveDerivedAbilityIds, [1, 2]);
});

test("resolver never persists or infers Automatic ownership and preserves canonical threshold behavior", () => {
  const durable = ability(1, {
    name: "Durable Muscles",
    acquisitionType: "automatic",
    activationType: "passive",
    requirements: [requirement({ requirementScope: "live" })],
  });
  const at39 = resolveCharacterDerivedAbilities({
    catalog: [durable], ownerships: [], attributes: { STR: 39 }, allowedSystems: enabled,
  });
  const at40 = resolveCharacterDerivedAbilities({
    catalog: [durable], ownerships: [], attributes: { STR: 40 }, allowedSystems: enabled,
  });
  assert.equal(at39.statuses[0]?.status, "automatic-inactive");
  assert.equal(at40.statuses[0]?.status, "automatic-active");
  assert.equal(at40.statuses[0]?.ownershipId, null);
});

test("owned unavailable prerequisites remain possessed while revoked and inactive Automatic prerequisites do not", () => {
  const prerequisite = ability(1, {
    requirements: [requirement({ requirementScope: "live", requiredValue: 100 })],
  });
  const dependent = ability(2, {
    requirements: [requirement({
      requirementType: "derived-ability",
      attributeKey: null,
      requiredValue: null,
      requiredDerivedAbilityId: 1,
      operator: "possessed",
    })],
  });
  const owned = resolveCharacterDerivedAbilities({
    catalog: [dependent, prerequisite],
    ownerships: [ownership(1, 1)],
    attributes: { STR: 40 },
    allowedSystems: enabled,
  });
  assert.equal(owned.statuses.find(({ abilityId }) => abilityId === 2)?.status, "eligible-to-learn");

  const revoked = resolveCharacterDerivedAbilities({
    catalog: [dependent, prerequisite],
    ownerships: [ownership(1, 1, { revokedAt: "2026-09-03T11:00:00.000Z", revokedByUserId: "god" })],
    attributes: { STR: 40 },
    allowedSystems: enabled,
  });
  assert.equal(revoked.statuses.find(({ abilityId }) => abilityId === 2)?.status, "not-eligible");

  const automatic = { ...prerequisite, acquisitionType: "automatic" as const };
  const inactive = resolveCharacterDerivedAbilities({
    catalog: [dependent, automatic], ownerships: [], attributes: { STR: 40 }, allowedSystems: enabled,
  });
  assert.equal(inactive.statuses.find(({ abilityId }) => abilityId === 2)?.status, "not-eligible");
});

test("dependency order is deterministic and rejects two-node and three-node cycles for every operator", () => {
  const depends = (id: number, dependency: number, operator: "possessed" | "not-possessed" = "possessed") => ability(id, {
    requirements: [requirement({
      requirementType: "derived-ability",
      attributeKey: null,
      requiredValue: null,
      requiredDerivedAbilityId: dependency,
      operator,
    })],
  });
  assert.deepEqual(getDerivedAbilityDependencyOrder([depends(3, 2), ability(1), depends(2, 1, "not-possessed")]), [1, 2, 3]);
  assert.throws(() => getDerivedAbilityDependencyOrder([depends(1, 2), depends(2, 1)]), /1 -> 2 -> 1/);
  assert.throws(() => getDerivedAbilityDependencyOrder([depends(1, 2), depends(2, 3), depends(3, 1)]), /cycle/);
});

test("use conditions are tri-state and event matching is exact", () => {
  const event = {
    conditionType: "event" as const,
    conditionKey: "successful-parry",
    operator: null,
    numericValue: null,
    textValue: null,
    notes: "",
    sortOrder: 0,
  };
  assert.equal(evaluateDerivedAbilityUseCondition(event, { eventKey: "successful-parry" }), "satisfied");
  assert.equal(evaluateDerivedAbilityUseCondition(event, { eventKey: "successful-dodge" }), "unsatisfied");
  assert.equal(evaluateDerivedAbilityUseCondition({ ...event, conditionType: "manual" }, {}), "manual");
  assert.equal(evaluateDerivedAbilityUseCondition({ ...event, conditionType: "equipment", conditionKey: "ancestral-weapon" }, {}), "manual");
  assert.equal(evaluateDerivedAbilityUseCondition({ ...event, conditionType: "equipment", conditionKey: "shield-equipped" }, { equipmentConditions: new Map([["shield-equipped", true]]) }), "satisfied");
});

test("planner returns unavailable, manual, insufficient, needs-selection, and ready without paying costs", () => {
  const base = ability(1, {
    effects: [{ kind: "condition.apply", name: "Focused", description: "", duration: { kind: "until-removed" } }],
    costs: [{ costType: "mana", amount: 3, resourceKey: "Spellcraft", notes: "", sortOrder: 0 }],
  });
  const needsSelection = planDerivedAbilityUse({
    characterId: 9,
    ability: base,
    resolvedStatus: availableStatus(1),
    eventContext: { manaPools: new Map([["Spellcraft", { current: 3 }]]) },
  });
  assert.equal(needsSelection.status, "needs-selection");
  assert.equal(needsSelection.costs[0]?.status, "automatic");

  const ready = planDerivedAbilityUse({
    characterId: 9,
    ability: base,
    resolvedStatus: availableStatus(1),
    eventContext: { manaPools: new Map([["Spellcraft", { current: 3 }]]) },
    effectApplications: new Map([[0, { targetCharacterId: 9 }]]),
  });
  assert.equal(ready.status, "ready");

  const insufficient = planDerivedAbilityUse({
    characterId: 9,
    ability: base,
    resolvedStatus: availableStatus(1),
    eventContext: { manaPools: new Map([["Spellcraft", { current: 2 }]]) },
    effectApplications: new Map([[0, { targetCharacterId: 9 }]]),
  });
  assert.equal(insufficient.status, "insufficient-resources");

  const manual = planDerivedAbilityUse({
    characterId: 9,
    ability: ability(1, { costs: [{ costType: "health", amount: 1, resourceKey: null, notes: "", sortOrder: 0 }] }),
    resolvedStatus: availableStatus(1),
  });
  assert.equal(manual.status, "manual");
  assert.equal(planDerivedAbilityUse({ ...manualInput(manual), manualConfirmed: true }).status, "ready");

  const unavailable = planDerivedAbilityUse({
    characterId: 9,
    ability: base,
    resolvedStatus: { ...availableStatus(1), status: "owned-unavailable", available: false },
  });
  assert.equal(unavailable.status, "unavailable");
});

function manualInput(plan: ReturnType<typeof planDerivedAbilityUse>) {
  return {
    characterId: plan.characterId,
    ability: ability(plan.abilityId, { costs: plan.costs.map(({ cost }) => cost) }),
    resolvedStatus: availableStatus(plan.abilityId),
  };
}

test("cost preflight is cumulative and unsupported costs remain manual", () => {
  const planned = planDerivedAbilityUse({
    characterId: 9,
    ability: ability(1, { costs: [
      { costType: "initiative", amount: 3, resourceKey: null, notes: "", sortOrder: 0 },
      { costType: "initiative", amount: 3, resourceKey: null, notes: "", sortOrder: 1 },
      { costType: "ammunition", amount: 1, resourceKey: null, notes: "", sortOrder: 2 },
      { costType: "custom", amount: 1, resourceKey: "favor", notes: "", sortOrder: 3 },
    ] }),
    resolvedStatus: availableStatus(1),
    eventContext: { encounterId: 5, currentInitiative: 5 },
  });
  assert.deepEqual(planned.costs.map(({ status }) => status), ["automatic", "insufficient", "manual", "manual"]);
  assert.equal(planned.status, "insufficient-resources");
});

function use(id: number, overrides: Partial<DerivedAbilityUseLedgerEntry> = {}): DerivedAbilityUseLedgerEntry {
  return {
    id,
    characterId: 9,
    derivedAbilityId: 1,
    ownershipId: 1,
    sessionId: 2,
    sceneId: 3,
    encounterId: 4,
    roundNumber: 5,
    eventKey: null,
    usedAt: `2026-09-03T10:0${id}:00.000Z`,
    ...overrides,
  };
}

test("all simultaneous round, encounter, scene, never, manual, and event limits must allow use", () => {
  const limited = ability(1, { useLimits: [
    { maximumUses: 1, refreshScope: "round", refreshKey: null, notes: "", sortOrder: 0 },
    { maximumUses: 3, refreshScope: "encounter", refreshKey: null, notes: "", sortOrder: 1 },
    { maximumUses: 4, refreshScope: "scene", refreshKey: null, notes: "", sortOrder: 2 },
    { maximumUses: 5, refreshScope: "never", refreshKey: null, notes: "", sortOrder: 3 },
    { maximumUses: 1, refreshScope: "manual", refreshKey: null, notes: "", sortOrder: 4 },
    { maximumUses: 1, refreshScope: "event", refreshKey: "dawn", notes: "", sortOrder: 5 },
  ] });
  const beforeReset = planDerivedAbilityUse({
    characterId: 9,
    ability: limited,
    resolvedStatus: availableStatus(1),
    eventContext: { sessionId: 2, sceneId: 3, encounterId: 4, roundNumber: 5 },
    uses: [use(1)],
    ownershipAcquiredAt: "2026-09-03T09:00:00.000Z",
  });
  assert.equal(beforeReset.status, "exhausted");
  assert.equal(beforeReset.limits.filter(({ status }) => status === "exhausted").length, 3);

  const recharges: DerivedAbilityRechargeLedgerEntry[] = [
    { id: 1, characterId: 9, derivedAbilityId: 1, refreshScope: "manual", refreshKey: null, rechargedAt: "2026-09-03T10:30:00.000Z" },
    { id: 2, characterId: 9, derivedAbilityId: 1, refreshScope: "event", refreshKey: "dawn", rechargedAt: "2026-09-03T10:30:00.000Z" },
  ];
  const afterResetNewRound = planDerivedAbilityUse({
    characterId: 9,
    ability: limited,
    resolvedStatus: availableStatus(1),
    eventContext: { sessionId: 2, sceneId: 8, encounterId: 7, roundNumber: 1 },
    uses: [use(1)],
    recharges,
    ownershipAcquiredAt: "2026-09-03T09:00:00.000Z",
  });
  assert.equal(afterResetNewRound.status, "ready");
  assert.equal(afterResetNewRound.limits.find(({ limit }) => limit.refreshScope === "never")?.uses, 1);
});

test("reacquisition starts a distinct owned usage lifecycle", () => {
  const planned = planDerivedAbilityUse({
    characterId: 9,
    ability: ability(1, { useLimits: [
      { maximumUses: 1, refreshScope: "never", refreshKey: null, notes: "", sortOrder: 0 },
    ] }),
    resolvedStatus: { ...availableStatus(1), ownershipId: 2 },
    uses: [use(1, { ownershipId: 1 })],
    ownershipAcquiredAt: "2026-09-03T10:30:00.000Z",
  });
  assert.equal(planned.status, "ready");
  assert.equal(planned.limits[0]?.uses, 0);
});

test("ordered Derived Ability effects use the shared planner and allow manual instructions to coexist", () => {
  const planned = planDerivedAbilityUse({
    characterId: 9,
    ability: ability(1, { effects: [
      { kind: "health.heal", amount: 3, scope: "full-body" },
      { kind: "health.damage", amount: 2, application: "localized" },
      { kind: "condition.apply", name: "Focused", description: "", duration: { kind: "until-removed" } },
      { kind: "modifier.apply", label: "Strong", channel: "attribute", targetKey: "STR", amount: 2, duration: { kind: "until-removed" } },
      { kind: "manual", title: "Table Ruling", description: "Resolve the narrative rider." },
    ] }),
    resolvedStatus: availableStatus(1),
    effectApplications: new Map([
      [0, { targetCharacterId: 9 }],
      [1, { targetCharacterId: 9, poolKey: "rightArm" }],
      [2, { targetCharacterId: 9 }],
      [3, { targetCharacterId: 9 }],
    ]),
  });
  assert.equal(planned.status, "manual");
  assert.deepEqual(planned.effects.map(({ plan }) => plan.effect?.kind), [
    "health.heal",
    "health.damage",
    "condition.apply",
    "modifier.apply",
    "manual",
  ]);
  assert.deepEqual(planned.effects.map(({ plan }) => plan.status), [
    "ready",
    "ready",
    "ready",
    "ready",
    "manual",
  ]);
  assert.ok(planned.effects.every(({ plan }) => plan.source?.kind === "derived-ability"));
  assert.equal(planned.manualSteps.length, 1);
  assert.equal(planDerivedAbilityUse({
    characterId: 9,
    ability: ability(1, { effects: [
      { kind: "manual", title: "Table Ruling", description: "Resolve the narrative rider." },
    ] }),
    resolvedStatus: availableStatus(1),
    manualConfirmed: true,
  }).status, "ready");
});

test("Reaction and Triggered opportunities surface matching events without executing", () => {
  const reaction = ability(1, {
    activationType: "reaction",
    useConditions: [{ conditionType: "event", conditionKey: "successful-parry", operator: null, numericValue: null, textValue: null, notes: "", sortOrder: 0 }],
  });
  const triggered = ability(2, {
    activationType: "triggered",
    useConditions: [{ conditionType: "event", conditionKey: "bloodied", operator: null, numericValue: null, textValue: null, notes: "", sortOrder: 0 }],
  });
  const character = {
    id: 9,
    abilities: [triggered, reaction],
    statuses: [availableStatus(1), availableStatus(2)],
  };
  assert.equal(planDerivedAbilityUse({
    characterId: 9,
    ability: reaction,
    resolvedStatus: availableStatus(1),
  }).status, "unavailable");
  assert.deepEqual(getDerivedAbilityOpportunities(character, { eventKey: "successful-parry" }).map(({ ability }) => ability.id), [1]);
  assert.deepEqual(getDerivedAbilityOpportunities(character, { eventKey: "wrong-event" }), []);
  assert.deepEqual(getDerivedAbilityOpportunities(character, {}), []);
});

test("Derived Ability control reuses Character owner and owning G.O.D. authorization", () => {
  const entity = {
    playerUserId: "player",
    campaignOwnerUserId: "god",
    isNpc: false,
    isCampaignMember: true,
  };
  assert.equal(canMutateActiveHealth({ userId: "player", roles: ["player"] }, entity), true);
  assert.equal(canMutateActiveHealth({ userId: "god", roles: ["god"] }, entity), true);
  assert.equal(canMutateActiveHealth({ userId: "stranger", roles: ["player"] }, entity), false);
  assert.equal(canMutateActiveHealth({ userId: "other-god", roles: ["god"] }, entity), false);
});

test("Pass 6 server boundaries preserve no-XP acquisition, authoritative rechecks, history, and shared effect execution", () => {
  const source = (relative: string) => readFileSync(path.resolve(process.cwd(), relative), "utf8");
  const service = source("src/features/derived-abilities/character-derived-ability-service.ts");
  const schema = source("src/db/derived-ability-schema.ts");
  const actions = source("src/app/heavens/derived-abilities/actions.ts");
  const migration = source("drizzle/0020_derived_ability_character_runtime.sql");
  assert.match(service, /status\.acquisitionResult === "unsatisfied"/);
  assert.match(service, /persistPlannedMechanicalEffectInTransaction/);
  assert.match(service, /spendActiveManaInTransaction/);
  assert.match(service, /spendImmediateInitiativeInTransaction/);
  assert.match(service, /characterDerivedAbilityUse/);
  assert.match(service, /reconcileCharacterDerivedAbilityPassivesInTransaction/);
  assert.doesNotMatch(service, /spendXp|experience:\s*.*-/i);
  assert.match(schema, /TODO: If canon later defines an acquisition price/);
  assert.match(schema, /character_derived_ability_active_uq/);
  assert.match(schema, /where\(sql`\$\{table\.revokedAt\} IS NULL`\)/);
  assert.match(actions, /active Character ownerships before changing/);
  assert.match(actions, /Character ownership history and cannot be deleted/);
  assert.match(migration, /ON DELETE restrict/);
  assert.match(migration, /ON DELETE cascade/);
  assert.match(migration, /derived-ability/);
});
