import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = source("src/db/tabletop-operations-schema.ts");
const migration = source("drizzle/0031_player_combat_ruling_requests.sql");
const rulingService = source("src/features/tabletop-operations/player-combat-ruling-service.ts");
const playerActions = source("src/app/realms/tabletop/player-combat-actions.ts");
const playerConsole = source("src/app/realms/tabletop/player-combat-console.tsx");
const playerWorkspace = source("src/app/realms/tabletop/player-tabletop-workspace.tsx");
const rollService = source("src/features/tabletop-operations/roll-runtime-service.ts");
const legacyPlayerEncounterPage = source("src/app/realms/characters/[characterId]/encounter/page.tsx");
const godWorkspace = source("src/app/heavens/tabletop/player-combat-ruling-workspace.tsx");
const godActions = source("src/app/heavens/tabletop/player-combat-ruling-actions.ts");

test("Pass 13 stores exact hierarchical idempotent Player ruling requests with append-only history", () => {
  for (const seam of [
    "campaignSessionPlayerRulingRequest",
    "campaignSessionPlayerRulingRequestEvent",
    "targetParticipantId",
    "sourceInstanceId",
    "frozenRequestJson",
    "idempotencyKey",
    "linkedDeclarationId",
    "linkedReactionId",
    "linkedFirearmAttackId",
  ]) assert.match(schema, new RegExp(seam));
  assert.match(migration, /campaign_session_player_ruling_request_hierarchy_uq/);
  assert.match(migration, /campaign_session_player_ruling_request_idempotency_uq/);
  assert.match(migration, /campaign_session_player_ruling_request_event_request_fk/);
  assert.match(migration, /target_participant_id[\s\S]+campaign_session_encounter_participant/);
  assert.match(rulingService, /lockPlayerCombatContextInTransaction/);
  assert.match(rulingService, /participantKind, "campaign-character"/);
  assert.match(rulingService, /requested exact Item instance is not owned/);
  assert.match(rulingService, /requested Spell source identity is invalid/);
  assert.match(rulingService, /requested exact Skill allocation is not owned/);
  assert.match(rulingService, /requested combat source kind is unsupported/);
  assert.match(rulingService, /Called Shot request requires an exact Encounter target/);
});

test("every Player combat mutation independently authenticates and locks exact ownership", () => {
  assert.match(playerActions, /const access = await requirePlayer\(\)/);
  assert.match(playerActions, /lockPlayerCombatContextInTransaction/);
  assert.match(playerActions, /authority: "player"/);
  assert.match(playerActions, /readCharacterEquipmentStateInTransaction/);
  assert.match(playerActions, /weapon\.initiativeCost/);
  assert.match(playerActions, /pg_advisory_xact_lock/);
  assert.match(playerActions, /parseActionDeclarationDraft\(draft\)\.sourcePayload\?\.submissionId/);
  assert.match(playerActions, /characterIds: \[\],[\s\S]*category/);
  assert.match(playerActions, /function automationBlocker/);
  assert.doesNotMatch(playerActions, /blockedReason: string/);
  assert.doesNotMatch(playerActions, /manualTarget:/);
  assert.doesNotMatch(playerActions, /godInitiativeCost:/);
  assert.doesNotMatch(playerActions, /manualGovernance:/);
  assert.match(playerActions, /request\.sourceInstanceId !== itemInstanceId \|\| request\.targetParticipantId !== targetParticipantId/);
});

test("Player combat reuses declarations, defenses, firearm runtime, Rolls, and one live console", () => {
  for (const seam of [
    "createActionDeclarationDraftInTransaction",
    "lockActionDeclarationInTransaction",
    "commitActionDeclarationInTransaction",
    "declareDefenseInterventionInTransaction",
    "recordDeclaredAttackRollInTransaction",
    "recordDeclaredResponseRollInTransaction",
    "resolveDeclaredDefensesInTransaction",
    "startFirearmPreparationInTransaction",
    "declareFirearmAttackInTransaction",
    "fireFirearmAttackInTransaction",
    "publishTabletopInvalidationInTransaction",
  ]) assert.match(playerActions, new RegExp(seam));
  assert.match(playerWorkspace, /TabletopLiveRefresh mode="player"/);
  assert.match(playerWorkspace, /<PlayerCombatConsole/);
  assert.doesNotMatch(playerConsole, /new EventSource/);
  assert.match(rollService, /actor\.characterId !== row\.rollerCharacterId && row\.visibility !== "table"/);
  assert.match(legacyPlayerEncounterPage, /redirect\(`\/realms\/tabletop\?character=\$\{id\}`\)/);
  assert.doesNotMatch(legacyPlayerEncounterPage, /PlayerEncounterConsole|getPlayerEncounter/);
});

test("Player UI prioritizes responses and exposes only request-side Called Shot authority", () => {
  assert.ok(playerConsole.indexOf("RESPONSE REQUIRED") < playerConsole.indexOf("AUTHORITATIVE INITIATIVE"));
  assert.match(playerConsole, /No Defense/);
  assert.match(playerConsole, /dodgeAvailable/);
  assert.match(playerConsole, /No approved Dodge Skill path is available/);
  assert.match(playerConsole, /Dodge · 1 Initiative/);
  assert.match(playerConsole, /Parry/);
  assert.match(playerConsole, /Block/);
  assert.match(playerConsole, /aria-label="Physical defense Roll"/);
  assert.match(playerConsole, /Approved Called Shot/);
  assert.doesNotMatch(playerConsole, /name="penalty"/);
  assert.match(playerConsole, /Legacy aggregate firearms require G\.O\.D\. initialization/);
  assert.match(playerConsole, /attack\.triggerTimingStatus === "completed"/);
  assert.match(playerConsole, /JSON\.stringify\(effect\.finalValue/);
});

test("G.O.D. rulings stay in Heavens and Called Shot penalties are assigned there", () => {
  assert.match(godWorkspace, /PLAYER COMBAT/);
  assert.match(godWorkspace, /name="penalty"/);
  assert.match(godActions, /requireGod\(\)/);
  assert.match(godActions, /lockOwnedEncounterRuntimeInTransaction/);
  assert.match(godActions, /request\.requestType === "called-shot"/);
  assert.match(godActions, /penalty: input\.calledShotPenalty, reason/);
  assert.match(godActions, /publishTabletopInvalidationInTransaction/);
});

test("direct Creature targets remain exact Encounter participant identities", () => {
  assert.match(rulingService, /targetParticipantId/);
  assert.match(rulingService, /campaignSessionEncounterParticipant\.characterId/);
  assert.match(playerConsole, /entry\.participantId/);
  assert.doesNotMatch(playerActions, /Math\.abs\([\s\S]*target/);
});
