import assert from "node:assert/strict";
import test from "node:test";

import { choiceDraft } from "./choice-types";
import { buildRollMechanicalSnapshot } from "@/features/tabletop-operations/roll-mechanical-snapshot";
import { buildActionEffectPlanProposal, type FrozenActionSourceSnapshot } from "@/features/tabletop-operations/action-effect-bridge";
import { frozenAoeSelections } from "@/features/tabletop-operations/action-effect-bridge";
import { assertAoESelectionAuthority } from "@/features/spell-construction/spell-target-groups";

function source(effects: FrozenActionSourceSnapshot["effects"]): FrozenActionSourceSnapshot {
  return {
    schemaVersion: 1,
    kind: "item",
    identity: "item-power:12;item:artifact",
    sourceId: 4,
    sourceInstanceId: 17,
    ownerParticipantId: 7,
    displayName: "Artifact Ability",
    authoringHref: null,
    liveRevision: "2026-09-16T00:00:00.000Z",
    resolutionMode: "automatic-no-roll",
    governingSource: null,
    governingSnapshot: null,
    authoredData: {},
    resourceCosts: [],
    effects,
    warnings: [],
  };
}

test("Item declarations preserve generic direct targets separately from Magic group selections", () => {
  const draft = choiceDraft({
    participantId: 7,
    source: { kind: "item", ref: "item-power:12", name: "Artifact Ability", instanceId: 17, itemId: 4, description: "" },
    targetIds: [7, 9],
    itemTargetIds: [7],
    spellSelections: { targetGroups: { "magic-target": [9] }, applications: {} },
    effectSelections: {},
  });
  assert.deepEqual(draft.targetCharacterIds, [7, 9]);
  assert.deepEqual(draft.sourcePayload?.itemTargetIds, [7]);
  assert.deepEqual((draft.sourcePayload?.selections as { targetGroups: Record<string, number[]> }).targetGroups, { "magic-target": [9] });
});

test("direct Item effects and Magic/AoE effects remain isolated in the Action Effect plan", () => {
  const plan = buildActionEffectPlanProposal({
    source: source([
      { key: "direct", effect: { kind: "condition.apply", name: "Direct", description: "", duration: { kind: "scene" } }, instruction: {}, applicationSupported: true, requiresGodReview: false, targetParticipantIds: [7] },
      { key: "magic-target", effect: { kind: "health.damage", amount: 3, application: "full-body" }, instruction: { targetGroupKind: "target" }, applicationSupported: true, requiresGodReview: false, targetParticipantIds: [9] },
      { key: "magic-area", effect: { kind: "health.damage", amount: 2, application: "full-body" }, instruction: { targetGroupKind: "aoe", targetGroupId: "area" }, applicationSupported: true, requiresGodReview: false, targetParticipantIds: [-3, -4] },
    ]),
    actorParticipantId: 7,
    targetParticipantIds: [7, 9, -3, -4],
    governingRoll: null,
    defenseResolution: null,
    initiativeComplete: true,
  });
  assert.deepEqual(plan.effects.map(({ effectKey, targetParticipantId }) => [effectKey, targetParticipantId]), [
    ["direct:target:7", 7],
    ["magic-target:target:9", 9],
    ["magic-area:target:-3", -3],
    ["magic-area:target:-4", -4],
  ]);
});

test("the same governing Roll is reused for every frozen Magic/AoE victim", () => {
  const roll = buildRollMechanicalSnapshot({ kind: "manual", label: "Fixed Ability", originalTarget: 40 }, 72, [], "original-roll");
  const plan = buildActionEffectPlanProposal({
    source: source([{ key: "area", scaling: "per-success", effect: { kind: "health.damage", amount: 2, application: "full-body" }, instruction: { targetGroupKind: "aoe" }, applicationSupported: true, requiresGodReview: false, targetParticipantIds: [9, -3] }]),
    actorParticipantId: 7,
    targetParticipantIds: [9, -3],
    governingRoll: roll,
    defenseResolution: null,
    initiativeComplete: true,
  });
  assert.deepEqual(plan.effects.map(({ calculatedValue }) => calculatedValue), [8, 8]);
});

test("Player AoE injection is rejected while zero victims remains authorized", () => {
  assert.throws(() => assertAoESelectionAuthority("player", [9], "Spell"), /only the Campaign-owning G.O.D./i);
  assert.doesNotThrow(() => assertAoESelectionAuthority("player", [], "Spell"));
});

test("frozen AoE membership is extracted per authored group and cannot be replaced by another group", () => {
  const frozen = source([
    { key: "first", effect: { kind: "health.damage", amount: 1, application: "full-body" }, instruction: { targetGroupKind: "aoe", targetGroupId: "first" }, applicationSupported: true, requiresGodReview: false, targetParticipantIds: [9, -2] },
    { key: "first-second-effect", effect: { kind: "condition.apply", name: "Marked", description: "", duration: { kind: "scene" } }, instruction: { targetGroupKind: "aoe", targetGroupId: "first" }, applicationSupported: true, requiresGodReview: false, targetParticipantIds: [9, -2] },
    { key: "second", effect: { kind: "health.damage", amount: 1, application: "full-body" }, instruction: { targetGroupKind: "aoe", targetGroupId: "second" }, applicationSupported: true, requiresGodReview: false, targetParticipantIds: [-4] },
  ]);
  assert.deepEqual(frozenAoeSelections(frozen), { first: [9, -2], second: [-4] });
});
