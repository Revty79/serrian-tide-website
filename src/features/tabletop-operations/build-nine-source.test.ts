import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("migration 0011 is additive and stores only lifecycle and reward history", () => {
  const migration = read("drizzle/0011_tabletop_operations_duration_closeout.sql");
  assert.match(migration, /CREATE TABLE "campaign_session_effect_duration_binding"/);
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_reward"/);
  assert.match(migration, /num_nonnulls\([^)]*condition_id[^)]*modifier_id[^)]*\) = 1/);
  assert.match(migration, /campaign_session_encounter_reward_character_kind_uq/);
  assert.match(migration, /campaign_session_encounter_reward_participant_fk/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM|ALTER COLUMN)\b/i);
  assert.doesNotMatch(migration, /(?:UPDATE|INSERT INTO) "campaign_character_/i);
});

test("duration passage observes authoritative Initiative transitions and excludes correction", () => {
  const normalActions = read("src/app/heavens/tabletop/initiative-actions.ts");
  const runtimeIntegration = read("src/features/tabletop-operations/runtime-integration-service.ts");
  const durationService = read("src/features/tabletop-operations/duration-lifecycle-service.ts");
  assert.match(normalActions, /applyInitiativeDurationTransitionInTransaction/);
  assert.match(runtimeIntegration, /applyInitiativeDurationTransitionInTransaction/);
  assert.match(normalActions, /correctEncounterInitiativeRuntime[\s\S]*durationPassage:\s*"correction"/);
  assert.match(durationService, /after\.stepNumber - before\.stepNumber|combatStepBoundaries/);
  assert.match(durationService, /after\.roundNumber - before\.roundNumber|combatRoundBoundaries/);
  assert.doesNotMatch(durationService, /revalidatePath|router\.refresh|Date\.now\(\).*remaining/i);
});

test("Tabletop-created effects bind from durable IDs inside caller-owned transactions", () => {
  const runtimeIntegration = read("src/features/tabletop-operations/runtime-integration-service.ts");
  const persistence = read("src/features/active-state/mechanical-effect-service.ts");
  for (const boundary of [
    "executeCharacterSpellCastInCallerTransaction",
    "executeCharacterItemUseInCallerTransaction",
    "executeCreatureAbilityUseInCallerTransaction",
    "bindPersistedEffectDurationInTransaction",
  ]) assert.match(runtimeIntegration, new RegExp(boundary));
  assert.match(persistence, /PersistedMechanicalEffectIdentity/);
  assert.match(persistence, /created\.id/);
  assert.doesNotMatch(runtimeIntegration, /latest.*(?:condition|modifier)|orderBy\([^)]*createdAt[^)]*desc/i);
});

test("effect expiration preserves Active Effect history through owning services", () => {
  const service = read("src/features/tabletop-operations/duration-lifecycle-service.ts");
  assert.match(service, /resolveConditionInTransaction/);
  assert.match(service, /endModifierInTransaction/);
  assert.match(service, /Effect was already ended outside Tabletop Operations/);
  assert.doesNotMatch(service, /delete\(campaignCharacterActive(?:Condition|Modifier)/);
});

test("closeout increments spendable XP only and finalizes in one transaction boundary", () => {
  const service = read("src/features/tabletop-operations/encounter-closeout-service.ts");
  const actions = read("src/app/heavens/tabletop/closeout-actions.ts");
  const mutation = service.slice(service.indexOf("for (const award of awards)"), service.indexOf("const next = transitionEncounter"));
  assert.match(service, /experience:\s*sql`\$\{campaignCharacterProfile\.experience\} \+ \$\{award\.amount\}`/);
  assert.doesNotMatch(mutation, /totalExperience\s*:/);
  assert.match(service, /campaignSessionEncounterReward/);
  assert.match(service, /eq\(campaignSessionEncounterParticipant\.encounterId, context\.encounterId\)/);
  assert.match(service, /transitionEncounter\([\s\S]*"complete"/);
  assert.match(actions, /db\.transaction[\s\S]*finalizeEncounterCloseoutInTransaction/);
});

test("Creature suggestions never infer outcomes from Health or CR", () => {
  const domain = read("src/features/tabletop-operations/encounter-closeout.ts");
  const service = read("src/features/tabletop-operations/encounter-closeout-service.ts");
  const ui = read("src/app/heavens/tabletop/encounter-closeout.tsx");
  const sources = `${domain}\n${service}\n${ui}`;
  assert.match(domain, /core[\s\S]*killXp/);
  assert.doesNotMatch(sources, /Math\.random|challengeRating|\bCR\b|remainingHp|totalDamage|health\s*[<=>]+\s*0/i);
  assert.match(ui, /new Set\(\)/);
  assert.match(ui, /Unchecked by default/);
  assert.match(ui, /Health never decides/);
});

test("Encounter workspace exposes operational Closeout as the fourth tab", () => {
  const workspace = read("src/app/heavens/tabletop/encounter-workspace.tsx");
  const closeout = read("src/app/heavens/tabletop/encounter-closeout.tsx");
  assert.match(workspace, /Encounter Prep[\s\S]*Initiative Tracker[\s\S]*Combat Aid[\s\S]*Closeout/);
  assert.match(workspace, /<EncounterCloseout/);
  for (const label of [
    "RUNTIME STATUS",
    "DURATION REVIEW",
    "CREATURE REWARD REFERENCES",
    "RECIPIENTS",
    "Finalize Encounter",
  ]) assert.match(closeout, new RegExp(label));
});
