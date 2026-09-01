import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  authorizePlayerCharacterDeletion,
  type PlayerCharacterDeletionContext,
} from "./character-deletion";

const actionsSource = readFileSync("src/app/characters/actions.ts", "utf8");
const actionStart = actionsSource.indexOf(
  "export async function deleteCharacterAsGod(",
);
const actionEnd = actionsSource.indexOf(
  "export async function createRaceNpc(",
  actionStart,
);
const actionSource = actionsSource.slice(actionStart, actionEnd);
const schemaSource = readFileSync("src/db/realm-schema.ts", "utf8");

function characterContext(
  values: Partial<PlayerCharacterDeletionContext> = {},
): PlayerCharacterDeletionContext {
  return {
    id: 17,
    campaignId: 4,
    name: "Neris",
    isNpc: false,
    campaignOwnerUserId: "god-owner",
    ...values,
  };
}

function schemaBlock(tableName: string) {
  const start = schemaSource.indexOf(`export const ${tableName} =`);
  const end = schemaSource.indexOf("export const ", start + 1);
  assert.ok(start >= 0, `${tableName} was not found in realm-schema.ts`);
  return schemaSource.slice(start, end < 0 ? undefined : end);
}

test("the owning G.O.D. is authorized before one player Character root is deleted", () => {
  assert.deepEqual(
    authorizePlayerCharacterDeletion(characterContext(), "god-owner"),
    characterContext(),
  );
  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  assert.match(actionSource, /const session = await requireGod\(\)/);
  assert.match(actionSource, /campaignId: campaignCharacter\.campaignId/);
  assert.match(actionSource, /campaignOwnerUserId: campaign\.createdByUserId/);
  assert.match(actionSource, /isNpc: campaignCharacter\.isNpc/);
  assert.match(actionSource, /\.delete\(campaignCharacter\)/);
  assert.ok(
    actionSource.indexOf("authorizePlayerCharacterDeletion(") <
      actionSource.indexOf(".delete(campaignCharacter)"),
  );
});

test("every normal player Character-owned table cascades from campaign_character", () => {
  for (const tableName of [
    "campaignCharacterProfile",
    "campaignCharacterAttribute",
    "campaignCharacterSkillAllocation",
    "campaignCharacterCurrencyHolding",
    "campaignCharacterItem",
    "campaignCharacterItemInstance",
    "campaignCharacterSpellDocument",
  ]) {
    assert.match(
      schemaBlock(tableName),
      /references\(\(\) => campaignCharacter\.id, \{ onDelete: "cascade" \}\)/,
      `${tableName} must cascade from the Character root`,
    );
  }
  assert.match(
    schemaBlock("campaignCharacterSkillAllocation"),
    /campaign_character_skill_allocation_parent_fk[\s\S]*?\.onDelete\("cascade"\)/,
  );
});

test("deleting a Character does not delete its Campaign", () => {
  assert.doesNotMatch(actionSource, /\.delete\(campaign\)/);
  assert.equal((actionSource.match(/\.delete\(/g) ?? []).length, 1);
});

test("deleting a Character does not delete the Player account or Campaign membership", () => {
  assert.doesNotMatch(actionSource, /\.delete\(user\)/);
  assert.doesNotMatch(actionSource, /\.delete\(campaignPlayer\)/);
});

test("deleting a Character does not delete shared Race, Skill, Item, or Creature masters", () => {
  assert.doesNotMatch(actionSource, /\.delete\(race\)/);
  assert.doesNotMatch(actionSource, /\.delete\(skill\)/);
  assert.doesNotMatch(actionSource, /\.delete\(item\)/);
  assert.doesNotMatch(actionSource, /\.delete\(creature\)/);
});

test("another G.O.D. is rejected and failed authorization leaves all records untouched", () => {
  const records = {
    characters: [17],
    profiles: [17],
    memberships: ["4:player-1"],
    campaigns: [4],
  };
  const before = structuredClone(records);

  assert.throws(() => {
    authorizePlayerCharacterDeletion(characterContext(), "other-god");
    records.characters = records.characters.filter((id) => id !== 17);
    records.profiles = records.profiles.filter((id) => id !== 17);
  }, /one of your Campaigns/);
  assert.deepEqual(records, before);
});

test("Players cannot invoke the G.O.D.-only delete action", () => {
  assert.match(actionSource, /const session = await requireGod\(\)/);
  assert.doesNotMatch(actionSource, /requirePlayer\(/);
  assert.match(
    readFileSync("src/lib/server-access.ts", "utf8"),
    /export function requireGod\(\) \{\s*return requireRole\("god"\)/,
  );
});

test("the player Character delete workflow rejects NPCs", () => {
  assert.throws(
    () => authorizePlayerCharacterDeletion(
      characterContext({ isNpc: true }),
      "god-owner",
    ),
    /player Character/,
  );
  assert.match(actionSource, /eq\(campaignCharacter\.isNpc, false\)/);
});

test("the Heavens control requires confirmation and refreshes without clearing Campaign or Player", () => {
  const uiSource = readFileSync(
    "src/app/heavens/heavens-campaign-control.tsx",
    "utf8",
  );
  const deleteFlowStart = uiSource.indexOf(
    "async function permanentlyDeleteCharacter()",
  );
  const deleteFlowEnd = uiSource.indexOf("\n  return (", deleteFlowStart);
  const deleteFlow = uiSource.slice(deleteFlowStart, deleteFlowEnd);

  assert.match(
    uiSource,
    /selectedCharacter \? <button[\s\S]*?>Delete Character<\/button>/,
  );
  assert.match(uiSource, /Permanently delete \{selectedCharacter\.name\}\?/);
  assert.match(uiSource, />Character<\/dt>/);
  assert.match(uiSource, />Player<\/dt>/);
  assert.match(uiSource, />Campaign<\/dt>/);
  assert.match(uiSource, /This cannot be undone\./);
  assert.match(uiSource, />Cancel<\/button>/);
  assert.match(uiSource, /Permanently Delete Character/);
  assert.match(deleteFlow, /await deleteCharacterAsGod\(selectedCharacter\.id\)/);
  assert.match(deleteFlow, /setCharacterId\(""\)/);
  assert.match(deleteFlow, /await getCampaignMembers\(Number\(campaignId\)\)/);
  assert.doesNotMatch(deleteFlow, /setCampaignId\(/);
  assert.doesNotMatch(deleteFlow, /setPlayerId\(/);
});

test("successful deletion revalidates Heavens and Realms Character paths", () => {
  assert.match(actionSource, /revalidatePath\("\/heavens"\)/);
  assert.match(actionSource, /revalidatePath\(`\/heavens\/characters\/\$\{deleted\.id\}`\)/);
  assert.match(actionSource, /revalidatePath\("\/realms"\)/);
  assert.match(actionSource, /revalidatePath\(`\/realms\/characters\/\$\{deleted\.id\}`\)/);
});
