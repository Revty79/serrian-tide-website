import assert from "node:assert/strict";
import test from "node:test";

import { canMutateActiveHealth } from "./authorization";

const pc = {
  playerUserId: "player-one",
  campaignOwnerUserId: "god-one",
  isNpc: false,
  isCampaignMember: true,
};

test("Player can mutate their own Campaign Player Character", () => {
  assert.equal(canMutateActiveHealth({ userId: "player-one", roles: ["player"] }, pc), true);
});

test("Player cannot mutate another Player Character", () => {
  assert.equal(canMutateActiveHealth({ userId: "player-two", roles: ["player"] }, pc), false);
});

test("Player cannot mutate an NPC or a Character outside current membership", () => {
  assert.equal(canMutateActiveHealth(
    { userId: "player-one", roles: ["player"] },
    { ...pc, isNpc: true },
  ), false);
  assert.equal(canMutateActiveHealth(
    { userId: "player-one", roles: ["player"] },
    { ...pc, isCampaignMember: false },
  ), false);
});

test("Campaign-owning G.O.D. can mutate PCs and NPCs", () => {
  const god = { userId: "god-one", roles: ["god"] };
  assert.equal(canMutateActiveHealth(god, pc), true);
  assert.equal(canMutateActiveHealth(god, { ...pc, isNpc: true }), true);
});

test("unrelated G.O.D. cannot mutate outside their Campaign", () => {
  assert.equal(canMutateActiveHealth({ userId: "god-two", roles: ["god"] }, pc), false);
});
