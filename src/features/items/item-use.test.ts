import assert from "node:assert/strict";
import test from "node:test";

import type { ActiveHealthAnatomy, ActiveHealthState } from "@/features/active-state/models";
import {
  canExecuteItemUse,
  executeItemUseInTransaction,
  getItemUseActivatability,
  planItemUse,
  type ItemUseDefinition,
  type ItemUsePlan,
  type ItemUseResourcePreview,
} from "./item-use";
import type { ItemRuntimeProfile } from "./item-runtime";

const humanoidAnatomy: ActiveHealthAnatomy = {
  kind: "humanoid",
  totalMaximumHp: 100,
  maximumHpNote: null,
  pools: [
    { key: "rightArm", name: "Right Arm", maximumHp: 20, percentage: 20, sortOrder: 0 },
    { key: "torso", name: "Torso", maximumHp: 40, percentage: 40, sortOrder: 1 },
  ],
  hitLocations: [
    { result: 3, name: "Right Lower Arm", bodyParts: "Forearm", poolKey: "rightArm", poolName: "Right Arm" },
    { result: 4, name: "Right Upper Arm", bodyParts: "Upper arm", poolKey: "rightArm", poolName: "Right Arm" },
  ],
};

const creatureAnatomy: ActiveHealthAnatomy = {
  kind: "creature",
  totalMaximumHp: null,
  maximumHpNote: "Unavailable",
  pools: [
    { key: "LEFT_WING", name: "Left Wing", maximumHp: null, percentage: null, sortOrder: 0 },
    { key: "BODY", name: "Body", maximumHp: null, percentage: null, sortOrder: 1 },
  ],
  hitLocations: [
    { result: 7, name: "Left Wing", bodyParts: "Wing", poolKey: "LEFT_WING", poolName: "Left Wing" },
  ],
};

function state(
  anatomy: ActiveHealthAnatomy = humanoidAnatomy,
  characterId = 1,
): ActiveHealthState {
  return {
    characterId,
    totalDamage: anatomy.kind === "humanoid" ? 20 : 6,
    pools: anatomy.kind === "humanoid"
      ? [{ poolKey: "rightArm", poolNameSnapshot: "Right Arm", damage: 8 }]
      : [{ poolKey: "LEFT_WING", poolNameSnapshot: "Left Wing", damage: 6 }],
    injuries: [],
  };
}

function profile(
  useMode: ItemRuntimeProfile["useMode"],
  overrides: Partial<ItemRuntimeProfile> = {},
): ItemRuntimeProfile {
  return {
    useMode,
    quantityPerUse: useMode === "consume-item" ? 1 : null,
    maximumCharges: useMode === "charges" ? 10 : null,
    chargesPerUse: useMode === "charges" ? 1 : null,
    rechargeNotes: "",
    activationLabel: "Use",
    useNotes: "",
    ...overrides,
  };
}

type Effect = ItemUseDefinition["effects"][number];

function effect(id: number, sortOrder: number, effectJson: unknown): Effect {
  return { id, sortOrder, schemaVersion: 1, effectJson };
}

function definition(
  runtimeProfile: ItemRuntimeProfile,
  effects: readonly Effect[] = [effect(11, 0, { kind: "health.heal", amount: 5, scope: "full-body" })],
): ItemUseDefinition {
  return { id: 9, name: "Test Item", runtimeProfile, effects };
}

function plan(input: {
  runtimeProfile?: ItemRuntimeProfile;
  effects?: readonly Effect[];
  resource?: { kind: "stack"; quantity: number } | { kind: "instance"; instanceId: number; currentCharges: number };
  itemInstanceId?: number | null;
  anatomy?: ActiveHealthAnatomy;
  state?: ActiveHealthState;
  selections?: Parameters<typeof planItemUse>[0]["effectSelections"];
} = {}): ItemUsePlan {
  const anatomy = input.anatomy ?? humanoidAnatomy;
  const current = input.state ?? state(anatomy);
  return planItemUse({
    definition: definition(input.runtimeProfile ?? profile("consume-item"), input.effects),
    resource: input.resource ?? { kind: "stack", quantity: 3 },
    requestedItemInstanceId: input.itemInstanceId ?? null,
    target: { characterId: current.characterId, name: "Target", anatomy, state: current },
    effectSelections: input.selections,
  });
}

test("activatability covers none, all active modes, and the zero-effect guard", () => {
  assert.equal(getItemUseActivatability(profile("none"), 1).executable, false);
  assert.equal(getItemUseActivatability(profile("consume-item"), 1).executable, true);
  assert.equal(getItemUseActivatability(profile("charges"), 1).executable, true);
  assert.equal(getItemUseActivatability(profile("unlimited"), 1).executable, true);
  assert.deepEqual(getItemUseActivatability(profile("consume-item"), 0), {
    executable: false,
    reason: "This Item has no valid Mechanical Effects and will not consume resources.",
  });
});

test("consumable previews 3 to 2, deletes at zero, and supports multiple quantity per use", () => {
  assert.deepEqual(plan().resource, {
    kind: "stack", useMode: "consume-item", before: 3, after: 2, consumed: 1,
  });
  assert.equal(plan({ resource: { kind: "stack", quantity: 1 } }).resource?.after, 0);
  assert.equal(plan({
    runtimeProfile: profile("consume-item", { quantityPerUse: 2 }),
    resource: { kind: "stack", quantity: 5 },
  }).resource?.after, 3);
});

test("insufficient consumable rejects before health or quantity changes", () => {
  const planned = plan({
    runtimeProfile: profile("consume-item", { quantityPerUse: 2 }),
    resource: { kind: "stack", quantity: 1 },
  });
  assert.equal(planned.status, "insufficient-resource");
  assert.equal(planned.ready, false);
  assert.equal(planned.initialHealth.totalDamage, planned.finalHealth.totalDamage);
  assert.equal(planned.resource?.after, 1);
});

test("charged use previews the selected instance and rejects insufficient Charges", () => {
  const success = plan({
    runtimeProfile: profile("charges"),
    resource: { kind: "instance", instanceId: 40, currentCharges: 4 },
    itemInstanceId: 40,
  });
  assert.deepEqual(success.resource, {
    kind: "instance", useMode: "charges", instanceId: 40,
    before: 4, after: 3, consumed: 1, maximumCharges: 10, exceedsCurrentMaximum: false,
  });
  const insufficient = plan({
    runtimeProfile: profile("charges", { maximumCharges: 2, chargesPerUse: 2 }),
    resource: { kind: "instance", instanceId: 40, currentCharges: 1 },
    itemInstanceId: 40,
  });
  assert.equal(insufficient.status, "insufficient-resource");
  assert.equal(insufficient.resource?.after, 1);
  assert.equal(insufficient.initialHealth.totalDamage, insufficient.finalHealth.totalDamage);
});

test("charged use preserves over-maximum state while decrementing by the current definition", () => {
  const planned = plan({
    runtimeProfile: profile("charges", { maximumCharges: 5, chargesPerUse: 2 }),
    resource: { kind: "instance", instanceId: 41, currentCharges: 8 },
    itemInstanceId: 41,
  });
  assert.equal(planned.resource?.after, 6);
  assert.equal(planned.resource?.kind === "instance" && planned.resource.exceedsCurrentMaximum, true);
});

test("unlimited use executes without changing the required owned stack", () => {
  const planned = plan({
    runtimeProfile: profile("unlimited"),
    resource: { kind: "stack", quantity: 1 },
  });
  assert.equal(planned.ready, true);
  assert.deepEqual(planned.resource, {
    kind: "stack", useMode: "unlimited", before: 1, after: 1, consumed: 0,
  });
  assert.equal(planned.finalHealth.totalDamage, 15);
});

test("manual-only use consumes successfully and returns instructions without health mutation", async () => {
  const planned = plan({
    effects: [effect(12, 0, { kind: "manual", title: "Lost Memory", description: "Reveal one memory." })],
  });
  assert.equal(planned.ready, true);
  assert.equal(planned.finalHealth.totalDamage, planned.initialHealth.totalDamage);
  const resource = { quantity: 3 };
  let healthWrites = 0;
  const result = await executeItemUseInTransaction(async (execute) => execute({
    loadAndPlan: async () => planned,
    consumeResource: async (preview) => { resource.quantity = preview.after; },
    applyAutomaticEffect: async () => { healthWrites += 1; },
  }));
  assert.equal(resource.quantity, 2);
  assert.equal(healthWrites, 0);
  assert.deepEqual(result.manualEffects, [{ effectId: 12, title: "Lost Memory", description: "Reveal one memory." }]);
});

test("mixed automatic and manual effects apply health and preserve manual instructions", async () => {
  const planned = plan({ effects: [
    effect(13, 0, { kind: "health.heal", amount: 5, scope: "full-body" }),
    effect(14, 1, { kind: "manual", title: "Dreams", description: "Resolve vivid dreams." }),
  ] });
  let health = planned.initialHealth.totalDamage;
  const result = await executeItemUseInTransaction(async (execute) => execute({
    loadAndPlan: async () => planned,
    consumeResource: async () => undefined,
    applyAutomaticEffect: async (entry) => { health = entry.plan.healthResult!.nextState.totalDamage; },
  }));
  assert.equal(health, 15);
  assert.equal(result.automaticEffects.length, 1);
  assert.equal(result.manualEffects[0]?.title, "Dreams");
});

test("persisted sortOrder controls sequential effect state", () => {
  const current = state();
  current.totalDamage = 4;
  current.pools = [{ poolKey: "rightArm", poolNameSnapshot: "Right Arm", damage: 4 }];
  const planned = plan({
    state: current,
    effects: [
      effect(22, 8, { kind: "health.damage", amount: 2, application: "localized" }),
      effect(21, 2, { kind: "health.heal", amount: 5, scope: "full-body" }),
    ],
    selections: { "22": { poolKey: "rightArm" } },
  });
  assert.deepEqual(planned.effects.map(({ effectId }) => effectId), [21, 22]);
  assert.equal(planned.finalHealth.totalDamage, 2);
  assert.equal(planned.source.kind, "item");
  assert.deepEqual(planned.source, { kind: "item", id: 9, name: "Test Item" });
});

test("missing area selection prevents resource consumption", async () => {
  const planned = plan({ effects: [effect(31, 0, { kind: "health.heal", amount: 5, scope: "area" })] });
  assert.equal(planned.status, "needs-selection");
  let consumed = false;
  await assert.rejects(executeItemUseInTransaction(async (execute) => execute({
    loadAndPlan: async () => planned,
    consumeResource: async () => { consumed = true; },
    applyAutomaticEffect: async () => undefined,
  })), /missing/i);
  assert.equal(consumed, false);
});

test("localized damage uses exact Active Health hit-location mapping", () => {
  const planned = plan({
    effects: [effect(32, 0, { kind: "health.damage", amount: 4, application: "localized" })],
    selections: { "32": { hitLocationNumber: 3 } },
  });
  assert.equal(planned.ready, true);
  assert.equal(planned.finalHealth.totalDamage, 24);
  assert.equal(planned.finalHealth.tracks.find(({ key }) => key === "rightArm")?.damage, 12);
});

test("creature area selection uses its real pool and unknown maximum remains valid", () => {
  const planned = plan({
    anatomy: creatureAnatomy,
    state: state(creatureAnatomy),
    effects: [effect(33, 0, { kind: "health.heal", amount: 2, scope: "area" })],
    selections: { "33": { poolKey: "LEFT_WING" } },
  });
  assert.equal(planned.ready, true);
  assert.equal(planned.finalHealth.total.maximumHp, null);
  assert.equal(planned.finalHealth.tracks.find(({ key }) => key === "LEFT_WING")?.damage, 4);
  assert.equal(planned.finalHealth.tracks.some(({ key }) => key === "rightArm"), false);
});

test("Player authorization is own Player Character and self-target only", () => {
  const player = { userId: "p1", roles: ["player"] };
  const own = { characterId: 1, campaignId: 7, playerUserId: "p1", campaignOwnerUserId: "god", isNpc: false, isCampaignMember: true };
  assert.equal(canExecuteItemUse(player, own, own), true);
  assert.equal(canExecuteItemUse(player, { ...own, characterId: 2, playerUserId: "p2" }, own), false);
  assert.equal(canExecuteItemUse(player, { ...own, isNpc: true }, { ...own, isNpc: true }), false);
  assert.equal(canExecuteItemUse(player, own, { ...own, characterId: 3 }), false);
});

test("G.O.D. authorization covers PC, Race NPC, and Creature NPC in owned Campaign only", () => {
  const god = { userId: "g1", roles: ["god"] };
  const pc = { characterId: 1, campaignId: 7, playerUserId: "p1", campaignOwnerUserId: "g1", isNpc: false, isCampaignMember: false };
  const raceNpc = { ...pc, characterId: 2, playerUserId: "g1", isNpc: true };
  const creatureNpc = { ...raceNpc, characterId: 3 };
  assert.equal(canExecuteItemUse(god, pc, raceNpc), true);
  assert.equal(canExecuteItemUse(god, raceNpc, creatureNpc), true);
  assert.equal(canExecuteItemUse(god, creatureNpc, pc), true);
  assert.equal(canExecuteItemUse(god, pc, { ...raceNpc, campaignId: 8 }), false);
  assert.equal(canExecuteItemUse(god, { ...pc, campaignOwnerUserId: "g2" }, raceNpc), false);
});

type FakeStore = { quantity: number; charges: Record<number, number>; totalDamage: number };

async function fakeAtomicExecution(input: {
  committed: FakeStore;
  planned: ItemUsePlan;
  resourceFailure?: boolean;
  healthFailure?: boolean;
}): Promise<void> {
  await executeItemUseInTransaction(async (execute) => {
    const working = structuredClone(input.committed);
    const result = await execute({
      loadAndPlan: async () => input.planned,
      consumeResource: async (resource: ItemUseResourcePreview) => {
        if (input.resourceFailure) throw new Error("resource failed");
        if (resource.kind === "stack") working.quantity = resource.after;
        else working.charges[resource.instanceId] = resource.after;
      },
      applyAutomaticEffect: async (entry) => {
        if (input.healthFailure) throw new Error("health failed");
        working.totalDamage = entry.plan.healthResult!.nextState.totalDamage;
      },
    });
    Object.assign(input.committed, working);
    return result;
  });
}

test("consumable execution commits quantity 3 to 2 and applies Full Body healing", async () => {
  const committed: FakeStore = { quantity: 3, charges: {}, totalDamage: 20 };
  await fakeAtomicExecution({ committed, planned: plan() });
  assert.deepEqual(committed, { quantity: 2, charges: {}, totalDamage: 15 });
});

test("consumable execution reaches zero for the server deletion branch", async () => {
  const committed: FakeStore = { quantity: 1, charges: {}, totalDamage: 20 };
  await fakeAtomicExecution({
    committed,
    planned: plan({ resource: { kind: "stack", quantity: 1 } }),
  });
  assert.equal(committed.quantity, 0);
  assert.equal(committed.totalDamage, 15);
});

test("multi-quantity and unlimited execution commit the planned resource semantics", async () => {
  const multi: FakeStore = { quantity: 5, charges: {}, totalDamage: 20 };
  await fakeAtomicExecution({
    committed: multi,
    planned: plan({
      runtimeProfile: profile("consume-item", { quantityPerUse: 2 }),
      resource: { kind: "stack", quantity: 5 },
    }),
  });
  assert.equal(multi.quantity, 3);
  assert.equal(multi.totalDamage, 15);

  const unlimited: FakeStore = { quantity: 1, charges: {}, totalDamage: 20 };
  await fakeAtomicExecution({
    committed: unlimited,
    planned: plan({
      runtimeProfile: profile("unlimited"),
      resource: { kind: "stack", quantity: 1 },
    }),
  });
  assert.equal(unlimited.quantity, 1);
  assert.equal(unlimited.totalDamage, 15);
});

test("selected charged instance changes while another copy remains unchanged", async () => {
  const planned = plan({
    runtimeProfile: profile("charges"),
    resource: { kind: "instance", instanceId: 70, currentCharges: 3 },
    itemInstanceId: 70,
  });
  const committed: FakeStore = { quantity: 0, charges: { 70: 3, 71: 8 }, totalDamage: 20 };
  await fakeAtomicExecution({ committed, planned });
  assert.deepEqual(committed.charges, { 70: 2, 71: 8 });
  assert.equal(committed.totalDamage, 15);
});

test("fake transaction rolls back resource when health persistence fails", async () => {
  const committed: FakeStore = { quantity: 3, charges: {}, totalDamage: 20 };
  await assert.rejects(fakeAtomicExecution({ committed, planned: plan(), healthFailure: true }), /health failed/);
  assert.deepEqual(committed, { quantity: 3, charges: {}, totalDamage: 20 });
});

test("fake transaction commits no health when ownership mutation fails", async () => {
  const committed: FakeStore = { quantity: 3, charges: {}, totalDamage: 20 };
  await assert.rejects(fakeAtomicExecution({ committed, planned: plan(), resourceFailure: true }), /resource failed/);
  assert.deepEqual(committed, { quantity: 3, charges: {}, totalDamage: 20 });
});
