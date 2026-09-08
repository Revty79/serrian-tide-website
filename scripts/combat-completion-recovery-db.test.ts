import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { campaignSessionEncounter as encounter, campaignSessionEncounterInitiativeParticipant as participant,
  campaignSessionEncounterParticipant as occurrence, campaignSessionEncounterEffect as effect,
  campaignSessionEncounterEffectPlan as plan, campaignSessionEncounterEffectPlanEvent as event,
  campaignSessionEncounterActionDeclaration as declaration, campaignSessionEncounterResponderOpportunity as opportunity,
  campaignSessionEncounterReaction as reaction, campaignSessionEncounterInitiative as initiative } from "@/db/tabletop-operations-schema";
import { declareCombatMovementInTransaction } from "@/features/tabletop-operations/combat-movement-service";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction,
  cancelActionDeclarationInTransaction, interruptActionDeclarationInTransaction, reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { generateActionEffectPlanInTransaction, approveActionEffectPlanInTransaction, applyRoutineCombatConsequencesInTransaction,
  completeRetainedCombatEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { readCombatRecoveryInTransaction, settleCombatEffectRemainderInTransaction } from "@/features/tabletop-operations/combat-recovery-service";
import { readEncounterCloseoutInTransaction, lockEncounterCloseoutContextInTransaction } from "@/features/tabletop-operations/encounter-closeout-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { setCombatFrozenInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { resolveDeclaredDefensesInTransaction, declareDefenseInterventionInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { withdrawCombatCheckpointInTransaction } from "@/features/tabletop-operations/combat-recovery-service";
import { readOpenDeclarationCheckpoint } from "@/features/tabletop-operations/declaration-checkpoint-service";
import { readRollLedgerInTransaction } from "@/features/tabletop-operations/roll-runtime-service";
import { initiativeStateToken, assertExpectedInitiativeState } from "@/features/tabletop-operations/initiative-state-token";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_COMBAT_RECOVERY");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fixture = Awaited<ReturnType<typeof completionServiceFixture>>;
async function advance(tx: Tx, f: Fixture, point: number) {
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, point));
}

test("authoritative Creature movement records four then two feet, survives Freeze and interruption, and cannot replay a segment", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "movement");
    const id = f.occurrences[0];
    await tx.update(occurrence).set({ creatureSnapshotJson: { ...f.creatureSnapshot, attributes: [], movement: [{ movementMode: "Walk", movementValue: 2 }] } }).where(eq(occurrence.characterId, id));
    await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, id)));
    const command = { participantId: id, movementMode: "Walk", distance: 4, requestKey: crypto.randomUUID() };
    await assert.rejects(declareCombatMovementInTransaction(tx, f.context, f.player, command), /own|Player/);
    const move = await declareCombatMovementInTransaction(tx, f.context, f.god, command);
    assert.equal((await declareCombatMovementInTransaction(tx, f.context, f.god, command)).pendingActionId, move.pendingActionId);
    await assert.rejects(declareCombatMovementInTransaction(tx, f.context, f.god, { ...command, distance: 10 }), /different segment/);
    await advance(tx, f, 20);
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, move.declarationId)).status, "applied");
    const next = await declareCombatMovementInTransaction(tx, f.context, f.god, { ...command, requestKey: crypto.randomUUID(), distance: 4 });
    await advance(tx, f, 19);
    const state = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    await assert.rejects(advance(tx, f, 18), /Combat is paused/);
    assert.deepEqual(await loadInitiativeEngineInTransaction(tx, f.encounterId), state);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
    await interruptActionDeclarationInTransaction(tx, f.context, f.god, next.declarationId, "Movement interrupted after two feet of this segment.");
    const [row] = await tx.select().from(occurrence).where(eq(occurrence.characterId, id));
    const history = (row.localStateJson as { movementHistory: { distance: number }[] }).movementHistory;
    assert.deepEqual(history.map(({ distance }) => distance), [4, 2]);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).pendingActions.find(({ id }) => id === next.pendingActionId)!.remainingInitiativeCost, 1);
    throw rollback;
  }), (error) => error === rollback);
});

async function plannedAttack(tx: Tx, label: string, roll = 70) {
  const f = await completionServiceFixture(tx, label);
  await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.heroId)));
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId });
  await lockActionDeclarationInTransaction(tx, f.context, f.player, id);
  await commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: roll });
  await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, id);
  await advance(tx, f, 18);
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
  await approveActionEffectPlanInTransaction(tx, f.context, f.god, planId);
  return { ...f, declarationId: id, planId };
}

test("stale Initiative writes cannot advance twice and a withdrawn checkpoint keeps its recorded Roll sealed", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "checkpoint-recovery");
    for (const id of [f.heroId, f.defenderId]) await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, id)));
    const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, id);
    await commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: 70 });
    const checkpoint = (await readOpenDeclarationCheckpoint(tx, f.encounterId))!;
    const request = { checkpointId: checkpoint.id, reason: "Player is absent; withdraw the entire unexposed group without inventing a choice." };
    await assert.rejects(withdrawCombatCheckpointInTransaction(tx, f.encounterId, f.player, request), /Campaign-owning/);
    await withdrawCombatCheckpointInTransaction(tx, f.encounterId, f.god, request);
    assert.equal((await withdrawCombatCheckpointInTransaction(tx, f.encounterId, f.god, request)).reused, true);
    assert.equal(await readOpenDeclarationCheckpoint(tx, f.encounterId), null);
    assert.equal((await readRollLedgerInTransaction(tx, { readAs: "god-owner", userId: f.godId, campaignId: f.campaignId, canRecordGodOnly: true }, f.sessionId)).rolls.length, 0);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    const token = initiativeStateToken(before);
    const changed = { ...before, participants: before.participants.map((entry) => ({ ...entry, currentInitiative: entry.currentInitiative - 1 })) };
    await persistInitiativeEngineInTransaction(tx, f.context, before, changed);
    await assert.rejects(persistInitiativeEngineInTransaction(tx, f.context, before, changed), /already completed|state changed/);
    assert.throws(() => assertExpectedInitiativeState(changed, token), /Refresh before advancing/);
    throw rollback;
  }), (error) => error === rollback);
});

test("withdrawing a sealed response checkpoint preserves the earlier incoming attack and keeps the response Roll private", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "response-checkpoint-recovery"), target = f.occurrences[0];
    await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.heroId)));
    for (const id of f.occurrences) await tx.update(participant).set({ participationStatus: "active", currentInitiative: 20 }).where(eq(participant.characterId, id));
    const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, target), sourceKind: "weapon", weaponItemId: f.weaponId });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, id);
    await commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: 70 });
    await advance(tx, f, 20);
    const [window] = await tx.select().from(opportunity).where(and(eq(opportunity.declarationId, id), eq(opportunity.responderCharacterId, target)));
    await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "allow" });
    const reactionId = await declareDefenseInterventionInTransaction(tx, f.context, f.god,
      { opportunityId: window.id, reactionType: "dodge", protectedTargetCharacterId: target }, { method: "entered", enteredTotal: 90 });
    const checkpoint = (await readOpenDeclarationCheckpoint(tx, f.encounterId))!;
    assert.ok(checkpoint);
    await withdrawCombatCheckpointInTransaction(tx, f.encounterId, f.god, { checkpointId: checkpoint.id, reason: "Withdraw this unfinished response group only." });
    const [attack] = await tx.select().from(declaration).where(eq(declaration.id, id));
    assert.ok(!["cancelled", "abandoned"].includes(attack.status));
    const engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(engine.pendingActions.find(({ id }) => id === attack.pendingActionId)!.status, "active");
    assert.equal(engine.participants.find(({ characterId }) => characterId === target)!.currentInitiative, 19);
    assert.equal((await tx.select().from(reaction).where(eq(reaction.id, reactionId)))[0].status, "cancelled");
    const visible = await readRollLedgerInTransaction(tx, { readAs: "god-owner", userId: f.godId, campaignId: f.campaignId, canRecordGodOnly: true }, f.sessionId);
    assert.deepEqual(visible.rolls.map(({ resultTotal }) => resultTotal), [70]);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

test("cancellation closes every unapplied portion plan and closeout reports unfinished plans independently", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await plannedAttack(tx, "multi-plan-cancel");
    const [first] = await tx.select().from(plan).where(eq(plan.id, f.planId));
    const { id: ignored, ...copy } = first; void ignored;
    const [second] = await tx.insert(plan).values({ ...copy, firearmPortion: 1 }).returning();
    const context = await lockEncounterCloseoutContextInTransaction(tx, f.encounterId, f.godId);
    assert.equal((await readEncounterCloseoutInTransaction(tx, context)).blockers.filter(({ code }) => code === "effect-plan-unresolved").length, 2);
    await assert.rejects(cancelActionDeclarationInTransaction(tx, f.context, f.god, f.declarationId, "Attempt to discard a completed hit by ending its action."), /already completed/);
    for (const planId of [first.id, second.id]) await settleCombatEffectRemainderInTransaction(tx, f.encounterId, f.god, { planId, reason: "Explicitly decline this completed outcome before cancelling." });
    await cancelActionDeclarationInTransaction(tx, f.context, f.god, f.declarationId, "Both plans explicitly declined.");
    assert.deepEqual((await tx.select().from(plan).where(eq(plan.declarationId, f.declarationId))).map(({ status }) => status), ["cancelled", "cancelled"]);
    assert.ok(second.id !== first.id);
    throw rollback;
  }), (error) => error === rollback);
});

test("G.O.D. recovery preserves partial applied evidence in a completed historical Encounter and only declines the remainder", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await plannedAttack(tx, "historical-recovery");
    const [original] = await tx.select().from(effect).where(eq(effect.planId, f.planId));
    const receipt = { historicalFixture: true, totalDamageBefore: 0, totalDamageAfter: 6 };
    await tx.update(effect).set({ status: "applied", appliedResultJson: receipt, appliedAt: new Date() }).where(eq(effect.id, original.id));
    const { id: ignored, ...copy } = original; void ignored;
    const [remaining] = await tx.insert(effect).values({ ...copy, effectKey: `${copy.effectKey}:remainder`, status: "application-failed", appliedResultJson: null, appliedAt: null }).returning();
    await tx.update(plan).set({ status: "partially-applied" }).where(eq(plan.id, f.planId));
    await assert.rejects(cancelActionDeclarationInTransaction(tx, f.context, f.god, f.declarationId, "Cannot silently cancel a partial plan."), /unapplied remainder/);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    const command = { planId: f.planId, reason: "Explicit historical recovery: retain the recorded first effect and decline the failed remainder." };
    await assert.rejects(settleCombatEffectRemainderInTransaction(tx, f.encounterId, f.god, command), /Combat is paused/);
    assert.equal((await readCombatRecoveryInTransaction(tx, f.encounterId, f.god)).length, 1);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
    // Reproduce the audited retained state without changing any ordinary database.
    await tx.update(declaration).set({ status: "cancelled", endedAt: new Date(), endedByUserId: f.godId }).where(eq(declaration.id, f.declarationId));
    await tx.update(encounter).set({ status: "completed", completedAt: new Date() }).where(eq(encounter.id, f.encounterId));
    await assert.rejects(settleCombatEffectRemainderInTransaction(tx, f.encounterId, f.player, command), /Campaign-owning/);
    await assert.rejects(settleCombatEffectRemainderInTransaction(tx, f.encounterId, { authority: "god-owner", userId: "outsider-admin" }, command), /owner|creator/);
    assert.equal((await settleCombatEffectRemainderInTransaction(tx, f.encounterId, f.god, command)).reused, false);
    assert.equal((await settleCombatEffectRemainderInTransaction(tx, f.encounterId, f.god, command)).reused, true);
    const [preserved] = await tx.select().from(effect).where(eq(effect.id, original.id));
    assert.equal(preserved.status, "applied"); assert.deepEqual(preserved.appliedResultJson, receipt);
    assert.equal((await tx.select().from(effect).where(eq(effect.id, remaining.id)))[0].status, "declined");
    assert.equal((await tx.select().from(event).where(and(eq(event.planId, f.planId), eq(event.eventKind, "unapplied-remainder-recovered")))).length, 1);
    throw rollback;
  }), (error) => error === rollback);
});

test("approved historical damage completes once after force-close without reopening Initiative or replaying resources", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await plannedAttack(tx, "historical-complete");
    await tx.update(declaration).set({ status: "cancelled", endedAt: new Date(), endedByUserId: f.godId }).where(eq(declaration.id, f.declarationId));
    await tx.update(encounter).set({ status: "completed", completedAt: new Date(), frozenAt: new Date() }).where(eq(encounter.id, f.encounterId));
    await tx.update(initiative).set({ status: "closed", closedAt: new Date() }).where(eq(initiative.encounterId, f.encounterId));
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId, true);
    const command = { planId: f.planId, reason: "Explicit G.O.D. correction: complete the approved damage despite the prior force-close." };
    await assert.rejects(completeRetainedCombatEffectPlanInTransaction(tx, f.encounterId, f.player, command), /Campaign-owning/);
    await assert.rejects(completeRetainedCombatEffectPlanInTransaction(tx, f.encounterId, { authority: "god-owner", userId: "outsider" }, command), /owner|creator/);
    await assert.rejects(completeRetainedCombatEffectPlanInTransaction(tx, f.encounterId, f.god, command), /Combat is paused/);
    await tx.update(encounter).set({ frozenAt: null }).where(eq(encounter.id, f.encounterId));
    assert.equal((await completeRetainedCombatEffectPlanInTransaction(tx, f.encounterId, f.god, command)).status, "applied");
    assert.equal((await completeRetainedCombatEffectPlanInTransaction(tx, f.encounterId, f.god, command)).reused, true);
    const [target] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
    assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, 6);
    assert.deepEqual(await loadInitiativeEngineInTransaction(tx, f.encounterId, true), before);
    assert.equal((await tx.select().from(encounter).where(eq(encounter.id, f.encounterId)))[0].status, "completed");
    assert.equal((await tx.select().from(declaration).where(eq(declaration.id, f.declarationId)))[0].status, "resolved");
    assert.equal((await tx.select().from(event).where(and(eq(event.planId, f.planId), eq(event.eventKind, "historical-consequences-completed")))).length, 1);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

test("an all-declined completed attack closes automatically, and its legacy calculated wrapper can be repaired without damage", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await plannedAttack(tx, "no-applicable-consequences", 8);
    assert.equal((await tx.select().from(plan).where(eq(plan.id, f.planId)))[0].status, "applied", "No empty Apply request is needed after generation.");
    assert.equal((await tx.select().from(declaration).where(eq(declaration.id, f.declarationId)))[0].status, "resolved");
    assert.ok((await tx.select().from(effect).where(eq(effect.planId, f.planId))).every(({ status }) => status === "declined"));
    // Reproduce the historical stale wrapper, preserving the already-declined effect.
    await tx.update(plan).set({ status: "calculated", appliedAt: null, appliedByUserId: null }).where(eq(plan.id, f.planId));
    await tx.update(declaration).set({ status: "cancelled" }).where(eq(declaration.id, f.declarationId));
    await tx.update(encounter).set({ status: "completed", completedAt: new Date() }).where(eq(encounter.id, f.encounterId));
    const input = { planId: f.planId, reason: "Keep the correctly declined damage and finish its enclosing plan." };
    assert.equal((await completeRetainedCombatEffectPlanInTransaction(tx, f.encounterId, f.god, input)).status, "declined");
    assert.equal((await completeRetainedCombatEffectPlanInTransaction(tx, f.encounterId, f.god, input)).reused, true);
    const [target] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
    assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, 0);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});
