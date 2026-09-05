import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCampaignRuntimeOperator,
  canManageCampaignRecords,
  canMutateActiveHealth,
  canOperateCampaignState,
  canReadActiveState,
} from "./authorization";

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

test("administrator can read active state and manage records site-wide without live mutation authority", () => {
  const admin = { userId: "admin-one", roles: ["admin"] };
  assert.equal(canManageCampaignRecords(admin, "god-one"), true);
  assert.equal(canOperateCampaignState(admin, "god-one"), false);
  assert.equal(canReadActiveState(admin, pc), true);
  assert.equal(canReadActiveState(admin, { ...pc, isNpc: true }), true);
  assert.equal(canMutateActiveHealth(admin, pc), false);
  assert.equal(canMutateActiveHealth(admin, { ...pc, isNpc: true }), false);
});

test("normal G.O.D. campaign management remains owner-scoped", () => {
  assert.equal(canManageCampaignRecords({ userId: "god-one", roles: ["god"] }, "god-one"), true);
  assert.equal(canManageCampaignRecords({ userId: "god-two", roles: ["god"] }, "god-one"), false);
  assert.equal(canOperateCampaignState({ userId: "god-one", roles: ["god"] }, "god-one"), true);
  assert.equal(canOperateCampaignState({ userId: "god-two", roles: ["god"] }, "god-one"), false);
});

test("live Campaign operation requires the owning G.O.D. even when the caller is an administrator", () => {
  assert.doesNotThrow(() => assertCampaignRuntimeOperator(
    { userId: "god-one", roles: ["god"] },
    "god-one",
    "Session",
  ));
  assert.throws(() => assertCampaignRuntimeOperator(
    { userId: "admin-one", roles: ["admin"] },
    "god-one",
    "Session",
  ), /Only the Campaign-owning G\.O\.D\. can operate live Session state/);
  assert.throws(() => assertCampaignRuntimeOperator(
    { userId: "admin-one", roles: ["admin", "god"] },
    "god-one",
    "Encounter closeout",
  ), /Only the Campaign-owning G\.O\.D\. can operate live Encounter closeout state/);
  assert.doesNotThrow(() => assertCampaignRuntimeOperator(
    { userId: "god-one", roles: ["admin", "god"] },
    "god-one",
    "Encounter closeout",
  ));
});

test("an administrator with an independently authorized Player role keeps only that Player authority", () => {
  const adminPlayer = { userId: "player-one", roles: ["admin", "player"] };
  assert.equal(canMutateActiveHealth(adminPlayer, pc), true);
  assert.equal(canMutateActiveHealth(adminPlayer, { ...pc, isNpc: true }), false);
});
