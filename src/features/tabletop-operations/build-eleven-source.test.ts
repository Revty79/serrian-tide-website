import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const playerService = source("src/features/tabletop-operations/player-encounter-service.ts");
const playerPolicy = source("src/features/tabletop-operations/player-encounter-policy.ts");
const playerActions = source("src/app/realms/characters/[characterId]/encounter/actions.ts");
const playerUi = source("src/app/realms/characters/[characterId]/encounter/player-encounter-console.tsx");
const playerCss = source("src/app/realms/characters/[characterId]/encounter/player-encounter.css");
const activeEncounterCard = source("src/app/realms/characters/[characterId]/active-encounter-card.tsx");
const activeEncounterCardCss = source("src/app/realms/characters/[characterId]/active-encounter-card.module.css");
const notificationDomain = source("src/features/tabletop-operations/player-encounter-notifications.ts");
const notificationCenter = source("src/features/tabletop-operations/player-live-notification-center.tsx");
const playerPage = source("src/app/realms/characters/[characterId]/encounter/page.tsx");
const characterPage = source("src/app/realms/characters/[characterId]/page.tsx");
const liveEvents = source("src/features/tabletop-operations/tabletop-live-events.ts");
const liveRoute = source("src/app/api/tabletop/live/route.ts");
const liveClient = source("src/features/tabletop-operations/tabletop-live-refresh.tsx");
const godRuntimeActions = source("src/app/heavens/tabletop/runtime-integration-actions.ts");
const godInitiativeActions = source("src/app/heavens/tabletop/initiative-actions.ts");
const godRollActions = source("src/app/heavens/tabletop/roll-actions.ts");
const godSessionActions = source("src/app/heavens/tabletop/actions.ts");
const godSceneActions = source("src/app/heavens/tabletop/scene-actions.ts");
const godCloseoutActions = source("src/app/heavens/tabletop/closeout-actions.ts");
const godSessionCloseoutActions = source("src/app/heavens/tabletop/session-closeout-actions.ts");
const itemUseActions = source("src/app/characters/item-use-actions.ts");
const architecture = source("docs/architecture/tabletop-operations.md");
const schema = source("src/db/tabletop-operations-schema.ts");

test("Player active Encounter discovery requires exact ownership and every active hierarchy layer", () => {
  for (const token of [
    "campaignCharacter.playerUserId",
    "campaignCharacter.isNpc",
    "campaignSessionRoster",
    "campaignSession.status, \"active\"",
    "campaignSessionSceneMember",
    "campaignSessionScene.status, \"active\"",
    "campaignSessionEncounterParticipant",
    "campaignSessionEncounter.status, \"active\"",
  ]) assert.match(playerService, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(playerService, /desc\(campaignSession|createdAt.*limit\(1\)/i);
  assert.match(playerService, /rows\.length > 1/);
});

test("Player DTO is a server-side privacy projection rather than the G.O.D. Combat Aid DTO", () => {
  assert.match(playerService, /projectPlayerEncounterView/);
  assert.match(playerService, /projectPlayerParticipantSummaries/);
  assert.match(playerPolicy, /characterId:[\s\S]*name:[\s\S]*kindLabel:[\s\S]*currentInitiative:[\s\S]*participationStatus:[\s\S]*pendingAction/);
  for (const forbidden of ["health:", "mana:", "equipment:", "resources:", "prepNotes", "godNotes"]) {
    assert.doesNotMatch(playerPolicy, new RegExp(forbidden));
  }
  assert.match(playerService, /readAs: "player"/);
  assert.match(playerPolicy, /visibility === "private" && rollerCharacterId === authorizedCharacterId/);
});

test("Player controllers authorize again and delegate to shared authoritative services", () => {
  assert.match(playerActions, /requirePlayer\(\)/);
  assert.match(playerActions, /resolveActivePlayerEncounterInTransaction\(tx, characterId, access\.user\.id, true\)/);
  for (const service of [
    "holdParticipantInitiativeInTransaction",
    "passParticipantInitiativeInTransaction",
    "startWeaponActionInTransaction",
    "prepareEncounterSpellActionInTransaction",
    "startSpellActionInTransaction",
    "declareEncounterReactionInTransaction",
    "recordRollInTransaction",
  ]) assert.match(playerActions, new RegExp(service));
  assert.match(playerActions, /request\.casterCharacterId !== characterId/);
  assert.match(playerActions, /authorizePlayerEncounterActor/);
  assert.match(playerActions, /assertPlayerEncounterCapability/);
  assert.match(playerPolicy, /PLAYER_ENCOUNTER_CAPABILITIES/);
  assert.match(playerActions, /rollerCharacterId: characterId/);
  assert.match(playerActions, /visibility: "table"/);
  assert.doesNotMatch(playerActions, /godSuppliedInitiativeCost|beginGenericInitiativeAction|applyEncounterDamage|resolveEncounterReaction/);
});

test("the accepted Player Encounter implementation remains covered while its route consolidates into Player Tabletop", () => {
  assert.match(characterPage, /ActiveEncounterCard/);
  assert.match(characterPage, /CharacterEditor/);
  assert.match(playerPage, /redirect\(`\/realms\/tabletop\?character=\$\{id\}`\)/);
  assert.doesNotMatch(playerPage, /PlayerEncounterConsole|getPlayerEncounter/);
  for (const label of ["Your Initiative", "Hold", "Pass", "Actions", "Reaction", "Percentile Roll", "Your State"]) {
    assert.match(playerUi, new RegExp(label));
  }
  assert.match(playerUi, /getHitLocationFromPercentile/);
  assert.match(playerUi, /ownInitiative\.canAct/);
  assert.match(playerUi, /ownInitiative\.canIntervene/);
  assert.match(playerUi, /raw-saved/);
  assert.match(playerUi, /G\.O\.D\. timing ruling/);
  assert.doesNotMatch(playerUi, /Apply Damage|Resolve Reaction|G\.O\.D\.-only/);
});

test("Player UX establishes prominent Encounter, opportunity, Initiative, action, state, Roll, and timeline regions", () => {
  assert.match(activeEncounterCard, /ACTIVE ENCOUNTER/);
  assert.match(activeEncounterCard, /Open Player Tabletop/);
  assert.match(activeEncounterCard, /YOUR INITIATIVE/);
  assert.match(activeEncounterCardCss, /border: 1px solid rgb\(245 202 115 \/ 48%\)/);
  assert.match(activeEncounterCardCss, /backdrop-filter: blur\(16px\)/);
  assert.match(activeEncounterCardCss, /\.runtime/);
  for (const structuralClass of [
    "__header",
    "__opportunity",
    "__initiative-panel",
    "__critical-action",
    "__actions-panel",
    "__roll-panel",
    "__state-cards",
    "__timeline-panel",
    "__roll-history",
  ]) assert.match(playerUi, new RegExp(structuralClass));
  assert.match(playerCss, /max-width: 78rem/);
  assert.match(playerCss, /grid-template-columns: repeat\(12/);
  assert.match(playerCss, /@media \(max-width: 48rem\)/);
  assert.match(playerCss, /@media \(max-width: 30rem\)/);
  assert.match(playerCss, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(playerCss, /focus-visible/);
});

test("Player live notices compare only the already-authorized Player snapshot", () => {
  for (const title of ["YOU TOOK", "REACTION AVAILABLE", "YOUR ACTION IS READY", "CONDITION ADDED", "MANA CHANGED", "ENCOUNTER ENDED"]) {
    assert.match(notificationDomain, new RegExp(title));
  }
  assert.match(notificationCenter, /sessionStorage/);
  assert.match(notificationCenter, /role=\{notification\.priority === "critical" \? "alert" : "status"\}/);
  assert.doesNotMatch(notificationDomain, /prepNotes|godNotes|creatureAttacks|creatureAbilities|equipment:/);
  assert.doesNotMatch(notificationCenter, /EventSource|pg_notify|fetch\(/);
});

test("live synchronization is authorized invalidation transport with post-commit database emission", () => {
  assert.match(liveEvents, /select pg_notify/);
  assert.match(liveEvents, /campaignId:[\s\S]*sessionId:[\s\S]*sceneId:[\s\S]*encounterId:[\s\S]*characterIds:[\s\S]*category/);
  assert.doesNotMatch(liveEvents, /health|mana|notes|resultTotal|damage/i);
  assert.match(liveRoute, /auth\.api\.getSession/);
  assert.match(liveRoute, /createdByUserId/);
  assert.match(liveRoute, /resolveActivePlayerEncounterInTransaction/);
  assert.match(liveRoute, /LISTEN/);
  assert.match(liveRoute, /text\/event-stream/);
  assert.match(liveRoute, /heartbeat/);
  assert.match(liveClient, /EventSource/);
  assert.match(liveClient, /router\.refresh/);
  for (const controller of [godRuntimeActions, godInitiativeActions, godRollActions, playerActions]) {
    assert.match(controller, /publishTabletopInvalidationInTransaction/);
  }
  for (const hierarchyController of [godSessionActions, godSceneActions, godCloseoutActions, godSessionCloseoutActions]) {
    assert.match(hierarchyController, /publishTabletopInvalidationInTransaction/);
  }
  assert.match(itemUseActions, /assertStandalonePlayerItemTiming/);
  assert.match(itemUseActions, /G\.O\.D\. TIMING RULING REQUIRED/);
});

test("Build 11 adds no Player combat persistence and freezes the shared-state architecture", () => {
  for (const forbidden of [
    "player_current_hp",
    "player_combat_health",
    "player_combat_mana",
    "player_encounter_inventory",
    "player_initiative",
    "player_pending_action",
    "player_reaction",
    "player_roll",
  ]) assert.doesNotMatch(schema, new RegExp(forbidden));
  assert.match(architecture, /Build 11 Player Active Encounter/);
  assert.match(architecture, /same active hierarchy and runtime services/);
  assert.match(architecture, /rollback emits nothing/);
});
