import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEncounterCloseoutBlockers,
  getSuggestedCreatureXpTotal,
  normalizeExperienceAwards,
  parseCreatureKillXpSuggestion,
  splitSuggestedExperience,
} from "./encounter-closeout";

test("closeout reports every objective unresolved runtime blocker", () => {
  const blockers = buildEncounterCloseoutBlockers({
    initiativeStatus: "active",
    actionDeclarations: [
      { status: "rolling-ready", label: "Declared strike", actorCharacterId: 1 },
      { status: "resolved", label: "Resolved declaration", actorCharacterId: 3 },
    ],
    pendingActions: [
      { status: "active", label: "Joren attacks", actorCharacterId: 1 },
      { status: "interrupted", label: "Mara casts", actorCharacterId: 2 },
      { status: "completed", label: "Historical action", actorCharacterId: 3 },
      { status: "ended", label: "Ended action", actorCharacterId: 4 },
    ],
    authoredActions: [
      { resolutionStatus: "pending", label: "Flame", sourceCharacterId: 1 },
      { resolutionStatus: "needs-ruling", label: "Ambiguous item", sourceCharacterId: 2 },
      { resolutionStatus: "resolved", label: "Resolved attack", sourceCharacterId: 3 },
      { resolutionStatus: "cancelled", label: "Cancelled attack", sourceCharacterId: 4 },
    ],
    reactions: [
      { status: "declared", reactionType: "Dodge", reactorCharacterId: 1 },
      { status: "needs-ruling", reactionType: "Parry", reactorCharacterId: 2 },
      { status: "resolved", reactionType: "Block", reactorCharacterId: 3 },
      { status: "cancelled", reactionType: "Dodge", reactorCharacterId: 4 },
    ],
  });
  assert.deepEqual(blockers.map(({ code }) => code), [
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

test("completed/ended history permits closeout once explicit rulings are complete", () => {
  assert.deepEqual(buildEncounterCloseoutBlockers({
    initiativeStatus: "closed",
    actionDeclarations: [
      { status: "resolved", label: "Resolved", actorCharacterId: 1 },
      { status: "cancelled", label: "Cancelled", actorCharacterId: 2 },
      { status: "abandoned", label: "Abandoned", actorCharacterId: 3 },
    ],
    pendingActions: [
      { status: "completed", label: "Complete", actorCharacterId: 1 },
      { status: "abandoned", label: "Abandoned", actorCharacterId: 2 },
      { status: "ended", label: "Ended", actorCharacterId: 3 },
    ],
    authoredActions: [
      { resolutionStatus: "resolved", label: "Resolved", sourceCharacterId: 1 },
      { resolutionStatus: "cancelled", label: "Cancelled", sourceCharacterId: 2 },
    ],
    reactions: [
      { status: "resolved", reactionType: "Dodge", reactorCharacterId: 1 },
      { status: "cancelled", reactionType: "Block", reactorCharacterId: 2 },
    ],
  }), []);
});

test("XP normalization accepts explicit nonnegative whole values and omits zero", () => {
  assert.deepEqual(normalizeExperienceAwards([
    { characterId: 8, amount: 35 },
    { characterId: 9, amount: 0 },
  ]), [{ characterId: 8, amount: 35 }]);
  assert.throws(() => normalizeExperienceAwards([{ characterId: 8, amount: -1 }]), /nonnegative whole/);
  assert.throws(() => normalizeExperienceAwards([{ characterId: 8, amount: 2.5 }]), /nonnegative whole/);
  assert.throws(() => normalizeExperienceAwards([{ characterId: 0, amount: 1 }]), /valid Character/);
  assert.throws(() => normalizeExperienceAwards([
    { characterId: 8, amount: 1 },
    { characterId: 8, amount: 2 },
  ]), /only once/);
});

test("Creature authored killXp is an optional suggestion and no CR fallback exists", () => {
  assert.equal(parseCreatureKillXpSuggestion(JSON.stringify({ core: { killXp: 20, challengeRating: 99 } })), 20);
  assert.equal(parseCreatureKillXpSuggestion(JSON.stringify({ core: { challengeRating: 99 } })), null);
  assert.equal(parseCreatureKillXpSuggestion(JSON.stringify({ core: { killXp: "20" } })), null);
  assert.equal(parseCreatureKillXpSuggestion("not json"), null);
  const candidates = [
    { characterId: 1, suggestedXp: 20 },
    { characterId: 2, suggestedXp: 20 },
    { characterId: 3, suggestedXp: null },
  ];
  assert.equal(getSuggestedCreatureXpTotal(candidates, []), 0);
  assert.equal(getSuggestedCreatureXpTotal(candidates, [1, 2]), 40);
  assert.equal(getSuggestedCreatureXpTotal(candidates, [1, 3]), 20);
});

test("split helper preserves exact arithmetic without hidden rounding", () => {
  assert.equal(splitSuggestedExperience(40, 2), 20);
  assert.equal(splitSuggestedExperience(40, 3), 40 / 3);
  assert.equal(splitSuggestedExperience(0, 2), 0);
  assert.equal(splitSuggestedExperience(20, 0), null);
  assert.throws(() => splitSuggestedExperience(-1, 2), /nonnegative finite/);
});
