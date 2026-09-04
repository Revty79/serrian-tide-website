import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assertActionCanRoll,
  assertActionDeclarationTransition,
  buildLockedActionDeclarationSnapshot,
  calculateHasTheRun,
  calculateInterruptedActionProgress,
  deriveActionWindow,
  deriveResponderCandidates,
  initiativePositionIsInActionWindow,
  normalizeActionDeclarationDraft,
  responderOpportunitiesAreReconciled,
  type ActionDeclarationDraft,
  type LockedActionDeclarationSnapshot,
} from "./action-declaration";
import type { InitiativeParticipantState, PendingInitiativeActionState } from "./initiative-runtime";

function draft(overrides: Partial<ActionDeclarationDraft> = {}): ActionDeclarationDraft {
  return {
    actorCharacterId: 11,
    targetCharacterIds: [12],
    label: "Measured strike",
    actionKind: "attack",
    sourceKind: "weapon",
    sourceRef: "item:71",
    sourceInstanceId: 91,
    weaponItemId: 71,
    firingModeId: 31,
    attackMode: "Single",
    initiativeCost: 8,
    allowsMultiRound: false,
    heldIntervention: false,
    windowKind: "melee-overlap",
    aimDeclared: true,
    calledShot: { declared: true, label: "Weapon hand", assignedPenalty: -20 },
    explicitModifiers: [{ label: "Cover", value: -10 }],
    preparesForDeclarationId: null,
    godNotes: "Keep the fiction unresolved.",
    ...overrides,
  };
}

function snapshot(overrides: Partial<ActionDeclarationDraft> = {}): LockedActionDeclarationSnapshot {
  return buildLockedActionDeclarationSnapshot({
    draft: draft(overrides),
    context: { campaignId: 1, sessionId: 2, sceneId: 3, encounterId: 4, roundNumber: 5, stepNumber: 6 },
    weapon: { itemId: 71, weaponProfileId: 72, firingModeId: 31, attackMode: "Single" },
    governing: {
      status: "resolved",
      source: { kind: "skill", allocationId: 401, path: [101, 201, 301] },
      rollOverTarget: 63,
      explanation: "Exact canonical allocation lineage.",
    },
    authoritativeSourceRef: "instance:91",
    authorUserId: "author",
    lockedByUserId: "god",
    authoredAt: new Date("2026-09-05T12:00:00.000Z"),
    lockedAt: new Date("2026-09-05T12:01:00.000Z"),
  });
}

function participant(
  characterId: number,
  currentInitiative: number,
  participationStatus: InitiativeParticipantState["participationStatus"] = "active",
): InitiativeParticipantState {
  return {
    encounterId: 4,
    characterId,
    normalTotalInitiative: 35,
    currentInitiative,
    participationStatus,
    deferredInitiativeCost: 0,
    lastSatisfiedStep: 1,
    movementMode: "Land",
  };
}

test("declaration lifecycle permits only explicit legal transitions", () => {
  assert.doesNotThrow(() => assertActionDeclarationTransition("draft", "locked"));
  assert.doesNotThrow(() => assertActionDeclarationTransition("locked", "committed"));
  assert.doesNotThrow(() => assertActionDeclarationTransition("committed", "rolling-ready"));
  assert.doesNotThrow(() => assertActionDeclarationTransition("rolling-ready", "rolling"));
  assert.doesNotThrow(() => assertActionDeclarationTransition("rolling", "resolved"));
  assert.doesNotThrow(() => assertActionDeclarationTransition("interrupted", "committed"));
  assert.throws(() => assertActionDeclarationTransition("draft", "resolved"), /cannot transition/);
  assert.throws(() => assertActionDeclarationTransition("locked", "rolling"), /cannot transition/);
  assert.throws(() => assertActionDeclarationTransition("interrupted", "awaiting-god-ruling"), /cannot transition/);
  assert.throws(() => assertActionDeclarationTransition("resolved", "resolved"), /cannot transition/);
  assert.throws(() => assertActionDeclarationTransition("cancelled", "committed"), /cannot transition/);
});

test("locked snapshot preserves exact context, source, governing target, modes, and placeholders", () => {
  const locked = snapshot();
  assert.deepEqual(locked.context, { campaignId: 1, sessionId: 2, sceneId: 3, encounterId: 4, roundNumber: 5, stepNumber: 6 });
  assert.equal(locked.actorCharacterId, 11);
  assert.deepEqual(locked.targetCharacterIds, [12]);
  assert.deepEqual(locked.source, { kind: "weapon", ref: "instance:91", instanceId: 91 });
  assert.deepEqual(locked.weapon, { itemId: 71, weaponProfileId: 72, firingModeId: 31, attackMode: "Single" });
  assert.equal(locked.governing?.rollOverTarget, 63);
  assert.equal(locked.initiativeCost, 8);
  assert.equal(locked.aimDeclared, true);
  assert.deepEqual(locked.calledShot, { declared: true, label: "Weapon hand", assignedPenalty: -20 });
  assert.deepEqual(locked.explicitModifiers, [{ label: "Cover", value: -10 }]);
  assert.equal(locked.authorUserId, "author");
  assert.equal(locked.lockedByUserId, "god");
});

test("draft normalization edits freely but preserves explicitly supplied penalty sign", () => {
  const first = normalizeActionDeclarationDraft(draft({ label: "First" }));
  const edited = normalizeActionDeclarationDraft(draft({ label: "Edited", initiativeCost: 3 }));
  assert.equal(first.label, "First");
  assert.equal(edited.label, "Edited");
  assert.equal(edited.initiativeCost, 3);
  assert.equal(edited.calledShot.assignedPenalty, -20);
  assert.throws(() => normalizeActionDeclarationDraft(draft({ windowKind: "firearm-trigger", initiativeCost: 2 })), /exactly 1/);
});

test("ordinary Initiative windows are inclusive, preserve negative completion, and never wrap", () => {
  const window = deriveActionWindow(35, snapshot());
  assert.deepEqual(window, {
    kind: "melee-overlap",
    startInitiative: 35,
    nominalCompletionInitiative: 27,
    initiativeCost: 8,
    includesBoundaryEquality: true,
    wraps: false,
    overlapMayExtendBeyondCompletion: true,
    preparesForDeclarationId: null,
  });
  assert.equal(initiativePositionIsInActionWindow(window, 35), true);
  assert.equal(initiativePositionIsInActionWindow(window, 30), true);
  assert.equal(initiativePositionIsInActionWindow(window, 27), true);
  assert.equal(initiativePositionIsInActionWindow(window, 26), false);
  const negative = deriveActionWindow(2, snapshot({ initiativeCost: 5, windowKind: "ordinary" }));
  assert.equal(negative.nominalCompletionInitiative, -3);
  assert.equal(negative.wraps, false);
});

test("objective responder candidates exclude actor and authoritative nonparticipants without guessing fiction", () => {
  const window = deriveActionWindow(35, snapshot());
  const candidates = deriveResponderCandidates(window, 11, [
    participant(11, 35),
    participant(12, 30),
    participant(13, 27, "holding"),
    participant(14, 26),
    participant(15, 30, "passed"),
    participant(16, 30, "suspended"),
  ]);
  assert.equal(candidates.find(({ characterId }) => characterId === 11)?.included, false);
  assert.equal(candidates.find(({ characterId }) => characterId === 12)?.included, true);
  assert.equal(candidates.find(({ characterId }) => characterId === 13)?.included, true);
  assert.equal(candidates.find(({ characterId }) => characterId === 14)?.included, false);
  assert.equal(candidates.find(({ characterId }) => characterId === 15)?.included, false);
  assert.equal(candidates.find(({ characterId }) => characterId === 16)?.included, false);
  assert.equal(candidates.find(({ characterId }) => characterId === 12)?.requiresGodConfirmation, true);
});

test("one-Initiative trigger and longer preparation windows remain distinct", () => {
  const trigger = deriveActionWindow(35, snapshot({ windowKind: "firearm-trigger", initiativeCost: 1 }));
  assert.equal(trigger.nominalCompletionInitiative, 34);
  const triggerIncluded = deriveResponderCandidates(trigger, 11, [
    participant(11, 35), participant(12, 34), participant(13, 33), participant(14, 35),
  ]).filter(({ included }) => included).map(({ characterId }) => characterId);
  assert.deepEqual(triggerIncluded, [12, 14]);

  const preparation = deriveActionWindow(35, snapshot({
    windowKind: "preparation",
    initiativeCost: 12,
    sourceKind: "weapon",
    preparesForDeclarationId: 99,
  }));
  assert.equal(preparation.nominalCompletionInitiative, 23);
  assert.equal(preparation.preparesForDeclarationId, 99);
  assert.deepEqual(deriveResponderCandidates(preparation, 11, [
    participant(11, 35), participant(12, 30), participant(13, 24), participant(14, 22),
  ]).filter(({ included }) => included).map(({ characterId }) => characterId), [12, 13]);
});

test("melee admission uses the original window and records overlap without deciding an outcome", () => {
  const window = deriveActionWindow(35, snapshot({ windowKind: "melee-overlap", initiativeCost: 8 }));
  assert.equal(initiativePositionIsInActionWindow(window, 30), true);
  assert.equal(initiativePositionIsInActionWindow(window, 26), false);
  assert.equal(window.overlapMayExtendBeyondCompletion, true);
  assert.equal("winner" in window, false);
  assert.equal("damage" in window, false);
});

test("pending responder opportunities block Rolls until every opportunity is reconciled", () => {
  assert.equal(responderOpportunitiesAreReconciled([{ status: "declined" }, { status: "ineligible" }]), true);
  assert.equal(responderOpportunitiesAreReconciled([{ status: "response-declared" }, { status: "pending" }]), false);
  assert.throws(() => assertActionCanRoll("draft", []), /locked, committed/);
  assert.throws(() => assertActionCanRoll("committed", [{ status: "pending" }]), /locked, committed/);
  assert.throws(() => assertActionCanRoll("rolling-ready", [{ status: "pending" }]), /must be reconciled/);
  assert.doesNotThrow(() => assertActionCanRoll("rolling-ready", [{ status: "declined" }, { status: "ineligible" }]));
  assert.doesNotThrow(() => assertActionCanRoll("rolling", [{ status: "response-declared" }]));
});

test("interruption charges only elapsed Initiative and preserves remaining work", () => {
  assert.deepEqual(calculateInterruptedActionProgress({
    startInitiative: 25,
    interruptionInitiative: 23,
    originalInitiativeCost: 3,
  }), { initiativeSpent: 2, remainingInitiativeCost: 1, currentInitiative: 23 });
});

test("the run treats Hold, Pass, active actions, equality, and explicit rulings structurally", () => {
  const participants = [
    participant(11, 35),
    participant(12, 30, "holding"),
    participant(13, 34, "passed"),
    participant(14, 33, "suspended"),
  ];
  const run = calculateHasTheRun({ actorCharacterId: 11, participants, proposedInitiativeCost: 1 });
  assert.equal(run.hasTheRun, true);
  assert.equal(run.nearestRelevantInitiative, 30);
  assert.equal(run.maximumWindowBeforeInterference, 5);
  assert.equal(run.nextReachedParticipantId, 12);
  assert.equal(run.proposedActionPreservesRun, true);
  assert.equal(run.preservationBoundary, "exclusive");
  assert.equal(run.requiresGodJudgment, true);
  assert.equal(calculateHasTheRun({ actorCharacterId: 11, participants, proposedInitiativeCost: 5 }).proposedActionPreservesRun, false);
  assert.equal(calculateHasTheRun({ actorCharacterId: 11, participants, explicitlyIneligibleCharacterIds: [12] }).nearestRelevantInitiative, null);
  assert.equal(calculateHasTheRun({ actorCharacterId: 11, participants, exceptionalCharacterIds: [13] }).nearestRelevantInitiative, 34);

  const activeAction: Pick<PendingInitiativeActionState, "actorCharacterId" | "status"> = {
    actorCharacterId: 11,
    status: "active",
  };
  assert.equal(calculateHasTheRun({ actorCharacterId: 11, participants, pendingActions: [activeAction] }).hasTheRun, false);
});

test("Pass 6 service boundary contains no attack result, damage, health, ammunition, or condition automation", () => {
  const source = readFileSync(path.join(process.cwd(), "src/features/tabletop-operations/action-declaration-service.ts"), "utf8");
  for (const forbidden of [
    /applyEncounterDamage/,
    /healthCurrent\s*:/,
    /ammunition.*(?:consume|spend)/i,
    /create.*condition/i,
    /attackWinner|defenseWinner/,
    /resolveEncounterReaction/,
  ]) assert.doesNotMatch(source, forbidden);
});

test("migration 0025 is additive and anchors declarations to the existing Initiative runtime", () => {
  const migration = readFileSync(
    path.join(process.cwd(), "drizzle/0025_action_declaration_initiative_windows.sql"),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_action_declaration"/);
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_responder_opportunity"/);
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_action_declaration_event"/);
  assert.match(migration, /REFERENCES "public"\."campaign_session_encounter_pending_action"/);
  assert.match(migration, /REFERENCES "public"\."campaign_session_encounter_initiative_participant"/);
  assert.match(migration, /campaign_session_encounter_action_declaration_lifecycle_valid/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im);
  const alteredTables = [...migration.matchAll(/ALTER TABLE "([^"]+)"/g)].map((match) => match[1]);
  assert.ok(alteredTables.every((name) => [
    "campaign_session_encounter_action_declaration",
    "campaign_session_encounter_responder_opportunity",
    "campaign_session_encounter_action_declaration_event",
  ].includes(name!)));
});
