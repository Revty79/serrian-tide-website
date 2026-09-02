import assert from "node:assert/strict";
import test from "node:test";

import { buildSessionCloseoutBlockers, buildSessionCloseoutWarnings } from "./session-closeout";

function closeoutInput() {
  return {
    scenes: [] as Array<{ id: number; title: string; status: "planned" | "active" | "completed" }>,
    encounters: [] as Array<{ id: number; sceneId: number; title: string; status: "planned" | "active" | "completed" }>,
    initiatives: [] as Array<{ encounterId: number; status: "active" | "closed" }>,
    pendingActions: [] as Array<{ encounterId: number; actorCharacterId: number; label: string; status: "active" | "interrupted" | "completed" | "abandoned" | "ended" }>,
    authoredActions: [] as Array<{ encounterId: number; sourceCharacterId: number; label: string; resolutionStatus: "pending" | "resolved" | "cancelled" | "needs-ruling" }>,
    reactions: [] as Array<{ encounterId: number; reactorCharacterId: number; reactionType: string; status: "declared" | "resolved" | "cancelled" | "needs-ruling" }>,
  };
}

test("Session closeout reports every objective unresolved runtime blocker", () => {
  const input = closeoutInput();
  input.scenes.push({ id: 1, title: "Road", status: "active" });
  input.encounters.push({ id: 2, sceneId: 1, title: "Ambush", status: "active" });
  input.initiatives.push({ encounterId: 2, status: "active" });
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

