import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { lifecycleAuditEvent } from "@/db/lifecycle-schema";
import { campaignCharacterProfile } from "@/db/realm-schema";
import { campaignSessionEncounter as encounter, campaignSessionEncounterInitiativeParticipant as participant,
  campaignSessionEncounterParticipant as member, campaignSessionEncounterEffect as effect,
  campaignSessionEncounterEffectPlan as plan, campaignSessionEncounterActionDeclaration as declaration, campaignSessionRoll } from "@/db/tabletop-operations-schema";
import { forceEndCombatInTransaction } from "@/features/tabletop-operations/combat-force-end-service";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { generateActionEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { resolveDeclaredDefensesInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { readEncounterCloseoutInTransaction, lockEncounterCloseoutContextInTransaction } from "@/features/tabletop-operations/encounter-closeout-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { setCombatFrozenInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { readOpenDeclarationCheckpoint } from "@/features/tabletop-operations/declaration-checkpoint-service";
import { readRollLedgerInTransaction } from "@/features/tabletop-operations/roll-runtime-service";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the disposable combat completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_FORCE_END");
const expected = (error: unknown) => { if (error !== rollback) console.error(error); return error === rollback; };

for (const state of ["underway", "ruling", "sealed"] as const) test(`G.O.D. force ends frozen ${state} combat without refunds, consequences, exposed choices, or duplicate audit`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, `force-end-${state}`);
    for (const id of state === "sealed" ? [f.heroId, f.defenderId] : [f.heroId]) await tx.update(participant).set({ participationStatus: "active" })
      .where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, id)));
    const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, id);
    const pendingId = await commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: 100 });
    if (state === "ruling") {
      await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, id);
      const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
      await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 18));
      await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
    }
    if (state === "sealed") assert.ok(await readOpenDeclarationCheckpoint(tx, f.encounterId));
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    const rolls = await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId));
    const resources = await tx.select().from(member).where(eq(member.encounterId, f.encounterId));
    const xp = await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId));
    await assert.rejects(forceEndCombatInTransaction(tx, f.encounterId, f.player), /Campaign-owning G.O.D./);
    await assert.rejects(forceEndCombatInTransaction(tx, f.encounterId, { authority: "god-owner", userId: "not-the-owner" }), /Campaign creator/i);
    assert.deepEqual(await loadInitiativeEngineInTransaction(tx, f.encounterId), before);
    assert.equal((await forceEndCombatInTransaction(tx, f.encounterId, f.god)).reused, false);
    assert.equal((await forceEndCombatInTransaction(tx, f.encounterId, f.god)).reused, true);
    const after = await loadInitiativeEngineInTransaction(tx, f.encounterId, true);
    assert.equal(after.runtime.status, "closed"); assert.equal(after.runtime.timelineInitiative, before.runtime.timelineInitiative);
    assert.deepEqual(after.participants, before.participants, "Closing cannot refund or zero Initiative debt.");
    const pending = after.pendingActions.find((entry) => entry.id === pendingId)!;
    assert.equal(pending.status, state === "ruling" ? "completed" : "ended");
    assert.equal(pending.initiativeSpent, before.pendingActions.find((entry) => entry.id === pendingId)!.initiativeSpent);
    assert.deepEqual(await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId)), rolls);
    assert.deepEqual(await tx.select().from(member).where(eq(member.encounterId, f.encounterId)), resources);
    assert.deepEqual(await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)), xp);
    assert.equal((await tx.select().from(declaration).where(eq(declaration.id, id)))[0].status, "cancelled");
    assert.equal(await readOpenDeclarationCheckpoint(tx, f.encounterId), null);
    if (state === "sealed") assert.equal((await readRollLedgerInTransaction(tx, { readAs: "god-owner", userId: f.godId, campaignId: f.campaignId, canRecordGodOnly: true }, f.sessionId)).rolls.length, 0);
    if (state === "ruling") {
      assert.ok((await tx.select().from(plan).where(eq(plan.encounterId, f.encounterId))).every((entry) => entry.status === "cancelled"));
      assert.ok((await tx.select().from(effect).where(eq(effect.encounterId, f.encounterId))).every((entry) => entry.status === "declined" && entry.appliedAt === null));
    }
    const closed = await readEncounterCloseoutInTransaction(tx, await lockEncounterCloseoutContextInTransaction(tx, f.encounterId, f.godId));
    assert.equal(closed.encounter.status, "completed"); assert.deepEqual(closed.blockers, []);
    assert.equal((await tx.select().from(encounter).where(eq(encounter.id, f.encounterId)))[0].frozenAt, null);
    assert.equal((await tx.select().from(lifecycleAuditEvent).where(and(eq(lifecycleAuditEvent.entityKind, "encounter"), eq(lifecycleAuditEvent.targetId, String(f.encounterId))))).length, 1);
    throw rollback;
  }), expected);
});

test("force end also works before Initiative is initialized", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "force-end-planned");
    const [planned] = await tx.insert(encounter).values({ campaignId: f.campaignId, sessionId: f.sessionId, sceneId: f.sceneId,
      sequenceNumber: 99, title: "Abandoned setup" }).returning();
    assert.equal((await forceEndCombatInTransaction(tx, planned.id, f.god)).status, "completed");
    const [result] = await tx.select().from(encounter).where(eq(encounter.id, planned.id));
    assert.ok(result.startedAt); assert.ok(result.completedAt);
    throw rollback;
  }), expected);
});
