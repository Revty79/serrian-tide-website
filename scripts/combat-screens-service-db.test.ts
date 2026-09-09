import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { campaignCharacter } from "@/db/realm-schema";
import { weaponProfile } from "@/db/item-schema";
import { campaignSessionEncounterInitiativeParticipant as enrollment, campaignSessionEncounterActionDeclaration as declaration, campaignSessionEncounterParticipant as member, campaignSessionRoll as roll } from "@/db/tabletop-operations-schema";
import { previewCombatChoiceInTransaction, submitCombatChoiceInTransaction } from "@/features/combat-screen/choice-service";
import { physicalPercentile, type CombatSubmission } from "@/features/combat-screen/choice-types";
import { applyRoutineCombatConsequencesInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { resolveDeclaredDefensesInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { holdParticipantInitiativeInTransaction, loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { readCombatProjectionInTransaction } from "@/features/tabletop-operations/combat-projection-service";
import { readOpenDeclarationCheckpoint } from "@/features/tabletop-operations/declaration-checkpoint-service";
import { reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { campaignSessionEncounterResponderOpportunity as response } from "@/db/tabletop-operations-schema";
import { ruleOrdinaryAttackConsequenceInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { spawnEncounterCreaturesInTransaction } from "@/features/tabletop-operations/creature-spawn-service";
if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the disposable combat completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_SCREEN_FIXTURE");

test("a critical lethal Roll cannot damage a Creature while the slower attack is unfinished; earlier concurrent work resolves first", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx);
    await tx.update(weaponProfile).set({ initiativeCost: 5 }).where(eq(weaponProfile.itemId, f.weaponId));
    await tx.update(enrollment).set({ participationStatus: "active" }).where(and(eq(enrollment.encounterId, f.encounterId), eq(enrollment.characterId, f.occurrences[0])));
    const attackReceipt = await submitCombatChoiceInTransaction(tx, f.context, f.player, { ...f.input, roll: { method: "entered", enteredTotal: 100 } });
    const creatureReceipt = await submitCombatChoiceInTransaction(tx, f.context, f.god, { requestKey: crypto.randomUUID(), choice: { participantId: f.occurrences[0], targetIds: [f.occurrences[1]], source: { kind: "creature-attack", ref: "fixture-shortsword", name: "Shortsword", itemId: null, instanceId: null, description: "" } }, roll: { method: "entered", enteredTotal: 20 } });
    assert.ok("declarationId" in attackReceipt && "declarationId" in creatureReceipt);
    const attack = attackReceipt.declarationId, creature = creatureReceipt.declarationId;
    for (const window of await tx.select().from(response).where(eq(response.encounterId, f.encounterId))) if (window.status === "pending") await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "ineligible", reason: "Explicit fixture ruling: no additional legitimate response during these committed attacks." });
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 18));
    await assert.rejects(tx.transaction((savepoint) => applyRoutineCombatConsequencesInTransaction(savepoint, f.context, f.player, attack)), /complete|timing/i);
    const readTarget = async () => (await tx.select().from(member).where(eq(member.characterId, f.occurrences[0])))[0].localStateJson as { health?: { totalDamage?: number }; combatCondition?: { status: string } };
    assert.equal((await readTarget())?.health?.totalDamage ?? 0, 0);
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, creature);
    await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, creature);
    const next = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, next, advanceInitiativeTimeline(next, 17));
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, attack);
    const result = await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, attack);
    assert.equal(result.status, "requires-god-ruling");
    assert.equal((await readTarget())?.health?.totalDamage ?? 0, 0);
    await ruleOrdinaryAttackConsequenceInTransaction(tx, f.context, f.god, result.planId, { targetParticipantId: f.occurrences[0], hitLocationNumber: 0, reason: "Apply the completed critical attack at its authored head location using the calculated damage." });
    await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, attack);
    const final = await readTarget();
    assert.equal(final.combatCondition?.status, "dead");
    await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, attack);
    assert.deepEqual(await readTarget(), final);
    throw rollback;
  }), (error) => error === rollback);
});

test("Hold satisfies its sealed choice, keeps Initiative, and never demands another ordinary choice or extra Step", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx);
    await tx.update(enrollment).set({ participationStatus: "active" }).where(and(eq(enrollment.encounterId, f.encounterId), eq(enrollment.characterId, f.defenderId)));
    await holdParticipantInitiativeInTransaction(tx, f.context, f.heroId);
    assert.ok(await readOpenDeclarationCheckpoint(tx, f.encounterId));
    await holdParticipantInitiativeInTransaction(tx, f.context, f.heroId);
    let engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(engine.runtime.stepNumber, 1);
    await holdParticipantInitiativeInTransaction(tx, f.context, f.defenderId);
    assert.equal(await readOpenDeclarationCheckpoint(tx, f.encounterId), null);
    engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(engine.runtime.stepNumber, 2);
    const projection = await readCombatProjectionInTransaction(tx, f.context, f.player);
    const hero = projection.entities.find((entry) => entry.participantId === f.heroId)!;
    assert.equal(hero.currentInitiative, 22);
    assert.equal(hero.mustChooseNow, false);
    assert.equal(hero.heldInterventionAvailable, true);
    assert.match(hero.statusText, /No ordinary choice is required/);
    assert.equal(projection.progression.canAdvanceTimeline, false);
    assert.match(projection.progression.reason, /No further Initiative event/);
    await holdParticipantInitiativeInTransaction(tx, f.context, f.heroId);
    assert.deepEqual(await loadInitiativeEngineInTransaction(tx, f.encounterId), engine);
    throw rollback;
  }), (error) => error === rollback);
});
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function fixture(tx: Tx) {
  const f = await completionServiceFixture(tx, "screen-command");
  await tx.update(enrollment).set({ participationStatus: "active" }).where(and(eq(enrollment.encounterId, f.encounterId), eq(enrollment.characterId, f.heroId)));
  const input: CombatSubmission = { choice: { participantId: f.heroId, targetIds: [f.occurrences[0]], source: { kind: "weapon", ref: `stack:${f.weaponId}`, name: "Shortsword", itemId: f.weaponId, instanceId: null, description: "" } }, requestKey: crypto.randomUUID(), roll: { method: "entered", enteredTotal: 70 } };
  return { ...f, input };
}
test("screen preview does not create declarations, spend resources or roll; declaration and Roll commit exactly once", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx);
    const preview = await previewCombatChoiceInTransaction(tx, f.context, f.player, f.input.choice);
    assert.equal(preview.kind, "declaration"); if (preview.kind === "declaration") assert.equal(preview.snapshot.initiativeCost, 4);
    assert.equal((await tx.select().from(declaration).where(eq(declaration.encounterId, f.encounterId))).length, 0);
    const first = await submitCombatChoiceInTransaction(tx, f.context, f.player, f.input);
    const second = await submitCombatChoiceInTransaction(tx, f.context, f.player, f.input);
    assert.equal("declarationId" in first && first.declarationId, "declarationId" in second && second.declarationId);
    assert.equal((await tx.select().from(declaration).where(eq(declaration.encounterId, f.encounterId))).length, 1);
    assert.equal((await tx.select().from(roll).where(eq(roll.encounterId, f.encounterId))).length, 1);
    await assert.rejects(submitCombatChoiceInTransaction(tx, f.context, f.player, { ...f.input, roll: { method: "entered", enteredTotal: 71 } }), /different command or Roll/);
    throw rollback;
  }), (error) => error === rollback);
});
test("invalid physical Roll rolls back the entire screen declaration", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx);
    await assert.rejects(tx.transaction((savepoint) => submitCombatChoiceInTransaction(savepoint, f.context, f.player, { ...f.input, roll: { method: "entered", enteredTotal: 101 } })));
    assert.equal((await tx.select().from(declaration).where(eq(declaration.encounterId, f.encounterId))).length, 0);
    assert.equal(physicalPercentile("00"), 100);
    throw rollback;
  }), (error) => error === rollback);
});
test("screen choice authority keeps Player choices with the Player; G.O.D. can apply their completed result", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx);
    await assert.rejects(submitCombatChoiceInTransaction(tx, f.context, f.god, f.input), /Player|own/);
    await assert.rejects(submitCombatChoiceInTransaction(tx, f.context, f.player, { ...f.input, choice: { ...f.input.choice, participantId: f.defenderId } }), /Player|own/);
    const result = await submitCombatChoiceInTransaction(tx, f.context, f.player, f.input);
    assert.ok("declarationId" in result); const id = result.declarationId;
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, id);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 18));
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, id)).status, "applied");
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, id)).status, "applied");
    const [target] = await tx.select().from(member).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, f.occurrences[0])));
    assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, 6);
    throw rollback;
  }), (error) => error === rollback);
});
test("adding and retrying Creature occurrences creates no NPC records", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx);
    const [existing] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
    const count = (await tx.select().from(campaignCharacter).where(eq(campaignCharacter.campaignId, f.campaignId))).length;
    const input = { creatureId: existing.creatureId!, quantity: 3, joinInitiative: false, requestKey: crypto.randomUUID() };
    const first = await spawnEncounterCreaturesInTransaction(tx, f.context, f.godId, input);
    assert.deepEqual(await spawnEncounterCreaturesInTransaction(tx, f.context, f.godId, input), first);
    assert.equal(first.created.length, 3); assert.equal(new Set(first.created.map((entry) => entry.runtimeParticipantKey)).size, 3);
    assert.ok(first.created.every((entry) => entry.runtimeParticipantKey < 0));
    assert.equal((await tx.select().from(campaignCharacter).where(eq(campaignCharacter.campaignId, f.campaignId))).length, count);
    throw rollback;
  }), (error) => error === rollback);
});
