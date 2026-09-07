import assert from "node:assert/strict";
import test from "node:test";
import { buildCombatProgression, type CombatProgressionInput } from "./combat-progression";

type Declaration = CombatProgressionInput["declarations"][number];
const declaration = (changes: Partial<Declaration> = {}): Declaration => ({
  id: 1, actorCharacterId: 10, actorName: "Hero", status: "rolling-ready", pendingActionId: 1,
  draft: { label: "Sword", actionKind: "attack" }, lockedSnapshot: { label: "Sword" },
  timing: { status: "completed", startInitiative: 11, remainingInitiativeCost: 0 },
  opportunities: [], rollState: { attackRollId: null, resolved: false, message: "Attack roll needed" }, ...changes,
});
const state = (changes: Partial<CombatProgressionInput> = {}): CombatProgressionInput => ({
  runtimeStatus: "active", timelineInitiative: 7, canAdvanceRound: false,
  nextEvent: { kind: "normal-opportunity", initiative: 7, characterIds: [10, -1], canAdvance: false },
  participants: [{ characterId: 10, name: "Hero" }, { characterId: -1, name: "Bandit" }],
  declarations: [], reactions: [], plans: [], ...changes,
});
const opportunity = { id: 8, responderCharacterId: -1, responderName: "Bandit", status: "pending", requiresGodConfirmation: true, reachedAtInitiative: 11 };

test("completed timing with a missing attack roll takes precedence over another ordinary action", () => {
  const progress = buildCombatProgression(state({ declarations: [declaration()] }));
  assert.deepEqual(progress.tasks.map(({ kind }) => kind), ["roll-attack"]);
  assert.deepEqual(progress.actingParticipantIds, []);
  assert.equal(progress.canAdvanceTime, false);
});
test("all simultaneous completed attacks stay present, including signed creature identities", () => {
  const progress = buildCombatProgression(state({ declarations: [declaration(), declaration({ id: 2, actorCharacterId: -1, actorName: "Bandit" })] }));
  assert.deepEqual(progress.tasks.map(({ participantId }) => participantId), [10, -1]);
});
test("simultaneous choices precede the eligibility operation the server would reject", () => {
  const progress = buildCombatProgression(state({ timelineInitiative: 11,
    nextEvent: { kind: "normal-opportunity", initiative: 11, characterIds: [-1], canAdvance: false },
    declarations: [declaration({ status: "committed", timing: { status: "active", startInitiative: 11, remainingInitiativeCost: 4 }, opportunities: [opportunity] })],
  }));
  assert.equal(progress.tasks[0].kind, "choose-action");
  assert.deepEqual(progress.actingParticipantIds, [-1]);
});
test("pending eligibility and pending responses are not disguised as missing dice", () => {
  for (const requiresGodConfirmation of [true, false]) {
    const progress = buildCombatProgression(state({ declarations: [declaration({ opportunities: [{ ...opportunity, requiresGodConfirmation }] })] }));
    assert.equal(progress.tasks[0].kind, requiresGodConfirmation ? "eligibility" : "choose-response");
    assert.equal(progress.canAdvanceTime, false);
  }
});
test("attack and defense rolls appear together after choices; recorded slots disappear", () => {
  const reactions = [{ id: 5, declarationId: 1, responderCharacterId: -1, responderName: "Bandit", status: "declared", rollRequired: true, rollId: null }];
  const progress = buildCombatProgression(state({ declarations: [declaration()], reactions }));
  assert.deepEqual(progress.tasks.map(({ kind }) => kind), ["roll-defense", "roll-attack"]);
  const after = buildCombatProgression(state({ declarations: [declaration({ rollState: { attackRollId: 4, resolved: false, message: "Recorded" } })], reactions }));
  assert.deepEqual(after.tasks.map(({ kind }) => kind), ["roll-defense"]);
});
test("an automatic action requests resolution, never an invented dice roll", () => {
  const progress = buildCombatProgression(state({ declarations: [declaration({ lockedSnapshot: { label: "Move", authoredSource: { resolutionMode: "automatic-no-roll" } } })] }));
  assert.equal(progress.tasks[0].kind, "resolve-exchange");
});
test("completed comparison still requires application before the actor is offered another action", () => {
  const progress = buildCombatProgression(state({ declarations: [declaration({ rollState: { attackRollId: 4, resolved: true, message: "Compared" } })] }));
  assert.equal(progress.tasks[0].kind, "apply-result");
  assert.deepEqual(progress.actingParticipantIds, []);
});
test("a resolved declaration does not hide an unapplied or partially applied result", () => {
  for (const status of ["calculated", "partially-applied", "application-failed"]) {
    const progress = buildCombatProgression(state({ declarations: [declaration({ status: "resolved" })], plans: [{ id: 3, declarationId: 1, status }] }));
    assert.equal(progress.tasks[0].kind, "apply-result");
  }
});
test("rulings remain human decisions", () => {
  const progress = buildCombatProgression(state({ declarations: [declaration({ status: "awaiting-god-ruling" })] }));
  assert.equal(progress.tasks[0].kind, "ruling");
  assert.equal(progress.canAdvanceTime, false);
});
test("long actions do not serialize combat when someone else reaches an opening", () => {
  const progress = buildCombatProgression(state({
    nextEvent: { kind: "normal-opportunity", initiative: 7, characterIds: [-1], canAdvance: false },
    declarations: [declaration({ timing: { status: "active", startInitiative: 11, remainingInitiativeCost: 9 } })],
  }));
  assert.deepEqual(progress.actingParticipantIds, [-1]);
});
test("the table advances to the next event before acting at a lower Initiative", () => {
  const progress = buildCombatProgression(state({ nextEvent: { kind: "normal-opportunity", initiative: 3, characterIds: [-1], canAdvance: true } }));
  assert.equal(progress.canAdvanceTime, true);
  assert.deepEqual(progress.actingParticipantIds, []);
});
test("finished and cancelled exchanges do not block the next opportunity", () => {
  for (const status of ["resolved", "cancelled", "abandoned"]) {
    assert.deepEqual(buildCombatProgression(state({ declarations: [declaration({ status })] })).actingParticipantIds, [10, -1]);
  }
});
test("round changes remain explicit and cannot skip a missing roll", () => {
  assert.equal(buildCombatProgression(state({ nextEvent: null, canAdvanceRound: true })).canStartRound, true);
  assert.equal(buildCombatProgression(state({ nextEvent: null, canAdvanceRound: true, declarations: [declaration()] })).canStartRound, false);
});
test("closed and uninitialized encounters never present a live roll or action", () => {
  assert.equal(buildCombatProgression(state({ runtimeStatus: "closed", declarations: [declaration()] })).tasks[0].kind, "closed");
  assert.equal(buildCombatProgression(state({ runtimeStatus: "not-initialized" })).tasks[0].kind, "start");
});
