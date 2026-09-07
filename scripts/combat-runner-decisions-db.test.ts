import assert from "node:assert/strict";
import test, { after } from "node:test";
import { db, pool } from "@/db";
import { sql } from "drizzle-orm";
import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { readCombatRunnerInTransaction, continueCombatRunnerInTransaction } from "@/features/tabletop-operations/combat-runner-service";


import { submitCombatRunnerDecisionInTransaction } from "@/features/tabletop-operations/combat-runner-decision-service";
import type { CombatRunnerDecision } from "@/features/tabletop-operations/combat-runner-decision";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || !url.pathname.endsWith("_dev")) throw new Error("Use a disposable loopback _dev database only.");
const ROLLBACK = new Error("Rollback runner fixture");
after(() => pool.end());

test("revision-checked screen commands preserve ownership, simultaneous attacks, exact rolls, duplicate safety and carryover", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const base = await insertBuildTenFixture(tx, "runner");
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, base.encounterId, base.godId);
    const god = { authority: "god-owner" as const, userId: base.godId };
    const player = { authority: "player" as const, userId: base.godId, characterId: base.heroId };
    // Setup only: no direct state changes after play begins below.
    await tx.execute(sql`delete from campaign_session_encounter_reaction where encounter_id=${base.encounterId}`);
    await tx.execute(sql`delete from campaign_session_encounter_pending_action_source where encounter_id=${base.encounterId}`);
    await tx.execute(sql`delete from campaign_session_encounter_pending_action where encounter_id=${base.encounterId}`);
    await tx.execute(sql`update campaign_session_encounter_initiative set round_number=1,step_number=1,timeline_initiative=11 where encounter_id=${base.encounterId}`);
    await tx.execute(sql`update campaign_session_encounter_initiative_participant set normal_total_initiative=11,current_initiative=11 where encounter_id=${base.encounterId}`);
    for (const id of [base.heroId, base.defenderId]) for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) {
      await tx.execute(sql`insert into campaign_character_attribute (character_id,attribute_key,value) values (${id},${key},30)`);
    }
    const suffix = crypto.randomUUID().toUpperCase();
    const item = await tx.execute(sql`insert into items (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,created_by_user_id) values (${suffix},'Runner sword','equipment','weapon','Weapon','Test','Melee','unit',${base.godId}) returning id`);
    const itemId = Number((item.rows[0] as { id: number }).id);
    const profile = await tx.execute(sql`insert into weapon_profiles (item_id,profile_record_type,weapon_type,handedness,damage_source,damage,initiative_cost,damage_type,reach_text) values (${itemId},'Weapon','Melee','One-handed','STR','2',4,'Slashing','Close') returning id`);
    const profileId = Number((profile.rows[0] as { id: number }).id);
    const skill = await tx.execute(sql`insert into skill (name,classification,tier,primary_attribute,created_by_user_id) values (${`Runner melee ${suffix}`},'standard',1,'DEX',${base.godId}) returning id`);
    const skillId = Number((skill.rows[0] as { id: number }).id);
    await tx.execute(sql`insert into weapon_skill_path_mappings (weapon_profile_id,endpoint_skill_id,review_state,sort_order,updated_by_user_id) values (${profileId},${skillId},'approved',0,${base.godId})`);
    await tx.execute(sql`insert into campaign_inventory_item (campaign_id,item_id,sort_order) values (${base.campaignId},${itemId},0)`);
    await tx.execute(sql`insert into item_runtime_profiles (item_id,use_mode,activation_label) values (${itemId},'none','Use')`);
    for (const id of [base.heroId, base.defenderId]) {
      await tx.execute(sql`insert into campaign_character_item (character_id,item_id,quantity,unit_cost_credits) values (${id},${itemId},1,0)`);
      await tx.execute(sql`insert into campaign_character_item_equipment_state (character_id,item_id,state,quantity) values (${id},${itemId},'wielded',1)`);
    }
    const read = () => readCombatRunnerInTransaction(tx, context);
    async function choose(actorId: number, kind: string, decision: CombatRunnerDecision) {
      const view = await read();
      const task = view.snapshot.progression.tasks.find((task) => task.participantId === actorId && task.kind === kind)!;
      assert.ok(task, `Missing ${kind} for ${actorId}`);
      const authority = kind === "eligibility" ? god : actorId === base.heroId ? player : god;
      return submitCombatRunnerDecisionInTransaction(tx, context, authority, { revision: view.snapshot.revision, taskKey: task.key, decision });
    }
    async function attack(actorId: number, target: number) {
      const view = await read();
      const weapon = view.declarations.participants.find(({ characterId }) => characterId === actorId)!.weapons.find(({ itemId: id }) => id === itemId)!;
      await choose(actorId, "choose-action", { kind: "attack", source: "weapon", sourceKey: weapon.ownershipKey, targetParticipantId: target });
      return (await read()).declarations.declarations.filter(({ actorCharacterId }) => actorCharacterId === actorId).at(-1)!.id;
    }
    async function noDefenses() {
      let view = await read();
      for (const task of view.snapshot.progression.tasks.filter(({ kind }) => kind === "eligibility")) {
        await choose(task.participantId!, "eligibility", { kind: "eligibility", allow: true });
      }
      view = await read();
      for (const task of view.snapshot.progression.tasks.filter(({ kind }) => kind === "choose-response")) {
        await choose(task.participantId!, "choose-response", { kind: "defense", reactionType: "no-reaction" });
      }
    }
    const initial = await read();
    assert.equal(initial.snapshot.progression.actingParticipantIds.length, 2);
    const originalChoice = initial.snapshot.progression.tasks.find(({ participantId }) => participantId === base.heroId)!;
    await assert.rejects(submitCombatRunnerDecisionInTransaction(tx, context, god, {
      revision: initial.snapshot.revision, taskKey: originalChoice.key, decision: { kind: "pass" },
    }), /belongs|belong/);
    const first = await attack(base.heroId, base.defenderId);
    const stale = await submitCombatRunnerDecisionInTransaction(tx, context, player, {
      revision: initial.snapshot.revision, taskKey: originalChoice.key, decision: { kind: "pass" },
    });
    assert.equal(stale.stale, true);
    assert.equal(stale.changed, false);
    assert.deepEqual((await read()).snapshot.progression.actingParticipantIds, [base.defenderId]);
    const second = await attack(base.defenderId, base.heroId);
    await noDefenses();
    const ready = await read();
    assert.equal(ready.snapshot.progression.canAdvanceTime, true);
    await continueCombatRunnerInTransaction(tx, context, { revision: ready.snapshot.revision, command: "continue" });
    const due = await read();
    assert.equal(due.engine.runtime.timelineInitiative, 7);
    assert.deepEqual(due.snapshot.progression.tasks.map(({ kind }) => kind), ["roll-attack", "roll-attack"]);
    await assert.rejects(continueCombatRunnerInTransaction(tx, context, { revision: due.snapshot.revision, command: "continue" }), /choice, roll/);
    assert.equal((await continueCombatRunnerInTransaction(tx, context, { revision: ready.snapshot.revision, command: "continue" })).stale, true);
    for (const id of [first, second]) {
      await choose(id === first ? base.heroId : base.defenderId, "roll-attack", { kind: "roll", method: "entered", enteredTotal: 89 });
    }
    const rolled = await read();
    await continueCombatRunnerInTransaction(tx, context, { revision: rolled.snapshot.revision, command: "continue" });
    const applied = await read();
    assert.deepEqual(applied.effects.plans.map(({ status }) => status), ["applied", "applied"]);
    assert.deepEqual(applied.declarations.declarations.map(({ status }) => status), ["resolved", "resolved"]);
    assert.equal((await continueCombatRunnerInTransaction(tx, context, { revision: rolled.snapshot.revision, command: "continue" })).stale, true);
    assert.equal((await read()).effects.plans.length, 2);
    await attack(base.heroId, base.defenderId);
    await choose(base.defenderId, "choose-action", { kind: "pass" });
    // The pending opportunity belongs to a passed defender; GOD explicitly rules it out.
    for (const declaration of (await read()).declarations.declarations) for (const opportunity of declaration.opportunities.filter(({ status }) => status === "pending")) {
      await choose(opportunity.responderCharacterId, "eligibility", { kind: "eligibility", allow: false, reason: "Passed for this round." });
    }
    const again = await read();
    await continueCombatRunnerInTransaction(tx, context, { revision: again.snapshot.revision, command: "continue" });
    const third = (await read()).declarations.declarations.find(({ status }) => status !== "resolved")!;
    await choose(base.heroId, "roll-attack", { kind: "roll", method: "entered", enteredTotal: 25 });
    await continueCombatRunnerInTransaction(tx, context, { revision: (await read()).snapshot.revision, command: "continue" });
    assert.equal((await read()).effects.plans.find(({ declarationId }) => declarationId === third.id)?.status, "applied", "a miss is a completed no-effect result, not a GOD ruling");
    await choose(base.heroId, "choose-action", { kind: "pass" });
    const roundEnd = await read();
    assert.equal(roundEnd.snapshot.progression.canStartRound, true);
    await continueCombatRunnerInTransaction(tx, context, { revision: roundEnd.snapshot.revision, command: "round" });
    const nextRound = await read();
    assert.equal(nextRound.engine.runtime.roundNumber, 2);
    assert.deepEqual(nextRound.engine.participants.map(({ currentInitiative }) => currentInitiative), [14, 18]);
    throw ROLLBACK;
  }), (error) => { if (error !== ROLLBACK) console.error(error); return error === ROLLBACK; });
});
