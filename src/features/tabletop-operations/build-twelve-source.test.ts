import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("Pass 8 uses one normalized source/effect plan bridge and restrictive persisted identity", () => {
  const schema = read("src/db/tabletop-operations-schema.ts");
  const bridge = read("src/features/tabletop-operations/action-effect-bridge.ts");
  const resolver = read("src/features/tabletop-operations/action-source-resolver-service.ts");
  const service = read("src/features/tabletop-operations/action-effect-plan-service.ts");
  for (const kind of ["weapon", "item", "spell", "derived-ability", "skill", "attribute", "creature-attack", "creature-ability", "no-roll", "manual"]) {
    assert.match(bridge, new RegExp(`"${kind}"`));
  }
  assert.match(schema, /campaign_session_encounter_effect_plan/);
  assert.match(schema, /campaign_session_encounter_effect_key_uq/);
  assert.match(schema, /onDelete\("restrict"\)/);
  assert.match(resolver, /loadCharacterSkillLineageInputInTransaction/);
  assert.match(resolver, /resolveCharacterSkillLineageSelection/);
  assert.match(service, /sourceDivergenceJson/);
});

test("every authored source resolver freezes an exact canonical identity", () => {
  const resolver = read("src/features/tabletop-operations/action-source-resolver-service.ts");
  for (const identity of [
    /weapon-profile:\$\{row\.profileId\};item:\$\{row\.canonicalId\}/,
    /item:\$\{row\.canonicalId\}/,
    /spell:\$\{preview\.plan\.source\.identity\};document:\$\{loaded\.spell\.id\}/,
    /derived-ability:\$\{ability\.id\}/,
    /skill-allocation:\$\{resolved\.source\.allocationId\}/,
    /attribute:\$\{resolved\.source\.attributeKey\}/,
    /creature-attack:\$\{sourceRef\}/,
    /creature-ability:\$\{ability\.canonicalId\}/,
    /\$\{kind\}:declaration:\$\{declarationId\}/,
  ]) {
    assert.match(resolver, identity);
  }
});

test("Pass 8 application reuses Active State and has an occurrence-local Creature branch", () => {
  const service = read("src/features/tabletop-operations/action-effect-plan-service.ts");
  assert.match(service, /persistPlannedMechanicalEffectInTransaction/);
  assert.match(service, /spendActiveManaInTransaction/);
  assert.match(service, /spendItemChargesInTransaction/);
  assert.match(service, /assertConsumableHasInactiveQuantityInTransaction/);
  assert.match(service, /reconcileItemPassiveEffectsInTransaction/);
  assert.match(service, /bindPersistedEffectDurationInTransaction/);
  assert.match(service, /applyDirectCreatureEffect/);
  assert.match(service, /targetParticipantId < 0/);
  assert.match(service, /campaignSessionEncounterParticipant\)\.set\(\{ localStateJson/);
  const directBranch = service.slice(service.indexOf("async function applyDirectCreatureEffect"), service.indexOf("async function applySupportedEffects"));
  assert.doesNotMatch(directBranch, /lockActiveHealthInTransaction|spendActiveManaInTransaction|persistPlannedMechanicalEffectInTransaction/);
});

test("persistent Creature NPC targets retain positive Character identity and shared Active State routing", () => {
  const service = read("src/features/tabletop-operations/action-effect-plan-service.ts");
  assert.match(service, /targetParticipantId < 0[\s\S]*applyDirectCreatureEffect[\s\S]*applyCharacterEffect/);
  assert.match(service, /campaignCharacter\.npcKind/);
  assert.match(service, /lockActiveHealthInTransaction\(tx, target\.id, target\.npcKind\)/);
});

test("browser actions accept identities and rulings, never proposed Roll outcomes or authored effect payloads", () => {
  const actions = read("src/app/heavens/tabletop/action-effect-plan-actions.ts");
  assert.match(actions, /requireGod\(\)/);
  assert.match(actions, /lockOwnedEncounterRuntimeInTransaction/);
  assert.doesNotMatch(actions, /targetCharacterIds|successCount|rollOutcome|authoredValueJson|resourceCostsJson/);
});

test("Tabletop consequence review shows locked evidence, separated values, audits, and no global authoring controls", () => {
  const workspace = read("src/app/heavens/tabletop/action-effect-plan-workspace.tsx");
  const declarations = read("src/app/heavens/tabletop/action-declaration-workspace.tsx");
  assert.match(workspace, /Acting|Actor:/);
  assert.match(workspace, /Governing Roll/);
  assert.match(workspace, /Defense \/ Intervention/);
  assert.match(workspace, /Initiative commitment/);
  assert.match(workspace, /Authored/);
  assert.match(workspace, /Calculated/);
  assert.match(workspace, /G\.O\.D\. correction/);
  assert.match(workspace, /Final applied result/);
  assert.match(workspace, /Audit history/);
  assert.match(workspace, /Review canonical source authoring/);
  assert.doesNotMatch(workspace, /saveWeapon|updateItem|updateSpell|updateCreature|updateDerivedAbility/);
  for (const kind of ["weapon", "item", "spell", "derived-ability", "skill", "attribute", "creature-attack", "creature-ability", "no-roll", "manual"]) {
    assert.match(declarations, new RegExp(`value="${kind}"`));
  }
});

test("complete firearm damage and ammunition automation remain outside Pass 8", () => {
  const resolver = read("src/features/tabletop-operations/action-source-resolver-service.ts");
  const service = read("src/features/tabletop-operations/action-effect-plan-service.ts");
  assert.match(resolver, /Full weapon damage, ammunition, armor, soak, hit location, recoil, and Called Shot rules are deferred/);
  assert.doesNotMatch(service, /consumeAmmunition|calculateBurstDamage|applyArmorSoak|calledShotDexBonus/);
});

test("migration 0027 is additive and follows immutable Pass 7", () => {
  const migration = read("drizzle/0027_action_source_effect_bridge.sql");
  const journal = JSON.parse(read("drizzle/meta/_journal.json")) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  assert.equal(journal.entries.length, 36);
  assert.deepEqual(journal.entries[27], {
    idx: 27,
    version: "7",
    when: 1788535408466,
    tag: "0027_action_source_effect_bridge",
    breakpoints: true,
  });
  assert.deepEqual(journal.entries[29], {
    idx: 29,
    version: "7",
    when: 1788555142922,
    tag: "0029_firearm_attack_runtime",
    breakpoints: true,
  });
  assert.equal(journal.entries[30]?.tag, "0030_called_checks_high_low");
  assert.equal(journal.entries[31]?.tag, "0031_player_combat_ruling_requests");
  assert.equal(journal.entries[32]?.tag, "0032_safe_entity_lifecycles");
  assert.equal(journal.entries[33]?.tag, "0033_admin_account_lifecycle");
  assert.equal(journal.entries[34]?.tag, "0034_verification_user_delete_guard");
  assert.equal(journal.entries[35]?.tag, "0035_campaign_shop_foundation");
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_effect_plan"/);
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_effect"/);
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_effect_plan_event"/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|DELETE|TRUNCATE|UPDATE)\b/im);
});
