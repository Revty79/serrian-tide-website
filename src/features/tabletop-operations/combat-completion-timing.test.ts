import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceInitiativeTimeline, applyDirectInitiativeDelta, changeNormalTotalInitiative,
  getNextInitiativeTimelineEvent, holdInitiative, initializeInitiativeRuntime,
  setInitiativeParticipationStatus, startInitiativeAction,
} from "./initiative-runtime";
import { reconcileDefenseCost, resolveDefenseGroup } from "./defense-intervention";
import { resolvePercentileCheck } from "./percentile-resolution";

const initial = () => initializeInitiativeRuntime(1, [
  { characterId: 1, normalTotalInitiative: 26, movementMode: "fixture" },
  { characterId: -1, normalTotalInitiative: 22, movementMode: "fixture" },
]);

test("instant timing changes update stored finish and scheduling without rewriting the action origin", () => {
  let state = startInitiativeAction(initial(), { id: 1, actorCharacterId: 1, label: "swing", initiativeCost: 6, allowsMultiRound: false });
  state = advanceInitiativeTimeline(state, 22);
  state = applyDirectInitiativeDelta(state, 1, -3);
  assert.equal(state.pendingActions[0].remainingInitiativeCost, 2);
  assert.equal(state.pendingActions[0].expectedCompletionInitiative, 17);
  assert.equal(state.pendingActions[0].startInitiative, 26);
  state = setInitiativeParticipationStatus(state, -1, "suspended");
  assert.deepEqual(getNextInitiativeTimelineEvent(state), { kind: "pending-completion", initiative: 17, actionIds: [1] });
  state = changeNormalTotalInitiative(state, 1, 29, "ordinary");
  assert.equal(state.pendingActions[0].expectedCompletionInitiative, 20);
  assert.deepEqual(getNextInitiativeTimelineEvent(state), { kind: "pending-completion", initiative: 20, actionIds: [1] });
});

test("retained Hold counts with real ongoing progress but repeated reads/status do not create Steps", () => {
  let state = holdInitiative(initial(), 1);
  assert.equal(state.runtime.stepNumber, 1);
  state = advanceInitiativeTimeline(state, 22);
  state = startInitiativeAction(state, { id: 1, actorCharacterId: -1, label: "long work", initiativeCost: 8, allowsMultiRound: true });
  assert.equal(state.runtime.stepNumber, 2);
  state = advanceInitiativeTimeline(state, 22);
  state = setInitiativeParticipationStatus(state, 1, "holding");
  assert.equal(state.runtime.stepNumber, 2);
  state = advanceInitiativeTimeline(state, 21);
  assert.equal(state.runtime.stepNumber, 3);
  assert.equal(advanceInitiativeTimeline(state, 21).runtime.stepNumber, 3);
});

test("temporary capacity recovery applies immediately even when current Initiative is negative", () => {
  let state = applyDirectInitiativeDelta(initial(), 1, -30);
  state = changeNormalTotalInitiative(state, 1, 32, "ordinary");
  assert.equal(state.participants[0].currentInitiative, 2);
});

test("the two confirmed block cost branches remain different", () => {
  assert.deepEqual(reconcileDefenseCost({ reactionType: "block", committedInitiativeCost: 4, defenseSucceeded: true }), {
    defenderFinalCost: 1, defenderRefund: 3, attackerAdditionalCost: 4,
  });
  const result = resolveDefenseGroup({
    attack: resolvePercentileCheck({ resultTotal: 9, originalTarget: 40 }),
    defenses: [{ reactionId: 1, reactionType: "block", committedInitiativeCost: 4,
      roll: resolvePercentileCheck({ resultTotal: 78, originalTarget: 50 }) }],
  });
  assert.equal(result.outcomes[0].defenderFinalCost, 4);
  assert.equal(result.outcomes[0].attackerAdditionalCost, 0);
});
