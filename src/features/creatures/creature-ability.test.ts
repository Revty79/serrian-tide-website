import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MECHANICAL_EFFECT_SCHEMA_VERSION, type MechanicalEffect } from "@/features/mechanical-effects";
import type { ActiveHealthAnatomy, ActiveHealthState } from "@/features/active-state/models";

import {
  adaptCreatureAbilityToMechanicalEffects,
  copyCreatureAbility,
  createCreatureAbilityEffect,
  normalizeCreatureAbilityDefinition,
  normalizeCreatureAbilityEffects,
  normalizeCreatureSnapshotAbilities,
  reorderCreatureAbilityEffects,
  type CreatureAbilityDefinition,
} from "./creature-ability";
import {
  creatureAbilityApplicationKey,
  executeCreatureAbilityUseInTransaction,
  planCreatureAbilityUse,
  type CreatureAbilityRuntimeTarget,
  type CreatureAbilityUsePlan,
} from "./creature-ability-runtime";

const serviceSource = readFileSync("src/features/creatures/creature-ability-runtime-service.ts", "utf8");
const runtimeSource = readFileSync("src/features/creatures/creature-ability-runtime.ts", "utf8");
const creatureActionsSource = readFileSync("src/app/heavens/creatures/actions.ts", "utf8");
const npcActionsSource = readFileSync("src/app/heavens/npcs/actions.ts", "utf8");
const npcWorkspaceSource = readFileSync("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx", "utf8");
const schemaSource = readFileSync("src/db/creature-schema.ts", "utf8");

const humanoidAnatomy: ActiveHealthAnatomy = {
  kind: "humanoid",
  totalMaximumHp: 100,
  maximumHpNote: null,
  pools: [
    { key: "arm", name: "Arm", maximumHp: 20, percentage: 20, sortOrder: 0 },
    { key: "torso", name: "Torso", maximumHp: 40, percentage: 40, sortOrder: 1 },
  ],
  hitLocations: [
    { result: 3, name: "Lower Arm", bodyParts: "Forearm", poolKey: "arm", poolName: "Arm" },
  ],
};

const creatureAnatomy: ActiveHealthAnatomy = {
  kind: "creature",
  totalMaximumHp: null,
  maximumHpNote: "Creature total HP is not defined.",
  pools: [
    { key: "LEFT_WING", name: "Left Wing", maximumHp: null, percentage: 25, sortOrder: 0 },
    { key: "BODY", name: "Body", maximumHp: null, percentage: 75, sortOrder: 1 },
  ],
  hitLocations: [
    { result: 7, name: "Left Wing", bodyParts: "Wing", poolKey: "LEFT_WING", poolName: "Left Wing" },
  ],
};

function effect(effectKey: string, mechanicalEffect: MechanicalEffect, sortOrder = 0) {
  return createCreatureAbilityEffect(effectKey, mechanicalEffect, sortOrder);
}

function ability(effects: CreatureAbilityDefinition["effects"] = [], update: Partial<CreatureAbilityDefinition> = {}): CreatureAbilityDefinition {
  return {
    canonicalId: "ABL-TEST-001",
    abilityName: "Venom Cry",
    abilityType: "Supernatural",
    activation: "Action",
    requirements: "The G.O.D. resolves any prerequisite test.",
    usesRecharge: "Recharge 5-6",
    description: "A cloud rolls over the affected creatures.",
    mechanicalEffect: "Targets test resilience or become nauseated.",
    notes: "Test fixture",
    sortOrder: 0,
    crImpact: "Moderate",
    effects,
    ...update,
  };
}

function state(characterId: number, anatomy: ActiveHealthAnatomy = humanoidAnatomy): ActiveHealthState {
  return {
    characterId,
    totalDamage: anatomy.kind === "creature" ? 6 : 10,
    pools: anatomy.kind === "creature"
      ? [{ poolKey: "LEFT_WING", poolNameSnapshot: "Left Wing", damage: 6 }]
      : [{ poolKey: "arm", poolNameSnapshot: "Arm", damage: 4 }],
    injuries: [],
  };
}

function target(characterId: number, anatomy = humanoidAnatomy, name = `Target ${characterId}`): CreatureAbilityRuntimeTarget {
  return { characterId, name, isNpc: anatomy.kind === "creature", npcKind: anatomy.kind === "creature" ? "creature" : "race", anatomy, state: state(characterId, anatomy) };
}

function plan(input: {
  definition?: CreatureAbilityDefinition;
  targets?: CreatureAbilityRuntimeTarget[];
  targetIds?: number[];
  selections?: Record<string, { poolKey?: string | null; hitLocationNumber?: number | null }>;
} = {}): CreatureAbilityUsePlan {
  const targets = input.targets ?? [target(1)];
  return planCreatureAbilityUse({
    sourceCreature: { characterId: 90, name: "The Caller" },
    ability: input.definition ?? ability([effect("condition", { kind: "condition.apply", name: "Poisoned", description: "No hidden mechanics.", duration: { kind: "scene", value: null } })]),
    fingerprint: "authoritative-fingerprint",
    targets,
    targetCharacterIds: input.targetIds ?? targets.map(({ characterId }) => characterId),
    effectSelections: input.selections,
  });
}

test("11.1 Ability persistence normalization preserves ordered structured Mechanical Effects", () => {
  const normalized = normalizeCreatureAbilityEffects([
    { effectKey: "heal", schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION, effect: { kind: "health.heal", amount: 4, scope: "full-body" }, sortOrder: 8 },
    { effectKey: "manual", schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION, effect: { kind: "manual", title: "Resolve", description: "Resolve at the table." }, sortOrder: 2 },
  ]);
  assert.deepEqual(normalized.map(({ effectKey, sortOrder }) => [effectKey, sortOrder]), [["heal", 0], ["manual", 1]]);
  assert.match(schemaSource, /creature_ability_effects/);
});

test("11.2 Effect identity remains stable through copy and reorder", () => {
  const copied = copyCreatureAbility(ability([effect("first", { kind: "health.heal", amount: 3, scope: "full-body" }), effect("second", { kind: "manual", title: "Choose", description: "Choose a result." }, 1)]));
  assert.deepEqual(reorderCreatureAbilityEffects(copied.effects.reverse()).map(({ effectKey }) => effectKey), ["second", "first"]);
});

test("11.3 Duplicate effect keys are rejected case-insensitively", () => {
  assert.throws(() => normalizeCreatureAbilityEffects([
    { effectKey: "Venom", schemaVersion: 2, effect: { kind: "health.heal", amount: 1, scope: "full-body" } },
    { effectKey: "venom", schemaVersion: 2, effect: { kind: "health.heal", amount: 1, scope: "full-body" } },
  ]), /duplicated/);
});

test("11.4 Invalid effect JSON is rejected by the common codec", () => {
  assert.throws(() => normalizeCreatureAbilityEffects([{ effectKey: "bad", schemaVersion: 2, effect: { kind: "creature.poison" } }]), /Unsupported/);
});

test("11.5 Existing free-text mechanicalEffect is preserved unchanged", () => {
  const text = "Target rolls; the G.O.D. decides the outcome.";
  assert.equal(normalizeCreatureAbilityDefinition(ability([], { mechanicalEffect: text })).mechanicalEffect, text);
});

test("11.6 Free text is never parsed into automatic mechanics", () => {
  const adapted = adaptCreatureAbilityToMechanicalEffects(ability([], { mechanicalEffect: "Deal 999 damage and poison." }));
  assert.equal(adapted.valid, true);
  if (adapted.valid) assert.equal(adapted.effects[0]?.definition.effect.kind, "manual");
});

test("11.7 A new NPC snapshot receives copied structured Ability effects", () => {
  const master = ability([effect("venom", { kind: "condition.apply", name: "Poisoned", description: "", duration: { kind: "scene", value: null } })]);
  const snapshot = normalizeCreatureSnapshotAbilities({ abilities: [copyCreatureAbility(master)] });
  assert.deepEqual(snapshot.abilities[0]?.effects, master.effects);
  assert.match(npcActionsSource, /baselineSnapshotJson: JSON\.stringify\(snapshot\)/);
});

test("11.8 Baseline and current snapshot initially match", () => {
  const snapshot = { abilities: [copyCreatureAbility(ability([effect("one", { kind: "health.heal", amount: 2, scope: "full-body" })]))] };
  const baseline = structuredClone(snapshot);
  const current = structuredClone(snapshot);
  assert.deepEqual(baseline, current);
});

test("11.9 Later master edits do not alter an existing NPC snapshot", () => {
  const master = ability([effect("one", { kind: "health.heal", amount: 2, scope: "full-body" })]);
  const npc = copyCreatureAbility(master);
  master.effects[0]!.effect = { kind: "health.heal", amount: 8, scope: "full-body" };
  assert.equal((npc.effects[0]!.effect as { amount: number }).amount, 2);
});

test("11.10 Individual NPC current Ability effects change independently", () => {
  const baseline = copyCreatureAbility(ability([effect("one", { kind: "health.heal", amount: 2, scope: "full-body" })]));
  const current = copyCreatureAbility(baseline);
  current.effects[0]!.effect = { kind: "health.heal", amount: 6, scope: "full-body" };
  assert.notDeepEqual(current.effects, baseline.effects);
});

test("11.11 Current snapshot change does not modify baseline", () => {
  const baseline = copyCreatureAbility(ability([effect("one", { kind: "manual", title: "Old", description: "Old instructions." })]));
  const current = copyCreatureAbility(baseline);
  (current.effects[0]!.effect as { title: string }).title = "New";
  assert.equal((baseline.effects[0]!.effect as { title: string }).title, "Old");
  assert.match(npcActionsSource, /currentSnapshotJson: JSON\.stringify\(normalizedSnapshot\)/);
});

test("11.12 Another NPC snapshot remains unchanged", () => {
  const source = ability([effect("one", { kind: "manual", title: "Old", description: "Old instructions." })]);
  const firstNpc = copyCreatureAbility(source);
  const secondNpc = copyCreatureAbility(source);
  firstNpc.effects[0]!.effect = { kind: "manual", title: "Changed", description: "Changed." };
  assert.notDeepEqual(firstNpc.effects, secondNpc.effects);
});

test("11.13 Variant Ability effects are deep-copied independently", () => {
  const parent = ability([effect("one", { kind: "condition.apply", name: "Afraid", description: "", duration: { kind: "scene", value: null } })]);
  const variant = copyCreatureAbility(parent);
  assert.notEqual(variant.effects, parent.effects);
  assert.notEqual(variant.effects[0]!.effect, parent.effects[0]!.effect);
  assert.match(creatureActionsSource, /insert into creature_ability_effects/);
});

test("11.14 Parent changes do not mutate copied variant effects", () => {
  const parent = ability([effect("one", { kind: "manual", title: "Parent", description: "Resolve." })]);
  const variant = copyCreatureAbility(parent);
  (parent.effects[0]!.effect as { title: string }).title = "Changed parent";
  assert.equal((variant.effects[0]!.effect as { title: string }).title, "Parent");
});

test("11.15 Same logical effect key is safely scoped to separate copied Abilities", () => {
  assert.doesNotThrow(() => normalizeCreatureAbilityDefinition(ability([effect("shared-key", { kind: "health.heal", amount: 2, scope: "full-body" })])));
  assert.match(schemaSource, /unique\("creature_ability_effects_ability_key_uq"\)\.on\(table\.abilityId, table\.effectKey\)/);
});

test("11.16 Legacy Ability text produces one Manual runtime instruction", () => {
  const adapted = adaptCreatureAbilityToMechanicalEffects(ability([]));
  assert.equal(adapted.valid, true);
  if (adapted.valid) {
    assert.equal(adapted.effects.length, 1);
    assert.equal(adapted.effects[0]?.definition.effect.kind, "manual");
    assert.equal(adapted.effects[0]?.compatibilityFallback, true);
  }
});

test("11.17 Legacy fallback is temporary and is not persisted into the Ability", () => {
  const definition = ability([]);
  adaptCreatureAbilityToMechanicalEffects(definition);
  assert.deepEqual(definition.effects, []);
});

test("11.18 Structured effects suppress automatic legacy Manual duplication", () => {
  const adapted = adaptCreatureAbilityToMechanicalEffects(ability([effect("damage", { kind: "health.damage", amount: 3, application: "localized" })]));
  assert.equal(adapted.valid, true);
  if (adapted.valid) assert.deepEqual(adapted.effects.map(({ definition }) => definition.effect.kind), ["health.damage"]);
});

for (const [number, kind, mechanicalEffect] of [
  [19, "health.damage", { kind: "health.damage", amount: 3, application: "localized" }],
  [20, "health.heal", { kind: "health.heal", amount: 3, scope: "full-body" }],
  [21, "condition.apply", { kind: "condition.apply", name: "Poisoned", description: "", duration: { kind: "scene", value: null } }],
  [22, "modifier.apply", { kind: "modifier.apply", label: "Slowed", channel: "initiative", targetKey: "self", amount: -2, duration: { kind: "scene", value: null } }],
  [23, "manual", { kind: "manual", title: "Resolve", description: "Resolve manually." }],
] as const) {
  test(`11.${number} Adapter preserves ${kind}`, () => {
    const adapted = adaptCreatureAbilityToMechanicalEffects(ability([effect("effect", mechanicalEffect)]));
    assert.equal(adapted.valid, true);
    if (adapted.valid) assert.equal(adapted.effects[0]?.definition.effect.kind, kind);
  });
}

test("11.24 Adapter source kind and identity are creature-ability", () => {
  const adapted = adaptCreatureAbilityToMechanicalEffects(ability([effect("one", { kind: "manual", title: "Resolve", description: "Resolve." })]));
  assert.deepEqual(adapted.source, { kind: "creature-ability", id: "ABL-TEST-001", name: "Venom Cry" });
});

test("11.25 Persisted effect order is preserved", () => {
  const adapted = adaptCreatureAbilityToMechanicalEffects(ability([
    effect("first", { kind: "manual", title: "First", description: "First." }, 0),
    effect("second", { kind: "manual", title: "Second", description: "Second." }, 1),
  ]));
  assert.equal(adapted.valid, true);
  if (adapted.valid) assert.deepEqual(adapted.effects.map(({ effectKey }) => effectKey), ["first", "second"]);
});

test("11.26 Campaign-owning G.O.D. is the runtime authority", () => {
  assert.match(serviceSource, /Only a G\.O\.D\. may use Creature NPC Abilities/);
  assert.match(serviceSource, /campaignOwnerUserId !== userId/);
});

test("11.27 Cross-Campaign or non-Creature source use is rejected", () => {
  assert.match(serviceSource, /!source\.isNpc \|\| source\.npcKind !== "creature"/);
  assert.match(serviceSource, /Only the Campaign-owning G\.O\.D/);
});

test("11.28 Cross-Campaign targets are rejected server-side", () => {
  assert.match(serviceSource, /target\.campaignId !== source\.campaignId/);
});

test("11.29 Player UI and execution authority are not exposed", () => {
  assert.match(serviceSource, /userRole\.role/);
  assert.doesNotMatch(npcWorkspaceSource, /player|Realms/i);
});

test("11.30 One target may be explicitly selected", () => {
  const prepared = plan({ targets: [target(1)], targetIds: [1] });
  assert.equal(prepared.ready, true);
  assert.deepEqual(prepared.targets.map(({ characterId }) => characterId), [1]);
});

test("11.31 Multiple explicit targets preserve selected order", () => {
  const prepared = plan({ targets: [target(1), target(2)], targetIds: [2, 1] });
  assert.equal(prepared.ready, true);
  assert.deepEqual(prepared.targets.map(({ characterId }) => characterId), [2, 1]);
});

test("11.32 Target count is not inferred from descriptive prose", () => {
  const definition = ability([effect("condition", { kind: "condition.apply", name: "Marked", description: "", duration: { kind: "scene", value: null } })], { description: "Affects exactly ninety nearby targets." });
  assert.equal(plan({ definition, targets: [target(1)], targetIds: [1] }).automaticApplications.length, 1);
});

test("11.33 Source Creature may be explicitly selected as a target", () => {
  const source = target(90, creatureAnatomy, "The Caller");
  const prepared = plan({ targets: [source], targetIds: [90] });
  assert.equal(prepared.ready, true);
  assert.equal(prepared.targets[0]?.characterId, 90);
});

test("11.34 Duplicate targets are rejected", () => {
  const prepared = plan({ targets: [target(1)], targetIds: [1, 1] });
  assert.equal(prepared.status, "invalid");
  assert.match(prepared.issues[0] ?? "", /duplicated/);
});

test("11.35 Localized Damage resolves through the target's supplied anatomy", () => {
  const definition = ability([effect("damage", { kind: "health.damage", amount: 5, application: "localized" })]);
  const prepared = plan({ definition, selections: { [creatureAbilityApplicationKey("damage", 1)]: { hitLocationNumber: 3 } } });
  assert.equal(prepared.ready, true);
  assert.equal(prepared.targets[0]?.finalHealth.totalDamage, 15);
  assert.equal(prepared.targets[0]?.finalHealth.pools.find(({ poolKey }) => poolKey === "arm")?.damage, 9);
});

test("11.36 Creature target execution reads CURRENT snapshot anatomy", () => {
  const definition = ability([effect("damage", { kind: "health.damage", amount: 4, application: "localized" })]);
  const creature = target(7, creatureAnatomy);
  const prepared = plan({ definition, targets: [creature], targetIds: [7], selections: { [creatureAbilityApplicationKey("damage", 7)]: { hitLocationNumber: 7 } } });
  assert.equal(prepared.targets[0]?.finalHealth.pools.find(({ poolKey }) => poolKey === "LEFT_WING")?.damage, 10);
  assert.match(serviceSource, /campaignCreatureNpcProfile\.currentSnapshotJson/);
});

test("11.37 Area Healing uses the target's actual selected HP Pool", () => {
  const definition = ability([effect("heal", { kind: "health.heal", amount: 3, scope: "area" })]);
  const prepared = plan({ definition, selections: { [creatureAbilityApplicationKey("heal", 1)]: { poolKey: "arm" } } });
  assert.equal(prepared.ready, true);
  assert.equal(prepared.targets[0]?.finalHealth.totalDamage, 10);
  assert.equal(prepared.targets[0]?.finalHealth.pools.find(({ poolKey }) => poolKey === "arm")?.damage, 1);
});

test("11.38 Creature Ability runtime does not duplicate humanoid anatomy mappings", () => {
  assert.doesNotMatch(runtimeSource, /rightArm|leftArm|rightLeg|torso/);
  assert.match(serviceSource, /readActiveHealthInTransaction|lockActiveHealthInTransaction/);
});

test("11.39 Condition application is planned through the shared Active State service", () => {
  assert.equal(plan().automaticApplications[0]?.plan.status, "ready");
  assert.match(serviceSource, /persistPlannedMechanicalEffectInTransaction/);
});

test("11.40 Modifier application is planned through the shared Active State service", () => {
  const definition = ability([effect("modifier", { kind: "modifier.apply", label: "Slowed", channel: "initiative", targetKey: "self", amount: -2, duration: { kind: "scene", value: null } })]);
  assert.equal(plan({ definition }).automaticApplications[0]?.plan.status, "ready");
  assert.match(serviceSource, /persistPlannedMechanicalEffectInTransaction/);
});

test("11.41 Planning temporary state leaves permanent Creature snapshot data unchanged", () => {
  const definition = ability([effect("modifier", { kind: "modifier.apply", label: "Slowed", channel: "movement", targetKey: "movement:Land", amount: -2, duration: { kind: "scene", value: null } })]);
  const before = structuredClone(definition);
  plan({ definition });
  assert.deepEqual(definition, before);
});

test("11.42 Manual-only Ability returns instructions without invented state", () => {
  const definition = ability([effect("manual", { kind: "manual", title: "Fear", description: "The G.O.D. resolves fear." })]);
  const prepared = plan({ definition, targets: [], targetIds: [] });
  assert.equal(prepared.ready, true);
  assert.equal(prepared.automaticApplications.length, 0);
  assert.equal(prepared.manualEffects[0]?.title, "Fear");
});

test("11.43 Mixed Ability plans automatic effects and returns Manual instructions", () => {
  const definition = ability([
    effect("condition", { kind: "condition.apply", name: "Poisoned", description: "", duration: { kind: "scene", value: null } }),
    effect("manual", { kind: "manual", title: "Resistance", description: "Resolve the roll first." }, 1),
  ]);
  const prepared = plan({ definition });
  assert.equal(prepared.automaticApplications.length, 1);
  assert.equal(prepared.manualEffects.length, 1);
});

test("11.44 Multiple automatic effects execute sequentially inside one transaction runner", async () => {
  const prepared = plan({ definition: ability([
    effect("condition", { kind: "condition.apply", name: "Poisoned", description: "", duration: { kind: "scene", value: null } }),
    effect("modifier", { kind: "modifier.apply", label: "Slowed", channel: "initiative", targetKey: "self", amount: -2, duration: { kind: "scene", value: null } }, 1),
  ]) });
  let transactions = 0;
  const applied: string[] = [];
  await executeCreatureAbilityUseInTransaction(async (operation) => {
    transactions += 1;
    return operation({ loadAndPlan: async () => prepared, applyAutomaticEffect: async (application) => { applied.push(application.effectKey); } });
  }, true);
  assert.equal(transactions, 1);
  assert.deepEqual(applied, ["condition", "modifier"]);
});

async function assertAtomicRollback(prepared: CreatureAbilityUsePlan, failAt: number) {
  const store = { health: 0, conditions: 0, modifiers: 0 };
  await assert.rejects(executeCreatureAbilityUseInTransaction(async (operation) => {
    const before = structuredClone(store);
    let index = 0;
    try {
      return await operation({
        loadAndPlan: async () => prepared,
        applyAutomaticEffect: async (application) => {
          index += 1;
          const kind = application.plan.effect?.kind;
          if (kind === "health.damage" || kind === "health.heal") store.health += 1;
          if (kind === "condition.apply") store.conditions += 1;
          if (kind === "modifier.apply") store.modifiers += 1;
          if (index === failAt) throw new Error("simulated persistence failure");
        },
      });
    } catch (error) {
      Object.assign(store, before);
      throw error;
    }
  }, true), /simulated persistence failure/);
  assert.deepEqual(store, { health: 0, conditions: 0, modifiers: 0 });
}

test("11.45 Later failure rolls earlier Health state back", async () => {
  const definition = ability([
    effect("damage", { kind: "health.damage", amount: 2, application: "localized" }),
    effect("condition", { kind: "condition.apply", name: "Poisoned", description: "", duration: { kind: "scene", value: null } }, 1),
  ]);
  await assertAtomicRollback(plan({ definition, selections: { [creatureAbilityApplicationKey("damage", 1)]: { poolKey: "arm" } } }), 2);
});

test("11.46 Later failure rolls Condition and Modifier state back", async () => {
  const definition = ability([
    effect("condition", { kind: "condition.apply", name: "Poisoned", description: "", duration: { kind: "scene", value: null } }),
    effect("modifier", { kind: "modifier.apply", label: "Slowed", channel: "initiative", targetKey: "self", amount: -2, duration: { kind: "scene", value: null } }, 1),
    effect("damage", { kind: "health.damage", amount: 2, application: "localized" }, 2),
  ]);
  await assertAtomicRollback(plan({ definition, selections: { [creatureAbilityApplicationKey("damage", 1)]: { poolKey: "arm" } } }), 3);
});

test("11.47 Failed Ability use commits no partial application", async () => {
  await assertAtomicRollback(plan({ definition: ability([
    effect("condition", { kind: "condition.apply", name: "Marked", description: "", duration: { kind: "scene", value: null } }),
    effect("modifier", { kind: "modifier.apply", label: "Hindered", channel: "initiative", targetKey: "self", amount: -1, duration: { kind: "scene", value: null } }, 1),
  ]) }), 2);
});

test("11.48 Confirm reloads the authoritative CURRENT snapshot", () => {
  assert.match(serviceSource, /loadAuthoritativePlan\(tx, request, session\.user\.id, true\)/);
  assert.match(serviceSource, /currentSnapshotJson/);
});

test("11.49 Client request carries identity and selections, not effect definitions", () => {
  assert.doesNotMatch(runtimeSource.match(/export type CreatureAbilityUseRequest[\s\S]*?};/)?.[0] ?? "", /effectJson|MechanicalEffectDefinition/);
  assert.match(serviceSource, /abilities\.find\(\(\{ canonicalId \}\) => canonicalId === abilityCanonicalId\)/);
});

test("11.50 Stale preview fingerprint requires authoritative replanning", () => {
  assert.match(serviceSource, /request\.previewFingerprint !== source\.fingerprint/);
  assert.match(serviceSource, /Prepare a new authoritative preview/);
});

test("11.51 usesRecharge remains descriptive in the plan", () => {
  const prepared = plan();
  assert.equal(prepared.ability.usesRecharge, "Recharge 5-6");
});

test("11.52 Recharge text is never parsed", () => {
  const adapted = adaptCreatureAbilityToMechanicalEffects(ability([], { usesRecharge: "Once per scene; Recharge 5-6" }));
  assert.equal(adapted.valid, true);
  if (adapted.valid) assert.equal(adapted.effects[0]?.definition.effect.kind, "manual");
});

test("11.53 No Creature cooldown or resource state is created", () => {
  assert.doesNotMatch(schemaSource, /creature_(ability_)?(charges|cooldown|recharge_state)/i);
  assert.doesNotMatch(serviceSource, /cooldown|charge|recharge dice/i);
});

test("11.54 Creature Attack damage text is not parsed", () => {
  assert.doesNotMatch(serviceSource, /creatureAttack|attack\.damage|parseDice/);
});

test("11.55 Creature Attack percentage is not rolled", () => {
  assert.doesNotMatch(serviceSource, /attackPercentage|Math\.random|rollAttack/);
});

test("11.56 Creature Attack specialEffect text is not converted", () => {
  assert.doesNotMatch(serviceSource, /specialEffect/);
});

test("11.57 No Creature Attack execution pipeline is built", () => {
  assert.doesNotMatch(serviceSource, /executeCreatureAttack|planCreatureAttack/);
});

test("11.58 Creature Abilities use the common bridge rather than a separate Attack effect engine", () => {
  assert.match(serviceSource, /persistPlannedMechanicalEffectInTransaction/);
  assert.doesNotMatch(serviceSource, /AttackEffectEngine|CreatureDamageEngine/);
});
