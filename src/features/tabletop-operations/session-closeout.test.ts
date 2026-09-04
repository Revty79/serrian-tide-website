import assert from "node:assert/strict";
import test from "node:test";

import { buildSessionCloseoutBlockers, buildSessionCloseoutWarnings } from "./session-closeout";

function closeoutInput() {
  return {
    scenes: [] as Array<{ id: number; title: string; status: "planned" | "active" | "completed" }>,
    encounters: [] as Array<{ id: number; sceneId: number; title: string; status: "planned" | "active" | "completed" }>,
    initiatives: [] as Array<{ encounterId: number; status: "active" | "closed" }>,
    actionDeclarations: [] as Array<{ encounterId: number; actorCharacterId: number; label: string; status: "draft" | "locked" | "committed" | "rolling-ready" | "rolling" | "awaiting-god-ruling" | "resolved" | "cancelled" | "interrupted" | "abandoned" }>,
    pendingActions: [] as Array<{ encounterId: number; actorCharacterId: number; label: string; status: "active" | "interrupted" | "completed" | "abandoned" | "ended" }>,
    authoredActions: [] as Array<{ encounterId: number; sourceCharacterId: number; label: string; resolutionStatus: "pending" | "resolved" | "cancelled" | "needs-ruling" }>,
    reactions: [] as Array<{ encounterId: number; reactorCharacterId: number; reactionType: string; status: "declared" | "resolved" | "cancelled" | "needs-ruling" }>,
    calledChecks: [] as Array<{ sceneId: number | null; encounterId: number | null; recipientCharacterId: number; recipientName: string; purpose: string; visibility: string; issuedAt: Date }>,
    highLow: [] as Array<{ sceneId: number | null; encounterId: number | null; participantCharacterId: number | null; participantName: string | null; purpose: string; visibility: string; createdAt: Date }>,
  };
}

test("Session closeout reports every objective unresolved runtime blocker", () => {
  const input = closeoutInput();
  input.scenes.push({ id: 1, title: "Road", status: "active" });
  input.encounters.push({ id: 2, sceneId: 1, title: "Ambush", status: "active" });
  input.initiatives.push({ encounterId: 2, status: "active" });
  input.actionDeclarations.push({ encounterId: 2, actorCharacterId: 10, label: "Declared strike", status: "committed" });
  input.pendingActions.push(
    { encounterId: 2, actorCharacterId: 10, label: "Strike", status: "active" },
    { encounterId: 2, actorCharacterId: 11, label: "Spell", status: "interrupted" },
  );
  input.authoredActions.push(
    { encounterId: 2, sourceCharacterId: 10, label: "Strike", resolutionStatus: "pending" },
    { encounterId: 2, sourceCharacterId: 11, label: "Spell", resolutionStatus: "needs-ruling" },
  );
  input.reactions.push(
    { encounterId: 2, reactorCharacterId: 12, reactionType: "dodge", status: "declared" },
    { encounterId: 2, reactorCharacterId: 13, reactionType: "parry", status: "needs-ruling" },
  );
  assert.deepEqual(buildSessionCloseoutBlockers(input).map(({ code }) => code), [
    "scene-active",
    "encounter-active",
    "initiative-active",
    "action-declaration-open",
    "pending-action-active",
    "pending-action-interrupted",
    "authored-action-pending",
    "authored-action-needs-ruling",
    "reaction-declared",
    "reaction-needs-ruling",
  ]);
});

test("historical and closed runtime rows do not block Session closeout", () => {
  const input = closeoutInput();
  input.scenes.push({ id: 1, title: "Road", status: "completed" }, { id: 3, title: "Unused", status: "planned" });
  input.encounters.push({ id: 2, sceneId: 1, title: "Ambush", status: "completed" });
  input.initiatives.push({ encounterId: 2, status: "closed" });
  input.actionDeclarations.push(
    { encounterId: 2, actorCharacterId: 10, label: "Resolved declaration", status: "resolved" },
    { encounterId: 2, actorCharacterId: 11, label: "Cancelled declaration", status: "cancelled" },
    { encounterId: 2, actorCharacterId: 12, label: "Abandoned declaration", status: "abandoned" },
  );
  input.pendingActions.push({ encounterId: 2, actorCharacterId: 10, label: "Strike", status: "completed" });
  input.authoredActions.push({ encounterId: 2, sourceCharacterId: 10, label: "Strike", resolutionStatus: "resolved" });
  input.reactions.push({ encounterId: 2, reactorCharacterId: 12, reactionType: "dodge", status: "resolved" });
  assert.deepEqual(buildSessionCloseoutBlockers(input), []);
});

test("planned content and unbound durations are warnings rather than blockers", () => {
  const warnings = buildSessionCloseoutWarnings({
    plannedSceneCount: 2,
    plannedEncounterCount: 1,
    unboundDurations: [{ characterName: "Joren", effectLabel: "Shaken", durationLabel: "3 Rounds" }],
  });
  assert.deepEqual(warnings.map(({ code }) => code), ["planned-scenes", "planned-encounters", "unbound-duration"]);
  assert.match(warnings[2]!.message, /will not auto-advance and is not being guessed or cleared/);
});

test("unanswered Called Checks and High/Low are explicit closeout blockers, never automatic failures", () => {
  const input = closeoutInput();
  input.calledChecks.push({ sceneId: 1, encounterId: null, recipientCharacterId: 10, recipientName: "Joren", purpose: "Notice the wire", visibility: "private", issuedAt: new Date() });
  input.highLow.push({ sceneId: null, encounterId: null, participantCharacterId: 10, participantName: "Joren", purpose: "Choose the passage", visibility: "table", createdAt: new Date() });
  const blockers = buildSessionCloseoutBlockers(input);
  assert.deepEqual(blockers.map(({ code }) => code), ["called-check-pending", "high-low-pending"]);
  assert.match(blockers[0]!.message, /resolve or cancel/i);
  assert.doesNotMatch(blockers.map(({ message }) => message).join(" "), /automatic|failed/i);
});
