import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCampaignPlayerCandidates,
  canAdministerCampaign,
  canCreateCharacterForPlayer,
  getAddedCampaignPlayerSelection,
  getCampaignPlayerPanelState,
  scopeCampaignCharacters,
  type CampaignPlayerRoleRow,
} from "./campaign-membership";

const identities: CampaignPlayerRoleRow[] = [
  { userId: "player", username: "Player", displayName: "Player One", role: "player" },
  { userId: "god-player", username: "GodPlayer", displayName: "God Player", role: "god" },
  { userId: "god-player", username: "GodPlayer", displayName: "God Player", role: "player" },
  { userId: "creator", username: "revty79", displayName: "Brannan Revty", role: "admin" },
  { userId: "creator", username: "revty79", displayName: "Brannan Revty", role: "god" },
  { userId: "creator", username: "revty79", displayName: "Brannan Revty", role: "player" },
  { userId: "god-only", username: "GodOnly", displayName: "God Only", role: "god" },
];

test("Player, G.O.D. + Player, and Admin + G.O.D. + Player are eligible", () => {
  const candidates = buildCampaignPlayerCandidates(identities, [], "creator");
  assert.deepEqual(
    new Set(candidates.map(({ userId }) => userId)),
    new Set(["player", "god-player", "creator"]),
  );
});

test("Campaign creator with Player role remains eligible for their own Campaign", () => {
  const creator = buildCampaignPlayerCandidates(identities, [], "creator").find(
    ({ userId }) => userId === "creator",
  );
  assert.equal(creator?.isCampaignCreator, true);
  assert.deepEqual(creator?.roles, ["admin", "god", "player"]);
});

test("already-added Player remains visible with member state", () => {
  const player = buildCampaignPlayerCandidates(identities, ["player"], "creator").find(
    ({ userId }) => userId === "player",
  );
  assert.equal(player?.isMember, true);
});

test("a registered user without Player role is ineligible", () => {
  const candidates = buildCampaignPlayerCandidates(identities, [], "creator");
  assert.equal(candidates.some(({ userId }) => userId === "god-only"), false);
});

test("Campaign administration remains creator-only", () => {
  assert.equal(canAdministerCampaign("creator", "creator"), true);
  assert.equal(canAdministerCampaign("creator", "other-god"), false);
});

test("Character selection cannot leak across Campaigns or Players", () => {
  const characters = [
    { id: 1, campaignId: 12, playerUserId: "player" },
    { id: 2, campaignId: 12, playerUserId: "other" },
    { id: 3, campaignId: 13, playerUserId: "player" },
  ];
  assert.deepEqual(
    scopeCampaignCharacters(characters, 12, "player").map(({ id }) => id),
    [1],
  );
});

test("new Character association requires the selected Campaign member", () => {
  assert.equal(
    canCreateCharacterForPlayer({
      campaignId: 12,
      selectedCampaignId: 12,
      playerUserId: "player",
      selectedPlayerUserId: "player",
      campaignMemberUserIds: ["player"],
    }),
    true,
  );
  assert.equal(
    canCreateCharacterForPlayer({
      campaignId: 13,
      selectedCampaignId: 12,
      playerUserId: "player",
      selectedPlayerUserId: "player",
      campaignMemberUserIds: ["player"],
    }),
    false,
  );
});

test("no eligible Player profiles stays an inline empty panel state", () => {
  assert.equal(
    getCampaignPlayerPanelState({ loading: false, error: "", candidateCount: 0 }),
    "empty",
  );
});

test("successful membership refresh selects the newly-added Player", () => {
  assert.equal(
    getAddedCampaignPlayerSelection(
      {
        players: [{ userId: "creator" }],
        candidates: [{ userId: "creator", isMember: true }],
      },
      "creator",
    ),
    "creator",
  );
});
