import assert from "node:assert/strict";
import test from "node:test";
import { combatActionStatus, combatScreenPrompt, type CombatEntity, type CombatScreenData } from "./screen-types";

const state = (frozen = false, closed = false) => ({ pause: { frozen }, initialized: true, projection: { closed } }) as CombatScreenData;
test("Freeze and ended combat prompts override an earlier available opportunity", () => {
  const entity = { canActNow: true, statusText: "Can choose an action now." } as CombatEntity;
  assert.match(combatScreenPrompt(state(true), entity), /paused/);
  assert.match(combatScreenPrompt(state(false, true), entity), /ended/);
});
test("prompts retain the engine's unavailable reason regardless of an Initiative tie", () => {
  const entity = { currentInitiative: 22, canActNow: false, canRespondNow: false, statusText: "No confirmed response opportunity is available now." } as CombatEntity;
  assert.equal(combatScreenPrompt(state(), entity), entity.statusText);
});
test("preparation, pending enrollment and absent selection remain distinct", () => {
  assert.match(combatScreenPrompt({ ...state(), initialized: false, projection: null }, undefined), /prepare the roster/);
  assert.match(combatScreenPrompt({ ...state(), projection: null }, undefined), /enroll your Character/);
  assert.match(combatScreenPrompt(state(), undefined), /Select a combatant/);
});

test("a Holding inspection follows the next engine event instead of asking for another ordinary choice", () => {
  const entity = { heldInterventionAvailable: true, mustChooseNow: false, statusText: "Holding Initiative; no ordinary choice is required." } as CombatEntity;
  const data = { ...state(), projection: { progression: { reason: "The G.O.D. can advance combat to the next engine event." } } } as CombatScreenData;
  assert.match(combatScreenPrompt(data, entity), /Holding.*next engine event/);
});

test("recorded Rolls distinguish unfinished timing, pending consequences and resolved outcomes", () => {
  type Action = Parameters<typeof combatActionStatus>[0];
  assert.equal(combatActionStatus({ status: "rolling", timing: { status: "active" } } as Action), "Underway");
  assert.equal(combatActionStatus({ status: "rolling", timing: { status: "completed" } } as Action), "Timing complete; result pending");
  assert.equal(combatActionStatus({ status: "awaiting-god-ruling", timing: { status: "active" } } as Action), "Underway; a G.O.D. ruling is needed");
  assert.equal(combatActionStatus({ status: "resolved", timing: { status: "completed" } } as Action), "resolved");
});
