import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { campaignCharacter } from "@/db/realm-schema";
import { campaignSessionEncounterInitiativeParticipant as enrollment, campaignSessionEncounterActionDeclaration as declaration, campaignSessionEncounterParticipant as member, campaignSessionRoll as roll } from "@/db/tabletop-operations-schema";
import { previewCombatChoiceInTransaction, submitCombatChoiceInTransaction } from "@/features/combat-screen/choice-service";
import { physicalPercentile, type CombatSubmission } from "@/features/combat-screen/choice-types";
import { applyRoutineCombatConsequencesInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { resolveDeclaredDefensesInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { spawnEncounterCreaturesInTransaction } from "@/features/tabletop-operations/creature-spawn-service";
if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the disposable combat completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_SCREEN_FIXTURE");
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
