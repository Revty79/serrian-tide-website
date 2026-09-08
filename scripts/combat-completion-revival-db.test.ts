import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { skill, skillExtension } from "@/db/skill-schema";
import { campaignCharacterAttribute, campaignCharacterProfile, campaignCharacterSkillAllocation } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as member, campaignSessionEncounterInitiative as runtime,
  campaignSessionEncounterInitiativeParticipant as participant,
  campaignSessionEncounterEffect as effect } from "@/db/tabletop-operations-schema";
import catalog from "./fixtures/combat-recovery-spell-catalog.json";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { recordCombatSourceResolutionInTransaction } from "@/features/tabletop-operations/combat-source-resolution-service";
import { generateActionEffectPlanInTransaction, approveActionEffectPlanInTransaction, applyActionEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { resolveCombatSpellRecoveryInTransaction as recover, reconcileCombatRecoveryInTransaction as reconcile,
  resolveCombatRevivalExpirationInTransaction as stabilize } from "@/features/tabletop-operations/combat-spell-recovery-service";
import { combatRecoverySpellAuthority, RECOVERY_SPELL_SOURCES } from "@/features/tabletop-operations/combat-recovery-spells";
import { ruleCombatConditionInTransaction as rule } from "@/features/tabletop-operations/combat-condition-service";
import { combatConditionState, combatBlockers } from "@/features/tabletop-operations/combat-condition-state";
import { changeCombatParticipationInTransaction as change } from "@/features/tabletop-operations/combat-participation-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline, advanceInitiativeRound } from "@/features/tabletop-operations/initiative-runtime";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { applyConditionInTransaction } from "@/features/active-state/active-effects-service";
import { readActiveHealthInTransaction, healFullBodyInTransaction } from "@/features/active-state/active-health-service";
import { setCombatFrozenInTransaction as freeze } from "@/features/tabletop-operations/combat-freeze-service";
import { readCombatProjectionInTransaction, readCombatEntityInformationInTransaction } from "@/features/tabletop-operations/combat-projection-service";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rollback = new Error("ROLLBACK_REVIVAL");
const expected = (error: unknown) => { if (error !== rollback) console.error(error); return error === rollback; };
async function fixture(tx: Tx, name: "Vital Wellspring" | "Cycle of Rebirth", targetKind: "npc" | "creature" = "npc", mana = 200, extraConditions = false) {
  const f = await completionServiceFixture(tx, "revival");
  await tx.insert(userRole).values([{ userId: f.godId, role: "god" }, { userId: f.godId, role: "player" }]);
  const [root, channel] = await tx.insert(skill).values([
    { name: "Spellcraft", tier: 1, classification: "standard", primaryAttribute: "INT", createdByUserId: f.godId },
    { name: "Channeling", tier: 1, classification: "standard", primaryAttribute: "WIS", createdByUserId: f.godId },
  ]).returning();
  const [rootAllocation] = await tx.insert(campaignCharacterSkillAllocation).values([{ characterId: f.heroId, skillId: root.id, points: 1 }, { characterId: f.heroId, skillId: channel.id, points: mana }]).returning();
  await tx.update(campaignCharacterProfile).set({ baseMagicSteps: 4 }).where(eq(campaignCharacterProfile.characterId, f.heroId));
  for (const id of [f.heroId, f.defenderId]) await tx.insert(campaignCharacterAttribute).values([{ characterId: id, attributeKey: "INT", value: 60 }, { characterId: id, attributeKey: "CON", value: 50 }]);
  const authored = catalog.records.find((entry) => entry.name === name && entry.extension_type === "spell-construction")!;
  const document = { ...parseSpellDocument(authored.data_json), frameworkSkillId: root.id };
  const [source] = await tx.insert(skill).values({ name, tier: 3, classification: "spell", primaryAttribute: "INT", sourceSystem: "serrian-tide-core", sourceExternalId: authored.source_external_id, createdByUserId: f.godId }).returning();
  await tx.insert(skillExtension).values({ skillId: source.id, extensionType: "spell-construction", schemaVersion: 6, dataJson: JSON.stringify(document) });
  const [allocation] = await tx.insert(campaignCharacterSkillAllocation).values({ characterId: f.heroId, skillId: source.id, parentAllocationId: rootAllocation.id, points: 1 }).returning();
  const id = targetKind === "npc" ? f.defenderId : f.occurrences[0];
  await tx.update(participant).set({ participationStatus: "active", currentInitiative: 220, normalTotalInitiative: 220 }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.heroId)));
  await tx.update(runtime).set({ timelineInitiative: 220 }).where(eq(runtime.encounterId, f.encounterId));
  await tx.update(participant).set({ currentInitiative: -3, deferredInitiativeCost: 2 }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, id)));
  const blockerConditions: number[] = [];
  if (extraConditions) for (const name of ["Poison", "Paralysis"]) {
    const condition = await applyConditionInTransaction(tx, { characterId: id, effect: { kind: "condition.apply", name, description: "Exact independent incapacity fixture", duration: { kind: "until-removed" } }, source: { kind: "god", id: f.godId, name: "G.O.D." } });
    await rule(tx, f.encounterId, f.god, { participantId: id, status: "incapacitated", expectedRevision: blockerConditions.length, requestKey: `blocker-${condition.id}`, reason: "This exact condition suspends agency.", initiativeTreatment: "preserve", conditionId: condition.id });
    blockerConditions.push(condition.id);
  }
  await rule(tx, f.encounterId, f.god, { participantId: id, status: "dead", expectedRevision: blockerConditions.length, requestKey: "fixture-death", reason: "Specific preexisting fixture death." });
  const sourceRef = `catalog:${allocation.id}`;
  await recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: f.heroId, sourceKind: "spell", sourceRef,
    mode: "automatic-no-roll", governing: null, effectScaling: {}, reason: "Explicit G.O.D. casting mode for the isolated authored catalog spell." });
  const { prepareCharacterSpellCastInTransaction } = await import("@/features/characters/character-spell-runtime-service");
  const preview = await prepareCharacterSpellCastInTransaction(tx, { casterCharacterId: f.heroId, source: { kind: "catalog", allocationId: allocation.id }, selections: { targetGroups: {}, applications: {} } }, f.godId);
  const groups = preview.plan.targetGroups;
  const action = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, id), sourceKind: "spell", sourceRef: `spell:${sourceRef}`,
    label: name, actionKind: "spell-cast", windowKind: "ordinary", allowsMultiRound: true,
    sourcePayload: { selections: { targetGroups: Object.fromEntries(groups.map((entry) => [entry.id, [id]])), applications: {} } } });
  await lockActionDeclarationInTransaction(tx, f.context, f.player, action);
  const beforeMana = (await readActiveManaInTransaction(tx, f.heroId)).pools[0].currentMana;
  const pending = await commitActionDeclarationInTransaction(tx, f.context, f.player, action);
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, before.pendingActions.find((entry) => entry.id === pending)!.expectedCompletionInitiative));
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, action);
  await approveActionEffectPlanInTransaction(tx, f.context, f.god, planId, "Approve supported effects; authored prose stays explicit manual rulings.");
  assert.notEqual(await applyActionEffectPlanInTransaction(tx, f.context, f.god, planId), "application-failed");
  const [recoveryEffect] = (await tx.select().from(effect).where(eq(effect.planId, planId))).filter((entry) => entry.effectKey.startsWith("spell-combat-recovery:"));
  assert.ok(recoveryEffect);
  const request = { planId, effectId: recoveryEffect.id, operation: "revive" as const, requestKey: crypto.randomUUID(), reason: "G.O.D. confirms this exact authored revival and target; no unrelated conditions are removed.",
    ...(name === "Cycle of Rebirth" ? { temporaryDuration: { kind: "combat-rounds" as const, value: 2, label: "Specific G.O.D. duration including lingering: two rounds." } } : {}) };
  const local = async () => (await tx.select().from(member).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, id))))[0].localStateJson;
  return { ...f, id, action, request, beforeMana, local, blockerConditions };
}

for (const targetKind of ["npc", "creature"] as const) test(`Grand Master Vital Wellspring revives the exact ${targetKind} at 1 HP with preserved debt, Freeze and immutable retries`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "Vital Wellspring", targetKind);
    const history = (await f.local() as { defeat: unknown }).defeat;
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId), mana = await readActiveManaInTransaction(tx, f.heroId);
    await assert.rejects(recover(tx, f.encounterId, f.player, f.request), /Campaign-owning/);
    await freeze(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    await assert.rejects(recover(tx, f.encounterId, f.god, f.request), /Combat is paused/);
    await freeze(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
    await recover(tx, f.encounterId, f.god, f.request); assert.equal((await recover(tx, f.encounterId, f.god, f.request)).reused, true);
    assert.equal(combatConditionState(await f.local()).status, "able");
    assert.deepEqual((await f.local() as { defeat: unknown }).defeat, history);
    const after = await loadInitiativeEngineInTransaction(tx, f.encounterId), restored = after.participants.find(({ characterId }) => characterId === f.id)!;
    assert.equal(restored.currentInitiative, -3); assert.equal(restored.deferredInitiativeCost, 2); assert.equal(restored.participationStatus, "active");
    assert.deepEqual(after.runtime, before.runtime); assert.deepEqual(after.pendingActions, before.pendingActions);
    assert.deepEqual(await readActiveManaInTransaction(tx, f.heroId), mana); assert.ok(mana.pools[0].currentMana < f.beforeMana);
    if (f.id > 0) assert.equal((await readActiveHealthInTransaction(tx, f.id, "race")).view.total.remainingHp, 1);
    else assert.equal((await f.local() as { health: { totalDamage: number } }).health.totalDamage, 29);
    assert.equal((await readCombatProjectionInTransaction(tx, f.context, f.god)).entities.find(({ participantId }) => participantId === f.id)!.canActNow, false);
    throw rollback;
  }), expected);
});

test("a lower Wellspring mastery cannot revive, and a renamed or personal healing spell has no resurrection authority", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "Vital Wellspring", "npc", 40);
    await assert.rejects(recover(tx, f.encounterId, f.god, f.request), /mastery/);
    assert.equal(combatConditionState(await f.local()).status, "dead");
    throw rollback;
  }), expected);
  assert.equal(combatRecoverySpellAuthority({ spell: { name: "Vital Wellspring" }, casting: { activeProgressiveTier: "Grand Master" } }), null);
  assert.equal(combatRecoverySpellAuthority({ catalogSourceId: RECOVERY_SPELL_SOURCES.cycle, casting: { caster: { practitionerLevel: "Master" } } })!.reviveHp, null);
});

test("ordinary healing leaves death intact; insufficient healing and a second incapacitating condition remain blockers", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "Vital Wellspring");
    await healFullBodyInTransaction(tx, f.id, "race", 1000); await reconcile(tx, f.context, f.id);
    assert.equal(combatConditionState(await f.local()).status, "dead");
    await recover(tx, f.encounterId, f.god, f.request);
    const first = await applyConditionInTransaction(tx, { characterId: f.id, effect: { kind: "condition.apply", name: "Poison", description: "Fixture poison", duration: { kind: "until-removed" } }, source: { kind: "god", id: f.godId, name: "G.O.D." } });
    const second = await applyConditionInTransaction(tx, { characterId: f.id, effect: { kind: "condition.apply", name: "Paralysis", description: "Independent fixture blocker", duration: { kind: "until-removed" } }, source: { kind: "god", id: f.godId, name: "G.O.D." } });
    let revision = combatConditionState(await f.local()).revision;
    for (const condition of [first, second]) await rule(tx, f.encounterId, f.god, { participantId: f.id, status: "incapacitated", expectedRevision: revision++, requestKey: `condition-${condition.id}`,
      reason: "Specific condition suspends agency.", initiativeTreatment: "preserve", conditionId: condition.id });
    const { resolveConditionInTransaction } = await import("@/features/active-state/active-effects-service");
    await resolveConditionInTransaction(tx, f.id, first.id, "Only the first condition was cleansed."); await reconcile(tx, f.context, f.id);
    assert.equal(combatConditionState(await f.local()).status, "incapacitated");
    assert.deepEqual(combatBlockers(await f.local()).filter((entry) => !entry.resolvedAt).map(({ conditionId }) => conditionId), [second.id]);
    throw rollback;
  }), expected);
});

test("spell revival never automatically returns a voluntarily withdrawn combatant", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "Vital Wellspring");
    await change(tx, f.encounterId, f.god, { participantId: f.id, operation: "withdraw", expectedRevision: 0, requestKey: "withdraw-before-recovery", reason: "G.O.D. withdraws the retained target after this cast completed." });
    await recover(tx, f.encounterId, f.god, f.request);
    assert.equal(combatConditionState(await f.local()).status, "able");
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.id)!.participationStatus, "suspended");
    throw rollback;
  }), expected);
});

test("source-linked Wellspring cleansing and revival remove only the selected incapacity and preserve independent paralysis", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "Vital Wellspring", "npc", 200, true);
    await recover(tx, f.encounterId, f.god, { ...f.request, removeConditions: [{ conditionId: f.blockerConditions[0], category: "poison" }] });
    assert.equal(combatConditionState(await f.local()).status, "incapacitated");
    assert.deepEqual(combatBlockers(await f.local()).filter((entry) => !entry.resolvedAt).map(({ conditionId }) => conditionId), [f.blockerConditions[1]]);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.id)!.participationStatus, "suspended");
    throw rollback;
  }), expected);
});

for (const targetKind of ["npc", "creature"] as const) for (const survived of [false, true]) test(`Cycle of Rebirth ${targetKind} expiration requires stabilization; survived=${survived}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "Cycle of Rebirth", targetKind);
    await recover(tx, f.encounterId, f.god, f.request);
    if (f.id > 0) assert.equal((await readActiveHealthInTransaction(tx, f.id, "race")).view.total.remainingHp, 5);
    else assert.equal((await f.local() as { health: { totalDamage: number } }).health.totalDamage, 25);
    for (let round = 0; round < 2; round++) {
      const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
      await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeRound(before, true));
      if (round === 0) {
        await freeze(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
        const frozen = await loadInitiativeEngineInTransaction(tx, f.encounterId);
        await assert.rejects(persistInitiativeEngineInTransaction(tx, f.context, frozen, advanceInitiativeRound(frozen, true)), /Combat is paused/);
        assert.equal(combatConditionState(await f.local()).status, "able");
        await freeze(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
      }
    }
    assert.equal(combatConditionState(await f.local()).status, "incapacitated");
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(before.participants.find(({ characterId }) => characterId === f.id)!.participationStatus, "suspended");
    const information = await readCombatEntityInformationInTransaction(tx, f.context, f.god, f.id);
    const expiry = information.combatHistory?.revivals.find((entry) => entry.effectId === f.request.effectId);
    assert.equal(expiry?.status, "awaiting-ruling");
    assert.match(expiry?.rulingRequired ?? "", /stabilization save/);
    assert.ok(information.combatHistory?.defeat, "Historical defeat remains inspectable after revival.");
    const input = { participantId: f.id, effectId: f.request.effectId, stabilized: survived, reason: "G.O.D. resolves the source's unspecified stabilization save." };
    await stabilize(tx, f.encounterId, f.god, input); assert.equal((await stabilize(tx, f.encounterId, f.god, input)).reused, true);
    assert.equal(combatConditionState(await f.local()).status, survived ? "able" : "dead");
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.id)!.currentInitiative,
      before.participants.find(({ characterId }) => characterId === f.id)!.currentInitiative);
    assert.equal((await recover(tx, f.encounterId, f.god, f.request)).reused, true, "A cast retry cannot revive again after expiration.");
    throw rollback;
  }), expected);
});

test("the retained explicit duration-expiration path also suspends borrowed life for the source-linked stabilization ruling", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "Cycle of Rebirth"); await recover(tx, f.encounterId, f.god, f.request);
    const { readCharacterDurationBindingsInTransaction, expireDurationNowInTransaction } = await import("@/features/tabletop-operations/duration-lifecycle-service");
    const bindings = await readCharacterDurationBindingsInTransaction(tx, f.id);
    assert.equal(bindings.length, 1);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await expireDurationNowInTransaction(tx, f.context, bindings[0].id);
    assert.equal(combatConditionState(await f.local()).status, "incapacitated");
    assert.deepEqual((await loadInitiativeEngineInTransaction(tx, f.encounterId)).runtime, before.runtime);
    throw rollback;
  }), expected);
});

test("concurrent source-linked revival requests share one effect receipt and never duplicate the Mana cost", async () => {
  const f = await db.transaction((tx) => fixture(tx, "Vital Wellspring"));
  const mana = await db.transaction((tx) => readActiveManaInTransaction(tx, f.heroId));
  const results = await Promise.all([
    db.transaction((tx) => recover(tx, f.encounterId, f.god, f.request)),
    db.transaction((tx) => recover(tx, f.encounterId, f.god, f.request)),
  ]);
  assert.deepEqual(results.map(({ reused }) => reused).sort(), [false, true]);
  assert.deepEqual(await db.transaction((tx) => readActiveManaInTransaction(tx, f.heroId)), mana);
  const [row] = await db.select().from(member).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, f.id)));
  assert.equal(combatConditionState(row.localStateJson).status, "able");
  assert.equal(combatBlockers(row.localStateJson).filter((entry) => entry.status === "dead").length, 1);
  assert.equal((await db.transaction((tx) => readActiveHealthInTransaction(tx, f.id, "race"))).view.total.remainingHp, 1);
});
