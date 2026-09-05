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
  "export async function getCharacter(",
  actionStart,
);
const actionSource = actionsSource.slice(actionStart, actionEnd);
const schemaSource = readFileSync("src/db/realm-schema.ts", "utf8");
const lifecycleSource = readFileSync(
  "src/features/lifecycle/lifecycle-service.ts",
  "utf8",
);
const lifecycleControlsSource = readFileSync(
  "src/app/heavens/lifecycle-controls.tsx",
  "utf8",
);
const nonCampaignDeleteStart = lifecycleSource.indexOf(
  "async function deleteNonCampaignRoot(",
);
const nonCampaignDeleteEnd = lifecycleSource.indexOf(
  "export async function previewLifecycleEntityForActor(",
  nonCampaignDeleteStart,
);
const nonCampaignDeleteSource = lifecycleSource.slice(
  nonCampaignDeleteStart,
  nonCampaignDeleteEnd,
);

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

test("the Character wrapper delegates one exact player Character to the server-authorized lifecycle service", () => {
  assert.deepEqual(
    authorizePlayerCharacterDeletion(characterContext(), "god-owner"),
    characterContext(),
  );
  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  assert.match(actionSource, /requireGodOrAdminAccessContext\(\)/);
  assert.match(actionSource, /permanentlyDeleteLifecycleEntityForActor/);
  assert.match(actionSource, /entityKind: "player-character"/);
  assert.match(actionSource, /userId: session\.user\.id, roles/);
  assert.match(lifecycleSource, /assertMutationAuthorization\(actor, target, current\.root\)/);
  assert.match(lifecycleSource, /buildPreview\(tx, actor, target, true\)/);
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
  assert.equal((actionSource.match(/\.delete\(/g) ?? []).length, 0);
  assert.match(nonCampaignDeleteSource, /tx\.delete\(campaignCharacter\)/);
  assert.doesNotMatch(nonCampaignDeleteSource, /tx\.delete\(campaign\)/);
});

test("deleting a Character does not delete the Player account or Campaign membership", () => {
  assert.doesNotMatch(nonCampaignDeleteSource, /\.delete\(user\)/);
  assert.doesNotMatch(nonCampaignDeleteSource, /\.delete\(campaignPlayer\)/);
});

test("deleting a Character does not delete shared Race, Skill, Item, or Creature masters", () => {
  const characterBranch = nonCampaignDeleteSource.slice(
    nonCampaignDeleteSource.indexOf('case "player-character"'),
    nonCampaignDeleteSource.indexOf('case "race":'),
  );
  assert.match(characterBranch, /tx\.delete\(campaignCharacter\)/);
  assert.doesNotMatch(characterBranch, /\.delete\(race\)/);
  assert.doesNotMatch(characterBranch, /\.delete\(skill\)/);
  assert.doesNotMatch(characterBranch, /\.delete\(item\)/);
  assert.doesNotMatch(characterBranch, /\.delete\(creature\)/);
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
  assert.match(actionSource, /requireGodOrAdminAccessContext\(\)/);
  assert.doesNotMatch(actionSource, /requirePlayer\(/);
  assert.match(lifecycleSource, /if \(!isLifecycleActor\(actor\)\)/);
  assert.match(lifecycleSource, /G\.O\.D\. or administrator access is required/);
});

test("the player Character delete workflow rejects NPCs", () => {
  assert.throws(
    () => authorizePlayerCharacterDeletion(
      characterContext({ isNpc: true }),
      "god-owner",
    ),
    /player Character/,
  );
  assert.match(actionSource, /entityKind: "player-character"/);
  assert.match(lifecycleSource, /c\.is_npc = false/);
});

test("the Heavens control uses the shared impact dialog and refreshes without clearing Campaign or Player", () => {
  const uiSource = readFileSync(
    "src/app/heavens/heavens-campaign-control.tsx",
    "utf8",
  );
  const lifecycleFlowStart = uiSource.indexOf(
    "async function characterLifecycleCompleted(",
  );
  const lifecycleFlowEnd = uiSource.indexOf("\n\n  return (", lifecycleFlowStart);
  const lifecycleFlow = uiSource.slice(lifecycleFlowStart, lifecycleFlowEnd);

  assert.match(uiSource, /<LifecycleControls/);
  assert.match(uiSource, /entityKind: "player-character"/);
  assert.match(lifecycleControlsSource, /aria-label="Dependency summary"/);
  assert.match(lifecycleControlsSource, /Owner:/);
  assert.match(lifecycleControlsSource, /Campaign:/);
  assert.match(lifecycleControlsSource, />Cancel<\/button>/);
  assert.match(lifecycleControlsSource, /Type the exact name/);
  assert.match(lifecycleFlow, /setCharacterId\(""\)/);
  assert.match(lifecycleFlow, /await getCampaignMembers\(Number\(campaignId\)/);
  assert.doesNotMatch(lifecycleFlow, /setCampaignId\(/);
  assert.doesNotMatch(lifecycleFlow, /setPlayerId\(/);
});

test("successful deletion revalidates Heavens and Realms Character paths", () => {
  assert.match(actionSource, /revalidatePath\("\/heavens"\)/);
  assert.match(actionSource, /revalidatePath\(`\/heavens\/characters\/\$\{deleted\.entityId\}`\)/);
  assert.match(actionSource, /revalidatePath\("\/realms"\)/);
  assert.match(actionSource, /revalidatePath\(`\/realms\/characters\/\$\{deleted\.entityId\}`\)/);
});
