import assert from "node:assert/strict";
import test from "node:test";

import type { ActionDeclarationWorkspaceView } from "./action-declaration-service";
import { projectActionDeclarationWorkspaceForPlayer } from "./player-action-declaration-projection";
import { captureSubmittedAttempt, retrySubmittedAttempt } from "./submitted-attempt";

test("Player declaration projection keeps permitted target anatomy but removes opponent combat sources", () => {
  const workspace = {
    context: { campaignId: 1, sessionId: 2, sceneId: 3, encounterId: 4 },
    runtime: { roundNumber: 1, stepNumber: 2, timelineInitiative: 11 },
    participants: [
      {
        characterId: 7,
        name: "Player",
        currentInitiative: 11,
        participationStatus: "active",
        hasActiveAction: false,
        choiceOwner: "player",
        weapons: [{ ownershipKey: "stack:5", itemId: 5, instanceId: null, name: "Sword", initiativeCost: 4, firingModes: [] }],
        movementModes: [{ movementMode: "Walk", baseMovement: 5, normalTotalInitiative: 11 }],
        hitLocations: [{ result: 1, name: "Arm", poolKey: null }],
        creatureAttacks: [],
      },
      {
        characterId: -12,
        name: "Wyvern",
        currentInitiative: 9,
        participationStatus: "active",
        hasActiveAction: false,
        choiceOwner: "god",
        weapons: [],
        movementModes: [{ movementMode: "Fly", baseMovement: 30, normalTotalInitiative: 15 }],
        hitLocations: [{ result: 4, name: "Wing", poolKey: "wings" }],
        creatureAttacks: [{ canonicalId: "sting", attackName: "Sting", attackPercentage: 75, damage: "12", initiativeCost: 4 }],
      },
    ],
    declarations: [{
      id: 22,
      actorCharacterId: -12,
      actorName: "Wyvern",
      pendingActionId: 31,
      supersedesDeclarationId: null,
      status: "locked",
      versionNumber: 1,
      draft: {
        actorCharacterId: -12,
        targetCharacterIds: [7],
        label: "Sting the Player",
        actionKind: "creature-attack",
        sourceKind: "creature-attack",
        sourceRef: "sting",
        sourceInstanceId: 401,
        sourcePayload: { privateDamage: "12" },
        weaponItemId: 88,
        firingModeId: 99,
        explicitModifiers: [{ label: "hidden", amount: 10 }],
        godNotes: "private tactics",
      },
      lockedSnapshot: {
        source: { kind: "creature-attack", ref: "sting", instanceId: 401, payload: { privateDamage: "12" } },
        weapon: { itemId: 88, firingModeId: 99 },
        governing: { source: { originalTarget: 75 } },
        authoredSource: { damage: "12" },
        explicitModifiers: [{ label: "hidden", amount: 10 }],
        godNotes: "private tactics",
        authorUserId: "god-user",
        lockedByUserId: "god-user",
      },
      timing: null,
      window: null,
      opportunities: [],
      rollState: { attackRollId: null, missingResponseRolls: 0, resolved: false, message: "Waiting." },
      events: [{ id: 1, actorUserId: "god-user", reason: "private", eventKind: "locked" }],
      rulingReason: "private ruling",
      rulingNotes: "private note",
      createdAt: "2026-09-06T00:00:00.000Z",
      lockedAt: "2026-09-06T00:00:00.000Z",
      committedAt: null,
      endedAt: null,
    }],
    run: [],
  } as unknown as ActionDeclarationWorkspaceView;

  const projected = projectActionDeclarationWorkspaceForPlayer(workspace, 7);
  const player = projected.participants.find(({ characterId }) => characterId === 7)!;
  const opponent = projected.participants.find(({ characterId }) => characterId === -12)!;
  assert.equal(player.weapons[0]?.name, "Sword");
  assert.deepEqual(opponent.creatureAttacks, []);
  assert.deepEqual(opponent.weapons, []);
  assert.deepEqual(opponent.movementModes, []);
  assert.deepEqual(opponent.hitLocations, [{ result: 4, name: "Wing", poolKey: "wings" }]);
  assert.equal(opponent.name, "Wyvern");
  const opponentDeclaration = projected.declarations[0]!;
  assert.equal(opponentDeclaration.draft.label, "Sting the Player");
  assert.equal(opponentDeclaration.draft.sourceRef, null);
  assert.equal(opponentDeclaration.draft.sourceInstanceId, null);
  assert.equal(opponentDeclaration.draft.sourcePayload, null);
  assert.deepEqual(opponentDeclaration.draft.explicitModifiers, []);
  assert.equal(opponentDeclaration.draft.godNotes, "");
  assert.equal(opponentDeclaration.lockedSnapshot?.authoredSource, null);
  assert.equal(opponentDeclaration.lockedSnapshot?.governing, null);
  assert.deepEqual(opponentDeclaration.events, []);
  assert.equal(opponentDeclaration.rulingNotes, "");
});

test("uncertain retry reuses the complete captured attempt despite edited inputs and live timing", () => {
  const form = {
    targetParticipantId: -12,
    sourceRef: "stack:5",
    locationNumber: 4,
    intent: "Pin the left wing",
    requestedTiming: "Round 1, Initiative 11",
  };
  const captured = captureSubmittedAttempt("0123456789abcdef0123456789abcdef", "Called Shot", form);
  form.targetParticipantId = 99;
  form.intent = "Changed after the uncertain response";
  form.requestedTiming = "Round 1, Initiative 7";

  const retried = retrySubmittedAttempt(captured);
  assert.equal(retried.idempotencyKey, "0123456789abcdef0123456789abcdef");
  assert.deepEqual(retried.payload, {
    targetParticipantId: -12,
    sourceRef: "stack:5",
    locationNumber: 4,
    intent: "Pin the left wing",
    requestedTiming: "Round 1, Initiative 11",
  });
  assert.strictEqual(retried, captured);
});
