import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ActiveManaPool } from "@/features/active-state/active-mana";
import type {
  ActiveHealthAnatomy,
  ActiveHealthState,
} from "@/features/active-state/models";
import { createModifierSelection } from "@/features/spell-construction/utilities/spellFactory";
import type {
  EffectSelection,
  SpellContainer,
  SpellDocument,
} from "@/features/spell-construction/models/spell";
import {
  createContainer,
  createEmptySpell,
} from "@/features/spell-construction/utilities/spellFactory";

import {
  canInitiateSpellCast,
  canTargetSpellCast,
  executeSpellCastInTransaction,
  getSpellCastApplicationKey,
  planSpellCast,
  type LoadedSpellCastSource,
  type SpellCastExecutionOperations,
  type SpellCasterContext,
  type SpellCastPlan,
  type SpellCastRuntimeSelections,
  type SpellCastTargetContext,
} from "./character-spell-runtime";

function effect(
  id: string,
  ruleId: string,
  quantity = 1,
  healingScope?: "full-body" | "area",
): EffectSelection {
  return { id, ruleId, quantity, description: "", healingScope };
}

function container(
  id: string,
  effects: EffectSelection[],
  options: Partial<SpellContainer> = {},
): SpellContainer {
  return { ...createContainer("target"), id, effects, ...options };
}

function spellWith(...containers: SpellContainer[]): SpellDocument {
  return {
    ...createEmptySpell(),
    id: "runtime-spell",
    name: "Runtime Spell",
    frameworkSkillId: 1,
    sphere: "Water",
    castingSystem: "Spellcraft",
    containers,
  };
}

const anatomy: ActiveHealthAnatomy = {
  kind: "humanoid",
  totalMaximumHp: 100,
  maximumHpNote: null,
  pools: [
    { key: "head", name: "Head", maximumHp: 20, percentage: 20, sortOrder: 0 },
    { key: "torso", name: "Torso", maximumHp: 50, percentage: 50, sortOrder: 1 },
  ],
  hitLocations: [
    { result: 0, name: "Head", bodyParts: "Head", poolKey: "head", poolName: "Head" },
    { result: 1, name: "Torso", bodyParts: "Torso", poolKey: "torso", poolName: "Torso" },
  ],
};

function target(
  characterId: number,
  name: string,
  state: Partial<ActiveHealthState> = {},
  targetAnatomy = anatomy,
  npcKind: "race" | "creature" = "race",
): SpellCastTargetContext {
  return {
    characterId,
    campaignId: 10,
    name,
    isNpc: npcKind === "creature",
    npcKind,
    anatomy: targetAnatomy,
    state: {
      characterId,
      totalDamage: 0,
      pools: [],
      injuries: [],
      ...state,
    },
  };
}

function mana(overrides: Partial<ActiveManaPool> = {}): ActiveManaPool {
  return {
    system: "Spellcraft",
    maximumMana: 40,
    manaSpent: 0,
    currentMana: 40,
    sourceSkillName: "Channeling",
    sourceSkillPoints: 20,
    baseMagic: 2,
    spellAccessLevel: "Master",
    nextLevel: "High Master",
    nextRequiredMana: 51,
    ...overrides,
  };
}

function caster(overrides: Partial<SpellCasterContext> = {}): SpellCasterContext {
  return {
    characterId: 1,
    campaignId: 10,
    name: "Caster",
    system: "Spellcraft",
    practitionerLevel: "Master",
    mana: mana(),
    ...overrides,
  };
}

function source(
  spell: SpellDocument,
  overrides: Partial<LoadedSpellCastSource> = {},
): LoadedSpellCastSource {
  return {
    kind: "personal",
    identity: "personal:1",
    label: "Personal Spellbook Spell",
    spell,
    circumstance: "have-spell",
    ...overrides,
  };
}

function selections(
  targetGroups: Record<string, number[]> = {},
  applications: SpellCastRuntimeSelections["applications"] = {},
): SpellCastRuntimeSelections {
  return { targetGroups, applications };
}

function readyDamagePlan(options: {
  quantity?: number;
  targets?: SpellCastTargetContext[];
  selectedIds?: number[];
} = {}): SpellCastPlan {
  const spell = spellWith(container("target-root", [
    effect("damage", "damage", options.quantity ?? 1),
  ]));
  const selectedIds = options.selectedIds ?? [2];
  return planSpellCast({
    source: source(spell),
    caster: caster(),
    targets: options.targets ?? [target(2, "Target")],
    selections: selections(
      { "target-root": selectedIds },
      Object.fromEntries(selectedIds.map((id) => [
        getSpellCastApplicationKey("damage", id),
        { hitLocationNumber: 0 },
      ])),
    ),
  });
}

test("Known sources use have-spell and ignore any document practitioner override", () => {
  const spell = spellWith(container("root", [effect("damage", "damage")]));
  spell.practitionerLevel = "Grand Master";
  const plan = planSpellCast({
    source: source(spell),
    caster: caster({ practitionerLevel: "Novice", mana: mana({ spellAccessLevel: "Novice" }) }),
    selections: selections({ root: [2] }, {
      [getSpellCastApplicationKey("damage", 2)]: { hitLocationNumber: 0 },
    }),
    targets: [target(2, "Target")],
  });
  assert.equal(plan.castingCircumstance, "have-spell");
  assert.equal(plan.caster.practitionerLevel, "Novice");
});

test("all established Raw Casting circumstances remain calculable with the actual caster level", () => {
  const spell = spellWith(container("root", [effect("buff", "buff")]));
  for (const circumstance of [
    "have-spell",
    "have-framework",
    "no-framework",
    "no-open-framework-slot",
  ] as const) {
    const plan = planSpellCast({
      source: source(spell, { kind: "raw-formula", circumstance }),
      caster: caster({ practitionerLevel: "Master" }),
    });
    assert.equal(plan.status, "ready");
    assert.equal(plan.caster.practitionerLevel, "Master");
    assert.equal(plan.castingCircumstance, circumstance);
  }
});

test("complete Spell validation errors block casting while warnings remain visible", () => {
  const invalid = spellWith(container("empty", []));
  const invalidPlan = planSpellCast({ source: source(invalid), caster: caster() });
  assert.equal(invalidPlan.status, "invalid");
  assert.match(invalidPlan.issues.join(" "), /no Stand-Alone effect/i);

  const warned = spellWith(container("root", [effect("buff", "buff")]));
  warned.name = "";
  const warningPlan = planSpellCast({ source: source(warned), caster: caster() });
  assert.equal(warningPlan.status, "ready");
  assert.match(warningPlan.warnings.join(" "), /no name/i);
});

test("an adapter-invalid duplicate effect identity blocks casting before Mana use", () => {
  const spell = spellWith(
    container("one", [effect("duplicate", "damage")]),
    container("two", [effect("duplicate", "healing", 1, "full-body")]),
  );
  const plan = planSpellCast({ source: source(spell), caster: caster() });
  assert.equal(plan.status, "invalid");
  assert.match(plan.issues.join(" "), /occurs more than once/i);
});

test("Progressive consequences resolve at the actual Practitioner tier while cost keeps existing behavior", () => {
  const spell = spellWith(container("root", [effect("base", "buff")]));
  spell.modifiers = [createModifierSelection("progressive-spell")];
  spell.progressive.milestones.find(({ level }) => level === "Novice")!.changes = [{
    kind: "add-effect",
    containerId: "root",
    effect: effect("tier-damage", "damage", 3),
  }];
  const apprentice = planSpellCast({
    source: source(spell),
    caster: caster({ practitionerLevel: "Apprentice", mana: mana({ spellAccessLevel: "Apprentice" }) }),
  });
  const novice = planSpellCast({
    source: source(spell),
    caster: caster({ practitionerLevel: "Novice", mana: mana({ spellAccessLevel: "Novice" }) }),
    selections: selections({ root: [2] }, {
      [getSpellCastApplicationKey("tier-damage", 2)]: { hitLocationNumber: 0 },
    }),
    targets: [target(2, "Target")],
  });
  assert.equal(apprentice.activeProgressiveTier, "Apprentice");
  assert.equal(apprentice.automaticApplications.length, 0);
  assert.equal(novice.activeProgressiveTier, "Novice");
  assert.equal(novice.automaticApplications[0]?.spellEffectId, "tier-damage");
});

test("final calculated Mana uses only the resolved system pool and can spend exactly to zero", () => {
  const initial = readyDamagePlan();
  const exact = planSpellCast({
    source: source(spellWith(container("target-root", [effect("damage", "damage")]))),
    caster: caster({
      system: "Spellcraft",
      mana: mana({ maximumMana: initial.finalManaCost, currentMana: initial.finalManaCost }),
    }),
    selections: selections({ "target-root": [2] }, {
      [getSpellCastApplicationKey("damage", 2)]: { hitLocationNumber: 0 },
    }),
    targets: [target(2, "Target")],
  });
  assert.equal(exact.status, "ready");
  assert.equal(exact.manaAfterCast, 0);
  assert.equal(exact.caster.system, "Spellcraft");
});

test("insufficient Current Mana blocks every automatic effect and preview mutates nothing", () => {
  const state = target(2, "Target");
  const before = structuredClone(state.state);
  const plan = planSpellCast({
    source: source(spellWith(container("root", [effect("damage", "damage", 7)]))),
    caster: caster({ mana: mana({ currentMana: 1, manaSpent: 39 }) }),
    selections: selections({ root: [2] }, {
      [getSpellCastApplicationKey("damage", 2)]: { hitLocationNumber: 0 },
    }),
    targets: [state],
  });
  assert.equal(plan.status, "insufficient-mana");
  assert.equal(plan.automaticEffects[0]?.summary, "Deal 7 Damage · Localized");
  assert.deepEqual(state.state, before);
});

test("localized Damage uses Mechanical Effects, preserves exact hit location, and updates Total plus Pool", () => {
  const plan = readyDamagePlan({ quantity: 5 });
  assert.equal(plan.status, "ready");
  const application = plan.automaticApplications[0]!;
  assert.equal(application.plan.effect?.kind, "health.damage");
  assert.equal(application.plan.healthResult?.after.totalDamage, 5);
  assert.equal(application.plan.healthResult?.after.tracks.find(({ key }) => key === "head")?.damage, 5);
  assert.equal(application.plan.healthResult?.nextState.pools[0]?.poolKey, "head");
});

test("Creature targets use supplied Creature snapshot anatomy instead of humanoid mappings", () => {
  const creatureAnatomy: ActiveHealthAnatomy = {
    kind: "creature",
    totalMaximumHp: 60,
    maximumHpNote: null,
    pools: [{ key: "tail", name: "Tail", maximumHp: 15, percentage: 25, sortOrder: 0 }],
    hitLocations: [{ result: 9, name: "Tail", bodyParts: "Tail", poolKey: "tail", poolName: "Tail" }],
  };
  const spell = spellWith(container("root", [effect("damage", "damage", 4)]));
  const plan = planSpellCast({
    source: source(spell),
    caster: caster(),
    selections: selections({ root: [9] }, {
      [getSpellCastApplicationKey("damage", 9)]: { hitLocationNumber: 9 },
    }),
    targets: [target(9, "Cat", {}, creatureAnatomy, "creature")],
  });
  assert.equal(plan.status, "ready");
  assert.equal(plan.automaticApplications[0]!.plan.healthResult?.nextState.pools[0]?.poolKey, "tail");
});

test("Full Body Healing changes Total and all damaged Pools", () => {
  const damaged = target(2, "Target", {
    totalDamage: 10,
    pools: [
      { poolKey: "head", poolNameSnapshot: "Head", damage: 8 },
      { poolKey: "torso", poolNameSnapshot: "Torso", damage: 6 },
    ],
  });
  const plan = planSpellCast({
    source: source(spellWith(container("root", [effect("heal", "healing", 5, "full-body")]))),
    caster: caster(),
    selections: selections({ root: [2] }),
    targets: [damaged],
  });
  assert.equal(plan.status, "ready");
  const after = plan.automaticApplications[0]!.plan.healthResult!.after;
  assert.equal(after.totalDamage, 5);
  assert.equal(after.tracks.find(({ key }) => key === "head")?.damage, 3);
  assert.equal(after.tracks.find(({ key }) => key === "torso")?.damage, 1);
});

test("Area Healing changes only the selected actual Pool and not Total Damage", () => {
  const damaged = target(2, "Target", {
    totalDamage: 10,
    pools: [
      { poolKey: "head", poolNameSnapshot: "Head", damage: 8 },
      { poolKey: "torso", poolNameSnapshot: "Torso", damage: 6 },
    ],
  });
  const plan = planSpellCast({
    source: source(spellWith(container("root", [effect("heal", "healing", 5, "area")]))),
    caster: caster(),
    selections: selections({ root: [2] }, {
      [getSpellCastApplicationKey("heal", 2)]: { poolKey: "head" },
    }),
    targets: [damaged],
  });
  assert.equal(plan.status, "ready");
  const after = plan.automaticApplications[0]!.plan.healthResult!.after;
  assert.equal(after.totalDamage, 10);
  assert.equal(after.tracks.find(({ key }) => key === "head")?.damage, 3);
  assert.equal(after.tracks.find(({ key }) => key === "torso")?.damage, 6);
});

test("legacy Healing stays Manual while Manual-only Spells remain ready", () => {
  const spell = spellWith(container("root", [effect("legacy-heal", "healing", 7)]));
  const plan = planSpellCast({ source: source(spell), caster: caster() });
  assert.equal(plan.status, "ready");
  assert.equal(plan.automaticApplications.length, 0);
  assert.equal(plan.manualEffects.length, 1);
  assert.match(plan.manualEffects[0]!.description, /Healing amount: 7/);
});

test("mixed automatic and Manual consequences remain distinct and ordered", () => {
  const spell = spellWith(container("root", [
    effect("damage", "damage", 3),
    effect("buff", "buff"),
  ]));
  const plan = planSpellCast({
    source: source(spell),
    caster: caster(),
    selections: selections({ root: [2] }, {
      [getSpellCastApplicationKey("damage", 2)]: { hitLocationNumber: 1 },
    }),
    targets: [target(2, "Target")],
  });
  assert.equal(plan.status, "ready");
  assert.equal(plan.automaticApplications[0]?.spellEffectId, "damage");
  assert.equal(plan.manualEffects[0]?.spellEffectId, "buff");
});

test("effects in one Target container share one group and nested Target overrides its ancestor", () => {
  const nested = container("inner", [effect("inner-damage", "damage")]);
  const outer = container("outer", [
    effect("outer-damage", "damage"),
    effect("outer-heal", "healing", 1, "full-body"),
  ], { children: [nested] });
  const plan = planSpellCast({
    source: source(spellWith(outer)),
    caster: caster(),
    selections: selections({ outer: [2], inner: [3] }, {
      [getSpellCastApplicationKey("outer-damage", 2)]: { hitLocationNumber: 0 },
      [getSpellCastApplicationKey("inner-damage", 3)]: { hitLocationNumber: 1 },
    }),
    targets: [target(2, "Outer"), target(3, "Inner")],
  });
  assert.equal(plan.targetGroups.length, 2);
  assert.deepEqual(plan.targetGroups.find(({ id }) => id === "outer")?.automaticEffectIds, [
    "outer-damage",
    "outer-heal",
  ]);
  assert.equal(plan.automaticApplications.find(({ spellEffectId }) => spellEffectId === "inner-damage")?.targetCharacterId, 3);
});

test("Multi-Target is a capacity, permits fewer targets, and rejects excess or duplicates", () => {
  const spell = spellWith(container("root", [effect("damage", "damage")], {
    multiTarget: { ruleId: "multi-target", additionalTargets: 2, description: "" },
  }));
  const fewer = planSpellCast({
    source: source(spell),
    caster: caster(),
    selections: selections({ root: [2, 3] }, {
      [getSpellCastApplicationKey("damage", 2)]: { hitLocationNumber: 0 },
      [getSpellCastApplicationKey("damage", 3)]: { hitLocationNumber: 0 },
    }),
    targets: [target(2, "Two"), target(3, "Three")],
  });
  assert.equal(fewer.status, "ready");
  assert.equal(fewer.targetGroups[0]?.capacity, 3);

  const excess = planSpellCast({
    source: source(spell),
    caster: caster(),
    selections: selections({ root: [2, 3, 4, 5] }),
  });
  assert.equal(excess.status, "invalid");
  assert.match(excess.issues.join(" "), /at most 3/);

  const duplicate = planSpellCast({
    source: source(spell),
    caster: caster(),
    selections: selections({ root: [2, 2] }),
  });
  assert.equal(duplicate.status, "invalid");
  assert.match(duplicate.issues.join(" "), /duplicate Character target/);
});

test("Self range objectively targets only the caster", () => {
  const spell = spellWith(container("self-root", [effect("heal", "healing", 2, "full-body")], {
    rangeRuleId: "self",
  }));
  const plan = planSpellCast({
    source: source(spell),
    caster: caster(),
    targets: [target(1, "Caster", { totalDamage: 3 })],
  });
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.targetGroups[0]?.selectedTargetIds, [1]);

  const tampered = planSpellCast({
    source: source(spell),
    caster: caster(),
    selections: selections({ "self-root": [2] }),
    targets: [target(1, "Caster"), target(2, "Other")],
  });
  assert.equal(tampered.status, "invalid");
});

test("AoE never calculates geometry and requires explicit affected Character selections", () => {
  const spell = spellWith(container("area", [effect("damage", "damage", 4)], {
    containerRuleId: "aoe",
    shape: { id: "shape", ruleId: "radius", quantity: 2, description: "" },
  }));
  const missing = planSpellCast({ source: source(spell), caster: caster() });
  assert.equal(missing.status, "needs-selection");
  assert.equal(missing.targetGroups[0]?.kind, "aoe");
  assert.match(missing.targetGroups[0]?.shapeLabel ?? "", /Radius/);
  assert.equal(missing.targetGroups[0]?.capacity, null);

  const selected = planSpellCast({
    source: source(spell),
    caster: caster(),
    selections: selections({ area: [3, 2] }, {
      [getSpellCastApplicationKey("damage", 3)]: { hitLocationNumber: 1 },
      [getSpellCastApplicationKey("damage", 2)]: { hitLocationNumber: 0 },
    }),
    targets: [target(2, "Two"), target(3, "Three")],
  });
  assert.deepEqual(selected.automaticApplications.map(({ targetCharacterId }) => targetCharacterId), [3, 2]);
});

test("automatic application identity and execution order use effect ID then selected target order", () => {
  const spell = spellWith(container("root", [
    effect("damage-one", "damage"),
    effect("damage-two", "damage", 2),
  ], { multiTarget: { ruleId: "multi-target", additionalTargets: 1, description: "" } }));
  const applications = Object.fromEntries([
    "damage-one",
    "damage-two",
  ].flatMap((effectId) => [3, 2].map((id) => [
    getSpellCastApplicationKey(effectId, id),
    { hitLocationNumber: 0 },
  ])));
  const plan = planSpellCast({
    source: source(spell),
    caster: caster(),
    selections: selections({ root: [3, 2] }, applications),
    targets: [target(2, "Two"), target(3, "Three")],
  });
  assert.deepEqual(plan.automaticApplications.map(({ applicationKey }) => applicationKey), [
    "damage-one:3",
    "damage-one:2",
    "damage-two:3",
    "damage-two:2",
  ]);
});

test("Player and G.O.D. caster/target authorization stays within the Step 7 boundaries", () => {
  const player = { userId: "player-a", roles: ["player"] };
  const god = { userId: "god-a", roles: ["god"] };
  const ownPc = {
    characterId: 1, campaignId: 10, playerUserId: "player-a", campaignOwnerUserId: "god-a",
    isNpc: false, npcKind: "race" as const, isCampaignMember: true,
  };
  const otherPc = { ...ownPc, characterId: 2, playerUserId: "player-b" };
  const raceNpc = { ...ownPc, characterId: 3, playerUserId: "god-a", isNpc: true };
  const creatureNpc = { ...raceNpc, characterId: 4, npcKind: "creature" as const };
  const otherCampaign = { ...otherPc, characterId: 5, campaignId: 11 };

  assert.equal(canInitiateSpellCast(player, ownPc), true);
  assert.equal(canInitiateSpellCast(player, otherPc), false);
  assert.equal(canInitiateSpellCast(player, raceNpc), false);
  assert.equal(canInitiateSpellCast(god, ownPc), true);
  assert.equal(canInitiateSpellCast(god, raceNpc), true);
  assert.equal(canInitiateSpellCast(god, creatureNpc), false);
  assert.equal(canTargetSpellCast(player, ownPc, ownPc), true);
  assert.equal(canTargetSpellCast(player, ownPc, otherPc), true);
  assert.equal(canTargetSpellCast(player, ownPc, raceNpc), false);
  assert.equal(canTargetSpellCast(god, ownPc, raceNpc), true);
  assert.equal(canTargetSpellCast(god, ownPc, creatureNpc), true);
  assert.equal(canTargetSpellCast(player, ownPc, otherCampaign), false);
  assert.equal(canTargetSpellCast(god, ownPc, otherCampaign), false);
});

function fakeAtomicRunner(options: {
  plan: SpellCastPlan;
  state: { manaSpent: number; applied: string[] };
  failApplication?: number;
}) {
  return async (
    execute: (operations: SpellCastExecutionOperations) => Promise<unknown>,
  ) => {
    const snapshot = structuredClone(options.state);
    let applicationIndex = 0;
    try {
      return await execute({
        loadAndPlan: async () => options.plan,
        spendMana: async (plan) => {
          options.state.manaSpent += plan.finalManaCost;
          return mana({
            manaSpent: options.state.manaSpent,
            currentMana: 40 - options.state.manaSpent,
          });
        },
        applyAutomaticEffect: async (application) => {
          applicationIndex += 1;
          options.state.applied.push(application.applicationKey);
          if (options.failApplication === applicationIndex) {
            throw new Error("Fake Health persistence failure.");
          }
        },
      });
    } catch (error) {
      options.state.manaSpent = snapshot.manaSpent;
      options.state.applied = snapshot.applied;
      throw error;
    }
  };
}

test("Mana and one Health effect commit together", async () => {
  const plan = readyDamagePlan();
  const state = { manaSpent: 0, applied: [] as string[] };
  const result = await executeSpellCastInTransaction(
    fakeAtomicRunner({ plan, state }) as never,
    true,
  );
  assert.equal(result.finalManaCost, plan.finalManaCost);
  assert.equal(state.manaSpent, plan.finalManaCost);
  assert.deepEqual(state.applied, ["damage:2"]);
});

test("Mana rolls back when the first Health persistence throws", async () => {
  const plan = readyDamagePlan();
  const state = { manaSpent: 0, applied: [] as string[] };
  await assert.rejects(
    executeSpellCastInTransaction(
      fakeAtomicRunner({ plan, state, failApplication: 1 }) as never,
      true,
    ),
    /Health persistence failure/,
  );
  assert.deepEqual(state, { manaSpent: 0, applied: [] });
});

test("earlier Health changes and Mana roll back when a later effect throws", async () => {
  const spell = spellWith(container("root", [
    effect("damage-one", "damage"),
    effect("damage-two", "damage"),
  ]));
  const plan = planSpellCast({
    source: source(spell),
    caster: caster(),
    selections: selections({ root: [2] }, {
      "damage-one:2": { hitLocationNumber: 0 },
      "damage-two:2": { hitLocationNumber: 1 },
    }),
    targets: [target(2, "Target")],
  });
  const state = { manaSpent: 0, applied: [] as string[] };
  await assert.rejects(
    executeSpellCastInTransaction(
      fakeAtomicRunner({ plan, state, failApplication: 2 }) as never,
      true,
    ),
    /Health persistence failure/,
  );
  assert.deepEqual(state, { manaSpent: 0, applied: [] });
});

test("Manual-only casting spends Mana and mixed Manual output cannot cause partial persistence", async () => {
  const manualPlan = planSpellCast({
    source: source(spellWith(container("root", [effect("teleport", "teleportation")]))),
    caster: caster(),
  });
  const manualState = { manaSpent: 0, applied: [] as string[] };
  const manualResult = await executeSpellCastInTransaction(
    fakeAtomicRunner({ plan: manualPlan, state: manualState }) as never,
    true,
  );
  assert.equal(manualResult.manualEffects.length, 1);
  assert.equal(manualState.manaSpent, manualPlan.finalManaCost);
  assert.deepEqual(manualState.applied, []);
});

test("serialized concurrent casts cannot both spend the same remaining Mana", async () => {
  const castCost = readyDamagePlan().finalManaCost;
  assert.ok(castCost > 0);
  let spent = 0;
  let queue = Promise.resolve();
  const makeRunner = () => async (
    execute: (operations: SpellCastExecutionOperations) => Promise<unknown>,
  ) => {
    const previous = queue;
    let release = () => {};
    queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const currentMana = castCost - spent;
      const plan = planSpellCast({
        source: source(spellWith(container("target-root", [effect("damage", "damage", 1)]))),
        caster: caster({ mana: mana({ maximumMana: castCost, currentMana, manaSpent: spent }) }),
        selections: selections({ "target-root": [2] }, { "damage:2": { hitLocationNumber: 0 } }),
        targets: [target(2, "Target")],
      });
      return await execute({
        loadAndPlan: async () => plan,
        spendMana: async (ready) => {
          if (ready.finalManaCost > castCost - spent) throw new Error("insufficient Mana");
          spent += ready.finalManaCost;
          return mana({ maximumMana: castCost, manaSpent: spent, currentMana: castCost - spent });
        },
        applyAutomaticEffect: async () => {},
      });
    } finally {
      release();
    }
  };
  const outcomes = await Promise.allSettled([
    executeSpellCastInTransaction(makeRunner() as never, true),
    executeSpellCastInTransaction(makeRunner() as never, true),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(spent, castCost);
});

test("server runtime reloads authoritative sources and uses one transaction-aware Mana/Health path", () => {
  const service = readFileSync(
    "src/features/characters/character-spell-runtime-service.ts",
    "utf8",
  );
  const spellActions = readFileSync("src/app/characters/spell-actions.ts", "utf8");
  assert.match(service, /campaignCharacterSkillAllocation/);
  assert.match(service, /skillExtension\.extensionType, "spell-construction"/);
  assert.match(service, /campaignCharacterSpellDocument\.characterId, characterId/);
  assert.match(service, /row\.inSpellbook/);
  assert.match(service, /parseSpellDocument/);
  assert.match(service, /readActiveManaInTransaction/);
  assert.match(service, /spendActiveManaInTransaction/);
  assert.match(service, /persistPlannedMechanicalEffectInTransaction/);
  assert.match(service, /db\.transaction/);
  assert.doesNotMatch(service, /calculateCastingCircumstanceWithoutPractitioner/);
  assert.doesNotMatch(spellActions, /spendActiveManaInTransaction/);
});
