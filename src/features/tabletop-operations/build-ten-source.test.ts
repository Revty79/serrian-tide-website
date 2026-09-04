import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("migration 0012 is additive, bounded, immutable-history oriented, and hierarchy constrained", () => {
  const migration = read("drizzle/0012_tabletop_operations_roll_runtime.sql");
  assert.match(migration, /CREATE TABLE "campaign_session_roll"/);
  assert.match(migration, /campaign_session_roll_method/);
  assert.doesNotMatch(migration, /campaign_session_roll_type|roll_type|hit-location/);
  assert.match(migration, /campaign_session_roll_visibility/);
  assert.match(migration, /campaign_session_roll_purpose/);
  assert.match(migration, /campaign_session_roll_status/);
  assert.match(migration, /campaign_session_roll_result_valid/);
  assert.match(migration, /campaign_session_roll_pending_action_fk/);
  assert.match(migration, /campaign_session_roll_reaction_fk/);
  assert.match(migration, /ON DELETE restrict/g);
  assert.match(migration, /campaign_session_roll_lifecycle_valid/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM|ALTER COLUMN)\b/i);
  assert.doesNotMatch(migration, /(?:UPDATE|INSERT INTO) "campaign_character_/i);
  assert.doesNotMatch(migration, /die_count|die_sides|die_results_json|jsonb/);
});

test("the shared service owns secure generation, context validation, pagination, and visibility policy", () => {
  const service = read("src/features/tabletop-operations/roll-runtime-service.ts");
  const domain = read("src/features/tabletop-operations/roll-runtime.ts");
  const actions = read("src/app/heavens/tabletop/roll-actions.ts");
  assert.match(service, /from "node:crypto"/);
  assert.match(service, /randomInt\(/);
  assert.doesNotMatch(`${service}\n${domain}`, /Math\.random\(/);
  assert.match(domain, /randomSource\(1, 101\)/);
  assert.match(domain, /getHitLocationFromPercentile/);
  assert.match(domain, /validateRollResult\(resultTotal\) % 10/);
  assert.doesNotMatch(`${service}\n${domain}`, /hit-location|ROLL_TYPES|RollType/);
  assert.doesNotMatch(domain, /parseDiceNotation|DiceSpecification|NdM|ROLL_DICE_PRESETS/);
  assert.match(service, /recordRollInTransaction/);
  assert.match(service, /assertContextCharacters/);
  assert.match(service, /pendingActionId/);
  assert.match(service, /reactionId/);
  assert.match(service, /roundNumber/);
  assert.match(service, /readableRollVisibilities/);
  assert.match(service, /page size must be from 1 through 100/);
  assert.match(service, /\.limit\(limit \+ 1\)/);
  assert.doesNotMatch(service, /requireGod/);
  assert.match(actions, /requireGod/);
  assert.match(actions, /db\.transaction[\s\S]*recordRollInTransaction/);
});

test("Roll recording never mutates Initiative, Health, authored outcomes, Reactions, or XP", () => {
  const service = read("src/features/tabletop-operations/roll-runtime-service.ts");
  assert.doesNotMatch(service, /update\(campaignSessionEncounterInitiative\)/);
  assert.doesNotMatch(service, /update\(campaignSessionEncounterPendingAction/);
  assert.doesNotMatch(service, /update\(campaignSessionEncounterReaction/);
  assert.doesNotMatch(service, /campaignCharacterActiveHealth|campaignCharacterProfile|experience\s*:/);
  assert.equal((service.match(/\.insert\(campaignSessionRoll\)/g) ?? []).length, 1);
});

test("all G.O.D. Roll surfaces reuse one tray and quick Rolls remain explicit prefills", () => {
  const tray = read("src/app/heavens/tabletop/roll-tray.tsx");
  const ledger = read("src/app/heavens/tabletop/roll-ledger.tsx");
  const combat = read("src/app/heavens/tabletop/combat-aid-workspace.tsx");
  const operations = read("src/app/heavens/tabletop/combat-aid-operations.tsx");
  const domain = read("src/features/tabletop-operations/roll-runtime.ts");
  const percentileResolution = read("src/features/tabletop-operations/percentile-resolution.ts");
  assert.match(tray, /recordGodRoll/);
  assert.doesNotMatch(tray, /Math\.random/);
  assert.match(ledger, /<RollTray/);
  assert.match(combat, /<RollTray/);
  assert.match(operations, /Roll for Action/);
  assert.match(operations, /Roll for Reaction/);
  assert.match(operations, /pendingActionId:\s*selectedPending\.id/);
  assert.match(operations, /reactionId:\s*reaction\.id/);
  assert.match(tray, /The Roll never decides or executes an outcome/);
  assert.match(tray, /Random/);
  assert.match(tray, /Enter Physical/);
  assert.match(`${tray}\n${domain}\n${percentileResolution}`, /d100/);
  assert.doesNotMatch(`${tray}\n${domain}`, /d10.*Hit Location|hit-location.*Roll/);
  assert.match(tray, /Manual Roll-over Target/);
  assert.match(tray, /G\.O\.D\. Only/);
  assert.match(tray, /Show to Table/);
  assert.doesNotMatch(`${combat}\n${operations}`, /Math\.random|randomInt/);
  assert.doesNotMatch(tray, /d20|d12|d8|d6|d4|2d6|3d10|Custom NdM/);
  assert.match(tray, /Damage and Initiative are never rolled here/);
});

test("Session workspace exposes active table, Rolls, and Closeout without replacing existing tabs", () => {
  const workspace = read("src/app/heavens/tabletop/tabletop-workspace.tsx");
  const closeout = read("src/app/heavens/tabletop/session-closeout.tsx");
  assert.match(workspace, /Session Record[\s\S]*Roster &amp; Prep[\s\S]*Scenes[\s\S]*Rolls[\s\S]*Closeout/);
  assert.match(workspace, /ACTIVE TABLE/);
  assert.match(workspace, /<SessionRollWorkspace/);
  assert.match(workspace, /<SessionCloseout/);
  assert.match(closeout, /Finalization never heals, restores, clears, deletes, awards, or resets Character state/);
});

test("Active Table Roll navigation selects, scrolls to, and focuses the shared Roll workspace", () => {
  const workspace = read("src/app/heavens/tabletop/tabletop-workspace.tsx");
  assert.match(workspace, /function openRollWorkspace\(\)[\s\S]*setActiveTab\("rolls"\)[\s\S]*setRollNavigationRequest/);
  assert.match(workspace, /rollWorkspaceRef\.current/);
  assert.match(workspace, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(workspace, /focus\(\{ preventScroll: true \}\)/);
  assert.match(workspace, /id="session-roll-workspace"[\s\S]*tabIndex=\{-1\}/);
  assert.match(workspace, />Roll<\/button>/);
  assert.match(workspace, /onClick=\{openRollWorkspace\}>Roll/);
});

test("Roll Tray sends the complete corrected request and always exposes progress or failure", () => {
  const tray = read("src/app/heavens/tabletop/roll-tray.tsx");
  for (const field of [
    "sessionId", "sceneId", "encounterId", "rollerCharacterId", "targetCharacterId",
    "pendingActionId", "reactionId", "method", "visibility", "purposeKind",
    "enteredTotal", "label", "targetNumber", "notes",
  ]) assert.match(tray, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(tray, /rollType|ROLL_TYPES|Hit Location \/ d10/);
  assert.match(tray, /enteredTotal:\s*method === "entered" \? Number\(enteredTotal\) : null/);
  assert.match(tray, /busy \? "Recording…"/);
  assert.match(tray, /aria-busy=\{busy\}/);
  assert.match(tray, /role="status"/);
  assert.match(tray, /error instanceof Error \? error\.message/);
  assert.match(tray, /setLastRoll\(roll\)[\s\S]*onRecorded\?\.\(roll\)/);
  assert.doesNotMatch(tray, /router\.refresh\(\)/);
});

test("Session Closeout uses one locked transaction and only organizational completion", () => {
  const service = read("src/features/tabletop-operations/session-closeout-service.ts");
  const actions = read("src/app/heavens/tabletop/session-closeout-actions.ts");
  const finalizer = service.slice(service.indexOf("export async function finalizeSessionCloseoutInTransaction"));
  assert.match(service, /for\("update", \{ of: campaignSession \}\)/);
  assert.match(finalizer, /readSessionCloseoutInTransaction/);
  assert.match(finalizer, /transitionSession\([\s\S]*}, "complete"\)/);
  assert.match(finalizer, /\.update\(campaignSession\)/);
  assert.doesNotMatch(finalizer, /campaignCharacter|durationBinding|EncounterReward|campaignSessionRoll\)/);
  assert.match(actions, /db\.transaction[\s\S]*lockSessionCloseoutContextInTransaction[\s\S]*finalizeSessionCloseoutInTransaction/);
});

test("Roll history protects Session, Scene, and Encounter deletion", () => {
  for (const path of [
    "src/app/heavens/tabletop/actions.ts",
    "src/app/heavens/tabletop/scene-actions.ts",
    "src/app/heavens/tabletop/encounter-actions.ts",
  ]) {
    const source = read(path);
    assert.match(source, /campaignSessionRoll/);
    assert.match(source, /Roll history/);
  }
});

test("architecture freezes shared Roll authority and nonautomation boundaries", () => {
  const architecture = read("docs/architecture/tabletop-operations.md");
  assert.match(architecture, /Build 10 Shared Roll Runtime and Session Closeout/);
  assert.match(architecture, /Player controller[\s\S]*same transaction API/);
  assert.match(architecture, /`private` Rolls only when the server-verified Player Character is the rolling Character/);
  assert.match(architecture, /evaluated exactly once by the shared percentile engine/);
  assert.match(architecture, /never resolves attack\/defense opposition, Damage, Soak/);
  assert.match(architecture, /Finalizing or reopening a Session changes only organizational lifecycle fields/);
});
