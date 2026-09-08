import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { isTabletopReferenceRoll, TABLETOP_ROLL_PURPOSES } from "./tabletop-ui-policy";

const source = (path: string) => readFileSync(path, "utf8");

test("G.O.D. pages cannot mount or load retired Encounter workspaces", () => {
  const page = source("src/app/heavens/tabletop/page.tsx");
  const workspace = source("src/app/heavens/tabletop/tabletop-workspace.tsx");
  const scene = source("src/app/heavens/tabletop/scene-workspace.tsx");
  assert.doesNotMatch(page + workspace + scene, /EncounterWorkspace|InitiativeTracker|CombatAid|ActionDeclarationWorkspace|DefenseInterventionWorkspace|ActionEffectWorkspace|FirearmReadinessWorkspace|FirearmAttackWorkspace|PlayerCombatRulingWorkspace|WeaponGovernanceWorkspace/);
  assert.doesNotMatch(page, /query\.(encounter|weaponCharacter|firearmCharacter)/);
  assert.match(workspace, /<SceneWorkspace/);
  assert.match(workspace, /<CalledCheckWorkspace/);
  assert.match(scene, /<SceneLocationWorkspace/);
});

test("the dedicated combat components are removed from the application", () => {
  for (const name of [
    "encounter-workspace", "initiative-tracker", "combat-aid-workspace", "combat-aid-operations",
    "action-declaration-workspace", "defense-intervention-workspace", "action-effect-plan-workspace",
    "firearm-readiness-workspace", "firearm-attack-workspace", "player-combat-ruling-workspace",
    "encounter-closeout", "creature-catalog-spawn", "weapon-governance-workspace",
  ]) assert.equal(existsSync(`src/app/heavens/tabletop/${name}.tsx`), false, name);
  assert.equal(existsSync("src/app/realms/tabletop/player-combat-console.tsx"), false);
  assert.equal(existsSync("src/app/realms/characters/[characterId]/active-encounter-card.tsx"), false);
  assert.equal(existsSync("src/app/realms/characters/[characterId]/encounter/player-encounter-console.tsx"), false);
  assert.equal(existsSync("src/features/tabletop-operations/player-live-notification-center.tsx"), false);
});

test("Player pages retain shared tools without combat panels, state cards, or alerts", () => {
  const workspace = source("src/app/realms/tabletop/player-tabletop-workspace.tsx");
  const character = source("src/app/realms/characters/[characterId]/page.tsx");
  const page = source("src/app/realms/tabletop/page.tsx");
  assert.doesNotMatch(workspace + character, /PlayerCombatConsole|PlayerCombatIntentButton|ActiveEncounterCard|PlayerLiveNotificationCenter|view\.encounter|view\.combat|item\.firearmState/);
  assert.match(workspace, /PlayerShopVisit/);
  assert.match(workspace, /PlayerCalledCheckPanel/);
  assert.match(page, /readPlayerTabletopState/);
  assert.doesNotMatch(page, /readPlayerTabletopRuntime|combat:|combatAvailability:/);
  assert.match(character, /hasActivePlayerInitiativeInTransaction/);
  assert.match(character, /itemUseTimingBlocked=\{itemUseTimingBlocked\}/);
  assert.doesNotMatch(character, /getPlayerEncounter/);
});

test("page state reads skip combat projections while backend runtime reads remain available", () => {
  const service = source("src/features/tabletop-operations/player-tabletop-console-service.ts");
  const pageRead = service.slice(service.indexOf("async function readPlayerTabletopStateInTransaction"), service.indexOf("// Retained for backend consumers"));
  assert.doesNotMatch(pageRead, /readPlayerCombatConsole|readFirearmStates|loadInitiativeEngineInTransaction/);
  assert.match(service, /export async function readPlayerTabletopRuntimeInTransaction/);
  assert.match(service, /readPlayerCombatConsole\(tx, state\.identity, state\.hierarchy, playerUserId\)/);
});

test("old encounter bookmarks redirect to the remaining Player Tabletop", () => {
  const page = source("src/app/realms/characters/[characterId]/encounter/page.tsx");
  assert.match(page, /requirePlayer/);
  assert.match(page, /redirect\(`\/realms\/tabletop\?character=\$\{id\}`\)/);
  assert.doesNotMatch(page, /PlayerEncounterConsole/);
});

test("general Roll choices exclude attack and defense", () => {
  assert.deepEqual(TABLETOP_ROLL_PURPOSES, ["free", "attribute", "skill", "ability", "other"]);
  const tray = source("src/app/heavens/tabletop/roll-tray.tsx");
  assert.doesNotMatch(tray, /getHitLocationFromPercentile|recordGodWeaponGovernanceRoll|value="encounter"|Pending Action<|Reaction</);
});

test("reference Roll history excludes combat purpose and all encounter/action/reaction links", () => {
  const base = { purposeKind: "free" as const, encounterId: null, pendingActionId: null, reactionId: null };
  for (const purposeKind of TABLETOP_ROLL_PURPOSES) assert.equal(isTabletopReferenceRoll({ ...base, purposeKind }), true);
  assert.equal(isTabletopReferenceRoll({ ...base, purposeKind: "attack" }), false);
  assert.equal(isTabletopReferenceRoll({ ...base, purposeKind: "defense" }), false);
  assert.equal(isTabletopReferenceRoll({ ...base, encounterId: 7 }), false);
  assert.equal(isTabletopReferenceRoll({ ...base, pendingActionId: 8 }), false);
  assert.equal(isTabletopReferenceRoll({ ...base, reactionId: 9 }), false);
  const ledger = source("src/app/heavens/tabletop/roll-ledger.tsx");
  assert.match(ledger, /workspace\.initialHistory\.rolls\.filter\(isTabletopReferenceRoll\)/);
  assert.equal((ledger.match(/page\.rolls\.filter\(isTabletopReferenceRoll\)/g) ?? []).length, 2);
});
