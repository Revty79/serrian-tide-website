import assert from "node:assert/strict";
import test from "node:test";

import { buildRollMechanicalSnapshot } from "./roll-mechanical-snapshot";
import {
  ACTION_EFFECT_PLAN_STATUSES,
  ACTION_EFFECT_SOURCE_KINDS,
  buildActionEffectPlanProposal,
  type FrozenActionSourceSnapshot,
} from "./action-effect-bridge";

function source(overrides: Partial<FrozenActionSourceSnapshot> = {}): FrozenActionSourceSnapshot {
  return {
    schemaVersion: 1,
    kind: "item",
    identity: "item:ITEM-TEST;instance:17",
    sourceId: 4,
    sourceInstanceId: 17,
    ownerParticipantId: 7,
    displayName: "Test Item",
    authoringHref: "/heavens/items?item=4",
    liveRevision: "2026-09-04T00:00:00.000Z",
    resolutionMode: "automatic-no-roll",
    governingSource: null,
    governingSnapshot: null,
    authoredData: { canonicalId: "ITEM-TEST" },
    resourceCosts: [],
    effects: [{
      key: "item-effect:3",
      effect: { kind: "condition.apply", name: "Marked", description: "Exact authored effect.", duration: { kind: "scene" } },
      instruction: {},
      applicationSupported: true,
      requiresGodReview: false,
      targetParticipantIds: [9],
    }],
    warnings: [],
    ...overrides,
  };
}

test("Pass 8 exposes every exact source kind and every required plan state", () => {
  assert.deepEqual(ACTION_EFFECT_SOURCE_KINDS, [
    "weapon", "item", "spell", "derived-ability", "skill", "attribute",
    "creature-attack", "creature-ability", "no-roll", "manual",
  ]);
  assert.deepEqual(ACTION_EFFECT_PLAN_STATUSES, [
    "calculated", "requires-god-ruling", "approved", "applied", "partially-applied",
    "declined", "cancelled", "superseded", "application-failed",
  ]);
});

test("automatic structured effects preserve exact identity and produce calculated proposals without mutation", () => {
  const frozen = source();
  const before = structuredClone(frozen);
  const plan = buildActionEffectPlanProposal({
    source: frozen,
    actorParticipantId: 7,
    targetParticipantIds: [9],
    governingRoll: null,
    defenseResolution: null,
    initiativeComplete: true,
  });
  assert.equal(plan.status, "calculated");
  assert.equal(plan.effects[0]?.effectKey, "item-effect:3:target:9");
  assert.equal(plan.effects[0]?.targetParticipantId, 9);
  assert.equal(plan.effects[0]?.status, "calculated");
  assert.deepEqual(frozen, before);
});

test("generation rejects incomplete Initiative, mismatched owners, and injected targets", () => {
  assert.throws(() => buildActionEffectPlanProposal({
    source: source(), actorParticipantId: 7, targetParticipantIds: [9], governingRoll: null,
    defenseResolution: null, initiativeComplete: false,
  }), /Initiative action reaches completion/);
  assert.throws(() => buildActionEffectPlanProposal({
    source: source(), actorParticipantId: 8, targetParticipantIds: [9], governingRoll: null,
    defenseResolution: null, initiativeComplete: true,
  }), /does not belong to the acting participant/);
  assert.throws(() => buildActionEffectPlanProposal({
    source: source({ effects: [{
      key: "injected", effect: { kind: "health.heal", amount: 2, scope: "full-body" },
      instruction: {}, applicationSupported: true, requiresGodReview: false, targetParticipantIds: [99],
    }] }),
    actorParticipantId: 7, targetParticipantIds: [9], governingRoll: null,
    defenseResolution: null, initiativeComplete: true,
  }), /outside the original target set/);
});

test("a required governing Roll is immutable input and failed Rolls decline consequences", () => {
  const roll = buildRollMechanicalSnapshot(
    { kind: "manual", label: "Exact Creature attack", originalTarget: 40 },
    20,
    [],
    "original-roll",
  );
  assert.throws(() => buildActionEffectPlanProposal({
    source: source({ resolutionMode: "opposed-roll" }), actorParticipantId: 7,
    targetParticipantIds: [9], governingRoll: null, defenseResolution: null, initiativeComplete: true,
  }), /immutable governing Roll/);
  const plan = buildActionEffectPlanProposal({
    source: source({ resolutionMode: "opposed-roll" }), actorParticipantId: 7,
    targetParticipantIds: [9], governingRoll: roll, defenseResolution: { originalActionDisposition: "continue" }, initiativeComplete: true,
  });
  assert.equal(plan.effects[0]?.status, "declined");
  assert.equal(plan.effects[0]?.finalValue, null);
  assert.match(plan.effects[0]?.amendmentReason ?? "", /immutable governing Roll failed/);
});

test("No Defense permits consequences while a stopped attack preserves but declines them", () => {
  const noDefense = buildActionEffectPlanProposal({
    source: source(), actorParticipantId: 7, targetParticipantIds: [9], governingRoll: null,
    defenseResolution: { originalActionDisposition: "continue", defense: "no-reaction" }, initiativeComplete: true,
  });
  assert.equal(noDefense.effects[0]?.status, "calculated");
  const stopped = buildActionEffectPlanProposal({
    source: source(), actorParticipantId: 7, targetParticipantIds: [9], governingRoll: null,
    defenseResolution: { originalActionDisposition: "stopped" }, initiativeComplete: true,
  });
  assert.equal(stopped.effects[0]?.status, "declined");
  assert.equal(stopped.effects[0]?.authoredValue !== null, true);
});

test("unsupported and manual effects remain visible and ruling-required", () => {
  const plan = buildActionEffectPlanProposal({
    source: source({
      kind: "creature-ability",
      identity: "creature-ability:ABILITY-17",
      resolutionMode: "manual-god-ruling",
      effects: [{
        key: "manual", effect: null, instruction: { title: "Narrative only" },
        applicationSupported: false, requiresGodReview: true, targetParticipantIds: [9],
      }],
    }),
    actorParticipantId: 7, targetParticipantIds: [9], governingRoll: null,
    defenseResolution: null, initiativeComplete: true,
  });
  assert.equal(plan.status, "requires-god-ruling");
  assert.equal(plan.effects[0]?.status, "requires-god-ruling");
  assert.equal(plan.effects[0]?.applicationSupported, false);
});

test("authored Mana is proposed at review time and is never deducted by the pure planner", () => {
  const frozen = source({
    kind: "spell",
    identity: "spell:personal:12",
    resourceCosts: [{
      key: "spell-mana:12", kind: "mana", amount: 8, resourceKey: "Spellcraft",
      instruction: "Spend canonical Mana at application.", applicationSupported: true,
    }],
  });
  const before = structuredClone(frozen);
  const plan = buildActionEffectPlanProposal({
    source: frozen, actorParticipantId: 7, targetParticipantIds: [9], governingRoll: null,
    defenseResolution: null, initiativeComplete: true,
  });
  const mana = plan.effects.find(({ effectType }) => effectType === "resource.mana");
  assert.equal(mana?.calculatedValue, 8);
  assert.equal(mana?.status, "calculated");
  assert.deepEqual(frozen, before);
});

test("authored Item quantity and exact-instance Charge costs enter the shared application plan", () => {
  for (const kind of ["item-quantity", "item-charges"] as const) {
    const frozen = source({
      resourceCosts: [{
        key: `item-cost:${kind}`,
        kind,
        amount: 1,
        resourceKey: "ITEM-TEST",
        instruction: "Use the existing locked Item resource service.",
        applicationSupported: true,
      }],
    });
    const plan = buildActionEffectPlanProposal({
      source: frozen,
      actorParticipantId: 7,
      targetParticipantIds: [9],
      governingRoll: null,
      defenseResolution: null,
      initiativeComplete: true,
    });
    const cost = plan.effects.find(({ effectType }) => effectType === `resource.${kind}`);
    assert.equal(cost?.targetParticipantId, 7);
    assert.equal(cost?.applicationSupported, true);
    assert.equal(cost?.status, "calculated");
  }
});

test("weapon and Creature attack damage remain explicit non-automated instructions", () => {
  for (const kind of ["weapon", "creature-attack"] as const) {
    const plan = buildActionEffectPlanProposal({
      source: source({
        kind,
        identity: `${kind}:exact-id`,
        effects: [{
          key: "damage-instruction", effect: null,
          instruction: { damage: "2d10", nonautomation: "Armor, soak, ammunition, and Hit Location are deferred." },
          applicationSupported: false, requiresGodReview: true, targetParticipantIds: [9],
        }],
      }),
      actorParticipantId: 7, targetParticipantIds: [9], governingRoll: null,
      defenseResolution: null, initiativeComplete: true,
    });
    assert.equal(plan.effects[0]?.effectType, "manual");
    assert.equal(plan.effects[0]?.applicationSupported, false);
  }
});
