import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { weaponProfile } from "@/db/item-schema";
import { campaignCharacterAttribute } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as member, campaignSessionEncounterInitiative as runtime,
  campaignSessionEncounterInitiativeParticipant as enrollment } from "@/db/tabletop-operations-schema";
import { applyLocalizedDamageInTransaction, readActiveHealthInTransaction, healAreaInTransaction } from "@/features/active-state/active-health-service";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { applyRoutineCombatConsequencesInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { resolveDeclaredDefensesInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { readCombatProjectionInTransaction } from "@/features/tabletop-operations/combat-projection-service";
import { reconcileCombatRecoveryInTransaction } from "@/features/tabletop-operations/combat-spell-recovery-service";
import { combatLimbConditions } from "@/features/tabletop-operations/combat-limb-state";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the disposable combat completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fixture = Awaited<ReturnType<typeof completionServiceFixture>>;
const rollback = new Error("ROLLBACK_LIMB_TEST");
const expected = (error: unknown) => { if (error !== rollback) console.error(error); return error === rollback; };
async function local(tx: Tx, f: Fixture, id: number) {
  return (await tx.select().from(member).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, id))))[0].localStateJson as Record<string, unknown>;
}
async function strike(tx: Tx, f: Fixture, actorId: number, targetId: number, baseDamage: number, rolled = 72) {
  if (actorId > 0) await tx.update(weaponProfile).set({ damage: String(baseDamage) }).where(eq(weaponProfile.itemId, f.weaponId));
  else await tx.update(member).set({ creatureSnapshotJson: { ...f.creatureSnapshot, attacks: [{ ...f.creatureSnapshot.attacks[0], damage: String(baseDamage) }] } })
    .where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, actorId)));
  const actor = actorId === f.heroId ? f.player : f.god;
  const draft = actorId < 0 ? { ...completionDraft(actorId, targetId), sourceKind: "creature-attack" as const, sourceRef: "fixture-shortsword" }
    : { ...completionDraft(actorId, targetId), sourceKind: "weapon" as const, weaponItemId: f.weaponId };
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, actor, draft);
  await lockActionDeclarationInTransaction(tx, f.context, actor, id);
  const pendingId = await commitActionDeclarationInTransaction(tx, f.context, actor, id, { method: "entered", enteredTotal: rolled });
  await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, id);
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  const finish = before.pendingActions.find((entry) => entry.id === pendingId)!.expectedCompletionInitiative;
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, finish));
  for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, id)).status, "applied");
}
async function start(tx: Tx, f: Fixture, actorId: number, targetId: number) {
  await tx.update(enrollment).set({ participationStatus: "active", currentInitiative: 200 }).where(and(eq(enrollment.encounterId, f.encounterId), eq(enrollment.characterId, actorId)));
  await tx.update(enrollment).set({ participationStatus: "active", currentInitiative: 1 }).where(and(eq(enrollment.encounterId, f.encounterId), eq(enrollment.characterId, targetId)));
  await tx.update(runtime).set({ timelineInitiative: 200 }).where(eq(runtime.encounterId, f.encounterId));
}

for (const kind of ["pc", "npc", "creature"] as const) for (const remainingHp of [0, -1]) test(`${kind} limb at ${remainingHp} HP incapacitates only the limb and alerts only its Player and the G.O.D.`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "limb"), id = kind === "pc" ? f.heroId : kind === "npc" ? f.defenderId : f.occurrences[0];
    for (const characterId of [f.heroId, f.defenderId]) await tx.insert(campaignCharacterAttribute).values({ characterId, attributeKey: "CON", value: 50 });
    const actorId = id > 0 ? f.occurrences[1] : f.heroId;
    const arm = id > 0 ? (await readActiveHealthInTransaction(tx, id, "race")).anatomy.pools.find((entry) => entry.key === "leftArm")! : { key: "foreleg", name: "Left Foreleg", maximumHp: 10 };
    assert.ok(arm.maximumHp);
    if (id > 0) await applyLocalizedDamageInTransaction(tx, { characterId: id, poolKey: arm.key, amount: 2 }, "race");
    else await tx.update(member).set({ localStateJson: { ...await local(tx, f, id), health: { totalDamage: 2, poolDamage: { [arm.key]: 2 } } },
      creatureSnapshotJson: { ...f.creatureSnapshot, hpPools: [{ canonicalId: arm.key, poolName: arm.name, maximumHp: arm.maximumHp }, { canonicalId: "torso", poolName: "Torso", maximumHp: 20 }],
        hitLocations: [{ hitLocationNumber: 2, locationName: arm.name, hpPoolCanonicalId: arm.key, soak: "0", naturalArmor: "0" }] } })
      .where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, id)));
    await start(tx, f, actorId, id);
    await strike(tx, f, actorId, id, arm.maximumHp - remainingHp - 4);
    const god = await readCombatProjectionInTransaction(tx, f.context, f.god), card = god.entities.find((entry) => entry.participantId === id)!;
    assert.equal(card.condition.status, "able"); assert.equal(card.participationStatus, "active"); assert.equal(card.currentInitiative, 1);
    assert.deepEqual(card.limbConditions, [{ poolKey: arm.key, name: arm.name }]);
    assert.equal((await local(tx, f, id)).defeat, undefined);
    assert.equal(god.alerts.length, 1); assert.match(god.alerts[0].title, /incapacitated/);
    const player = await readCombatProjectionInTransaction(tx, f.context, f.player);
    assert.equal(player.alerts.length, kind === "pc" ? 1 : 0);
    assert.equal(player.entities.find((entry) => entry.participantId === id)!.limbConditions.length, kind === "pc" ? 1 : 0);
    await strike(tx, f, actorId, id, 1, 52); // Another hit cannot duplicate the same limb-incapacity episode.
    assert.equal(combatLimbConditions(await local(tx, f, id)).length, 1);
    assert.deepEqual((await readCombatProjectionInTransaction(tx, f.context, f.god)).alerts.map((entry) => entry.id), god.alerts.map((entry) => entry.id));
    const beforeHealing = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    if (id > 0) await healAreaInTransaction(tx, id, "race", arm.key, 3);
    else {
      const saved = await local(tx, f, id), health = saved.health as { totalDamage: number; poolDamage: Record<string, number> };
      await tx.update(member).set({ localStateJson: { ...saved, health: { ...health, poolDamage: { ...health.poolDamage, [arm.key]: health.poolDamage[arm.key] - 3 } } } })
        .where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, id)));
    }
    await reconcileCombatRecoveryInTransaction(tx, f.context, id);
    const healed = await readCombatProjectionInTransaction(tx, f.context, f.god);
    assert.deepEqual(healed.entities.find((entry) => entry.participantId === id)!.limbConditions, []);
    assert.equal(healed.alerts[0].id, god.alerts[0].id);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).runtime.stepNumber, beforeHealing.runtime.stepNumber);
    throw rollback;
  }), expected);
});

for (const remainingHp of [1, 0, -1]) test(`Slime whole-body HP ${remainingHp} derives the actor's condition without a ruling`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "slime"), id = f.occurrences[0];
    await tx.update(member).set({ localStateJson: { ...await local(tx, f, id), health: { totalDamage: 2, poolDamage: { body: 2 } } }, creatureSnapshotJson: {
      ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, totalHp: 10, canonicalName: "Slime" }, hpPools: [{ canonicalId: "body", poolName: "Body", maximumHp: 10 }],
      hitLocations: Array.from({ length: 10 }, (_, hitLocationNumber) => ({ hitLocationNumber, locationName: "Body", hpPoolCanonicalId: "body", soak: null, naturalArmor: null })),
    } }).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, id)));
    await start(tx, f, f.heroId, id);
    await strike(tx, f, f.heroId, id, 6 - remainingHp);
    const projection = await readCombatProjectionInTransaction(tx, f.context, f.god), card = projection.entities.find((entry) => entry.participantId === id)!;
    assert.equal(card.condition.status, remainingHp === 1 ? "able" : remainingHp === 0 ? "incapacitated" : "dead");
    assert.equal(card.participationStatus, remainingHp === 1 ? "active" : "suspended");
    assert.equal(projection.alerts.length, remainingHp === 1 ? 0 : 1);
    assert.equal(card.limbConditions.length, 0);
    assert.equal(Boolean((await local(tx, f, id)).defeat), remainingHp < 0);
    if (remainingHp <= 0) { assert.equal(card.canActNow, false); assert.equal(card.canRespondNow, false); }
    throw rollback;
  }), expected);
});
