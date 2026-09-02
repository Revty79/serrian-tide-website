import assert from "node:assert/strict";
import { test } from "node:test";

import {
  derivePlayerEncounterNotifications,
  type PlayerEncounterUiSnapshot,
} from "./player-encounter-notifications";

function snapshot(overrides: Partial<PlayerEncounterUiSnapshot> = {}): PlayerEncounterUiSnapshot {
  return {
    encounterId: 11,
    encounterTitle: "Bridge Ambush",
    characterId: 21,
    totalDamage: 0,
    remainingHealth: 40,
    currentInitiative: 18,
    participationStatus: "active",
    hasActionOpportunity: false,
    pendingAction: null,
    reactionActions: [],
    mana: [{ system: "Spellcraft", current: 6 }],
    conditions: [],
    modifiers: [],
    injuries: [],
    ownRolls: [],
    ...overrides,
  };
}

test("Player alerts report objective Damage and authorized Health changes without interpretation", () => {
  const alerts = derivePlayerEncounterNotifications(snapshot(), snapshot({ totalDamage: 10, remainingHealth: 30 }));
  assert.deepEqual(alerts[0], {
    priority: "critical",
    title: "YOU TOOK 10 DAMAGE",
    detail: "Total Damage is now 10. Health: 40 to 30.",
  });
  assert.doesNotMatch(JSON.stringify(alerts), /badly wounded|should|kill|potion/i);
});

test("Reaction and action opportunities become prominent alerts from authorized Initiative summaries", () => {
  const reaction = derivePlayerEncounterNotifications(snapshot(), snapshot({
    reactionActions: [{ id: 7, actorName: "Wolf", label: "Bite" }],
  }));
  assert.deepEqual(reaction[0], {
    priority: "critical",
    title: "REACTION AVAILABLE",
    detail: "Wolf is using Bite.",
  });
  const action = derivePlayerEncounterNotifications(snapshot(), snapshot({ hasActionOpportunity: true, currentInitiative: 22 }));
  assert.equal(action[0]?.title, "YOUR ACTION IS READY");
  assert.match(action[0]?.detail ?? "", /Initiative 22/);
});

test("conditions, modifiers, Mana, Rolls, and pending Actions use bounded objective priorities", () => {
  const alerts = derivePlayerEncounterNotifications(snapshot(), snapshot({
    pendingAction: { id: 5, label: "Longsword Attack" },
    conditions: [{ id: 1, name: "Stunned" }],
    modifiers: [{ id: 2, label: "Shielded" }],
    mana: [{ system: "Spellcraft", current: 2 }],
    ownRolls: [{ id: 3, label: "Attack", result: 73 }],
  }));
  assert.deepEqual(alerts.map(({ title, priority }) => [title, priority]), [
    ["ACTION IN PROGRESS", "important"],
    ["CONDITION ADDED", "important"],
    ["MODIFIER ADDED", "important"],
    ["MANA CHANGED", "informational"],
    ["ROLL RECORDED", "informational"],
  ]);
});

test("an active Player snapshot disappearing yields an objective Encounter-ended alert", () => {
  assert.deepEqual(derivePlayerEncounterNotifications(snapshot(), null), [{
    priority: "critical",
    title: "ENCOUNTER ENDED",
    detail: "Bridge Ambush is no longer active for this Character.",
  }]);
  assert.deepEqual(derivePlayerEncounterNotifications(null, null), []);
});
