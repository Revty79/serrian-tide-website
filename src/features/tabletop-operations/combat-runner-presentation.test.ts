import assert from "node:assert/strict";
import test from "node:test";
import { canAutomaticallyProgressCombat, canControlCombatTask, selectRunnerTask, type RunnerParticipant } from "./combat-runner-presentation";
import type { CombatTask } from "./combat-progression";
const roster: RunnerParticipant[] = [
  { id: 1, name: "Hero", controlled: false, initiative: 11, status: "active", movementMode: "land", attacks: [], defendingWeapons: [] },
  { id: -2, name: "Creature", controlled: true, initiative: 11, status: "active", movementMode: "land", attacks: [], defendingWeapons: [] },
];
function task(kind: CombatTask["kind"], participantId: number, key: string): CombatTask {
  return { key, kind, participantId, declarationId: 5, recordId: 9, title: key, detail: "" };
}
test("runner selects a GOD-owned task instead of stranding the screen on a Player roll", () => {
  const tasks = [task("roll-attack", 1, "player"), task("roll-defense", -2, "creature")];
  assert.equal(selectRunnerTask(tasks, null, roster, "god")?.key, "creature");
  assert.equal(canControlCombatTask(tasks[0], roster, "god"), false);
  assert.equal(canControlCombatTask(tasks[1], roster, "god"), true);
});
test("inspection and live refresh do not silently replace an outstanding selected task", () => {
  const tasks = [task("roll-attack", 1, "player"), task("roll-defense", -2, "creature")];
  assert.equal(selectRunnerTask(tasks, "player", roster, "god")?.key, "player");
  assert.equal(selectRunnerTask(tasks.slice(1), "player", roster, "god")?.key, "creature");
  assert.equal(selectRunnerTask([], "player", roster, "god"), null);
});
test("eligibility belongs to GOD even when the pending responder is Player-controlled", () => {
  const eligibility = task("eligibility", 1, "allow");
  assert.equal(canControlCombatTask(eligibility, roster, "god"), true);
  assert.equal(canControlCombatTask(eligibility, roster, "player"), false);
  assert.equal(canControlCombatTask(task("advance-time", -2, "time"), roster, "player"), false);
});

test("G.O.D. is guided to remaining eligibility before an NPC response", () => {
  const response = task("choose-response", -2, "response:9");
  const eligibility = task("eligibility", 1, "response:10");
  assert.equal(selectRunnerTask([response, eligibility], null, roster, "god"), eligibility);
  assert.equal(selectRunnerTask([response, eligibility], response.key, roster, "god"), response);
  assert.equal(selectRunnerTask([response], eligibility.key, roster, "god"), response);
});
test("task selection cannot create a choice outside the server's current decision group", () => {
  const choice = task("choose-action", -2, "act:-2");
  assert.equal(selectRunnerTask([choice], "response:10", roster, "god"), choice);
  assert.equal(selectRunnerTask([task("roll-attack", 1, "hero")], null, [{ id: 1, controlled: true }], "player")?.key, "hero");
});
test("opening corrections or losing connectivity pauses automatic progression", () => {
  const ready = { canGovern: true, serverReady: true, paused: false, toolsOpen: false,
    busy: false, loadFailed: false, revision: "new", attemptedRevision: "old" };
  assert.equal(canAutomaticallyProgressCombat(ready), true);
  for (const patch of [{ canGovern: false }, { serverReady: false }, { paused: true },
    { toolsOpen: true }, { busy: true }, { loadFailed: true }, { revision: null }, { attemptedRevision: "new" }]) {
    assert.equal(canAutomaticallyProgressCombat({ ...ready, ...patch }), false);
  }
  assert.equal(canAutomaticallyProgressCombat({ ...ready, toolsOpen: false }), true);
});

test("a mechanical result does not hide a remaining owned roll", () => {
  const tasks = [task("apply-result", -2, "result"), task("roll-defense", -2, "roll")];
  assert.equal(canControlCombatTask(tasks[0], roster, "god"), false);
  assert.equal(selectRunnerTask(tasks, null, roster, "god")?.key, "roll");
});
test("a Player actor's ruling is still a GOD task, not a Player wait", () => {
  const ruling = task("ruling", 1, "ruling");
  assert.equal(canControlCombatTask(ruling, roster, "god"), true);
  assert.equal(canControlCombatTask(ruling, roster, "player"), false);
});
