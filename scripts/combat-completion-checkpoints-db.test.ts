import assert from "node:assert/strict";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { campaignCharacter } from "@/db/realm-schema";
import { campaignSessionEncounterInitiative, campaignSessionEncounterInitiativeParticipant, campaignSessionRoll } from "@/db/tabletop-operations-schema";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction, readActionDeclarationWorkspaceInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import type { ActionDeclarationDraft } from "@/features/tabletop-operations/action-declaration";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { readOpenDeclarationCheckpoint } from "@/features/tabletop-operations/declaration-checkpoint-service";
import { holdParticipantInitiativeInTransaction, loadInitiativeEngineInTransaction, lockOwnedEncounterRuntimeInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { readRollLedgerInTransaction } from "@/features/tabletop-operations/roll-runtime-service";
import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the disposable combat completion harness.");
const connection = new URL(process.env.DATABASE_URL ?? "missing:");
if (connection.hostname !== "127.0.0.1" || connection.pathname !== "/serrian_combat_completion_dev" || connection.port === "5432") {
  throw new Error("Combat completion fixtures require the dedicated disposable database and port.");
}
after(() => pool.end());
const rollback = new Error("ROLLBACK_COMPLETION_CHECKPOINT_FIXTURE");
const draft = (actorCharacterId: number, target: number): ActionDeclarationDraft => ({
  actorCharacterId, targetCharacterIds: [target], label: "Explicit fixture action", actionKind: "fixture-action", sourceKind: "generic",
  sourceRef: null, sourceInstanceId: null, weaponItemId: null, firingModeId: null, attackMode: "", initiativeCost: 4,
  allowsMultiRound: false, heldIntervention: false, windowKind: "ordinary", aimDeclared: false,
  calledShot: { declared: false, label: "", assignedPenalty: null }, explicitModifiers: [], preparesForDeclarationId: null, godNotes: "Authorized numeric test override",
});

for (const reversed of [false, true]) test(`simultaneous declaration Rolls stay sealed across authoritative reads; reverse=${reversed}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const fixture = await insertBuildTenFixture(tx, "completion-checkpoint");
    await tx.update(campaignCharacter).set({ isNpc: true, npcKind: "race", npcBuildMode: "detailed" }).where(eq(campaignCharacter.id, fixture.heroId));
    await tx.update(campaignSessionEncounterInitiativeParticipant).set({ currentInitiative: 22, normalTotalInitiative: 22 })
      .where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, fixture.encounterId));
    await tx.update(campaignSessionEncounterInitiative).set({ timelineInitiative: 22, roundNumber: 1, stepNumber: 1 })
      .where(eq(campaignSessionEncounterInitiative.encounterId, fixture.encounterId));
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, fixture.encounterId, fixture.godId);
    const actor = { authority: "god-owner" as const, userId: fixture.godId };
    const reader = { readAs: "god-owner" as const, userId: fixture.godId, campaignId: fixture.campaignId, canRecordGodOnly: true };
    const ids = reversed ? [fixture.defenderId, fixture.heroId] : [fixture.heroId, fixture.defenderId];
    const declarationIds: number[] = [];
    for (const id of ids) {
      const declaration = await createActionDeclarationDraftInTransaction(tx, context, actor, draft(id, ids.find((candidate) => candidate !== id)!));
      await lockActionDeclarationInTransaction(tx, context, actor, declaration);
      declarationIds.push(declaration);
    }
    const firstRoll = ids[0] === fixture.heroId ? 90 : 55;
    const firstAction = await commitActionDeclarationInTransaction(tx, context, actor, declarationIds[0], { method: "entered", enteredTotal: firstRoll, manualTarget: 40, manualLabel: "Fixture target" });
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.pendingActionId, firstAction)))[0].resultTotal, firstRoll, "Roll is already recorded at declaration");
    assert.equal((await readRollLedgerInTransaction(tx, reader, fixture.sessionId)).rolls.length, 0);
    assert.equal((await readActionDeclarationWorkspaceInTransaction(tx, context, actor)).declarations.some(({ id }) => id === declarationIds[0]), false);
    const before = await loadInitiativeEngineInTransaction(tx, fixture.encounterId);
    await assert.rejects(persistInitiativeEngineInTransaction(tx, context, before, advanceInitiativeTimeline(before, 18)), /checkpoint/);
    assert.equal(await commitActionDeclarationInTransaction(tx, context, actor, declarationIds[0]), firstAction, "retry preserves original timing/Roll");
    await commitActionDeclarationInTransaction(tx, context, actor, declarationIds[1], { method: "entered", enteredTotal: ids[1] === fixture.heroId ? 90 : 55, manualTarget: 40, manualLabel: "Fixture target" });
    assert.equal(await readOpenDeclarationCheckpoint(tx, fixture.encounterId), null);
    const history = await readRollLedgerInTransaction(tx, reader, fixture.sessionId);
    assert.deepEqual(history.rolls.map(({ resultTotal }) => resultTotal).sort((a, b) => a - b), [55, 90]);
    const committed = await loadInitiativeEngineInTransaction(tx, fixture.encounterId);
    const completed = advanceInitiativeTimeline(committed, 18);
    await persistInitiativeEngineInTransaction(tx, context, committed, completed);
    assert.ok(completed.pendingActions.filter(({ id }) => id === firstAction).every(({ status }) => status === "completed"));
    throw rollback;
  }), (error) => error === rollback);
});

test("an explicit Hold closes the current group and retrying Hold neither spends nor advances a Step", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const fixture = await insertBuildTenFixture(tx, "completion-hold");
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, fixture.encounterId, fixture.godId);
    await holdParticipantInitiativeInTransaction(tx, context, fixture.heroId);
    const before = await loadInitiativeEngineInTransaction(tx, fixture.encounterId);
    await holdParticipantInitiativeInTransaction(tx, context, fixture.heroId);
    assert.deepEqual(await loadInitiativeEngineInTransaction(tx, fixture.encounterId), before);
    assert.equal(await readOpenDeclarationCheckpoint(tx, fixture.encounterId), null);
    throw rollback;
  }), (error) => error === rollback);
});
