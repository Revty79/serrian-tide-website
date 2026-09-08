import assert from "node:assert/strict";
import test from "node:test";

import { buildCombatRollPrompts, buildFirearmRollPrompts, selectCombatRollPrompt, type CombatRollPrompt } from "./combat-roll-prompts";

type Declaration = Parameters<typeof buildCombatRollPrompts>[0]["declarations"][number];
type Reaction = Parameters<typeof buildCombatRollPrompts>[0]["reactions"][number];
const action = (overrides: Partial<Declaration> = {}): Declaration => ({
  id: 101, actorCharacterId: 1, actorName: "Attacker", pendingActionId: 201,
  status: "rolling-ready", draft: { label: "Sword", actionKind: "attack" },
  lockedSnapshot: { label: "Sword", governing: { status: "resolved" } },
  rollState: { attackRollId: null, resolved: false, message: "Waiting for action." },
  opportunities: [], timing: { status: "completed", remainingInitiativeCost: 0 }, ...overrides,
});
const defense = (overrides: Partial<Reaction> = {}): Reaction => ({
  id: 301, declarationId: 101, responderCharacterId: 2, responderName: "Defender",
  reactionType: "dodge", rollRequired: true, rollId: null, status: "declared", ...overrides,
});
const prompts = (declarations: Declaration[], reactions: Reaction[] = [], ids = [1], manual = false) =>
  buildCombatRollPrompts({ declarations, reactions, controlledParticipantIds: ids, allowManualTarget: manual });

test("ready and in-progress actions both offer their own linked attack roll", () => {
  for (const status of ["rolling-ready", "rolling"]) {
    const result = prompts([action({ status })]);
    assert.equal(result.length, 1);
    assert.equal(result[0].ready, true);
    assert.equal(result[0].recordId, 101);
    assert.equal(result[0].kind, "attack");
  }
});
test("defenders get their roll independently of controlling or selecting the attacker", () => {
  const result = prompts([action()], [defense()], [2]);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "defense");
  assert.equal(result[0].recordId, 301);
  assert.equal(result[0].ready, true);
});
test("other players' actions and defenses are not offered", () => {
  assert.deepEqual(prompts([action()], [defense()], [3]), []);
});
test("a timing-blocked action stays visible and explains the remaining initiative", () => {
  const result = prompts([action({ status: "awaiting-window", timing: { status: "active", remainingInitiativeCost: 4 } })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].ready, false);
  assert.match(result[0].detail, /4 Initiative remains/);
});
test("outstanding defenses block the attack with a specific instruction", () => {
  const result = prompts([action({ opportunities: [{ status: "pending" }] })]);
  assert.equal(result[0].ready, false);
  assert.match(result[0].detail, /No Defense/);
});
test("already recorded or resolved attack slots never request a replacement roll", () => {
  assert.deepEqual(prompts([action({ rollState: { attackRollId: 9, resolved: false, message: "Recorded" } })]), []);
  assert.deepEqual(prompts([action({ rollState: { attackRollId: null, resolved: true, message: "Resolved" } })]), []);
});
test("recorded, declined, or finished defenses never request a replacement roll", () => {
  for (const reaction of [defense({ rollId: 9 }), defense({ rollRequired: false }), defense({ status: "resolved" })]) {
    assert.deepEqual(prompts([action()], [reaction], [2]), []);
  }
});
test("an uncommitted action or automatic action does not receive an attack roll", () => {
  assert.deepEqual(prompts([action({ pendingActionId: null })]), []);
  assert.deepEqual(prompts([action({ lockedSnapshot: { label: "Automatic", authoredSource: { resolutionMode: "automatic-no-roll" } } })]), []);
});
test("firearms use the firearm service instead of a generic declared attack roll", () => {
  assert.deepEqual(prompts([action({ draft: { label: "Pistol", actionKind: "firearm-trigger" } })]), []);
});
test("missing roll targets remain explicit; only GOD can supply the target", () => {
  const unresolved = action({ status: "awaiting-god-ruling", lockedSnapshot: { label: "Unmapped", governing: { status: "unresolved" } } });
  assert.equal(prompts([unresolved])[0].ready, false);
  assert.equal(prompts([unresolved])[0].manualTargetRequired, false);
  const god = prompts([unresolved], [], [1], true)[0];
  assert.equal(god.ready, true);
  assert.equal(god.manualTargetRequired, true);
});
const free: CombatRollPrompt = { key: "free", kind: "free", recordId: 0, label: "General", ready: true, detail: "Not an action" };
test("a waiting combat action is never silently replaced with unrelated general dice", () => {
  const waiting = prompts([action({ status: "awaiting-window" })])[0];
  assert.equal(selectCombatRollPrompt([free, waiting], null)?.key, waiting.key);
});
test("selection prefers ready combat, respects explicit general choice, and recovers from stale selection", () => {
  const ready = prompts([action()])[0];
  assert.equal(selectCombatRollPrompt([free, ready], null)?.key, ready.key);
  assert.equal(selectCombatRollPrompt([free, ready], "free")?.key, "free");
  assert.equal(selectCombatRollPrompt([free, ready], "no-longer-present")?.key, ready.key);
  assert.equal(selectCombatRollPrompt([], null), null);
});
type Shot = Parameters<typeof buildFirearmRollPrompts>[0][number];
const shot = (overrides: Partial<Shot> = {}): Shot => ({
  id: 401, actorParticipantId: 2, actorName: "Shooter", itemName: "Pistol",
  effectiveStatus: "committed", status: "committed", triggerTimingStatus: "completed",
  attackRollId: null, responderOpportunities: [], ...overrides,
});
test("firearm ownership uses the attack's actor without depending on declaration lookup", () => {
  assert.equal(buildFirearmRollPrompts([shot()], [2])[0].recordId, 401);
  assert.deepEqual(buildFirearmRollPrompts([shot()], [1]), []);
});
test("trigger commitment is explicit and is not presented as a dice roll", () => {
  const result = buildFirearmRollPrompts([shot({ effectiveStatus: "trigger-ready", status: "draft" })], [2])[0];
  assert.equal(result.kind, "firearm-trigger");
  assert.equal(result.ready, true);
});
test("firearm rolls wait visibly for shot timing and defense decisions", () => {
  for (const attack of [shot({ triggerTimingStatus: "active" }), shot({ responderOpportunities: [{ status: "pending" }] })]) {
    const result = buildFirearmRollPrompts([attack], [2])[0];
    assert.equal(result.kind, "firearm-roll");
    assert.equal(result.ready, false);
  }
});
test("firearm continuation reuses the recorded roll instead of rolling again", () => {
  assert.equal(buildFirearmRollPrompts([shot()], [2])[0].kind, "firearm-roll");
  assert.equal(buildFirearmRollPrompts([shot({ attackRollId: 44 })], [2])[0].kind, "firearm-finish");
  assert.deepEqual(buildFirearmRollPrompts([shot({ status: "resolved", effectiveStatus: "resolved" })], [2]), []);
});
