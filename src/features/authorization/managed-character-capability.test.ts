import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveManagedCharacterAccess } from "./managed-character-capability";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("detailed Character and Creature NPC routes resolve record and runtime capabilities from the database", () => {
  const service = source("src/features/authorization/managed-character-capability-service.ts");
  const policy = source("src/features/authorization/managed-character-capability.ts");
  const characterPage = source("src/app/heavens/characters/[characterId]/page.tsx");
  const creaturePage = source("src/app/heavens/npcs/[npcId]/page.tsx");

  assert.match(service, /^import "server-only";/);
  assert.match(service, /requireGodOrAdminAccessContext\(\)/);
  assert.match(service, /\.from\(campaignCharacter\)/);
  assert.match(service, /\.innerJoin\(campaign, eq\(campaign\.id, campaignCharacter\.campaignId\)\)/);
  assert.match(service, /campaignOwnerUserId: campaign\.createdByUserId/);
  assert.match(service, /resolveManagedCharacterAccess/);
  assert.match(policy, /canManageRecord: canManageCampaignRecords\(subject, input\.campaignOwnerUserId\)/);
  assert.match(policy, /canOperateRuntime: canOperateCampaignState\(subject, input\.campaignOwnerUserId\)/);

  for (const page of [characterPage, creaturePage]) {
    assert.match(page, /getManagedCharacterCapabilities\(id\)/);
    assert.match(page, /capabilities\?\.canManageRecord/);
    assert.match(page, /canOperateRuntime=\{capabilities\.canOperateRuntime\}/);
  }
});

test("record oversight never grants foreign live-runtime authority", () => {
  assert.deepEqual(resolveManagedCharacterAccess({
    actorUserId: "admin",
    roles: ["admin"],
    campaignOwnerUserId: "owner",
  }), { canManageRecord: true, canOperateRuntime: false });

  assert.deepEqual(resolveManagedCharacterAccess({
    actorUserId: "admin-owner",
    roles: ["admin"],
    campaignOwnerUserId: "admin-owner",
  }), { canManageRecord: true, canOperateRuntime: false });

  assert.deepEqual(resolveManagedCharacterAccess({
    actorUserId: "owner",
    roles: ["god"],
    campaignOwnerUserId: "owner",
  }), { canManageRecord: true, canOperateRuntime: true });

  assert.deepEqual(resolveManagedCharacterAccess({
    actorUserId: "foreign",
    roles: ["god"],
    campaignOwnerUserId: "owner",
  }), { canManageRecord: false, canOperateRuntime: false });

  assert.deepEqual(resolveManagedCharacterAccess({
    actorUserId: "dual-role-foreign",
    roles: ["admin", "god"],
    campaignOwnerUserId: "owner",
  }), { canManageRecord: true, canOperateRuntime: false });

  assert.deepEqual(resolveManagedCharacterAccess({
    actorUserId: "player-owner",
    roles: ["player"],
    campaignOwnerUserId: "player-owner",
  }), { canManageRecord: false, canOperateRuntime: false });
});

test("foreign Admin record editors receive read-only live-state controls", () => {
  const editor = source("src/app/characters/character-editor.tsx");
  const sheet = source("src/app/characters/character-sheet.tsx");
  const creature = source("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx");
  const health = source("src/app/characters/active-health-panel.tsx");
  const effects = source("src/app/characters/active-effects-panel.tsx");
  const derived = source("src/app/characters/derived-ability-panel.tsx");

  assert.match(editor, /canOperateRuntime/);
  assert.match(editor, /Live Campaign state is read-only/);
  assert.match(sheet, /<ActiveHealthPanel[\s\S]*?disabled=\{!canOperateRuntime\}/);
  assert.match(sheet, /<ActiveManaPanel[\s\S]*?disabled=\{activeManaDisabled \|\| !canOperateRuntime\}/);
  assert.match(sheet, /<ActiveEffectsPanel[\s\S]*?disabled=\{!canOperateRuntime\}/);
  assert.match(sheet, /runtimeDisabled=\{!canOperateRuntime\}/);
  assert.match(health, /disabled\?: boolean/);
  assert.match(effects, /disabled\?: boolean/);
  assert.match(derived, /runtimeDisabled: boolean/);

  assert.match(creature, /Live Campaign state is read-only/);
  assert.match(creature, /<ActiveHealthPanel[\s\S]*?disabled=\{!canOperateRuntime\}/);
  assert.match(creature, /<ActiveEffectsPanel[\s\S]*?disabled=\{!canOperateRuntime\}/);
  assert.match(creature, /disabled=\{dirty \|\| saving \|\| !canOperateRuntime\}/);
});
