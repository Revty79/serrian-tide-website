import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("Pass 4 persistence is additive and constrains every canonical scope identity", () => {
  const migration = source("drizzle/0024_character_weapon_governance_overrides.sql");
  assert.match(migration, /CREATE TABLE "campaign_character_weapon_override"/);
  assert.match(migration, /character_campaign_fk/);
  assert.match(migration, /profile_item_fk/);
  assert.match(migration, /mode_profile_fk/);
  assert.match(migration, /allocation_character_fk/);
  assert.match(migration, /attribute_character_fk/);
  assert.match(migration, /override_one_source/);
  assert.match(migration, /override_reason_valid/);
  assert.match(migration, /override_weapon_scope_uq/);
  assert.match(migration, /override_mode_scope_uq/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|INSERT INTO|^UPDATE /m);
  assert.doesNotMatch(migration, /item_instance/i);
});

test("the service keeps pure resolution separate and enforces owner-G.O.D. mutations", () => {
  const service = source("src/features/items/character-weapon-governance-service.ts");
  assert.match(service, /resolveCharacterWeaponGovernance\(await loadResolutionInput/);
  assert.match(service, /resolveNormalCharacterWeaponGovernanceInTransaction/);
  assert.match(service, /resolveCharacterWeaponGovernanceWithOneActionOverrideInTransaction/);
  assert.match(service, /campaignOwnerUserId !== actor\.userId \|\| !godRole/);
  assert.match(service, /userRole\.role, "god"/);
  assert.match(service, /readApplicableCharacterWeaponOverrideInTransaction/);
  assert.match(service, /createOrReplaceCharacterWeaponOverrideInTransaction/);
  assert.match(service, /removeCharacterWeaponOverrideInTransaction/);
  assert.match(service, /requireSession\(\)/);
});

test("resolution has no attack, damage, Initiative, ammunition, or mapping mutation", () => {
  const resolver = source("src/features/items/character-weapon-governance.ts");
  const service = source("src/features/items/character-weapon-governance-service.ts");
  assert.doesNotMatch(resolver, /Math\.random|rollDie|rollDice/);
  assert.doesNotMatch(service, /campaignSessionRoll|activeHealth|currentInitiative|currentCharges/);
  assert.doesNotMatch(service, /insert\(weaponSkillPathMapping\)|update\(weaponSkillPathMapping\)|delete\(weaponSkillPathMapping\)/);
});

test("Character editor persistence retains exact allocation IDs instead of recreating branches", () => {
  const actions = source("src/app/characters/actions.ts");
  assert.match(actions, /storedAttributeKeys/);
  assert.match(actions, /storedAllocationMap/);
  assert.match(actions, /existing Skill allocation identity or parent lineage cannot be redirected/);
  assert.doesNotMatch(
    actions,
    /delete\(campaignCharacterSkillAllocation\)\.where\(eq\(campaignCharacterSkillAllocation\.characterId, characterId\)\)/,
  );
  assert.doesNotMatch(
    actions,
    /delete\(campaignCharacterAttribute\)\.where\(eq\(campaignCharacterAttribute\.characterId, characterId\)\)/,
  );
});
