import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("unified NPC creation validates an active allowed Race or an active Creature master", () => {
  const actions = read("src/app/heavens/npcs/actions.ts");
  assert.match(actions, /export async function createNpc\(/);
  assert.match(actions, /normalizeCreateNpcValues\(input\)/);
  assert.match(actions, /eq\(campaignAllowedRace\.campaignId, normalized\.campaignId\)/);
  assert.match(actions, /eq\(campaignAllowedRace\.raceId, normalized\.sourceId\)/);
  assert.match(actions, /isNull\(race\.archivedAt\)/);
  assert.match(actions, /readCreatureNpcTemplateInTransaction[\s\S]*activeOnly: true/);
  assert.match(actions, /controllerUserId: manager\.campaignOwnerUserId/);
});

test("legacy Character actions cannot bypass the unified NPC creation workflow", () => {
  const characterActions = read("src/app/characters/actions.ts");
  const npcActions = read("src/app/heavens/npcs/actions.ts");
  const workspace = read("src/app/heavens/npcs/npc-workspace.tsx");

  assert.doesNotMatch(characterActions, /export async function createRaceNpc\(/);
  assert.match(npcActions, /export async function createNpc\(input: CreateNpcValues\)/);
  assert.match(npcActions, /const normalized = normalizeCreateNpcValues\(input\)/);
  assert.match(
    workspace,
    /const created = await createNpc\(\{[\s\S]*?origin: creation\.origin,[\s\S]*?buildMode: creation\.buildMode,[\s\S]*?sourceId: Number\(creation\.sourceId\),[\s\S]*?name: creation\.name,[\s\S]*?roleLabel: creation\.roleLabel,/,
  );
});

test("Creature NPC construction stores an independent full snapshot and lifecycle identity", () => {
  const service = read("src/features/creatures/creature-npc-constructor-service.ts");
  assert.match(service, /export async function readCreatureNpcTemplateInTransaction/);
  for (const source of [
    "creatureAttribute",
    "creatureMovement",
    "creatureHpPool",
    "creatureHitLocation",
    "creatureAttack",
    "creatureSkillLink",
    "creatureAbility",
    "creatureAbilityEffect",
    "creatureDefense",
    "creatureUse",
  ]) {
    assert.match(service, new RegExp(`from\\(${source}\\)`));
  }
  assert.match(service, /baselineSnapshotJson: JSON\.stringify\(snapshot\)/);
  assert.match(service, /currentSnapshotJson: JSON\.stringify\(snapshot\)/);
  assert.match(service, /npcBuildMode: input\.buildMode \?\? "detailed"/);
  assert.match(service, /npcRoleLabel: input\.roleLabel\?\.trim\(\) \?\? ""/);
});

test("simple NPC saves are compact, locked, and reject archived records", () => {
  const actions = read("src/app/heavens/npcs/actions.ts");
  const simpleSave = actions.slice(
    actions.indexOf("export async function saveSimpleNpc"),
    actions.indexOf("export async function upgradeNpcToDetailed"),
  );
  assert.match(simpleSave, /\.for\("update"\)/);
  assert.match(simpleSave, /assertNpcCanBeChanged/);
  assert.match(simpleSave, /npcRoleLabel: normalized\.roleLabel/);
  assert.match(simpleSave, /personality: normalized\.personalityDescription/);
  assert.match(simpleSave, /backstory: normalized\.notes/);
  assert.match(simpleSave, /instanceNotes: normalized\.notes/);
  assert.doesNotMatch(simpleSave, /baselineSnapshotJson|currentSnapshotJson|campaignCharacterItem/);
});

test("Simple to Detailed upgrade is in place, additive, idempotent, and never mutates NPC state", () => {
  const actions = read("src/app/heavens/npcs/actions.ts");
  const upgrade = actions.slice(
    actions.indexOf("export async function upgradeNpcToDetailed"),
    actions.indexOf("export async function getCreatureNpc"),
  );
  assert.match(upgrade, /\.for\("update"\)/);
  assert.match(upgrade, /assertNpcCanBeChanged/);
  assert.match(upgrade, /needsNpcUpgrade\(buildMode\)/);
  assert.match(upgrade, /\.onConflictDoNothing\(\)/);
  assert.match(upgrade, /npcBuildMode: "detailed"/);
  assert.doesNotMatch(upgrade, /\.delete\(|baselineSnapshotJson|currentSnapshotJson|campaignCharacterItem/);
});

test("NPC archive DTO and UI expose source, kind, build mode, status, and role-aware search", () => {
  const actions = read("src/app/heavens/npcs/actions.ts");
  const workspace = read("src/app/heavens/npcs/npc-workspace.tsx");
  assert.match(actions, /export async function listNpcArchive/);
  assert.match(actions, /raceName: race\.name/);
  assert.match(actions, /creatureName: creature\.canonicalName/);
  assert.match(actions, /isNotNull\(campaignCharacter\.archivedAt\)/);
  assert.match(workspace, /matchesNpcSearch/);
  assert.match(workspace, /Search name, role, or source/);
  assert.match(workspace, /npc\.roleLabel/);
  assert.match(workspace, /npc\.sourceName/);
  assert.match(workspace, /npc\.buildMode/);
  assert.match(workspace, /npc\.status/);
});

test("NPC dialogs, filters, compact operations, and shared lifecycle controls preserve scroll", () => {
  const workspace = read("src/app/heavens/npcs/npc-workspace.tsx");
  const creatureWorkspace = read("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx");
  assert.match(workspace, /<dialog ref=\{createDialogRef\}/);
  assert.match(workspace, /<LifecycleControls/);
  assert.match(workspace, /useInPlaceScrollPreservation\(\)/);
  assert.match(workspace, /preserveScroll\(async \(\) =>/);
  assert.match(workspace, /data-preserve-scroll="npc-archive-grid"/);
  assert.match(creatureWorkspace, /useInPlaceScrollPreservation\(\)/);
  assert.match(creatureWorkspace, /Role \/ Label/);
});

test("Detailed Race NPC editor maps and saves its separate role label and blocks archived saves", () => {
  const actions = read("src/app/characters/actions.ts");
  const editor = read("src/app/characters/character-editor.tsx");
  const raceRoute = read("src/app/heavens/characters/[characterId]/page.tsx");
  const creatureRoute = read("src/app/heavens/npcs/[npcId]/page.tsx");
  const rules = read("src/features/characters/character-rules.ts");
  assert.match(actions, /npcRoleLabel: campaignCharacter\.npcRoleLabel/);
  assert.match(actions, /npcRoleLabel: normalized\.npcRoleLabel/);
  assert.match(actions, /Archived NPCs are read-only/);
  assert.match(actions, /npcBuildMode === "simple"/);
  assert.match(rules, /npcRoleLabel: aggregate\.character\.npcRoleLabel \?\? ""/);
  assert.match(editor, /Role \/ Label · Required/);
  assert.match(editor, /archivedNpc/);
  assert.match(raceRoute, /npcBuildMode === "simple"/);
  assert.match(creatureRoute, /draft\.buildMode !== "detailed"/);
});

test("NPC management resolves Campaign owner or administrator authorization from the database", () => {
  const actions = read("src/app/heavens/npcs/actions.ts");
  const characterActions = read("src/app/characters/actions.ts");
  assert.match(actions, /requireGodOrAdminAccessContext/);
  assert.match(actions, /\.from\(userRole\)/);
  assert.match(actions, /assertOwnedRootManager/);
  assert.match(characterActions, /requireGodOrAdminAccessContext/);
  assert.match(characterActions, /assertOwnedRootManager/);
});
