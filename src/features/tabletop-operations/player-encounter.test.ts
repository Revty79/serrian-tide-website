import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertPlayerEncounterCapability,
  assertPlayerRollVisibility,
  authorizePlayerEncounterActor,
  projectPlayerParticipantSummaries,
} from "./player-encounter-policy";
import {
  eventMatchesGodSubscription,
  eventMatchesPlayerSubscription,
  parseTabletopInvalidation,
} from "./tabletop-live-events";

test("Player participant projection cannot leak NPC runtime or G.O.D. preparation data", () => {
  const source = [{
    identity: { characterId: 7, name: "Hidden Beast", kindLabel: "Creature NPC" },
    initiative: {
      enrolled: true as const,
      currentInitiative: 18,
      participationStatus: "active",
      pendingAction: null,
    },
    health: { totalDamage: 99 },
    mana: { pools: [{ currentMana: 4 }] },
    equipment: { wieldedWeapons: [{ itemName: "Secret Fang" }] },
    resources: { stacks: [{ itemName: "Secret Item" }] },
    prepNotes: "ambush from the east",
    godNotes: "private ruling",
  }];
  const projected = projectPlayerParticipantSummaries(source);
  assert.deepEqual(projected, [{
    characterId: 7,
    name: "Hidden Beast",
    kindLabel: "Creature NPC",
    currentInitiative: 18,
    participationStatus: "active",
    pendingAction: null,
  }]);
  const serialized = JSON.stringify(projected);
  for (const secret of ["totalDamage", "currentMana", "Secret Fang", "Secret Item", "ambush", "private ruling"]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("Player projection accepts table Rolls and only the authorized Character's private Rolls", () => {
  assert.doesNotThrow(() => assertPlayerRollVisibility([{ visibility: "table", rollerCharacterId: 1 }], 1));
  assert.doesNotThrow(() => assertPlayerRollVisibility([{ visibility: "private", rollerCharacterId: 1 }], 1));
  assert.throws(
    () => assertPlayerRollVisibility([{ visibility: "private", rollerCharacterId: 2 }], 1),
    /private Roll history/,
  );
  assert.throws(
    () => assertPlayerRollVisibility([
      { visibility: "table", rollerCharacterId: 1 },
      { visibility: "god-only", rollerCharacterId: 1 },
    ], 1),
    /private Roll history/,
  );
});

test("Player Encounter capability is bound to the owned Character and excludes adjudication", () => {
  const actor = authorizePlayerEncounterActor({
    playerUserId: "player-a",
    campaignId: 2,
    characterId: 7,
    ownedCharacterId: 7,
  });
  assert.doesNotThrow(() => assertPlayerEncounterCapability(actor, "initiative.hold"));
  assert.doesNotThrow(() => assertPlayerEncounterCapability(actor, "action.weapon"));
  assert.equal(actor.capabilities.includes("reaction.declare"), true);
  assert.equal(actor.capabilities.some((entry: string) => entry.includes("damage") || entry.includes("resolve")), false);
  assert.throws(() => authorizePlayerEncounterActor({
    playerUserId: "player-a",
    campaignId: 2,
    characterId: 8,
    ownedCharacterId: 7,
  }), /only their own Encounter Character/);
});

test("live invalidations contain only bounded identity metadata and filter by authorization scope", () => {
  const event = parseTabletopInvalidation({
    campaignId: 2,
    sessionId: 3,
    sceneId: 4,
    encounterId: 5,
    characterIds: [7, 7],
    category: "roll",
    secretHealth: 99,
  });
  assert.deepEqual(event, {
    campaignId: 2,
    sessionId: 3,
    sceneId: 4,
    encounterId: 5,
    characterIds: [7],
    category: "roll",
  });
  assert.equal(eventMatchesGodSubscription(event!, 2), true);
  assert.equal(eventMatchesGodSubscription(event!, 9), false);
  assert.equal(eventMatchesPlayerSubscription(event!, { campaignId: 2, encounterId: 5, characterId: 7 }), true);
  assert.equal(eventMatchesPlayerSubscription(event!, { campaignId: 2, encounterId: 5, characterId: 8 }), false);
  assert.equal(eventMatchesPlayerSubscription({ ...event!, characterIds: [] }, { campaignId: 2, encounterId: 5, characterId: 8 }), true);
  assert.equal(eventMatchesPlayerSubscription({ ...event!, audience: "god-only" }, { campaignId: 2, encounterId: 5, characterId: 7 }), false);
  assert.equal(parseTabletopInvalidation({ campaignId: 2, sessionId: 3, sceneId: null, encounterId: null, characterIds: [], category: "private-state" }), null);
});
