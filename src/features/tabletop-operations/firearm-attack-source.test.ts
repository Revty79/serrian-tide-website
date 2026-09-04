import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

test("Pass 10 owns one exact attack, bullet, and event persistence model", () => {
  const schema = read("src/db/tabletop-operations-schema.ts");
  const migration = read("drizzle/0029_firearm_attack_runtime.sql");
  for (const table of [
    "campaign_session_encounter_firearm_attack",
    "campaign_session_encounter_firearm_bullet",
    "campaign_session_encounter_firearm_attack_event",
  ]) {
    assert.match(schema, new RegExp(table));
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(migration, /campaign_session_encounter_firearm_attack_state_fk/);
  assert.match(migration, /campaign_session_encounter_firearm_attack_target_fk/);
  assert.match(migration, /campaign_session_encounter_firearm_attack_roll_uq/);
  assert.match(migration, /campaign_session_encounter_firearm_attack_idempotency_uq/);
  assert.match(migration, /campaign_session_encounter_firearm_bullet_order_uq/);
  assert.match(migration, /ON DELETE restrict/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/im);
});

test("migration 0029 remains after immutable 0028 in the 31-entry ledger", () => {
  const journal = JSON.parse(read("drizzle/meta/_journal.json")) as { entries: Array<Record<string, unknown>> };
  assert.equal(journal.entries.length, 31);
  assert.deepEqual(journal.entries[28], {
    idx: 28,
    version: "7",
    when: 1788542229363,
    tag: "0028_firearm_readiness_ammunition_runtime",
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
});

test("the firearm transaction reuses Rolls, defenses, Initiative, readiness, and Pass 8 plans", () => {
  const service = read("src/features/tabletop-operations/firearm-attack-service.ts");
  for (const seam of [
    "recordDeclaredAttackRollInTransaction",
    "resolveDeclaredDefensesInTransaction",
    "commitActionDeclarationInTransaction",
    "campaignCharacterFirearmState",
    "campaignSessionEncounterEffectPlan",
    "campaignSessionEncounterEffect",
    "getHitLocationFromPercentile",
    "readActiveHealthInTransaction",
    "readCharacterEquipmentStateInTransaction",
  ]) assert.match(service, new RegExp(seam));
  assert.match(service, /fired-awaiting-timing/);
  assert.match(service, /roundsLoadedAfter === 0 \? null/);
  assert.match(service, /attack\.attackRollId !== null/);
  assert.match(service, /participantKind === "creature"/);
  assert.match(service, /defenseTotalSuccesses/);
  assert.match(service, /outcome\.comparison\?\.defenseTotalSuccesses/);
  assert.match(service, /defenderParticipantId/);
  assert.match(service, /defenseRollId/);
  assert.match(service, /defenseContributions\.flatMap/);
  assert.match(service, /firearm-called-automatic-dex/);
  assert.doesNotMatch(service, /Called Shot burst or sustained-fire damage requires a G\.O\.D\. ruling/);
  assert.doesNotMatch(service, /\.insert\(campaignSessionRoll\)/);
  assert.doesNotMatch(service, /lockActiveHealthInTransaction|persistPlannedMechanicalEffectInTransaction|Math\.random/);
});

test("Tabletop exposes G.O.D.-only attack review without global authoring or Player controls", () => {
  const actions = read("src/app/heavens/tabletop/firearm-attack-actions.ts");
  const workspace = read("src/app/heavens/tabletop/firearm-attack-workspace.tsx");
  const player = read("src/app/realms/characters/[characterId]/encounter/player-encounter-console.tsx");
  assert.match(actions, /requireGod\(\)/);
  assert.match(actions, /lockOwnedEncounterRuntimeInTransaction/);
  assert.match(workspace, /Aim, Trigger &amp; Damage/);
  assert.match(workspace, /Called Shot/);
  assert.match(workspace, /Defense &amp; Intervention workspace/);
  assert.match(workspace, /Action Effect Plan review/);
  assert.match(workspace, /Review global Equipment/);
  assert.doesNotMatch(workspace, /saveWeapon|updateWeapon|saveAmmunition|updateAmmunition/);
  assert.doesNotMatch(player, /FirearmAttackWorkspace|firearm-attack-actions/);
});

test("Pass 10 accepts no browser-authored round count, damage, armor, soak, or consequence payload", () => {
  const actions = read("src/app/heavens/tabletop/firearm-attack-actions.ts");
  const service = read("src/features/tabletop-operations/firearm-attack-service.ts");
  assert.doesNotMatch(actions, /roundsDeclared|roundsConsumed|bulletAllocation|authoredDamage|armorSnapshot|proposedNetDamage/);
  assert.match(service, /planFirearmDelivery/);
  assert.match(service, /parseAuthoredBulletDamage/);
  assert.match(service, /resolveProtection/);
  assert.match(service, /calculateFirearmBulletDamage/);
});
