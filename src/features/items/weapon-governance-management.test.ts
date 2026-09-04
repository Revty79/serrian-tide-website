import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("Character weapon governance is embedded in G.O.D. Tabletop without duplicating canonical authoring", () => {
  const page = source("src/app/heavens/tabletop/page.tsx");
  const tabletop = source("src/app/heavens/tabletop/tabletop-workspace.tsx");
  const workspace = source("src/app/heavens/tabletop/weapon-governance-workspace.tsx");

  assert.match(page, /getGodWeaponGovernanceWorkspace/);
  assert.match(tabletop, /WeaponGovernanceWorkspace/);
  assert.match(tabletop, />Weapon Governance</);
  assert.match(workspace, /CANONICAL PATH REVIEW/);
  assert.match(workspace, /canonical mapping for everyone in/);
  assert.match(workspace, /href=\{view\.selectedWeapon\.catalogScope === "equipment" \? "\/heavens\/equipment" : "\/heavens\/inventory"\}/);
  assert.doesNotMatch(workspace, /saveWeaponSkillGovernance|weaponSkillPathMapping/);
});

test("the G.O.D. workflow exposes exact resolution, explicit override lifetimes, and no automatic Roll", () => {
  const workspace = source("src/app/heavens/tabletop/weapon-governance-workspace.tsx");

  assert.match(workspace, /Complete root-to-endpoint|rootToEndpoint/);
  assert.match(workspace, /Deepest result:/);
  assert.match(workspace, /Equal best targets remain visible/);
  assert.match(workspace, /Save Persistent Override/);
  assert.match(workspace, /Replace Override/);
  assert.match(workspace, /Remove Override/);
  assert.match(workspace, /Override invalid:/);
  assert.match(workspace, /normal alternative above is not silently used/i);
  assert.match(workspace, /Preview One-Action Ruling/);
  assert.match(workspace, /Prepare This Roll/);
  assert.match(workspace, /This weapon has no approved governing Skill path\. The program will not guess\./);
  assert.doesNotMatch(workspace, /recordGodWeaponGovernanceRoll/);
});

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
  assert.match(tray, /The server reruns weapon governance when this Roll is recorded/);
  assert.match(tray, /onClick=\{\(\) => void submit\(\)\}/);
});

test("Player governance is read-only and exact allocation deletion returns a domain route", () => {
  const playerAction = source("src/app/realms/characters/[characterId]/weapon-governance-actions.ts");
  const playerPanel = source("src/app/realms/characters/[characterId]/player-weapon-governance-panel.tsx");
  const characterActions = source("src/app/characters/actions.ts");

  assert.match(playerAction, /requirePlayer\(\)/);
  assert.match(playerAction, /readPlayerWeaponGovernanceInTransaction/);
  assert.doesNotMatch(playerAction, /save|remove|create/i);
  assert.match(playerPanel, /Read-only/);
  assert.doesNotMatch(playerPanel, /<button|<input|<select|<textarea/);
  assert.match(characterActions, /readOverrideIdsForAllocationsInTransaction/);
  assert.match(characterActions, /Remove or replace that override in G\.O\.D\. Tabletop before deleting the allocation/);
  assert.match(characterActions, /workspace=weapons&weaponCharacter=/);
});

test("management code does not automate combat consequences", () => {
  const files = [
    source("src/features/items/weapon-governance-management-service.ts"),
    source("src/app/heavens/tabletop/weapon-governance-actions.ts"),
    source("src/app/heavens/tabletop/weapon-governance-workspace.tsx"),
  ].join("\n");

  assert.doesNotMatch(files, /campaignCharacterActiveHealth|campaignCharacterActiveEffect/);
  assert.doesNotMatch(files, /campaignSessionEncounterInitiativeParticipant|currentInitiative/);
  assert.doesNotMatch(files, /currentCharges|consumeAmmunition|ammunition.*update/i);
  assert.doesNotMatch(files, /update\(campaignSessionEncounterPendingAction\)|update\(campaignSessionEncounterReaction\)/);
});
