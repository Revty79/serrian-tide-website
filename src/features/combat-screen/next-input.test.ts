import assert from "node:assert/strict";
import test from "node:test";
import { combatNextInput, automaticCombatInputKey, type CombatOperations } from "./next-input";
import type { CombatScreenData } from "./screen-types";
const operations = { sealed: false, plans: [], defenses: { reactions: [] }, firearms: { attacks: [] } } as unknown as CombatOperations;
function fixture() {
  return { pause: { frozen: false }, projection: { closed: false, checkpoint: null,
    progression: { canAdvanceTimeline: true, canAdvanceRound: false, reason: "Wait" },
    entities: [{ participantId: -8, name: "Cat", canControl: true, mustChooseNow: false, canRespondNow: true, responseDecisionOpportunityIds: [], currentAction: null, participation: { departed: false }, condition: { status: "able" } }],
    declarations: [
      { id: 1, actorCharacterId: 1, actorName: "Player", draft: { label: "Longsword" }, status: "awaiting-god-ruling", timing: { status: "active", remainingInitiativeCost: 4 }, opportunities: [] },
      { id: 2, actorCharacterId: -8, actorName: "Cat", draft: { label: "Bite" }, status: "rolling", timing: { status: "completed" }, opportunities: [] },
    ] } } as unknown as CombatScreenData;
}
test("the guide resolves the completed Bite, offers the Cat its next choice, and leaves an unfinished critical sword alone", () => {
  const data = fixture(), projection = data.projection!;
  assert.deepEqual(combatNextInput(data, operations), { kind: "resolve", declarationId: 2, label: "Prepare Cat's Bite result", explanation: "Timing is complete. Prepare the result report using the recorded Roll and defense." });
  projection.declarations = projection.declarations.map((entry) => entry.id === 2 ? { ...entry, status: "resolved" } : entry);
  projection.entities[0].mustChooseNow = true;
  const next = combatNextInput(data, operations);
  assert.equal(next.kind, "inspect"); assert.equal(next.label, "Cat can act now");
  projection.entities[0].mustChooseNow = false;
  assert.equal(combatNextInput(data, operations).kind, "advance");
});
test("the guide respects Freeze, all-Hold waiting, and sealed choices over result readiness", () => {
  const data = fixture(); data.pause.frozen = true;
  assert.equal(combatNextInput(data, operations).kind, "wait");
  data.pause.frozen = false;
  assert.equal(combatNextInput(data, { ...operations, sealed: true }).kind, "wait");
  data.projection!.declarations = [];
  data.projection!.progression.canAdvanceTimeline = false;
  data.projection!.entities[0].heldInterventionAvailable = true;
  assert.equal(combatNextInput(data, operations).kind, "wait");
});
test("a completed attack opens a needed response or exact ruling before offering consequence application", () => {
  const data = fixture(), action = data.projection!.declarations[1];
  data.projection!.declarations = [data.projection!.declarations[0], { ...action, opportunities: [{ id: 4, responderCharacterId: -8, responderName: "Cat", status: "pending", reactionId: null, requiresGodConfirmation: false }] as unknown as typeof action.opportunities }];
  let next = combatNextInput(data, operations);
  assert.equal(next.kind, "inspect"); assert.match(next.label, /Choose Cat's response/);
  assert.equal(next.kind === "inspect" && next.participantId, -8);
  data.projection!.declarations = [data.projection!.declarations[0], action];
  next = combatNextInput(data, { ...operations, plans: [{ id: 7, declarationId: 2, status: "requires-god-ruling", explanation: "Select the authored hit location." }] as unknown as CombatOperations["plans"] });
  assert.equal(next.kind, "inspect"); assert.equal(next.kind === "inspect" && next.planId, 7);
});

test("automatic flow keys only routine work and distinguishes a fresh event from a retry", () => {
  const next = combatNextInput(fixture(), operations);
  assert.equal(automaticCombatInputKey(next, "state-a"), "state-a:resolve:2:ordinary");
  assert.notEqual(automaticCombatInputKey(next, "state-a"), automaticCombatInputKey(next, "state-b"));
  for (const kind of ["wait", "round"] as const) assert.equal(automaticCombatInputKey({ kind, label: "", explanation: "" }, "state-a"), null);
  assert.equal(automaticCombatInputKey({ kind: "inspect", participantId: -8, focus: "response", label: "", explanation: "" }, "state-a"), null);
});
test("a reached response during an unfinished action stops automatic advancement without applying its hit", () => {
  const data = fixture();
  const action = data.projection!.declarations[0];
  data.projection!.declarations = [{ ...action, opportunities: [{ id: 4, responderCharacterId: -8, responderName: "Cat", status: "pending", reactionId: null, requiresGodConfirmation: false }] as unknown as typeof action.opportunities }];
  const next = combatNextInput(data, operations);
  assert.match(next.label, /Choose Cat's response/);
  assert.equal(automaticCombatInputKey(next, "state-a"), null);
});

test("automatic flow stops at one ordinary attack report, including when its critical needs a ruling", () => {
  for (const status of ["calculated", "requires-god-ruling"]) {
    const next = combatNextInput(fixture(), { ...operations, plans: [{ id: 7, declarationId: 2, status, sourceKind: "creature-attack", sourceSnapshot: { identity: "bite" } }] as unknown as CombatOperations["plans"] });
    assert.equal(next.kind, "review");
    assert.equal(next.kind === "review" && next.planId, 7);
    assert.equal(automaticCombatInputKey(next, "state-a"), null);
  }
});

test("a crossover offers an independent ordinary choice before an optional response", () => {
  const data = fixture();
  data.projection!.declarations = [{ ...data.projection!.declarations[0], opportunities: [{ id: 4, responderCharacterId: -8, status: "pending", reactionId: null, requiresGodConfirmation: false }] as unknown as NonNullable<CombatScreenData["projection"]>["declarations"][number]["opportunities"] }];
  data.projection!.entities[0].mustChooseNow = true;
  data.projection!.entities[0].canRespondNow = true;
  const next = combatNextInput(data, operations);
  assert.equal(next.kind, "inspect");
  assert.equal(next.kind === "inspect" && next.focus, "action");
  assert.match(next.explanation, /own legal target, Hold or Pass/);
  assert.match(next.label, /can act now/);
  assert.match(next.explanation, /can move/);
  assert.doesNotMatch(next.explanation, /confirms eligibility|Can .* respond/);
  assert.equal(automaticCombatInputKey(next, "crossing"), null);
});

test("busy actors and future candidates never demand response decisions", () => {
  const data = fixture();
  data.projection!.declarations = [{ ...data.projection!.declarations[0], opportunities: [{ id: 4, responderCharacterId: -8, status: "pending", reactionId: null, requiresGodConfirmation: false }] as unknown as NonNullable<CombatScreenData["projection"]>["declarations"][number]["opportunities"] }];
  const entity = data.projection!.entities[0];
  entity.currentAction = { declarationId: 3, label: "Bite", status: "active", originalCost: 4, elapsed: 1, remaining: 3, expectedFinish: 10 };
  assert.equal(combatNextInput(data, operations).kind, "advance");
  entity.currentAction = null;
  entity.canRespondNow = false;
  assert.equal(combatNextInput(data, operations).kind, "advance");
});

test("a matured firing portion waits for its reached response, then finishes before advancing", () => {
  const data = fixture(), action = data.projection!.declarations[0];
  data.projection!.declarations = [{ ...action, opportunities: [{ id: 4, responderCharacterId: -8, responderName: "Cat", status: "pending", reactionId: null, requiresGodConfirmation: false }] as unknown as typeof action.opportunities }];
  const firing = { ...operations, firearms: { attacks: [{ id: 9, triggerDeclarationId: action.id, firingPortionReady: true }] } } as unknown as CombatOperations;
  assert.equal(combatNextInput(data, firing).kind, "inspect");
  data.projection!.declarations = [{ ...data.projection!.declarations[0], opportunities: [] }];
  const ruling = { ...firing, defenses: { reactions: [{ declarationId: action.id, responderCharacterId: -8, status: "needs-ruling" }] } } as unknown as CombatOperations;
  assert.equal(combatNextInput(data, ruling).kind, "inspect");
  const next = combatNextInput(data, firing);
  assert.equal(next.kind, "resolve");
  assert.equal(next.kind === "resolve" && next.firearmId, 9);
  assert.equal(automaticCombatInputKey(next, "at-response"), `at-response:resolve:${action.id}:9`);
  assert.equal(combatNextInput(data, { ...firing, sealed: true }).kind, "wait");
  assert.equal(combatNextInput(data, operations).kind, "advance");
});

test("an eligible free actor chooses a normal action at a completed attack crossing before its outcome is applied", () => {
  const data = fixture(), entity = data.projection!.entities[0], action = data.projection!.declarations[1];
  entity.mustChooseNow = true;
  data.projection!.declarations = data.projection!.declarations.map((entry) => entry.id !== action.id ? entry : { ...action, opportunities: [{ id: 9, responderCharacterId: entity.participantId, responderName: entity.name,
    status: "pending", source: "initiative", reactionId: null, requiresGodConfirmation: false }] as unknown as typeof action.opportunities });
  const next = combatNextInput(data, operations);
  assert.equal(next.kind, "inspect"); assert.equal(next.kind === "inspect" && next.focus, "action");
  assert.equal(next.label, "Cat can act now");
});
