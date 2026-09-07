import assert from "node:assert/strict";
import test from "node:test";

import { resolveEncounterBattleParticipantId } from "./encounter-battle-selection";

const participants = [
  { characterId: 7, choiceOwner: "player" as const, participationStatus: "active" },
  { characterId: 8, choiceOwner: "god" as const, participationStatus: "active" },
  { characterId: -3, choiceOwner: "god" as const, participationStatus: "active" },
];

test("battle actor selection preserves exact positive and negative requested participants", () => {
  assert.equal(resolveEncounterBattleParticipantId({ requestedParticipantId: 7, participants, nextEventParticipantIds: [-3] }), 7);
  assert.equal(resolveEncounterBattleParticipantId({ requestedParticipantId: -3, participants, nextEventParticipantIds: [8] }), -3);
});

test("battle actor selection has one deterministic G.O.D. fallback", () => {
  assert.equal(resolveEncounterBattleParticipantId({ requestedParticipantId: 99, participants, nextEventParticipantIds: [-3] }), -3);
  assert.equal(resolveEncounterBattleParticipantId({ requestedParticipantId: null, participants, nextEventParticipantIds: [] }), 8);
  assert.equal(resolveEncounterBattleParticipantId({ requestedParticipantId: null, participants: participants.slice(0, 1), nextEventParticipantIds: [] }), 7);
});
