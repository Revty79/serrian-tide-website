import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CAMPAIGN_GRAPH_DELETE_STEPS } from "./campaign-delete-plan";

const serviceSource = readFileSync(
  "src/features/lifecycle/lifecycle-service.ts",
  "utf8",
);
const actionSource = readFileSync(
  "src/app/heavens/lifecycle-actions.ts",
  "utf8",
);
const accessSource = readFileSync("src/lib/server-access.ts", "utf8");

test("the public lifecycle Server Actions expose only trusted target inputs", () => {
  for (const signature of [
    /export async function previewLifecycleEntity\(\s*target: LifecycleTargetInput/,
    /export async function archiveLifecycleEntity\(\s*target: LifecycleTargetInput,\s*reason\?: string/,
    /export async function restoreLifecycleEntity\(\s*target: LifecycleTargetInput/,
    /export async function permanentlyDeleteLifecycleEntity\(\s*target: LifecycleTargetInput,\s*confirmationName\?: string/,
  ]) {
    assert.match(actionSource, signature);
  }
  assert.doesNotMatch(actionSource, /ownerUserId|dependencies:|blockers:/);
  assert.match(actionSource, /requireGodOrAdminAccessContext\(\)/);
});

test("G.O.D.-or-admin identity and roles are resolved from session and database", () => {
  const start = accessSource.indexOf(
    "export async function requireGodOrAdminAccessContext",
  );
  const block = accessSource.slice(start);
  assert.ok(start >= 0);
  assert.match(block, /loadAccessContext\(\)/);
  assert.match(block, /roles\.includes\("god"\)/);
  assert.match(block, /roles\.includes\("admin"\)/);
});

test("archive and restore lock, authorize, mutate, and audit in one transaction", () => {
  const archiveStart = serviceSource.indexOf(
    "export async function archiveLifecycleEntityForActor",
  );
  const restoreStart = serviceSource.indexOf(
    "export async function restoreLifecycleEntityForActor",
  );
  const deleteStart = serviceSource.indexOf(
    "export async function permanentlyDeleteLifecycleEntityForActor",
  );
  const archiveBlock = serviceSource.slice(archiveStart, restoreStart);
  const restoreBlock = serviceSource.slice(restoreStart, deleteStart);
  for (const block of [archiveBlock, restoreBlock]) {
    assert.match(block, /db\.transaction/);
    assert.match(block, /buildPreview\(tx, actor, target, true\)/);
    assert.match(block, /assertMutationAuthorization/);
    assert.match(block, /updateRootArchiveState/);
    assert.match(block, /recordLifecycleAudit/);
  }
});

test("Campaign archive state is synchronized to only Campaign-scoped chat rooms", () => {
  assert.match(serviceSource, /tx\.update\(chatRoom\)/);
  assert.match(serviceSource, /eq\(chatRoom\.campaignId, target\.entityId\)/);
  assert.match(serviceSource, /eq\(chatRoom\.scope, "campaign"\)/);
});

test("permanent deletion enforces recovery protection outside and inside the transaction", () => {
  const start = serviceSource.indexOf(
    "export async function permanentlyDeleteLifecycleEntityForActor",
  );
  const block = serviceSource.slice(start);
  const checks = block.match(/assertPermanentDeletionEnabled\(\)/g) ?? [];
  assert.equal(checks.length, 2);
  assert.ok(block.indexOf("assertPermanentDeletionEnabled()") < block.indexOf("db.transaction"));
  assert.ok(
    block.lastIndexOf("assertPermanentDeletionEnabled()")
      > block.indexOf("db.transaction"),
  );
});

test("fresh locked dependencies are authoritative and Campaign names are exact", () => {
  const start = serviceSource.indexOf(
    "export async function permanentlyDeleteLifecycleEntityForActor",
  );
  const block = serviceSource.slice(start);
  assert.match(block, /buildPreview\(tx, actor, target, true\)/);
  assert.match(block, /assertMutationAuthorization/);
  assert.match(block, /assertExactConfirmation\(current\.root\.name, confirmationName\)/);
  assert.match(block, /blocking && count > 0/);
  assert.match(block, /Archive it instead or resolve those references explicitly/);
});

test("Character deletion blocks immutable runtime and clears only history-free firearm state", () => {
  for (const label of [
    "Session roster references",
    "Encounter participant references",
    "Initiative and action runtime references",
    "Timed effect bindings",
    "Encounter rewards",
    "Roll history",
    "Called-check requests",
    "High-low requests",
    "Player ruling requests",
    "Firearm preparation and event history",
  ]) {
    assert.ok(serviceSource.includes(`label: \"${label}\", blocking: true`), label);
  }
  assert.match(
    serviceSource,
    /delete from campaign_character_firearm_state[\s\S]*?campaign_id = \$\{root\.campaign_id\} and character_id = \$\{target\.entityId\}/,
  );
});

test("shared library previews enumerate every protected reference family", () => {
  for (const label of [
    "Campaign allowlists",
    "Player Character and Race NPC profiles",
    "Derived child Creatures",
    "Creature NPC snapshot profiles",
    "Parent relationships",
    "Child relationships",
    "Race grants",
    "Character Skill allocations",
    "Saved Character spell documents using this framework Skill",
    "Other spell-construction Skill extensions using this framework Skill",
    "Campaign inventory authorization",
    "Character inventory stacks",
    "Firearm runtime and history",
    "Active and historical Item-sourced Conditions and Modifiers",
    "Tabletop Item action, effect-plan, and reaction history",
    "Other Derived Ability prerequisites",
    "Character ownership history",
  ]) {
    assert.ok(serviceSource.includes(label), label);
  }
  assert.match(serviceSource, /referencesFrameworkSkill/);
  assert.match(serviceSource, /extension_type = 'spell-construction'/);
  assert.match(serviceSource, /skill_id <> \$\{id\}/);
});

test("Item lifecycle counts semantic active-state and Tabletop history without active-only filters", () => {
  const start = serviceSource.indexOf("function itemDependencySpecs");
  const end = serviceSource.indexOf("function derivedAbilityDependencySpecs", start);
  const itemDependencies = serviceSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(itemDependencies, /campaign_character_active_condition where source_kind = 'item' and source_id = \$\{itemSourceId\}/);
  assert.match(itemDependencies, /campaign_character_active_modifier where source_kind = 'item' and source_id = \$\{itemSourceId\}/);
  assert.doesNotMatch(itemDependencies, /resolved_at|ended_at/);
  assert.match(itemDependencies, /campaign_session_encounter_pending_action_source where source_kind = 'item' and source_ref = \$\{itemActionSourceRef\}/);
  assert.match(itemDependencies, /campaign_session_encounter_effect_plan where source_kind = 'item' and source_id = \$\{itemSourceId\}/);
  assert.match(itemDependencies, /campaign_session_encounter_reaction where defending_item_id = \$\{id\}/);
});

test("the Campaign preview inventories every table in the explicit delete graph", () => {
  const start = serviceSource.indexOf("function campaignDependencySpecs");
  const end = serviceSource.indexOf("function characterDependencySpecs", start);
  const previewSource = serviceSource.slice(start, end);
  for (const { tableName } of CAMPAIGN_GRAPH_DELETE_STEPS) {
    assert.match(
      previewSource,
      new RegExp(`\\b${tableName}\\b`),
      `${tableName} is missing from the Campaign dependency inventory`,
    );
  }
});

test("the forced-failure seam is service-internal and absent from client actions", () => {
  assert.match(serviceSource, /LifecycleDeletionTestSeam/);
  assert.match(serviceSource, /afterCampaignDeleteStep/);
  assert.doesNotMatch(actionSource, /LifecycleDeletionTestSeam|testSeam|afterCampaignDeleteStep/);
});
