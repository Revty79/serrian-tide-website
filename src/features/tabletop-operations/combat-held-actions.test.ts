import assert from "node:assert/strict";
import test from "node:test";
import { withHeldCombatChoices, canFinishRoundWithHolders } from "./combat-held-actions";
import {
  initializeInitiativeRuntime, holdInitiative, startInitiativeAction,
  advanceInitiativeToNextEvent, advanceInitiativeRound,
  type InitiativeEngineState,
} from "./initiative-runtime";
import type { CombatProgression, CombatTaskKind } from "./combat-progression";
import { canControlCombatTask } from "./combat-runner-presentation";

const names = [{ characterId: 1, name: "Holder" }, { characterId: -2, name: "Creature" }];
function setup(): InitiativeEngineState {
  return holdInitiative(initializeInitiativeRuntime(1, [
    { characterId: 1, normalTotalInitiative: 11, movementMode: "land" },
    { characterId: -2, normalTotalInitiative: 9, movementMode: "land" },
  ]), 1);
}
function progress(kind: CombatTaskKind = "advance-time"): CombatProgression {
  return { tasks: [{ key: "next", kind, participantId: -2, declarationId: null,
    recordId: null, title: "Next", detail: "" }], canAdvanceTime: kind === "advance-time",
    canStartRound: kind === "next-round", actingParticipantIds: kind === "choose-action" ? [-2] : [] };
}
test("Hold stays actionable before and after another combatant's movement", () => {
  const held = setup();
  const before = withHeldCombatChoices(held, progress(), names);
  assert.equal(before.tasks[0].kind, "held-action");
  assert.equal(before.tasks[0].participantId, 1);
  const opening = advanceInitiativeToNextEvent(held);
  const moving = startInitiativeAction(opening, { id: 1, actorCharacterId: -2,
    label: "Move", actionKind: "movement", initiativeCost: 2, allowsMultiRound: false });
  assert.equal(withHeldCombatChoices(moving, progress(), names).tasks[0].kind, "held-action");
  const finished = advanceInitiativeToNextEvent(moving);
  const after = withHeldCombatChoices(finished, progress("choose-action"), names);
  assert.equal(after.tasks[0].kind, "held-action");
  assert.equal(finished.participants.find(({ characterId }) => characterId === 1)?.currentInitiative, 11);
  assert.equal(finished.runtime.timelineInitiative, 7);
});
test("acting from Hold uses the retained pool without rewinding combat time", () => {
  const atNine = advanceInitiativeToNextEvent(setup());
  const acting = startInitiativeAction(atNine, { id: 2, actorCharacterId: 1, label: "Held attack",
    initiativeCost: 4, allowsMultiRound: false, heldIntervention: true });
  assert.equal(acting.runtime.timelineInitiative, 9);
  assert.equal(acting.pendingActions[0].startInitiative, 11);
  assert.equal(acting.pendingActions[0].expectedCompletionInitiative, 7);
  assert.equal(acting.participants[0].participationStatus, "active");
  assert.ok(!withHeldCombatChoices(acting, progress(), names).tasks.some(({ kind }) => kind === "held-action"));
});
test("Hold never inserts a new action into a due roll, result, ruling or closed fight", () => {
  for (const kind of ["roll-attack", "roll-defense", "resolve-exchange", "apply-result", "ruling", "closed", "start"] as const) {
    const base = progress(kind);
    assert.equal(withHeldCombatChoices(setup(), base, names), base);
  }
  const engine = setup();
  engine.runtime.status = "closed";
  assert.equal(withHeldCombatChoices(engine, progress(), names).tasks.length, 1);
});
test("a completion at the current point still precedes a held action", () => {
  const engine = setup();
  engine.pendingActions = [{ id: 9, actorCharacterId: -2, encounterId: 1, label: "Due",
    actionKind: "attack", allowsMultiRound: false, originalInitiativeCost: 2,
    initiativeSpent: 0, remainingInitiativeCost: 2, startInitiative: 13,
    startTimelineInitiative: 11, expectedCompletionInitiative: 11, status: "active", startedRound: 1, completedRound: null }];
  engine.participants[1].currentInitiative = 13;
  assert.equal(withHeldCombatChoices(engine, progress(), names).tasks.length, 1);
});
test("passed, suspended, exhausted and too-slow holders do not get an intervention", () => {
  for (const status of ["passed", "suspended", "active"] as const) {
    const engine = setup(); engine.participants[0].participationStatus = status;
    assert.equal(withHeldCombatChoices(engine, progress(), names).tasks.length, 1);
  }
  for (const initiative of [0, -2, 10]) {
    const engine = setup(); engine.participants[0].currentInitiative = initiative;
    assert.equal(withHeldCombatChoices(engine, progress(), names).tasks.length, 1);
  }
});
test("held choices preserve the ordinary next event and controller ownership", () => {
  const engine = setup();
  const result = withHeldCombatChoices(engine, progress(), names);
  assert.equal(result.canAdvanceTime, true);
  assert.deepEqual(result.actingParticipantIds, []);
  assert.equal(canControlCombatTask(result.tasks[0], [{ id: 1, controlled: true }], "player"), true);
  assert.equal(canControlCombatTask(result.tasks[0], [{ id: 1, controlled: false }], "god"), false);
});
test("holding the whole round preserves carryover without converting it to Pass", () => {
  const engine = setup();
  engine.participants[1].participationStatus = "holding";
  assert.equal(canFinishRoundWithHolders(engine), true);
  const next = advanceInitiativeRound(engine, canFinishRoundWithHolders(engine));
  assert.deepEqual(next.participants.map(({ currentInitiative }) => currentInitiative), [22, 18]);
  assert.deepEqual(engine.participants.map(({ participationStatus }) => participationStatus), ["holding", "holding"]);
  engine.participants[1].participationStatus = "active";
  assert.equal(canFinishRoundWithHolders(engine), false);
});
