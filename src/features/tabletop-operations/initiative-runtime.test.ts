import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  addDeferredInitiativeCost,
  advanceInitiativeRound,
  advanceInitiativeTimeline,
  advanceInitiativeToNextEvent,
  applyDirectInitiativeDelta,
  canAdvanceInitiativeRound,
  canHoldingParticipantIntervene,
  canParticipantReactToAction,
  calculateNormalTotalInitiative,
  changeNormalTotalInitiative,
  closeInitiativeRuntime,
  completePendingInitiativeActionManually,
  correctInitiativeRuntimePosition,
  endPendingInitiativeAction,
  enrollLateInitiativeParticipant,
  getDodgeInitiativeCost,
  getMaximumMovementDistance,
  getNextInitiativeTimelineEvent,
  holdInitiative,
  initializeInitiativeRuntime,
  interruptPendingInitiativeAction,
  passInitiative,
  resolveBlockParryInitiativeCosts,
  restartPendingInitiativeAction,
  resumePendingInitiativeAction,
  resumePendingInitiativeActionWithAdjustedCost,
  setCurrentInitiative,
  setInitiativeParticipationStatus,
  settleDeferredInitiativeCost,
  startInitiativeAction,
  abandonPendingInitiativeAction,
  adjustPendingInitiativeActionRemainingCost,
  type InitiativeEngineState,
} from "./initiative-runtime";

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function state(...totals: number[]): InitiativeEngineState {
  return initializeInitiativeRuntime(9, totals.map((normalTotalInitiative, index) => ({
    characterId: index + 1,
    normalTotalInitiative,
    movementMode: "Land",
  })), new Date("2026-09-04T18:00:00.000Z"));
}

function participant(engine: InitiativeEngineState, characterId = 1) {
  return engine.participants.find((entry) => entry.characterId === characterId)!;
}

function action(engine: InitiativeEngineState, actionId = 1) {
  return engine.pendingActions.find((entry) => entry.id === actionId)!;
}

test("canonical Base Initiative and movement totals reuse Character rules without randomness", () => {
  assert.equal(calculateNormalTotalInitiative(1, 1), 1);
  assert.equal(calculateNormalTotalInitiative(4, 1), 1);
  assert.equal(calculateNormalTotalInitiative(5, 1), 2);
  assert.equal(calculateNormalTotalInitiative(10, 1), 3);
  assert.equal(calculateNormalTotalInitiative(30, 1), 7);
  assert.equal(calculateNormalTotalInitiative(30, 5), 35);
  const source = readSource("src/features/tabletop-operations/initiative-runtime.ts");
  assert.match(source, /getMovementInitiative/);
  assert.doesNotMatch(source, /Math\.random|\bd20\b|\bd100\b|initiativeRoll/i);
});

test("initialization uses calculated totals directly and permits signed and uncapped Current Initiative", () => {
  let engine = state(35);
  assert.equal(engine.runtime.timelineInitiative, 35);
  assert.equal(participant(engine).currentInitiative, 35);
  engine = setCurrentInitiative(engine, 1, 70);
  assert.equal(participant(engine).currentInitiative, 70);
  engine = setCurrentInitiative(engine, 1, 0);
  assert.equal(participant(engine).currentInitiative, 0);
  engine = setCurrentInitiative(engine, 1, -4);
  assert.equal(participant(engine).currentInitiative, -4);
});

test("round advancement preserves positive carryover and signed debt without a cap", () => {
  let carry = setCurrentInitiative(state(35), 1, 5);
  carry = advanceInitiativeRound(carry, true);
  assert.equal(participant(carry).currentInitiative, 40);
  let full = state(35);
  full = advanceInitiativeRound(full, true);
  assert.equal(participant(full).currentInitiative, 70);
  let debt = setCurrentInitiative(state(35), 1, -4);
  debt = advanceInitiativeRound(debt, true);
  assert.equal(participant(debt).currentInitiative, 31);
});

test("capacity differences preserve spent time and penalty recovery can wait while negative", () => {
  let engine = setCurrentInitiative(state(35), 1, 20);
  engine = changeNormalTotalInitiative(engine, 1, 45, "ordinary");
  assert.equal(participant(engine).currentInitiative, 30);
  engine = setCurrentInitiative(state(35), 1, 5);
  engine = changeNormalTotalInitiative(engine, 1, 25, "ordinary");
  assert.equal(participant(engine).currentInitiative, -5);

  engine = setCurrentInitiative(state(23), 1, -4);
  engine = changeNormalTotalInitiative(engine, 1, 35, "penalty-recovery");
  assert.equal(participant(engine).normalTotalInitiative, 35);
  assert.equal(participant(engine).currentInitiative, -4);
  engine = advanceInitiativeRound(engine, true);
  assert.equal(participant(engine).currentInitiative, 31);
});

test("direct Initiative deltas change Current only and may create debt", () => {
  let engine = setCurrentInitiative(state(35), 1, 20);
  engine = applyDirectInitiativeDelta(engine, 1, 5);
  assert.equal(participant(engine).currentInitiative, 25);
  assert.equal(participant(engine).normalTotalInitiative, 35);
  engine = setCurrentInitiative(engine, 1, 2);
  engine = applyDirectInitiativeDelta(engine, 1, -5);
  assert.equal(participant(engine).currentInitiative, -3);
});

test("ordinary unaffordable actions reject while explicit long actions persist", () => {
  const engine = setCurrentInitiative(state(24), 1, 5);
  assert.throws(() => startInitiativeAction(engine, {
    id: 1, actorCharacterId: 1, label: "Ordinary attack", initiativeCost: 8, allowsMultiRound: false,
  }), /ordinary action cannot cost more/i);
  const long = startInitiativeAction(engine, {
    id: 1, actorCharacterId: 1, label: "Long spell", initiativeCost: 12, allowsMultiRound: true,
  });
  assert.equal(action(long).remainingInitiativeCost, 12);
  assert.equal(action(long).status, "active");
});

test("action time elapses progressively and interruption loses only elapsed Initiative", () => {
  let engine = setCurrentInitiative(state(25), 1, 25);
  engine = startInitiativeAction(engine, {
    id: 1, actorCharacterId: 1, label: "Focused action", initiativeCost: 8, allowsMultiRound: false,
  });
  engine = advanceInitiativeTimeline(engine, 23);
  assert.equal(participant(engine).currentInitiative, 23);
  assert.equal(action(engine).initiativeSpent, 2);
  assert.equal(action(engine).remainingInitiativeCost, 6);
  engine = interruptPendingInitiativeAction(engine, 1);
  assert.equal(action(engine).status, "interrupted");
  assert.equal(participant(engine).currentInitiative, 23);
  assert.equal(action(engine).remainingInitiativeCost, 6);
});

test("interrupted action resolution supports retained resume, restart, adjusted resume, end, abandon, and manual completion", () => {
  let interrupted = startInitiativeAction(state(25), {
    id: 1, actorCharacterId: 1, label: "Ritual", initiativeCost: 8, allowsMultiRound: true,
  });
  interrupted = advanceInitiativeTimeline(interrupted, 23);
  interrupted = interruptPendingInitiativeAction(interrupted, 1);

  const retained = resumePendingInitiativeAction(interrupted, 1);
  assert.equal(action(retained).initiativeSpent, 2);
  assert.equal(action(retained).remainingInitiativeCost, 6);
  const restarted = restartPendingInitiativeAction(interrupted, 1);
  assert.equal(action(restarted).initiativeSpent, 0);
  assert.equal(action(restarted).remainingInitiativeCost, 8);
  const adjusted = resumePendingInitiativeActionWithAdjustedCost(interrupted, 1, 4);
  assert.equal(action(adjusted).initiativeSpent, 2);
  assert.equal(action(adjusted).remainingInitiativeCost, 4);
  const separatelyAdjusted = adjustPendingInitiativeActionRemainingCost(interrupted, 1, 5);
  assert.equal(action(separatelyAdjusted).remainingInitiativeCost, 5);
  assert.equal(action(endPendingInitiativeAction(interrupted, 1)).status, "ended");
  assert.equal(action(abandonPendingInitiativeAction(interrupted, 1)).status, "abandoned");
  const completed = completePendingInitiativeActionManually(interrupted, 1);
  assert.equal(action(completed).status, "completed");
  assert.equal(action(completed).remainingInitiativeCost, 0);
});

test("pending completion precedes a new opportunity at the same Initiative", () => {
  let engine = state(23, 21);
  engine = startInitiativeAction(engine, {
    id: 1, actorCharacterId: 1, label: "Punch", initiativeCost: 2, allowsMultiRound: false,
  });
  assert.deepEqual(getNextInitiativeTimelineEvent(engine), {
    kind: "pending-completion",
    initiative: 21,
    actionIds: [1],
  });
  assert.throws(() => startInitiativeAction(engine, {
    id: 2, actorCharacterId: 2, label: "Waiting action", initiativeCost: 1, allowsMultiRound: false,
  }), /completion must resolve/);
  engine = advanceInitiativeToNextEvent(engine);
  assert.equal(action(engine).status, "completed");
  assert.equal(engine.runtime.timelineInitiative, 21);
});

test("Held 23 to 21 intervention spends retained Initiative and completes before a new action at 21", () => {
  let engine = state(23, 21);
  engine = holdInitiative(engine, 1);
  assert.equal(participant(engine, 1).currentInitiative, 23);
  assert.equal(participant(engine, 1).participationStatus, "holding");
  assert.deepEqual(getNextInitiativeTimelineEvent(engine), {
    kind: "normal-opportunity", initiative: 21, characterIds: [2],
  });
  engine = advanceInitiativeToNextEvent(engine);
  assert.equal(engine.runtime.timelineInitiative, 21);
  assert.equal(canHoldingParticipantIntervene(engine.runtime, participant(engine, 1)), true);
  engine = startInitiativeAction(engine, {
    id: 1, actorCharacterId: 1, label: "Held intervention", initiativeCost: 2, allowsMultiRound: false, heldIntervention: true,
  });
  assert.equal(action(engine).startInitiative, 23);
  assert.equal(action(engine).startTimelineInitiative, 21);
  assert.equal(action(engine).expectedCompletionInitiative, 21);
  assert.equal(action(engine).initiativeSpent, 0);
  assert.equal(action(engine).remainingInitiativeCost, 2);
  assert.equal(engine.runtime.timelineInitiative, 21);
  assert.deepEqual(getNextInitiativeTimelineEvent(engine), {
    kind: "pending-completion", initiative: 21, actionIds: [1],
  });
  assert.throws(() => startInitiativeAction(engine, {
    id: 2, actorCharacterId: 2, label: "Bob at 21", initiativeCost: 1, allowsMultiRound: false,
  }), /completion must resolve/);
  engine = advanceInitiativeToNextEvent(engine);
  assert.equal(action(engine).status, "completed");
  assert.equal(action(engine).initiativeSpent, 2);
  assert.equal(action(engine).remainingInitiativeCost, 0);
  assert.equal(participant(engine, 1).currentInitiative, 21);
  assert.equal(engine.runtime.timelineInitiative, 21);
  assert.deepEqual(getNextInitiativeTimelineEvent(engine), {
    kind: "normal-opportunity", initiative: 21, characterIds: [1, 2],
  });
});

test("a Held 23 action at timeline 21 consumes its retained span before continuing to 18", () => {
  let engine = state(23, 21);
  engine = holdInitiative(engine, 1);
  engine = advanceInitiativeToNextEvent(engine);
  engine = startInitiativeAction(engine, {
    id: 1, actorCharacterId: 1, label: "Five-point held action", initiativeCost: 5, allowsMultiRound: false, heldIntervention: true,
  });
  assert.equal(action(engine).startInitiative, 23);
  assert.equal(action(engine).startTimelineInitiative, 21);
  assert.equal(action(engine).expectedCompletionInitiative, 18);
  engine = passInitiative(engine, 2);
  engine = advanceInitiativeToNextEvent(engine);
  assert.equal(engine.runtime.timelineInitiative, 18);
  assert.equal(action(engine).status, "completed");
  assert.equal(action(engine).initiativeSpent, 5);
  assert.equal(action(engine).remainingInitiativeCost, 0);
  assert.equal(participant(engine, 1).currentInitiative, 18);
});

test("a Held completion above a lower normal opportunity resolves without rewinding world time", () => {
  let engine = state(23, 20);
  engine = holdInitiative(engine, 1);
  engine = advanceInitiativeToNextEvent(engine);
  assert.equal(engine.runtime.timelineInitiative, 20);
  engine = startInitiativeAction(engine, {
    id: 1, actorCharacterId: 1, label: "Retained punch", initiativeCost: 2, allowsMultiRound: false, heldIntervention: true,
  });
  assert.equal(action(engine).expectedCompletionInitiative, 21);
  assert.deepEqual(getNextInitiativeTimelineEvent(engine), {
    kind: "pending-completion", initiative: 21, actionIds: [1],
  });
  engine = advanceInitiativeToNextEvent(engine);
  assert.equal(action(engine).status, "completed");
  assert.equal(participant(engine, 1).currentInitiative, 21);
  assert.equal(engine.runtime.timelineInitiative, 20);
  assert.deepEqual(getNextInitiativeTimelineEvent(engine), {
    kind: "normal-opportunity", initiative: 20, characterIds: [1, 2],
  });
});

test("Pass banks Current Initiative, prevents normal same-round entry, and resets next Round", () => {
  let engine = state(20);
  engine = passInitiative(engine, 1);
  assert.equal(participant(engine).currentInitiative, 20);
  assert.equal(participant(engine).participationStatus, "passed");
  assert.equal(canAdvanceInitiativeRound(engine), true);
  assert.throws(() => startInitiativeAction(engine, {
    id: 1, actorCharacterId: 1, label: "Too late", initiativeCost: 1, allowsMultiRound: false,
  }), /Only an active Participant/);
  engine = advanceInitiativeRound(engine);
  assert.equal(participant(engine).currentInitiative, 40);
  assert.equal(participant(engine).participationStatus, "active");
});

test("a multi-round action stops at zero, survives the Round, and completes from replenished Initiative", () => {
  let engine = setCurrentInitiative(state(24), 1, 5);
  engine = correctInitiativeRuntimePosition(engine, { roundNumber: 1, stepNumber: 1, timelineInitiative: 5 });
  engine = startInitiativeAction(engine, {
    id: 1, actorCharacterId: 1, label: "Long spell", initiativeCost: 12, allowsMultiRound: true,
  });
  assert.deepEqual(getNextInitiativeTimelineEvent(engine), {
    kind: "pending-round-boundary", initiative: 0, actionIds: [1],
  });
  engine = advanceInitiativeToNextEvent(engine);
  assert.equal(participant(engine).currentInitiative, 0);
  assert.equal(action(engine).initiativeSpent, 5);
  assert.equal(action(engine).remainingInitiativeCost, 7);
  engine = advanceInitiativeRound(engine);
  assert.equal(participant(engine).currentInitiative, 24);
  assert.equal(action(engine).status, "active");
  assert.equal(getNextInitiativeTimelineEvent(engine).initiative, 17);
  engine = advanceInitiativeToNextEvent(engine);
  assert.equal(participant(engine).currentInitiative, 17);
  assert.equal(action(engine).status, "completed");
});

test("deferred costs stack, settle into debt, and auto-settle when an action resolves", () => {
  let engine = setCurrentInitiative(state(10), 1, 10);
  engine = addDeferredInitiativeCost(engine, 1, 1);
  engine = addDeferredInitiativeCost(engine, 1, 2);
  assert.equal(participant(engine).deferredInitiativeCost, 3);
  engine = settleDeferredInitiativeCost(engine, 1);
  assert.equal(participant(engine).currentInitiative, 7);
  assert.equal(participant(engine).deferredInitiativeCost, 0);

  engine = setCurrentInitiative(state(10), 1, 1);
  engine = addDeferredInitiativeCost(engine, 1, 3);
  engine = settleDeferredInitiativeCost(engine, 1);
  assert.equal(participant(engine).currentInitiative, -2);

  engine = startInitiativeAction(state(10), {
    id: 1, actorCharacterId: 1, label: "Casting", initiativeCost: 2, allowsMultiRound: false,
  });
  engine = addDeferredInitiativeCost(engine, 1, 3);
  engine = advanceInitiativeTimeline(engine, 8);
  assert.equal(action(engine).status, "completed");
  assert.equal(participant(engine).currentInitiative, 5);
  assert.equal(participant(engine).deferredInitiativeCost, 0);
});

test("reaction gap detection respects start and completion boundaries", () => {
  const pending = {
    startTimelineInitiative: 35,
    expectedCompletionInitiative: 27,
  };
  assert.equal(canParticipantReactToAction(pending, 30), true);
  assert.equal(canParticipantReactToAction(pending, 35), true);
  assert.equal(canParticipantReactToAction(pending, 27), true);
  assert.equal(canParticipantReactToAction(pending, 26), false);
});

test("movement, Dodge, and Block/Parry helpers preserve canonical numeric rules", () => {
  assert.equal(getMaximumMovementDistance(3, 30), 90);
  assert.equal(getDodgeInitiativeCost(), 1);
  assert.deepEqual(resolveBlockParryInitiativeCosts(8, 6, false), { attackerCost: 8, defenderCost: 6 });
  assert.deepEqual(resolveBlockParryInitiativeCosts(8, 6, true), { attackerCost: 14, defenderCost: 1 });
});

test("late enrollment grants full Normal Initiative without changing timeline, Round, or existing Participants", () => {
  let engine = advanceInitiativeTimeline(holdInitiative(state(35, 20), 1), 20);
  const before = structuredClone(engine);
  engine = enrollLateInitiativeParticipant(engine, { characterId: 3, normalTotalInitiative: 30, movementMode: "Land" });
  assert.equal(participant(engine, 3).currentInitiative, 30);
  assert.equal(engine.runtime.timelineInitiative, before.runtime.timelineInitiative);
  assert.equal(engine.runtime.roundNumber, before.runtime.roundNumber);
  assert.deepEqual(engine.participants.slice(0, 2), before.participants);
  assert.deepEqual(getNextInitiativeTimelineEvent(engine), {
    kind: "normal-opportunity", initiative: 20, characterIds: [2, 3],
  });
});

test("a late entrant with 30 Initiative at timeline 20 can spend all 30 for 90 feet in the same Round", () => {
  let engine = passInitiative(state(20), 1);
  engine = enrollLateInitiativeParticipant(engine, {
    characterId: 2, normalTotalInitiative: 30, movementMode: "Land",
  });
  assert.equal(engine.runtime.timelineInitiative, 20);
  assert.equal(participant(engine, 2).currentInitiative, 30);
  engine = startInitiativeAction(engine, {
    id: 1,
    actorCharacterId: 2,
    label: "Move full distance",
    actionKind: "movement",
    initiativeCost: 30,
    allowsMultiRound: false,
  });
  assert.equal(action(engine).startInitiative, 30);
  assert.equal(action(engine).startTimelineInitiative, 20);
  assert.equal(action(engine).expectedCompletionInitiative, 0);
  assert.equal(getMaximumMovementDistance(3, action(engine).originalInitiativeCost), 90);
  assert.deepEqual(getNextInitiativeTimelineEvent(engine), {
    kind: "pending-completion", initiative: 0, actionIds: [1],
  });
  engine = advanceInitiativeToNextEvent(engine);
  assert.equal(action(engine).initiativeSpent, 30);
  assert.equal(action(engine).remainingInitiativeCost, 0);
  assert.equal(participant(engine, 2).currentInitiative, 0);
  assert.equal(engine.runtime.timelineInitiative, 0);
  assert.equal(engine.runtime.roundNumber, 1);
});

test("multiple pending actions are ordered by shared chronology rather than insertion stack", () => {
  let engine = state(35, 25, 20);
  engine = startInitiativeAction(engine, {
    id: 1, actorCharacterId: 1, label: "Bob spell", initiativeCost: 12, allowsMultiRound: false,
  });
  engine = advanceInitiativeTimeline(engine, 25);
  engine = startInitiativeAction(engine, {
    id: 2, actorCharacterId: 2, label: "Ryan action", initiativeCost: 3, allowsMultiRound: false,
  });
  assert.deepEqual(getNextInitiativeTimelineEvent(engine), {
    kind: "pending-completion", initiative: 23, actionIds: [1],
  });
  engine = advanceInitiativeToNextEvent(engine);
  assert.equal(action(engine, 1).status, "completed");
  assert.equal(action(engine, 2).status, "active");
  assert.deepEqual(getNextInitiativeTimelineEvent(engine), {
    kind: "normal-opportunity", initiative: 23, characterIds: [1],
  });
  engine = passInitiative(engine, 1);
  assert.equal(getNextInitiativeTimelineEvent(engine).initiative, 22);
});

test("Combat Steps advance by participation slices without a one-action-per-Round limiter", () => {
  let engine = state(40, 20);
  for (let id = 1; id <= 4; id += 1) {
    engine = startInitiativeAction(engine, {
      id, actorCharacterId: 1, label: `Fast action ${id}`, initiativeCost: 5, allowsMultiRound: false,
    });
    engine = advanceInitiativeToNextEvent(engine);
  }
  assert.equal(participant(engine, 1).currentInitiative, 20);
  assert.equal(participant(engine, 2).currentInitiative, 20);
  assert.equal(engine.runtime.stepNumber, 4);
  assert.equal(engine.runtime.roundNumber, 1);
  assert.deepEqual(getNextInitiativeTimelineEvent(engine), {
    kind: "normal-opportunity", initiative: 20, characterIds: [1, 2],
  });
  engine = startInitiativeAction(engine, {
    id: 5, actorCharacterId: 1, label: "Bob tied action", initiativeCost: 1, allowsMultiRound: false,
  });
  engine = startInitiativeAction(engine, {
    id: 6, actorCharacterId: 2, label: "Ryan tied action", initiativeCost: 1, allowsMultiRound: false,
  });
  engine = advanceInitiativeToNextEvent(engine);
  assert.equal(engine.runtime.stepNumber, 5);
});

test("suspension preserves Current Initiative and requires explicit G.O.D. resolution", () => {
  let engine = setCurrentInitiative(state(35), 1, 22);
  engine = setInitiativeParticipationStatus(engine, 1, "suspended");
  assert.equal(participant(engine).currentInitiative, 22);
  assert.equal(participant(engine).participationStatus, "suspended");
  engine = setInitiativeParticipationStatus(engine, 1, "active");
  assert.equal(participant(engine).currentInitiative, 22);
});

test("runtime correction is explicit and closing preserves history while requiring active actions resolved", () => {
  let engine = correctInitiativeRuntimePosition(state(35), {
    roundNumber: 3, stepNumber: 7, timelineInitiative: 18,
  });
  assert.deepEqual({
    roundNumber: engine.runtime.roundNumber,
    stepNumber: engine.runtime.stepNumber,
    timelineInitiative: engine.runtime.timelineInitiative,
  }, { roundNumber: 3, stepNumber: 7, timelineInitiative: 18 });
  engine = startInitiativeAction(engine, {
    id: 1, actorCharacterId: 1, label: "Correction action", initiativeCost: 2, allowsMultiRound: false,
  });
  assert.throws(() => closeInitiativeRuntime(engine), /Resolve all active pending actions/);
  engine = completePendingInitiativeActionManually(engine, 1);
  engine = closeInitiativeRuntime(engine, new Date("2026-09-04T19:00:00.000Z"));
  assert.equal(engine.runtime.status, "closed");
  assert.equal(engine.pendingActions.length, 1);
  assert.equal(engine.participants.length, 1);
});

test("canonical stress timeline preserves Hold, Pass, interruption, carryover, and no rewind", () => {
  let engine = state(35, 30, 24, 20);
  engine = startInitiativeAction(engine, {
    id: 1, actorCharacterId: 1, label: "Bob action", initiativeCost: 8, allowsMultiRound: false,
  });
  assert.equal(canParticipantReactToAction(action(engine), participant(engine, 2).currentInitiative), true);
  engine = advanceInitiativeTimeline(engine, 30);
  engine = holdInitiative(engine, 2);
  engine = advanceInitiativeTimeline(engine, 28);
  engine = interruptPendingInitiativeAction(engine, 1);
  assert.equal(participant(engine, 1).currentInitiative, 28);
  assert.equal(action(engine).initiativeSpent, 7);
  assert.equal(action(engine).remainingInitiativeCost, 1);
  assert.equal(engine.runtime.timelineInitiative, 28);
  engine = passInitiative(engine, 2);
  assert.equal(participant(engine, 2).currentInitiative, 30);
  engine = advanceInitiativeRound(engine, true);
  assert.equal(participant(engine, 2).currentInitiative, 60);
  assert.equal(engine.runtime.roundNumber, 2);
});

test("debt stress combines capacity reduction, direct penalty, deferred recovery, and next Round", () => {
  let engine = setCurrentInitiative(state(35), 1, 20);
  engine = changeNormalTotalInitiative(engine, 1, 23, "ordinary");
  assert.equal(participant(engine).currentInitiative, 8);
  engine = applyDirectInitiativeDelta(engine, 1, -12);
  assert.equal(participant(engine).currentInitiative, -4);
  engine = changeNormalTotalInitiative(engine, 1, 35, "penalty-recovery");
  assert.equal(participant(engine).currentInitiative, -4);
  engine = advanceInitiativeRound(engine, true);
  assert.equal(participant(engine).currentInitiative, 31);
});

test("Initiative foundation contains no circular clock or one-action-per-Round model", () => {
  const source = readSource("src/features/tabletop-operations/initiative-runtime.ts");
  assert.doesNotMatch(source, /%\s*100|hasTakenTurnThisRound|oneActionPerRound|initiativeRoll/i);
  let engine = setCurrentInitiative(state(8), 1, 8);
  engine = applyDirectInitiativeDelta(engine, 1, -15);
  assert.equal(participant(engine).currentInitiative, -7);
});
