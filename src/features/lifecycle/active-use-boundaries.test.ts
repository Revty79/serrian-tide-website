import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function occurrences(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

test("Player Tabletop and live subscriptions reject archived Campaigns and Characters", () => {
  const consoleService = source("src/features/tabletop-operations/player-tabletop-console-service.ts");
  const encounterService = source("src/features/tabletop-operations/player-encounter-service.ts");
  const rulingService = source("src/features/tabletop-operations/player-combat-ruling-service.ts");
  const liveRoute = source("src/app/api/tabletop/live/route.ts");

  assert.ok(occurrences(consoleService, /isNull\(campaignCharacter\.archivedAt\)/g) >= 2);
  assert.ok(occurrences(consoleService, /isNull\(campaign\.archivedAt\)/g) >= 2);
  assert.match(encounterService, /isNull\(campaignCharacter\.archivedAt\)/);
  assert.match(encounterService, /isNull\(campaign\.archivedAt\)/);
  assert.match(rulingService, /isNull\(campaignCharacter\.archivedAt\)/);
  assert.match(rulingService, /isNull\(campaign\.archivedAt\)/);
  assert.match(liveRoute, /innerJoin\(campaign, eq\(campaign\.id, campaignCharacter\.campaignId\)\)/);
  assert.match(liveRoute, /isNull\(campaignCharacter\.archivedAt\)/);
  assert.ok(occurrences(liveRoute, /isNull\(campaign\.archivedAt\)/g) >= 2);
});

test("active Item, Spell, and Derived Ability runtime rejects archived roots and targets", () => {
  const itemUse = source("src/app/characters/item-use-actions.ts");
  const spellUse = source("src/features/characters/character-spell-runtime-service.ts");
  const derivedUse = source("src/features/derived-abilities/character-derived-ability-service.ts");

  assert.ok(occurrences(itemUse, /isNull\(campaignCharacter\.archivedAt\)/g) >= 2);
  assert.match(itemUse, /isNull\(campaign\.archivedAt\)/);
  assert.match(itemUse, /isNull\(item\.archivedAt\)/);
  assert.ok(occurrences(spellUse, /isNull\(campaignCharacter\.archivedAt\)/g) >= 2);
  assert.match(spellUse, /isNull\(campaign\.archivedAt\)/);
  assert.match(spellUse, /isNull\(skill\.archivedAt\)/);
  assert.match(derivedUse, /Archived Characters and Campaigns cannot mutate Derived Abilities/);
  assert.ok(occurrences(derivedUse, /isNull\(campaignCharacter\.archivedAt\)/g) >= 2);
});

test("new Campaign and Character choices cannot submit archived master roots", () => {
  const campaignCreation = source("src/app/heavens/campaigns/new/actions.ts");
  const characterActions = source("src/app/characters/actions.ts");
  const randomActions = source("src/app/realms/characters/random-actions.ts");
  const randomRules = source("src/features/characters/random-character.ts");
  const creatureNpcActions = source("src/app/heavens/npcs/actions.ts");

  assert.match(campaignCreation, /isNull\(race\.archivedAt\)/);
  assert.match(campaignCreation, /isNull\(item\.archivedAt\)/);
  assert.match(characterActions, /isNull\(race\.archivedAt\)/);
  assert.match(characterActions, /archived: skillRow\.archivedAt !== null/);
  assert.match(characterActions, /Archived Skills cannot be added to a Character/);
  assert.match(characterActions, /Archived Items cannot be added to or increased in Character possessions/);
  assert.match(characterActions, /Archived Derived Abilities cannot be acquired|archived: archivedAt !== null/);
  assert.match(randomActions, /allowedRaces\.filter\(\(\{ archived \}\) => !archived\)/);
  assert.match(randomRules, /skillCatalog\.filter\(\(\{ archived \}\) => !archived\)/);
  assert.match(randomRules, /!item\.archived/);
  assert.match(creatureNpcActions, /Archived Items cannot be added to or increased in Creature NPC inventory/);
  assert.match(creatureNpcActions, /Archived Items cannot be added as new Creature NPC instances/);
});

test("specialized authoring selectors use active Skills while historical graphs remain readable", () => {
  const effects = source("src/features/active-state/active-effects-service.ts");
  const spells = source("src/app/characters/spell-actions.ts");
  const weaponGovernance = source("src/features/items/weapon-skill-governance-service.ts");
  const defense = source("src/features/tabletop-operations/defense-intervention-service.ts");
  const derived = source("src/features/derived-abilities/character-derived-ability-service.ts");

  assert.match(effects, /isNull\(skill\.archivedAt\)/);
  assert.ok(occurrences(spells, /isNull\(skill\.archivedAt\)/g) >= 2);
  assert.match(weaponGovernance, /readCanonicalSkillGraph\(tx, true\)/);
  assert.match(weaponGovernance, /mapping\.id === null \? activeGraph\.skills : graph\.skills/);
  assert.match(defense, /from\(skill\)\.where\(isNull\(skill\.archivedAt\)\)/);
  assert.match(derived, /Archived Derived Abilities cannot be acquired/);
  assert.match(derived, /archived: archivedAt !== null/);
});

test("Admins can enter the Heavens portal without impersonating a G.O.D.", () => {
  const page = source("src/app/heavens/page.tsx");
  assert.match(page, /requireGodOrAdminAccessContext/);
  assert.doesNotMatch(page, /await requireGod\(\)/);
});
