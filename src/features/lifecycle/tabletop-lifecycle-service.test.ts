import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const service = read("src/features/lifecycle/tabletop-lifecycle-service.ts");
const types = read("src/features/lifecycle/tabletop-lifecycle-types.ts");
const previewActions = read("src/app/heavens/tabletop/lifecycle-actions.ts");
const sessionActions = read("src/app/heavens/tabletop/actions.ts");
const sceneActions = read("src/app/heavens/tabletop/scene-actions.ts");
const encounterActions = read("src/app/heavens/tabletop/encounter-actions.ts");
const sessionCloseoutActions = read("src/app/heavens/tabletop/session-closeout-actions.ts");
const encounterCloseoutActions = read("src/app/heavens/tabletop/closeout-actions.ts");
const sessionCloseoutService = read("src/features/tabletop-operations/session-closeout-service.ts");
const encounterCloseoutService = read("src/features/tabletop-operations/encounter-closeout-service.ts");
const tabletopPage = read("src/app/heavens/tabletop/page.tsx");
const tabletopWorkspace = read("src/app/heavens/tabletop/tabletop-workspace.tsx");
const sceneWorkspace = read("src/app/heavens/tabletop/scene-workspace.tsx");
const encounterWorkspace = read("src/app/heavens/tabletop/encounter-workspace.tsx");
const sessionCloseout = read("src/app/heavens/tabletop/session-closeout.tsx");
const encounterCloseout = read("src/app/heavens/tabletop/encounter-closeout.tsx");
const lifecycleDialog = read("src/app/heavens/tabletop/lifecycle-confirmation-dialog.tsx");

test("Tabletop lifecycle preview accepts identity only and resolves actor roles from the database", () => {
  assert.match(
    previewActions,
    /previewTabletopLifecycleEntity\(\s*target: TabletopLifecycleTargetInput/,
  );
  assert.match(previewActions, /requireGodOrAdminAccessContext\(\)/);
  assert.match(previewActions, /userId: access\.session\.user\.id/);
  assert.match(previewActions, /roles: access\.roles/);
  assert.doesNotMatch(types, /ownerUserId|actorUserId|roles:/);
});

test("every Session, Scene, and Encounter lifecycle mutation uses locked owner-or-admin authorization", () => {
  for (const [source, entityKind] of [
    [sessionActions, "campaign-session"],
    [sceneActions, "scene"],
    [encounterActions, "encounter"],
  ] as const) {
    assert.match(source, /requireGodOrAdminAccessContext\(\)/);
    assert.match(
      source,
      new RegExp(`entityKind: "${entityKind}"`),
    );
    assert.match(source, /prepareTabletopLifecycleMutationInTransaction/);
    assert.match(source, /assertOwnedRootManager/);
    assert.match(source, /recordTabletopLifecycleAuditInTransaction/);
  }
  assert.match(service, /for update of t/);
  assert.match(service, /assertOwnedRootManager\(actor, root\.owner_user_id/);
});

test("completion, reopen, and deletion use durable audit action mappings", () => {
  for (const source of [sessionActions, sceneActions, encounterActions]) {
    assert.match(source, /transition === "complete" \? "archive" : "restore"/);
    assert.match(source, /"delete",\s*lifecycle\.root,\s*lifecycle\.preview/);
  }
  for (const source of [sessionCloseoutActions, encounterCloseoutActions]) {
    assert.match(source, /requireGodOrAdminAccessContext\(\)/);
    assert.match(source, /recordTabletopLifecycleAuditInTransaction/);
    assert.match(source, /"archive",\s*lifecycle\.root,\s*lifecycle\.preview/);
  }
  assert.match(service, /tx\.insert\(lifecycleAuditEvent\)/);
  assert.match(service, /dependencySummaryJson/);
});

test("closeout locks accept only a trusted server actor or the established internal user id", () => {
  for (const source of [sessionCloseoutService, encounterCloseoutService]) {
    assert.match(source, /actor: string \| LifecycleActor/);
    assert.match(source, /typeof actor === "string"/);
    assert.match(source, /assertOwnedRootManager\(actor/);
  }
});

test("the Tabletop route exposes lifecycle controls to administrators without broadening authoring mutations", () => {
  assert.match(tabletopPage, /requireGodOrAdminAccessContext\(\)/);
  assert.match(tabletopPage, /const canOperateTable = workspace\.canAuthor/);
  assert.match(tabletopPage, /canOperateTable && encounterWorkspace\?\.selectedEncounter/);
  assert.match(sessionActions, /actor\.roles\.includes\("admin"\)/);
  assert.match(sessionActions, /canAuthor: Boolean/);
  assert.match(sessionActions, /editable: canAuthor && context\.status !== "completed"/);
  assert.match(sceneActions, /assertOwnedRootManager\(actor, context\.ownerUserId, "Session"\)/);
  assert.match(encounterActions, /assertOwnedRootManager\(actor, context\.ownerUserId, "Scene"\)/);
  assert.match(tabletopWorkspace, /initialData\.canAuthor \? <button type="button" onClick=\{beginCreate\}>New Session/);
  for (const source of [sessionActions, sceneActions, encounterActions]) {
    assert.match(source, /const access = await requireGod\(\)/);
  }
});

test("the dependency preview names every Tabletop runtime and historical table", () => {
  const expectedTables = [
    "campaign_session_roster",
    "campaign_session_scene",
    "campaign_session_scene_member",
    "campaign_session_encounter",
    "campaign_session_encounter_participant",
    "campaign_session_encounter_initiative",
    "campaign_session_encounter_initiative_participant",
    "campaign_session_encounter_pending_action",
    "campaign_session_encounter_pending_action_source",
    "campaign_session_encounter_reaction",
    "campaign_session_encounter_reaction_event",
    "campaign_session_encounter_action_declaration",
    "campaign_session_encounter_action_declaration_event",
    "campaign_session_encounter_responder_opportunity",
    "campaign_session_encounter_effect_plan",
    "campaign_session_encounter_effect",
    "campaign_session_encounter_effect_plan_event",
    "campaign_session_effect_duration_binding",
    "campaign_session_encounter_reward",
    "campaign_session_roll",
    "campaign_session_roll_amendment",
    "campaign_session_called_check_batch",
    "campaign_session_called_check_request",
    "campaign_session_called_check_event",
    "campaign_session_high_low_request",
    "campaign_session_high_low_event",
    "campaign_session_player_ruling_request",
    "campaign_session_player_ruling_request_event",
    "campaign_session_encounter_firearm_attack",
    "campaign_session_encounter_firearm_bullet",
    "campaign_session_encounter_firearm_attack_event",
    "campaign_character_firearm_preparation",
    "campaign_character_firearm_event",
    "character_derived_ability_use",
    "character_derived_ability_recharge",
  ];
  for (const table of expectedTables) {
    assert.notEqual(service.indexOf(table), -1, `${table} must be inventoried`);
  }
});

test("permanent deletion is planned-only, dependency-blocked, and gated at action and service boundaries", () => {
  assert.match(service, /assertPermanentDeletionEnabled\(\)/);
  assert.match(service, /preview\.status !== "planned"/);
  assert.match(service, /blocking, count/);
  for (const source of [sessionActions, sceneActions, encounterActions]) {
    const deleteStart = source.indexOf("export async function deleteCampaignSession");
    const deletion = source.slice(deleteStart);
    assert.ok(deleteStart >= 0);
    assert.ok((deletion.match(/assertPermanentDeletionEnabled\(\)/g) ?? []).length >= 2);
    assert.match(deletion, /assertTabletopPermanentDeletionAllowed/);
  }
});

test("accessible delete dialogs render server dependency counts and disable blocked confirmation", () => {
  for (const path of [
    "src/app/heavens/tabletop/tabletop-workspace.tsx",
    "src/app/heavens/tabletop/scene-workspace.tsx",
    "src/app/heavens/tabletop/encounter-workspace.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /previewTabletopLifecycleEntity/);
    assert.match(source, /deletePreview\?\.dependencies/);
    assert.match(source, /confirmDisabled=\{!deletePreview\?\.canDelete\}/);
    assert.match(source, /useInPlaceScrollPreservation/);
  }
  assert.match(lifecycleDialog, /preview\.entityName/);
  assert.match(lifecycleDialog, /preview\.campaignName/);
  assert.match(lifecycleDialog, /preview\.ownerLabel/);
  assert.match(lifecycleDialog, /disabled=\{busy \|\| confirmDisabled\}/);
});

test("start, complete, and reopen controls use preview-backed scroll-preserving dialogs", () => {
  for (const source of [tabletopWorkspace, sceneWorkspace, encounterWorkspace]) {
    assert.match(source, /openTransitionConfirmation/);
    assert.match(source, /previewTabletopLifecycleEntity/);
    assert.match(source, /transitionPreview\?\.dependencies/);
    assert.match(source, /useInPlaceScrollPreservation/);
    assert.match(source, /<LifecycleConfirmationDialog/);
  }
  assert.match(sceneWorkspace, /openTransitionConfirmation\("complete"\)/);
  assert.match(sessionCloseout, /openConfirmation\("finalize"\)/);
  assert.match(sessionCloseout, /openConfirmation\("reopen"\)/);
  assert.match(encounterCloseout, /openFinalizeConfirmation/);
  for (const source of [sessionCloseout, encounterCloseout]) {
    assert.match(source, /previewTabletopLifecycleEntity/);
    assert.match(source, /lifecyclePreview\?\.dependencies/);
    assert.match(source, /useInPlaceScrollPreservation/);
  }
});

test("Character and NPC impact previews include every direct Tabletop participant reference", () => {
  const rootService = read("src/features/lifecycle/lifecycle-service.ts");
  for (const fragment of [
    "campaign_session_scene_member",
    "responder_character_id",
    "actor_participant_id",
    "target_participant_id",
  ]) {
    assert.notEqual(rootService.indexOf(fragment), -1, `${fragment} must be counted`);
  }
});
