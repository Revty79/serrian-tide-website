import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { campaignSessionEncounterInitiativeParticipant as participant, campaignSessionEncounterResponderOpportunity as opportunity, campaignSessionRoll, campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction, reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { declareDefenseInterventionInTransaction, resolveDeclaredDefensesInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { loadInitiativeEngineInTransaction, holdParticipantInitiativeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { readOpenDeclarationCheckpoint } from "@/features/tabletop-operations/declaration-checkpoint-service";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_PARTICIPANT_FIXTURE");

for (const kind of ["player", "npc", "creature"] as const) test(`${kind} uses exact sources and resolves one Block commitment`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, kind);
    const actorId = kind === "player" ? f.heroId : kind === "npc" ? f.defenderId : f.occurrences[0];
    const defenderId = kind === "creature" ? f.occurrences[1] : kind === "npc" ? f.heroId : f.defenderId;
    const actor = kind === "player" ? f.player : f.god;
    const defender = defenderId === f.heroId ? f.player : f.god;
    for (const [id, status] of [[actorId, "active"], [defenderId, "holding"]] as const) await tx.update(participant).set({ participationStatus: status }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, id)));
    const draft = { ...completionDraft(actorId, defenderId), sourceKind: kind === "creature" ? "creature-attack" as const : "weapon" as const,
      sourceRef: kind === "creature" ? "fixture-shortsword" : `item:${f.weaponId}`, weaponItemId: kind === "creature" ? null : f.weaponId };
    if (kind === "player") await assert.rejects(createActionDeclarationDraftInTransaction(tx, f.context, f.god, draft), /own action choice/);
    if (kind !== "player") await assert.rejects(createActionDeclarationDraftInTransaction(tx, f.context, f.player, draft), /own authorized Character/);
    await assert.rejects(createActionDeclarationDraftInTransaction(tx, f.context, { authority: "god-owner", userId: "unrelated-admin" }, draft), /Campaign-owning/);
    const declarationId = await createActionDeclarationDraftInTransaction(tx, f.context, actor, draft);
    await lockActionDeclarationInTransaction(tx, f.context, actor, declarationId);
    const pendingId = await commitActionDeclarationInTransaction(tx, f.context, actor, declarationId, { method: "entered", enteredTotal: 55 });
    assert.equal(await commitActionDeclarationInTransaction(tx, f.context, actor, declarationId), pendingId);
    const [window] = await tx.select().from(opportunity).where(and(eq(opportunity.declarationId, declarationId), eq(opportunity.responderCharacterId, defenderId)));
    assert.ok(window);
    const response = { opportunityId: window.id, reactionType: "block" as const, protectedTargetCharacterId: defenderId,
      itemId: kind === "creature" ? null : f.weaponId, sourceRef: kind === "creature" ? "fixture-shortsword" : undefined };
    assert.equal(window.requiresGodConfirmation, false, "Reached Initiative supplies eligibility without G.O.D. permission.");
    const reaction = await declareDefenseInterventionInTransaction(tx, f.context, defender, response, { method: "entered", enteredTotal: 78 });
    assert.equal(await declareDefenseInterventionInTransaction(tx, f.context, defender, response), reaction);
    const result = await resolveDeclaredDefensesInTransaction(tx, f.context, actor, declarationId);
    assert.equal(result.attackStopped, true);
    assert.equal(result.attackerAdditionalCost, 4);
    const engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(engine.participants.find(({ characterId }) => characterId === defenderId)?.currentInitiative, 21);
    assert.equal(engine.pendingActions.find(({ id }) => id === pendingId)?.expectedCompletionInitiative, 14);
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 2);
    if (kind === "creature") {
      const occurrences = await tx.select().from(campaignSessionEncounterParticipant).where(eq(campaignSessionEncounterParticipant.creatureId, (await tx.select().from(campaignSessionEncounterParticipant).where(eq(campaignSessionEncounterParticipant.characterId, actorId)))[0].creatureId!));
      assert.equal(occurrences.length, 2);
      assert.notEqual(occurrences[0].characterId, occurrences[1].characterId);
    }
    throw rollback;
  }), (error) => error === rollback);
});

test("Mira's simultaneous Hold reveals the checkpoint and permits a response with fresh Roll 36 without permission", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "hold-awareness");
    await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.heroId)));
    await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.occurrences[0])));
    const declaration = await createActionDeclarationDraftInTransaction(tx, f.context, f.god, { ...completionDraft(f.occurrences[0], f.heroId), sourceKind: "creature-attack", sourceRef: "fixture-shortsword" });
    await lockActionDeclarationInTransaction(tx, f.context, f.god, declaration);
    await commitActionDeclarationInTransaction(tx, f.context, f.god, declaration, { method: "entered", enteredTotal: 55 });
    const [window] = await tx.select().from(opportunity).where(eq(opportunity.declarationId, declaration));
    await assert.rejects(reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "allow" }), /sealed/);
    await holdParticipantInitiativeInTransaction(tx, f.context, f.heroId);
    assert.equal(await readOpenDeclarationCheckpoint(tx, f.encounterId), null);
    const dodge = { opportunityId: window.id, reactionType: "dodge" as const, protectedTargetCharacterId: f.heroId };
    assert.equal(window.requiresGodConfirmation, false);
    await declareDefenseInterventionInTransaction(tx, f.context, f.player, dodge, { method: "entered", enteredTotal: 36 });
    assert.deepEqual((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).map(({ resultTotal }) => resultTotal).sort((a, b) => a - b), [36, 55]);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.heroId)?.currentInitiative, 21);
    throw rollback;
  }), (error) => error === rollback);
});
