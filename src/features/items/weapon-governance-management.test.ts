import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");



test("weapon Roll recording reruns Pass 4 and supplies its authoritative source to Pass 2", () => {
  const service = source("src/features/items/weapon-governance-management-service.ts");
  const action = source("src/app/heavens/tabletop/roll-actions.ts");
  const tray = source("src/app/heavens/tabletop/roll-tray.tsx");

  assert.match(service, /resolveCharacterWeaponGovernanceInTransaction/);
  assert.match(service, /assertCharacterOwnsCanonicalWeaponInTransaction/);
  assert.match(service, /governingSource: governance\.rollGoverningSource/);
  assert.match(service, /rollerCharacterId: governance\.characterId/);
  assert.match(service, /recordRollInTransaction/);
  assert.match(action, /recordGodWeaponGovernanceRollInTransaction/);
  assert.match(tray, /resolvePercentileCheck/);
  assert.match(tray, /Original target - bonuses \+ penalties = final roll-over target/);
  assert.doesNotMatch(tray, /recordGodWeaponGovernanceRoll/);
  assert.match(tray, /onClick=\{\(\) => void submit\(\)\}/);
});

test("Player governance stays read-only and allocation deletion preserves existing overrides", () => {
  const playerAction = source("src/app/realms/characters/[characterId]/weapon-governance-actions.ts");
  const playerPanel = source("src/app/realms/characters/[characterId]/player-weapon-governance-panel.tsx");
  const characterActions = source("src/app/characters/actions.ts");

  assert.match(playerAction, /requirePlayer\(\)/);
  assert.match(playerAction, /readPlayerWeaponGovernanceInTransaction/);
  assert.doesNotMatch(playerAction, /save|remove|create/i);
  assert.match(playerPanel, /Read-only/);
  assert.doesNotMatch(playerPanel, /<button|<input|<select|<textarea/);
  assert.match(characterActions, /readOverrideIdsForAllocationsInTransaction/);
  assert.match(characterActions, /The override must be removed or replaced before this allocation can be deleted/);
  assert.doesNotMatch(characterActions, /workspace=weapons/);
});

test("management code does not automate combat consequences", () => {
  const files = [
    source("src/features/items/weapon-governance-management-service.ts"),
    source("src/app/heavens/tabletop/weapon-governance-actions.ts"),
  ].join("\n");

  assert.doesNotMatch(files, /campaignCharacterActiveHealth|campaignCharacterActiveEffect/);
  assert.doesNotMatch(files, /campaignSessionEncounterInitiativeParticipant|currentInitiative/);
  assert.doesNotMatch(files, /currentCharges|consumeAmmunition|ammunition.*update/i);
  assert.doesNotMatch(files, /update\(campaignSessionEncounterPendingAction\)|update\(campaignSessionEncounterReaction\)/);
});

test("weapon governance rejects authoring against an archived Campaign", () => {
  const service = source("src/features/items/weapon-governance-management-service.ts");
  const authorizationStart = service.indexOf("async function assertCampaignOwnerGod");
  assert.notEqual(authorizationStart, -1);
  assert.match(
    service.slice(authorizationStart, authorizationStart + 900),
    /isNull\(campaign\.archivedAt\)/,
  );
});
