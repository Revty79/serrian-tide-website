import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { weaponProfile } from "@/db/item-schema";
import { campaignCharacterAttribute, campaignCharacterProfile, campaignCharacterActiveHealth } from "@/db/realm-schema";
import { campaignSessionEncounter as encounter, campaignSessionEncounterInitiative as runtime,
  campaignSessionEncounterInitiativeParticipant as initiativeParticipant, campaignSessionEncounterParticipant as member,
  campaignSessionEncounterActionDeclaration as declaration, campaignSessionEncounterResponderOpportunity as opportunity,
  campaignSessionEncounterReaction as reaction, campaignSessionRoll as roll } from "@/db/tabletop-operations-schema";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction,
  reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { resolveDeclaredDefensesInTransaction, declareDefenseInterventionInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { generateActionEffectPlanInTransaction, approveActionEffectPlanInTransaction,
  applyRoutineCombatConsequencesInTransaction, completeRetainedCombatEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction, lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { lockPlayerCombatContextInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { advanceInitiativeTimeline, advanceInitiativeRound, setInitiativeParticipationStatus } from "@/features/tabletop-operations/initiative-runtime";
import { ruleCombatConditionInTransaction as rule, type CombatConditionCommand } from "@/features/tabletop-operations/combat-condition-service";
import { combatConditionState, headDamageCondition } from "@/features/tabletop-operations/combat-condition-state";
import { changeCombatParticipationInTransaction as change } from "@/features/tabletop-operations/combat-participation-service";
import { readCombatProjectionInTransaction, readCombatEntityInformationInTransaction } from "@/features/tabletop-operations/combat-projection-service";
import { awardCombatExperienceInTransaction as award } from "@/features/tabletop-operations/combat-xp-service";
import { setCombatFrozenInTransaction as freeze } from "@/features/tabletop-operations/combat-freeze-service";
import { readOpenDeclarationCheckpoint } from "@/features/tabletop-operations/declaration-checkpoint-service";
import { applyConditionInTransaction, resolveConditionInTransaction } from "@/features/active-state/active-effects-service";
import { readActiveHealthInTransaction, healFullBodyInTransaction, applyLocalizedDamageInTransaction } from "@/features/active-state/active-health-service";
import { reconcileCombatRecoveryInTransaction } from "@/features/tabletop-operations/combat-spell-recovery-service";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fixture = Awaited<ReturnType<typeof fixture>>;
const rollback = new Error("ROLLBACK_COMBAT_CONDITIONS");
const expected = (error: unknown) => { if (error !== rollback) console.error(error); return error === rollback; };
const command = (participantId: number, status: CombatConditionCommand["status"], expectedRevision = 0): CombatConditionCommand => ({
  participantId, status, expectedRevision, requestKey: crypto.randomUUID(), reason: `Specific G.O.D. ${status} ruling.`, initiativeTreatment: "preserve",
});
async function fixture(tx: Tx) {
  const f = await completionServiceFixture(tx, "condition-followup");
  for (const id of [f.heroId, f.defenderId]) {
    await tx.insert(campaignCharacterAttribute).values({ characterId: id, attributeKey: "CON", value: 50 });
    await tx.update(campaignCharacterActiveHealth).set({ totalDamage: 0 }).where(eq(campaignCharacterActiveHealth.characterId, id));
  }
  return f;
}
async function activate(tx: Tx, f: Fixture, id: number, value = 22) {
  await tx.update(initiativeParticipant).set({ participationStatus: "active", currentInitiative: value })
    .where(and(eq(initiativeParticipant.encounterId, f.encounterId), eq(initiativeParticipant.characterId, id)));
}
async function local(tx: Tx, f: Fixture, id: number) {
  return (await tx.select().from(member).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, id))))[0].localStateJson as Record<string, unknown>;
}
async function attack(tx: Tx, f: Fixture, id: number, target: number, rolled = 70) {
  const actor = id === f.heroId ? f.player : f.god;
  const draft = id < 0 ? { ...completionDraft(id, target), sourceKind: "creature-attack" as const, sourceRef: "fixture-shortsword" }
    : { ...completionDraft(id, target), sourceKind: "weapon" as const, weaponItemId: f.weaponId };
  const declarationId = await createActionDeclarationDraftInTransaction(tx, f.context, actor, draft);
  await lockActionDeclarationInTransaction(tx, f.context, actor, declarationId);
  await commitActionDeclarationInTransaction(tx, f.context, actor, declarationId, { method: "entered", enteredTotal: rolled });
  return declarationId;
}
async function advance(tx: Tx, f: Fixture, point: number) {
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, point));
}

for (const kind of ["pc", "npc", "creature"] as const) for (const status of ["dead", "incapacitated"] as const) test(`${kind} ${status} suspends future work, retains history/XP, blocks generic return and releases progression`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx), id = kind === "pc" ? f.heroId : kind === "npc" ? f.defenderId : f.occurrences[0];
    await activate(tx, f, id);
    const action = await attack(tx, f, id, f.occurrences[1]);
    await advance(tx, f, 21);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    const xpBefore = (await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)))[0].experience;
    const request = command(id, status);
    await assert.rejects(rule(tx, f.encounterId, f.player, request), /Campaign-owning/);
    await assert.rejects(rule(tx, f.encounterId, { ...f.god, userId: "wrong-owner" }, request), /owner|owning|Campaign/);
    await freeze(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    await assert.rejects(rule(tx, f.encounterId, f.god, request), /Combat is paused/);
    await freeze(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
    await rule(tx, f.encounterId, f.god, request);
    assert.equal((await rule(tx, f.encounterId, f.god, request)).reused, true);
    const after = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(after.runtime.stepNumber, before.runtime.stepNumber);
    assert.equal(after.participants.find(({ characterId }) => characterId === id)!.currentInitiative, 21);
    assert.equal((await tx.select().from(declaration).where(eq(declaration.id, action)))[0].status, "cancelled");
    assert.equal((await tx.select().from(roll).where(eq(roll.encounterId, f.encounterId))).length, 1);
    assert.equal(combatConditionState(await local(tx, f, id)).status, status);
    assert.equal(Boolean((await local(tx, f, id)).defeat), status === "dead");
    const card = (await readCombatProjectionInTransaction(tx, f.context, f.god)).entities.find(({ participantId }) => participantId === id)!;
    assert.equal(card.canInspect, true); assert.equal(card.canActNow, false); assert.equal(card.canRespondNow, false);
    assert.equal(card.participation.departed, false); assert.equal(card.condition.status, status);
    await assert.rejects(attack(tx, f, id, f.occurrences[1]), /Dead|Incapacitated/);
    await assert.rejects(change(tx, f.encounterId, f.god, { participantId: id, operation: "arrive", expectedRevision: 0, requestKey: crypto.randomUUID(), reason: "Try generic return." }), /Dead|Incapacitated/);
    await assert.rejects(persistInitiativeEngineInTransaction(tx, f.context, after, setInitiativeParticipationStatus(after, id, "active")), /Dead|Incapacitated/);
    const awardInput = { kind: "encounter" as const, amountPerCharacter: 10, recipientCharacterIds: [f.heroId, f.defenderId], requestKey: crypto.randomUUID() };
    await award(tx, f.encounterId, f.god, awardInput); await award(tx, f.encounterId, f.god, awardInput);
    assert.equal((await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)))[0].experience, xpBefore + 10);
    if (kind === "creature" && status === "incapacitated") await award(tx, f.encounterId, f.god, {
      kind: "creature", defeatedParticipantId: id, mode: "full-to-each", recipientCharacterIds: [f.heroId], requestKey: crypto.randomUUID(), valueRuling: { value: 3, reason: "Fixture value." },
    });
    await persistInitiativeEngineInTransaction(tx, f.context, after, advanceInitiativeRound(after));
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === id)!.currentInitiative, 21);
    throw rollback;
  }), expected);
});

test("incapacity releases an uncommitted checkpoint without revealing another simultaneous choice early", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx);
    for (const id of [f.heroId, f.defenderId, f.occurrences[0]]) await activate(tx, f, id);
    await attack(tx, f, f.heroId, f.occurrences[1]);
    const checkpoint = (await readOpenDeclarationCheckpoint(tx, f.encounterId))!;
    await rule(tx, f.encounterId, f.god, command(f.defenderId, "incapacitated"));
    assert.equal((await readOpenDeclarationCheckpoint(tx, f.encounterId))!.id, checkpoint.id);
    assert.equal((await readCombatProjectionInTransaction(tx, f.context, f.god)).declarations.length, 0);
    await rule(tx, f.encounterId, f.god, command(f.occurrences[0], "dead"));
    assert.equal(await readOpenDeclarationCheckpoint(tx, f.encounterId), null);
    assert.equal((await readCombatProjectionInTransaction(tx, f.context, f.god)).declarations.length, 1);
    await advance(tx, f, 18);
    throw rollback;
  }), expected);
});

for (const responded of [false, true]) test(`incapacity at completion preserves due attack and prior response; responded=${responded}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx); await activate(tx, f, f.heroId);
    await tx.update(initiativeParticipant).set({ participationStatus: "holding" }).where(and(eq(initiativeParticipant.encounterId, f.encounterId), eq(initiativeParticipant.characterId, f.occurrences[0])));
    const action = await attack(tx, f, f.heroId, f.occurrences[0]);
    const [window] = await tx.select().from(opportunity).where(eq(opportunity.declarationId, action));
    await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "allow" });
    if (responded) await declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: window.id, reactionType: "block", protectedTargetCharacterId: f.occurrences[0], sourceRef: "fixture-shortsword" }, { method: "entered", enteredTotal: 20 });
    await advance(tx, f, 18);
    await rule(tx, f.encounterId, f.god, command(f.occurrences[0], "incapacitated"));
    await rule(tx, f.encounterId, f.god, command(f.heroId, "incapacitated"));
    const retry = () => declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: window.id, reactionType: "block", protectedTargetCharacterId: f.occurrences[0], sourceRef: "fixture-shortsword" }, { method: "entered", enteredTotal: 20 });
    if (responded) await retry(); // Returns the already committed receipt, never another defense.
    else await assert.rejects(retry(), /pending|response|Incapacitated/);
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, action);
    await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, action);
    await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, action);
    assert.equal(((await local(tx, f, f.occurrences[0])).health as { totalDamage: number }).totalDamage, 6);
    if (responded) assert.equal((await tx.select().from(reaction).where(eq(reaction.id, (await tx.select().from(opportunity).where(eq(opportunity.id, window.id)))[0].reactionId!)))[0].status, "resolved");
    throw rollback;
  }), expected);
});

test("an exact bound paralysis must end before explicit recovery; generic return never clears it or its preserved debt", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx); await activate(tx, f, f.heroId);
    const condition = await applyConditionInTransaction(tx, { characterId: f.heroId, effect: { kind: "condition.apply", name: "Paralysis", description: "Specific fixture ruling suspends agency.", duration: { kind: "until-removed", label: "Until removed" } }, source: { kind: "god", id: f.godId, name: "G.O.D." } });
    const request = { ...command(f.heroId, "incapacitated"), conditionId: condition.id };
    await rule(tx, f.encounterId, f.god, request);
    const recover = command(f.heroId, "able", 1);
    await assert.rejects(rule(tx, f.encounterId, f.god, recover), /bound condition/);
    await resolveConditionInTransaction(tx, f.heroId, condition.id, "Existing condition service resolves paralysis.");
    await rule(tx, f.encounterId, f.god, recover);
    await change(tx, f.encounterId, f.god, { participantId: f.heroId, operation: "arrive", expectedRevision: 0, requestKey: crypto.randomUUID(), reason: "Condition resolved; return at preserved Initiative." });
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.heroId)!.currentInitiative, 22);
    assert.equal((await rule(tx, f.encounterId, f.god, request)).status, "able", "An old incapacity retry must not incapacitate a recovered combatant again.");
    throw rollback;
  }), expected);
});

test("closed Initiative and completed Encounter projections remain authorized and readable across fresh transactions, including recovery", async () => {
  const f = await db.transaction(async (tx) => {
    const f = await fixture(tx); await activate(tx, f, f.heroId);
    const action = await attack(tx, f, f.heroId, f.occurrences[0]);
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, action); await advance(tx, f, 18);
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, action);
    await approveActionEffectPlanInTransaction(tx, f.context, f.god, planId);
    await tx.update(runtime).set({ status: "closed", closedAt: new Date() }).where(eq(runtime.encounterId, f.encounterId));
    return { ...f, planId };
  });
  const inspect = async () => db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, f.encounterId, f.godId);
    const playerContext = await lockPlayerCombatContextInTransaction(tx, f.encounterId, f.heroId, f.godId);
    await assert.rejects(lockPlayerCombatContextInTransaction(tx, f.encounterId, f.heroId, "wrong-player"));
    for (const actor of [f.god, f.player]) {
      const projection = await readCombatProjectionInTransaction(tx, actor.authority === "player" ? playerContext : context, actor);
      assert.equal(projection.closed, true); assert.equal(projection.runtime.status, "closed");
      assert.ok(projection.entities.every((entity) => entity.canInspect && !entity.canActNow && !entity.canRespondNow && /ended/.test(entity.statusText)));
      assert.equal(projection.declarations.length, 1);
      const info = await readCombatEntityInformationInTransaction(tx, context, actor, f.heroId);
      assert.ok(info.resources && "health" in info.resources && info.resources.health);
      assert.equal(info.combatHistory !== null, actor.authority === "god-owner");
    }
    assert.equal((await readCombatEntityInformationInTransaction(tx, context, f.player, f.defenderId)).resources, null);
    await assert.rejects(attack(tx, { ...f, context }, f.heroId, f.occurrences[0]), /active|closed/);
    return context;
  });
  await inspect();
  await db.update(encounter).set({ status: "completed", completedAt: new Date() }).where(eq(encounter.id, f.encounterId));
  await inspect();
  await db.transaction(async (tx) => {
    await assert.rejects(completeRetainedCombatEffectPlanInTransaction(tx, f.encounterId, f.player, { planId: f.planId, reason: "Unauthorized recovery." }), /Campaign-owning/);
    await completeRetainedCombatEffectPlanInTransaction(tx, f.encounterId, f.god, { planId: f.planId, reason: "Apply the isolated retained approved hit." });
    await completeRetainedCombatEffectPlanInTransaction(tx, f.encounterId, f.god, { planId: f.planId, reason: "Apply the isolated retained approved hit." });
    assert.equal(((await local(tx, f, f.occurrences[0])).health as { totalDamage: number }).totalDamage, 6);
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, f.encounterId, f.godId);
    const info = await readCombatEntityInformationInTransaction(tx, context, f.god, f.occurrences[0]);
    assert.equal(info.combatHistory?.damageOutcomes.length, 1);
  });
  await inspect();
});

test("head HP at 0 is unconscious, -1 is dead, and exceptional anatomy needs its own rule", () => {
  const head = { name: "Head", poolKey: "head" };
  const input = { poolDamage: 11, poolKey: "head", poolName: "Head", maximumHp: 11, location: head, locations: [head] };
  assert.equal(headDamageCondition({ ...input, poolDamage: 10 }), null);
  assert.equal(headDamageCondition(input), "unconscious");
  assert.equal(headDamageCondition({ ...input, poolDamage: 12 }), "dead");
  assert.equal(headDamageCondition({ ...input, poolDamage: 14 }), "dead");
  assert.equal(headDamageCondition({ ...input, maximumHp: null }), null);
  assert.equal(headDamageCondition({ ...input, location: { name: "Arm", poolKey: "head" } }), null);
  assert.equal(headDamageCondition({ ...input, locations: [head, { name: "Second Head", poolKey: "second" }] }), null);
  assert.equal(headDamageCondition({ ...input, location: { ...head, specialEffect: "Head regrowth needs a ruling." } }), null);
});

for (const kind of ["pc", "npc", "creature"] as const) for (const remainingHp of [0, -1]) test(`${kind} accumulated head HP ${remainingHp} automatically removes choices and preserves death through ordinary healing`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx), id = kind === "pc" ? f.heroId : kind === "npc" ? f.defenderId : f.occurrences[0];
    const actorId = kind === "creature" ? f.heroId : f.occurrences[1];
    const head = id > 0 ? (await readActiveHealthInTransaction(tx, id, "race")).anatomy.pools.find((entry) => entry.name === "Head")! : { key: "fixture-head", maximumHp: 11 };
    assert.ok(head.maximumHp);
    const priorDamage = 2;
    if (id > 0) await applyLocalizedDamageInTransaction(tx, { characterId: id, poolKey: head.key, amount: priorDamage }, "race");
    else await tx.update(member).set({ localStateJson: { ...await local(tx, f, id), health: { totalDamage: priorDamage, poolDamage: { [head.key]: priorDamage } } },
      creatureSnapshotJson: { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, totalHp: 105 },
        hpPools: [{ canonicalId: head.key, poolName: "Head", maximumHp: head.maximumHp }] } }).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, id)));
    const baseDamage = head.maximumHp - priorDamage - remainingHp - 2; // Roll 70 against 50 adds 2.
    if (actorId > 0) await tx.update(weaponProfile).set({ damage: String(baseDamage) }).where(eq(weaponProfile.itemId, f.weaponId));
    else await tx.update(member).set({ creatureSnapshotJson: { ...f.creatureSnapshot, attacks: [{ ...f.creatureSnapshot.attacks[0], damage: String(baseDamage) }] } })
      .where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, actorId)));
    await activate(tx, f, actorId, 200); await activate(tx, f, id, 1);
    await tx.update(runtime).set({ timelineInitiative: 200 }).where(eq(runtime.encounterId, f.encounterId));
    const action = await attack(tx, f, actorId, id);
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, action);
    const pending = (await loadInitiativeEngineInTransaction(tx, f.encounterId)).pendingActions.find((entry) => entry.actorCharacterId === actorId && entry.status === "active")!;
    await advance(tx, f, pending.expectedCompletionInitiative);
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, action)).status, "applied");
    const saved = await local(tx, f, id), expectedStatus = remainingHp === 0 ? "incapacitated" : "dead";
    assert.equal(combatConditionState(saved).status, expectedStatus);
    const outcomes = saved.damageOutcomes as Record<string, unknown>[];
    assert.equal(outcomes.length, 1); assert.equal(outcomes[0].locationRemainingHp, remainingHp);
    assert.equal(outcomes[0].unconscious, remainingHp === 0);
    assert.equal(Boolean(saved.defeat), remainingHp < 0);
    const card = (await readCombatProjectionInTransaction(tx, f.context, f.god)).entities.find((entry) => entry.participantId === id)!;
    assert.equal(card.canActNow, false); assert.equal(card.canRespondNow, false); assert.equal(card.mustChooseNow, false);
    assert.equal(card.canInspect, true);
    if (remainingHp === 0) assert.equal(card.currentInitiative, 0, "Unconsciousness removes positive Initiative under the existing knockout rule.");
    await assert.rejects(rule(tx, f.encounterId, f.god, command(id, "able", card.condition.revision)), remainingHp === 0 ? /head HP above 0/ : /revival/);
    await reconcileCombatRecoveryInTransaction(tx, f.context, id);
    assert.equal(combatConditionState(await local(tx, f, id)).status, expectedStatus, "Total HP above 0 does not clear unconsciousness.");
    const beforeHealing = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    if (id > 0) await healFullBodyInTransaction(tx, id, "race", 2);
    else await tx.update(member).set({ localStateJson: { ...saved, health: { totalDamage: head.maximumHp - remainingHp - 2,
      poolDamage: { [head.key]: head.maximumHp - remainingHp - 2 } } } }).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, id)));
    await reconcileCombatRecoveryInTransaction(tx, f.context, id);
    assert.equal(combatConditionState(await local(tx, f, id)).status, remainingHp === 0 ? "able" : "dead");
    const afterHealing = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(afterHealing.runtime.stepNumber, beforeHealing.runtime.stepNumber);
    assert.equal(afterHealing.participants.find((entry) => entry.characterId === id)!.currentInitiative, beforeHealing.participants.find((entry) => entry.characterId === id)!.currentInitiative);
    throw rollback;
  }), expected);
});

test("Ysra's 14 damage automatically kills the 11-HP-head bull without a death ruling or another turn", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx), id = f.occurrences[0];
    await tx.update(member).set({ creatureSnapshotJson: { ...f.creatureSnapshot,
      core: { ...f.creatureSnapshot.core, canonicalName: "Bull", totalHp: 105 },
      hpPools: [{ canonicalId: "fixture-head", poolName: "Head", maximumHp: 11 }],
    } }).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, id)));
    await tx.update(weaponProfile).set({ damage: "12" }).where(eq(weaponProfile.itemId, f.weaponId));
    await activate(tx, f, f.heroId); await activate(tx, f, id, 15);
    const action = await attack(tx, f, f.heroId, id);
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, action);
    await advance(tx, f, 18);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, action)).status, "applied");
    const saved = await local(tx, f, id), after = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.deepEqual(saved.health, { totalDamage: 14, poolDamage: { "fixture-head": 14 } });
    const outcomes = saved.damageOutcomes as Record<string, unknown>[];
    assert.equal(outcomes.length, 1); assert.equal(outcomes[0].locationRemainingHp, -3);
    assert.equal(outcomes[0].ruling, null);
    assert.equal(combatConditionState(saved).status, "dead");
    assert.equal(after.runtime.stepNumber, before.runtime.stepNumber);
    assert.equal(after.participants.find((entry) => entry.characterId === id)!.participationStatus, "suspended");
    const card = (await readCombatProjectionInTransaction(tx, f.context, f.god)).entities.find((entry) => entry.participantId === id)!;
    assert.equal(card.mustChooseNow, false); assert.equal(card.canActNow, false); assert.equal(card.canRespondNow, false);
    assert.equal(card.canInspect, true);
    throw rollback;
  }), expected);
});

for (const kind of ["pc", "npc"] as const) test(`normal authored damage derives ${kind} fatal head death while retaining earlier XP`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx), id = kind === "pc" ? f.heroId : f.defenderId;
    await award(tx, f.encounterId, f.god, { kind: "encounter", amountPerCharacter: 10, recipientCharacterIds: [f.heroId, f.defenderId], requestKey: "before-death" });
    const xp = (await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, id)))[0];
    await tx.update(member).set({ creatureSnapshotJson: { ...f.creatureSnapshot, attacks: [{ ...f.creatureSnapshot.attacks[0], damage: "21" }] } }).where(eq(member.characterId, f.occurrences[0]));
    await activate(tx, f, f.occurrences[0], 200);
    await tx.update(runtime).set({ timelineInitiative: 200 }).where(eq(runtime.encounterId, f.encounterId));
    const action = await attack(tx, f, f.occurrences[0], id);
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, action);
    const pending = (await loadInitiativeEngineInTransaction(tx, f.encounterId)).pendingActions.find((entry) => entry.actorCharacterId === f.occurrences[0] && entry.status === "active")!;
    await advance(tx, f, pending.expectedCompletionInitiative);
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, action)).status, "applied");
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, action)).status, "applied");
    const health = await readActiveHealthInTransaction(tx, id, "race");
    assert.equal(health.view.totalDamage, 23); assert.ok(health.view.total.remainingHp! > 0);
    assert.equal(combatConditionState(await local(tx, f, id)).status, "dead");
    const info = await readCombatEntityInformationInTransaction(tx, f.context, f.god, id);
    assert.equal(info.combatHistory?.damageOutcomes[0].dead, true);
    assert.deepEqual((await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, id)))[0], xp);
    throw rollback;
  }), expected);
});

test("total HP exhaustion incapacitates without a kill; insufficient healing retains the blocker and sufficient healing restores preserved eligibility", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx);
    await tx.update(member).set({ creatureSnapshotJson: { ...f.creatureSnapshot, attacks: [{ ...f.creatureSnapshot.attacks[0], damage: "110" }] } }).where(eq(member.characterId, f.occurrences[0]));
    await activate(tx, f, f.occurrences[0], 200);
    await tx.update(runtime).set({ timelineInitiative: 200 }).where(eq(runtime.encounterId, f.encounterId));
    const action = await attack(tx, f, f.occurrences[0], f.heroId, 75);
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, action);
    const pending = (await loadInitiativeEngineInTransaction(tx, f.encounterId)).pendingActions.find((entry) => entry.actorCharacterId === f.occurrences[0] && entry.status === "active")!;
    await advance(tx, f, pending.expectedCompletionInitiative);
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, action)).status, "applied");
    assert.equal(combatConditionState(await local(tx, f, f.heroId)).status, "incapacitated");
    assert.equal((await local(tx, f, f.heroId)).defeat, undefined);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await healFullBodyInTransaction(tx, f.heroId, "race", 5); await reconcileCombatRecoveryInTransaction(tx, f.context, f.heroId);
    assert.equal(combatConditionState(await local(tx, f, f.heroId)).status, "incapacitated");
    await healFullBodyInTransaction(tx, f.heroId, "race", 10); await reconcileCombatRecoveryInTransaction(tx, f.context, f.heroId);
    assert.equal(combatConditionState(await local(tx, f, f.heroId)).status, "able");
    const after = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(after.participants.find(({ characterId }) => characterId === f.heroId)!.currentInitiative, before.participants.find(({ characterId }) => characterId === f.heroId)!.currentInitiative);
    assert.deepEqual(after.runtime, before.runtime);
    throw rollback;
  }), expected);
});
