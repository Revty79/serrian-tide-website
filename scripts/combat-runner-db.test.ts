import assert from "node:assert/strict";
import test, { after } from "node:test";
import { db, pool } from "@/db";
import { sql } from "drizzle-orm";
import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";
import { lockOwnedEncounterRuntimeInTransaction, passParticipantInitiativeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { readCombatRunnerInTransaction, continueCombatRunnerInTransaction } from "@/features/tabletop-operations/combat-runner-service";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction, reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { declareDefenseInterventionInTransaction, recordDeclaredAttackRollInTransaction, resolveDeclaredDefensesIfReadyInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import type { ActionDeclarationDraft } from "@/features/tabletop-operations/action-declaration";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || !url.pathname.endsWith("_dev")) throw new Error("Use a disposable loopback _dev database only.");
const ROLLBACK = new Error("Rollback runner fixture");
after(() => pool.end());

test("continuous simultaneous fight uses linked rolls, guarded advancement, application once, another action and next round", async () => {
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
    async function attack(actorId: number, target: number) {
      const actor = actorId === base.heroId ? player : god;
      const draft: ActionDeclarationDraft = { actorCharacterId: actorId, targetCharacterIds: [target], label: "Sword attack", actionKind: "weapon-attack", sourceKind: "weapon", sourceRef: null, sourceInstanceId: null, weaponItemId: itemId, firingModeId: null, attackMode: "Melee", initiativeCost: 4, allowsMultiRound: false, heldIntervention: false, windowKind: "melee-overlap", aimDeclared: false, calledShot: { declared: false, label: "", assignedPenalty: null }, explicitModifiers: [], preparesForDeclarationId: null, godNotes: "" };
      const id = await createActionDeclarationDraftInTransaction(tx, context, actor, draft);
      await lockActionDeclarationInTransaction(tx, context, actor, id);
      await commitActionDeclarationInTransaction(tx, context, actor, id);
      return id;
    }
    async function noDefenses() {
      for (const declaration of (await read()).declarations.declarations) for (const opportunity of declaration.opportunities.filter(({ status }) => status === "pending")) {
        await reconcileResponderOpportunityInTransaction(tx, context, god, opportunity.id, { decision: "allow" });
        const responder = opportunity.responderCharacterId === base.heroId ? player : god;
        await declareDefenseInterventionInTransaction(tx, context, responder, { opportunityId: opportunity.id, reactionType: "no-reaction", protectedTargetCharacterId: declaration.draft.targetCharacterIds[0] });
      }
    }
    const initial = await read();
    assert.equal(initial.snapshot.progression.actingParticipantIds.length, 2);
    const first = await attack(base.heroId, base.defenderId);
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
      await recordDeclaredAttackRollInTransaction(tx, context, id === first ? player : god, id, { method: "entered", enteredTotal: 89 });
      await resolveDeclaredDefensesIfReadyInTransaction(tx, context, god, id);
    }
    const rolled = await read();
    await continueCombatRunnerInTransaction(tx, context, { revision: rolled.snapshot.revision, command: "continue" });
    const applied = await read();
    assert.deepEqual(applied.effects.plans.map(({ status }) => status), ["applied", "applied"]);
    assert.deepEqual(applied.declarations.declarations.map(({ status }) => status), ["resolved", "resolved"]);
    assert.equal((await continueCombatRunnerInTransaction(tx, context, { revision: rolled.snapshot.revision, command: "continue" })).stale, true);
    assert.equal((await read()).effects.plans.length, 2);
    await attack(base.heroId, base.defenderId);
    await passParticipantInitiativeInTransaction(tx, context, base.defenderId);
    // The pending opportunity belongs to a passed defender; GOD explicitly rules it out.
    for (const declaration of (await read()).declarations.declarations) for (const opportunity of declaration.opportunities.filter(({ status }) => status === "pending")) {
      await reconcileResponderOpportunityInTransaction(tx, context, god, opportunity.id, { decision: "ineligible", reason: "Passed for this round." });
    }
    const again = await read();
    await continueCombatRunnerInTransaction(tx, context, { revision: again.snapshot.revision, command: "continue" });
    const third = (await read()).declarations.declarations.find(({ status }) => status !== "resolved")!;
    await recordDeclaredAttackRollInTransaction(tx, context, player, third.id, { method: "entered", enteredTotal: 25 });
    await resolveDeclaredDefensesIfReadyInTransaction(tx, context, god, third.id);
    await continueCombatRunnerInTransaction(tx, context, { revision: (await read()).snapshot.revision, command: "continue" });
    assert.equal((await read()).effects.plans.find(({ declarationId }) => declarationId === third.id)?.status, "applied", "a miss is a completed no-effect result, not a GOD ruling");
    await passParticipantInitiativeInTransaction(tx, context, base.heroId);
    const roundEnd = await read();
    assert.equal(roundEnd.snapshot.progression.canStartRound, true);
    await continueCombatRunnerInTransaction(tx, context, { revision: roundEnd.snapshot.revision, command: "round" });
    const nextRound = await read();
    assert.equal(nextRound.engine.runtime.roundNumber, 2);
    assert.deepEqual(nextRound.engine.participants.map(({ currentInitiative }) => currentInitiative), [14, 18]);
    throw ROLLBACK;
  }), (error) => { if (error !== ROLLBACK) console.error(error); return error === ROLLBACK; });
});
