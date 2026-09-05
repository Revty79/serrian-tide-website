import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

test("migration 0030 is additive, follows immutable 0029, and adds normalized audit-safe identity", () => {
  const migration = read("drizzle/0030_called_checks_high_low.sql");
  const journal = JSON.parse(read("drizzle/meta/_journal.json")) as { entries: Array<Record<string, unknown>> };
  assert.equal(journal.entries.length, 32);
  assert.deepEqual(journal.entries[29], { idx: 29, version: "7", when: 1788555142922, tag: "0029_firearm_attack_runtime", breakpoints: true });
  assert.deepEqual(journal.entries[30], { idx: 30, version: "7", when: 1788561124817, tag: "0030_called_checks_high_low", breakpoints: true });
  assert.equal(journal.entries[31]?.tag, "0031_player_combat_ruling_requests");
  for (const table of [
    "campaign_session_called_check_batch",
    "campaign_session_called_check_request",
    "campaign_session_called_check_event",
    "campaign_session_high_low_request",
    "campaign_session_high_low_event",
  ]) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  for (const constraint of [
    "campaign_session_called_check_request_roster_fk",
    "campaign_session_called_check_request_scene_fk",
    "campaign_session_called_check_request_encounter_fk",
    "campaign_session_called_check_request_roll_fk",
    "campaign_session_called_check_request_parent_fk",
    "campaign_session_called_check_request_response_idempotency_uq",
    "campaign_session_high_low_request_roster_fk",
    "campaign_session_high_low_request_roll_uq",
    "campaign_session_high_low_request_successor_uq",
  ]) assert.match(migration, new RegExp(constraint));
  assert.match(migration, /recipient_character_id" > 0/);
  assert.match(migration, /ON DELETE restrict/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/im);
});

test("Called Check service freezes source mechanics and delegates immutable results to the Roll Runtime", () => {
  const service = read("src/features/tabletop-operations/called-check-service.ts");
  const rollService = read("src/features/tabletop-operations/roll-runtime-service.ts");
  for (const seam of [
    "loadCharacterSkillLineageInputInTransaction",
    "resolveCalledCheckSource",
    "recordFrozenRollInTransaction",
    "recordRollInTransaction",
    "parseRollGoverningSourceSnapshot",
    "responseIdempotencyKey",
    "parentRequestId",
    "publishTabletopInvalidationInTransaction",
  ]) assert.match(`${service}\n${read("src/app/heavens/tabletop/called-check-actions.ts")}`, new RegExp(seam));
  assert.match(rollService, /browser input never supplies the trusted snapshot/);
  assert.doesNotMatch(service, /Math\.random|applyDamage|applyCondition|advanceInitiative|narrativeConsequence/);
  assert.equal((service.match(/\.insert\(campaignSessionRoll\)/g) ?? []).length, 0);
});

test("authorization keeps issue, NPC, secret, cancellation, reroll, reveal, and ruling authority with the Campaign owner", () => {
  const service = read("src/features/tabletop-operations/called-check-service.ts");
  const godActions = read("src/app/heavens/tabletop/called-check-actions.ts");
  const playerActions = read("src/app/realms/characters/[characterId]/called-check-actions.ts");
  assert.match(service, /eq\(campaign\.createdByUserId, actorUserId\)/);
  assert.match(service, /eq\(userRole\.role, "god"\)/);
  assert.match(service, /eq\(userRole\.role, "player"\)/);
  assert.match(service, /eq\(campaignCharacter\.playerUserId, actorUserId\)/);
  assert.match(service, /batch\.visibility !== "god-only" && request\.recipientKind === "pc"/);
  assert.match(godActions, /requireGod\(\)/);
  assert.match(playerActions, /requirePlayer\(\)/);
  assert.doesNotMatch(playerActions, /issueCalledCheck|cancelCalledCheck|rerollCalledCheck|revealCalledCheck|ruleCalledCheck/);
});

test("G.O.D. and minimal Player surfaces expose the required workflow without global Skill authoring", () => {
  const god = read("src/app/heavens/tabletop/called-check-workspace.tsx");
  const player = read("src/app/realms/characters/[characterId]/player-called-check-panel.tsx");
  for (const phrase of [
    "Source type",
    "Canonical Skill endpoint and exact ancestry",
    "Recipient scope",
    "Purpose",
    "Instructions",
    "Visibility",
    "Roll method",
    "Issue Called Check",
    "Order Reroll",
    "Record Ruling",
    "Reveal to Recipient",
    "Complete audit history",
    "HIGH / LOW",
  ]) assert.match(god, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  for (const phrase of ["LIVE TABLE REQUESTS", "Frozen source", "Final target", "Raw Roll", "Call Low", "Call High", "Waiting for the G.O.D. Roll"]) {
    assert.match(player, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.doesNotMatch(god, /saveWeaponSkillGovernance|weaponSkillPathMapping|canonical authoring/i);
  assert.doesNotMatch(player, /cancelCalledCheck|rerollCalledCheck|ruleCalledCheck|issueCalledCheck/);
});

test("secret live invalidations are G.O.D.-only and Player reads filter visibility before returning data", () => {
  const live = read("src/features/tabletop-operations/tabletop-live-events.ts");
  const actions = read("src/app/heavens/tabletop/called-check-actions.ts");
  const service = read("src/features/tabletop-operations/called-check-service.ts");
  assert.match(live, /audience === "god-only"/);
  assert.match(actions, /audience: characterIds\.length \? "all" : "god-only"/);
  assert.match(service, /batch\.visibility === "god-only"/);
  assert.match(service, /request\.revealedVisibility/);
  assert.match(service, /request\.visibility === "private" && request\.participantCharacterId === character\.characterId/);
});
