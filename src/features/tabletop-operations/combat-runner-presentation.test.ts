import assert from "node:assert/strict";
import test from "node:test";
import { canControlCombatTask, selectRunnerTask, type RunnerParticipant } from "./combat-runner-presentation";
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
