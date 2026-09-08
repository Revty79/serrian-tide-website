import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { race, raceMovementMode } from "@/db/race-schema";
import { campaignCharacterProfile } from "@/db/realm-schema";
import { campaignSessionEncounterInitiativeParticipant as participant, campaignSessionEncounterParticipant as occurrence, campaignSessionRoll } from "@/db/tabletop-operations-schema";
import { applyModifierInTransaction, endModifierInTransaction, readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { applyDirectInitiativeDelta, advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { bindPersistedEffectDurationInTransaction } from "@/features/tabletop-operations/duration-lifecycle-service";
import { captureCombatModifierTimingInTransaction, reconcileCombatModifierTimingInTransaction } from "@/features/tabletop-operations/combat-modifier-timing-service";
import { setCombatFrozenInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rollback = new Error("ROLLBACK_EFFECT_FIXTURE");

async function fixture(tx: Tx, label: string, direct = false) {
  const f = await completionServiceFixture(tx, label);
  // Separate authored timing fixture, not invented Goblin stats in the fixed trace.
  const [ancestry] = await tx.insert(race).values({ name: `Timing fixture ${crypto.randomUUID()}`, createdByUserId: f.godId }).returning();
  await tx.insert(raceMovementMode).values({ raceId: ancestry.id, movementMode: "Walk", baseValue: 2 });
  await tx.update(campaignCharacterProfile).set({ raceId: ancestry.id, baseMovementSteps: 0 }).where(eq(campaignCharacterProfile.characterId, f.heroId));
  const actorId = direct ? f.occurrences[0] : f.heroId;
  if (direct) await tx.update(occurrence).set({ creatureSnapshotJson: { ...f.creatureSnapshot,
    attributes: [{ attributeKey: "Dexterity", value: 50 }], movement: [{ movementMode: "Walk", movementValue: 2 }] } }).where(eq(occurrence.characterId, actorId));
  await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, actorId)));
  const actor = direct ? f.god : f.player;
  const declarationId = await createActionDeclarationDraftInTransaction(tx, f.context, actor, { ...completionDraft(actorId, f.occurrences[1]),
    sourceKind: direct ? "creature-attack" : "weapon", sourceRef: direct ? "fixture-shortsword" : `item:${f.weaponId}`, weaponItemId: direct ? null : f.weaponId });
  await lockActionDeclarationInTransaction(tx, f.context, actor, declarationId);
  const pendingId = await commitActionDeclarationInTransaction(tx, f.context, actor, declarationId, { method: "entered", enteredTotal: 70 });
  return { ...f, actorId, declarationId, pendingId };
}

for (const [channel, targetKey, amount, difference] of [["attribute", "DEX", 10, 4], ["movement", "movement:Walk", 1, 11], ["initiative", "self", 5, 5]] as const) {
  test(`${channel} modifier changes committed timing immediately and removal restores it without a new Roll`, async () => {
    await assert.rejects(db.transaction(async (tx) => {
      const f = await fixture(tx, channel);
      const engine = () => loadInitiativeEngineInTransaction(tx, f.encounterId);
      const rolls = await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId));
      if (channel === "initiative") {
        const before = await engine();
        await persistInitiativeEngineInTransaction(tx, f.context, before, applyDirectInitiativeDelta(before, f.actorId, -25));
      }
      const initial = channel === "initiative" ? -3 : 22;
      const modifier = await applyModifierInTransaction(tx, { characterId: f.actorId,
        effect: { kind: "modifier.apply", label: "Temporary timing", channel, targetKey, amount, duration: { kind: "until-removed" } },
        source: { kind: "god", id: f.godId, name: "Timing fixture" } });
      let state = await engine();
      assert.equal(state.participants.find(({ characterId }) => characterId === f.actorId)!.currentInitiative, initial + difference);
      assert.equal(state.pendingActions.find(({ id }) => id === f.pendingId)!.expectedCompletionInitiative, initial + difference - 4);
      assert.equal(state.pendingActions.find(({ id }) => id === f.pendingId)!.remainingInitiativeCost, 4);
      await endModifierInTransaction(tx, f.actorId, modifier.id, "Remove fixture effect");
      state = await engine();
      assert.equal(state.participants.find(({ characterId }) => characterId === f.actorId)!.currentInitiative, initial);
      assert.equal(state.pendingActions.find(({ id }) => id === f.pendingId)!.expectedCompletionInitiative, initial - 4);
      assert.deepEqual(await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId)), rolls);
      throw rollback;
    }), (error) => error === rollback);
  });
}

for (const direct of [false, true]) test(`${direct ? "Creature occurrence" : "Character"} full-Step expiration restores pending timing; Freeze preserves the boundary and effect history`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, `expiry-${direct}`, direct);
    const engine = () => loadInitiativeEngineInTransaction(tx, f.encounterId);
    const effect = { kind: "modifier.apply" as const, label: "One Step DEX penalty", channel: "attribute" as const, targetKey: "DEX", amount: -10,
      duration: { kind: "combat-steps" as const, value: 1 } };
    const readOccurrence = (id: number) => tx.select().from(occurrence).where(eq(occurrence.characterId, id)).then(([row]) => row.localStateJson as Record<string, unknown>);
    const otherBefore = await readOccurrence(f.occurrences[1]);
    if (direct) {
      const timing = await captureCombatModifierTimingInTransaction(tx, f.actorId, [effect]);
      const state = await readOccurrence(f.actorId);
      await tx.update(occurrence).set({ localStateJson: { ...state, modifiers: [{ ...effect, effectPlanEffectId: "isolated-fixture" }],
        conditions: [{ name: "One Step condition", duration: { kind: "combat-steps", value: 1 } }] } }).where(eq(occurrence.characterId, f.actorId));
      await reconcileCombatModifierTimingInTransaction(tx, timing);
    } else {
      const modifier = await applyModifierInTransaction(tx, { characterId: f.actorId, effect, source: { kind: "god", id: f.godId, name: "Timing fixture" } });
      await bindPersistedEffectDurationInTransaction(tx, f.context, { kind: "modifier", id: modifier.id, characterId: f.actorId, duration: modifier.duration });
    }
    const before = await engine();
    assert.equal(before.participants.find(({ characterId }) => characterId === f.actorId)!.currentInitiative, 18);
    assert.equal(before.pendingActions.find(({ id }) => id === f.pendingId)!.expectedCompletionInitiative, 14);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    await assert.rejects(persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 16)), /Combat is paused/);
    assert.deepEqual(await engine(), before);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
    // The penalty moved the actor to 18. Progress starts there, so reaching 16
    // spends two action points; passing the old start does not spend time twice.
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 16));
    const after = await engine();
    assert.equal(after.runtime.stepNumber, before.runtime.stepNumber + 1);
    assert.equal(after.participants.find(({ characterId }) => characterId === f.actorId)!.currentInitiative, 20);
    assert.equal(after.pendingActions.find(({ id }) => id === f.pendingId)!.expectedCompletionInitiative, 18);
    assert.equal(after.pendingActions.find(({ id }) => id === f.pendingId)!.remainingInitiativeCost, 2);
    if (direct) {
      const local = await readOccurrence(f.actorId) as { modifiers: Array<{ expiredAt?: string; remainingValue: number }>; conditions: Array<{ expiredAt?: string }> };
      assert.ok(local.modifiers[0].expiredAt);
      assert.equal(local.modifiers[0].remainingValue, 0);
      assert.ok(local.conditions[0].expiredAt);
    } else assert.ok((await readActiveEffectsInTransaction(tx, f.actorId, true)).modifiers[0].endedAt);
    assert.deepEqual(await readOccurrence(f.occurrences[1]), otherBefore);
    throw rollback;
  }), (error) => error === rollback);
});
