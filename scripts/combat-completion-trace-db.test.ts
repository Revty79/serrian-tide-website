import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { skill } from "@/db/skill-schema";
import { weaponProfile } from "@/db/item-schema";
import { campaignCharacter, campaignCharacterActiveHealth, campaignCharacterAttribute, campaignCharacterProfile,
  campaignCharacterSkillAllocation, campaignCharacterSpellDocument } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as occurrence, campaignSessionEncounterInitiativeParticipant as participant,
  campaignSessionEncounterInitiative as runtime, campaignSessionEncounterActionDeclaration as declaration,
  campaignSessionEncounterResponderOpportunity as opportunity, campaignSessionRoll } from "@/db/tabletop-operations-schema";
import { spawnEncounterCreaturesInTransaction } from "@/features/tabletop-operations/creature-spawn-service";
import { createEmptySpell, createContainer } from "@/features/spell-construction/utilities/spellFactory";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction,
  reconcileResponderOpportunityInTransaction, resolveActionDeclarationInTransaction, readActionDeclarationWorkspaceInTransaction,
  cancelActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { parseLockedActionDeclarationSnapshot } from "@/features/tabletop-operations/action-declaration";
import { recordCombatSourceResolutionInTransaction } from "@/features/tabletop-operations/combat-source-resolution-service";
import { declareCombatMovementInTransaction } from "@/features/tabletop-operations/combat-movement-service";
import { declareDefenseInterventionInTransaction, resolveDeclaredDefensesInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { generateActionEffectPlanInTransaction, approveActionEffectPlanInTransaction, applyActionEffectPlanInTransaction,
  applyRoutineCombatConsequencesInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction, holdParticipantInitiativeInTransaction,
  cancelAuthoredActionBindingInTransaction, ruleOnInterruptedReactionInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline, closeInitiativeRuntime } from "@/features/tabletop-operations/initiative-runtime";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { setCombatFrozenInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { lockEncounterCloseoutContextInTransaction, finalizeEncounterCloseoutInTransaction } from "@/features/tabletop-operations/encounter-closeout-service";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { COMBAT_COMPLETION_FIXTURE as fixed } from "./fixtures/combat-completion-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rollback = new Error("ROLLBACK_FIXED_TRACE");

async function fixture(tx: Tx) {
  const f = await completionServiceFixture(tx, "fixed-rowan-mira");
  await tx.insert(userRole).values([{ userId: f.godId, role: "god" }, { userId: f.godId, role: "player" }]);
  const rowan = f.heroId, mira = f.defenderId;
  await tx.update(campaignCharacter).set({ name: "Rowan" }).where(eq(campaignCharacter.id, rowan));
  await tx.update(campaignCharacter).set({ name: "Mira", isNpc: false, npcBuildMode: null }).where(eq(campaignCharacter.id, mira));
  await tx.update(weaponProfile).set({ damage: "6", initiativeCost: 6 }).where(eq(weaponProfile.itemId, f.weaponId));
  for (const [id, source] of [[rowan, fixed.rowan], [mira, fixed.mira]] as const) {
    for (const [attributeKey, value] of Object.entries(source.attributes)) await tx.insert(campaignCharacterAttribute).values({ characterId: id, attributeKey, value })
      .onConflictDoUpdate({ target: [campaignCharacterAttribute.characterId, campaignCharacterAttribute.attributeKey], set: { value } });
    await tx.insert(campaignCharacterSkillAllocation).values({ characterId: id, skillId: f.skillId, points: 5 });
    await tx.update(campaignCharacterActiveHealth).set({ totalDamage: 0 }).where(eq(campaignCharacterActiveHealth.characterId, id));
  }
  const [goblin] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
  const third = (await spawnEncounterCreaturesInTransaction(tx, f.context, f.godId, { requestKey: crypto.randomUUID(), creatureId: goblin.creatureId!, quantity: 1, joinInitiative: false })).created[0].runtimeParticipantKey;
  const goblins = [...f.occurrences, third];
  await tx.insert(participant).values({ ...f.context, characterId: third, normalTotalInitiative: 22, currentInitiative: 22, movementMode: "Walk" });
  for (const [index, id] of goblins.entries()) {
    const [original] = await tx.select().from(occurrence).where(eq(occurrence.characterId, id));
    await tx.update(occurrence).set({ displayLabel: `Goblin ${index + 1}`, creatureSnapshotJson: {
      ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, killXp: 3 }, attributes: [], movement: [{ movementMode: "Walk", movementValue: 2 }] },
      localStateJson: { ...(original.localStateJson as object), conditions: index === 2 ? [{ name: "Isolated one-Step condition", duration: { kind: "combat-steps", value: 1 } }] : [] },
    }).where(eq(occurrence.characterId, id));
  }
  for (const id of [rowan, mira, ...goblins]) await tx.update(participant).set({ participationStatus: "active", currentInitiative: id === rowan ? 26 : 22, normalTotalInitiative: id === rowan ? 26 : 22 })
    .where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, id)));
  await tx.update(runtime).set({ timelineInitiative: 26 }).where(eq(runtime.encounterId, f.encounterId));
  const [spellcraft, channeling] = await tx.insert(skill).values([
    { name: "Spellcraft", classification: "standard", tier: 1, primaryAttribute: "INT", createdByUserId: f.godId },
    { name: "Channeling", classification: "standard", tier: 1, primaryAttribute: "WIS", createdByUserId: f.godId },
  ]).returning();
  await tx.insert(campaignCharacterSkillAllocation).values([{ characterId: mira, skillId: spellcraft.id, points: 1 }, { characterId: mira, skillId: channeling.id, points: 20 }]);
  await tx.update(campaignCharacterProfile).set({ baseMagicSteps: 4 }).where(eq(campaignCharacterProfile.characterId, mira));
  const spell = { ...createEmptySpell(), name: "Arc Bolt", castingSystem: "Spellcraft" as const, sphere: "Force", frameworkSkillId: spellcraft.id,
    containers: [{ ...createContainer("target"), id: "bolt-target", effects: [{ id: "bolt-damage", ruleId: "damage", quantity: 2, description: "Supplied fixture Arc Bolt" }] }] };
  const [saved] = await tx.insert(campaignCharacterSpellDocument).values({ characterId: mira, documentId: spell.id, name: spell.name, tradition: spell.tradition, inSpellbook: true, documentJson: JSON.stringify(spell) }).returning();
  await recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: mira, sourceKind: "spell", sourceRef: `personal:${saved.id}`,
    mode: "attribute-roll", governing: { kind: "attribute", attributeKey: "INT" }, effectScaling: { "bolt-damage": "per-success" }, reason: "Supplied Arc Bolt target and per-success fixture." });
  await cancelAuthoredActionBindingInTransaction(tx, f.context, f.pendingActionId, "Exclude the unrelated retained base-fixture binding from this complete encounter.");
  await ruleOnInterruptedReactionInTransaction(tx, f.context, f.reactionId, "keep");
  const player = (id: number) => ({ authority: "player" as const, userId: f.godId, characterId: id });
  const engine = () => loadInitiativeEngineInTransaction(tx, f.encounterId);
  const init = async (id: number) => (await loadInitiativeEngineInTransaction(tx, f.encounterId, true)).participants.find(({ characterId }) => characterId === id)!.currentInitiative;
  const advance = async (point: number) => { const before = await engine(); await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, point)); };
  const swing = async (id: number, target: number, roll: number) => {
    const actor = id === rowan ? player(id) : f.god;
    const declarationId = await createActionDeclarationDraftInTransaction(tx, f.context, actor, { ...completionDraft(id, target), label: `${id === rowan ? "Rowan" : "Goblin"} swing`,
      sourceKind: id === rowan ? "weapon" : "creature-attack", weaponItemId: id === rowan ? f.weaponId : null, sourceRef: id === rowan ? null : "fixture-shortsword", initiativeCost: id === rowan ? 6 : 4 });
    await lockActionDeclarationInTransaction(tx, f.context, actor, declarationId);
    await commitActionDeclarationInTransaction(tx, f.context, actor, declarationId, { method: "entered", enteredTotal: roll });
    return declarationId;
  };
  const window = async (declarationId: number, id: number) => (await tx.select().from(opportunity).where(and(eq(opportunity.declarationId, declarationId), eq(opportunity.responderCharacterId, id), eq(opportunity.status, "pending"))))[0];
  const allow = async (declarationId: number, id: number) => { const row = await window(declarationId, id); assert.ok(row, `Missing window ${declarationId}/${id}`);
    if (row.requiresGodConfirmation) await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, row.id, { decision: "allow" }); return row.id; };
  const settle = async (declarationId: number) => {
    const unanswered = await tx.select().from(opportunity).where(and(eq(opportunity.declarationId, declarationId), eq(opportunity.status, "pending")));
    for (const row of unanswered) await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, row.id,
      { decision: "ineligible", reason: "Fixture awareness ruling: no other combatant has an aware intervention in this supplied exchange." });
  };
  const resolve = async (declarationId: number) => { await settle(declarationId); return resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declarationId); };
  return { ...f, rowan, mira, goblins, saved, player, engine, init, advance, swing, window, allow, settle, resolve };
}

for (const reverse of [false, true]) test(`fixed overlapping Rowan/Mira/Goblin trace, reversed simultaneous submission=${reverse}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx), [g1, g2, g3] = f.goblins;
    const first = await f.swing(f.rowan, g1, 90);
    await f.advance(22);
    let secondGoblin = 0, bolt = 0, movement = 0;
    const choices = [async () => {
      await declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: await f.allow(first, g1), reactionType: "block", protectedTargetCharacterId: g1, sourceRef: "fixture-shortsword" }, { method: "entered", enteredTotal: 20 });
    }, async () => { secondGoblin = await f.swing(g2, f.rowan, 55); }, async () => {
      movement = (await declareCombatMovementInTransaction(tx, f.context, f.god, { participantId: g3, movementMode: "Walk", distance: 4, requestKey: crypto.randomUUID() })).declarationId;
    }, async () => {
      bolt = await createActionDeclarationDraftInTransaction(tx, f.context, f.player(f.mira), { ...completionDraft(f.mira, g3), label: "Arc Bolt", sourceKind: "spell", sourceRef: `personal:${f.saved.id}`,
        actionKind: "spell-cast", windowKind: "ordinary", sourcePayload: { selections: { targetGroups: { "bolt-target": [g3] }, applications: { [`bolt-damage:${g3}`]: { hitLocationNumber: 0 } } } } });
      await lockActionDeclarationInTransaction(tx, f.context, f.player(f.mira), bolt);
      const [row] = await tx.select().from(declaration).where(eq(declaration.id, bolt));
      const locked = parseLockedActionDeclarationSnapshot(row.lockedSnapshotJson);
      await tx.update(declaration).set({ lockedSnapshotJson: { ...locked, initiativeCost: 4, authoredSource: { ...locked.authoredSource!,
        resourceCosts: locked.authoredSource!.resourceCosts.map((cost) => ({ ...cost, amount: 3 })) } } }).where(eq(declaration.id, bolt));
      await commitActionDeclarationInTransaction(tx, f.context, f.player(f.mira), bolt, { method: "entered", enteredTotal: 12 });
    }];
    for (const choose of reverse ? [...choices].reverse() : choices) await choose();
    await f.resolve(first);
    assert.equal((await readActiveManaInTransaction(tx, f.mira)).pools[0].currentMana, 17);
    await f.advance(20);
    const firstPlan = await generateActionEffectPlanInTransaction(tx, f.context, f.god, first, { targetParticipantId: g1, hitLocationNumber: 0,
      finalDamage: 11, injuryName: "Severed head", defeated: true, defeatValueXp: 3, reason: "Brannan's supplied 11-damage/3-HP head severing and defeat." });
    await approveActionEffectPlanInTransaction(tx, f.context, f.god, firstPlan);
    await applyActionEffectPlanInTransaction(tx, f.context, f.god, firstPlan);
    await resolveActionDeclarationInTransaction(tx, f.context, f.player(f.rowan), first);
    await f.settle(movement);
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, movement)).status, "applied");
    assert.equal(await f.init(f.rowan), 20);
    const dodge = async () => declareDefenseInterventionInTransaction(tx, f.context, f.player(f.rowan), { opportunityId: await f.allow(secondGoblin, f.rowan), reactionType: "dodge", protectedTargetCharacterId: f.rowan }, { method: "entered", enteredTotal: 74 });
    const move = async () => { movement = (await declareCombatMovementInTransaction(tx, f.context, f.god, { participantId: g3, movementMode: "Walk", distance: 2, requestKey: crypto.randomUUID() })).declarationId; };
    for (const choose of reverse ? [move, dodge] : [dodge, move]) await choose();
    await f.resolve(secondGoblin);
    assert.equal(await f.init(f.rowan), 19);
    await f.advance(19);
    await f.settle(movement);
    await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, movement);
    let rowanSecond = 0;
    const attack = async () => { rowanSecond = await f.swing(f.rowan, g2, 9); };
    for (const choose of reverse ? [move, attack] : [attack, move]) await choose();
    const rowanPending = (await f.engine()).pendingActions.find(({ actorCharacterId, status }) => actorCharacterId === f.rowan && status === "active")!;
    assert.equal(rowanPending.expectedCompletionInitiative, 13);
    await f.advance(18);
    await f.settle(movement); await f.settle(bolt);
    for (const [id, actor] of [[secondGoblin, f.god], [bolt, f.player(f.mira)], [movement, f.god]] as const) await applyRoutineCombatConsequencesInTransaction(tx, f.context, actor, id);
    await declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: await f.allow(rowanSecond, g2), reactionType: "block", protectedTargetCharacterId: g2, sourceRef: "fixture-shortsword" }, { method: "entered", enteredTotal: 78 });
    assert.equal(await f.init(g2), 14);
    assert.equal(await f.init(g2) - 4, 10);
    assert.equal(await f.init(f.mira), 18);
    const rolls = await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId));
    assert.deepEqual(rolls.map(({ resultTotal }) => resultTotal).sort((a, b) => a! - b!), [9, 12, 20, 55, 74, 78, 90]);
    assert.ok(!rolls.some(({ resultTotal }) => resultTotal === 94));
    const [third] = await tx.select().from(occurrence).where(eq(occurrence.characterId, g3));
    assert.deepEqual((third.localStateJson as { movementHistory: { distance: number }[] }).movementHistory.map(({ distance }) => distance), [4, 2, 2]);
    assert.ok((third.localStateJson as { conditions: { expiredAt?: string }[] }).conditions[0].expiredAt);
    const [dead] = await tx.select().from(occurrence).where(eq(occurrence.characterId, g1));
    assert.equal((dead.localStateJson as { health: { totalDamage: number } }).health.totalDamage, 11);
    assert.deepEqual((dead.localStateJson as { defeat: { awards: unknown[] } }).defeat.awards, []);
    // Original supplied trace stops here. Mira has neither chosen Hold nor rolled a defense.
    assert.equal((await readActionDeclarationWorkspaceInTransaction(tx, f.context, f.player(f.mira))).participants.find(({ characterId }) => characterId === f.mira)!.participationStatus, "active");
    await assert.rejects(f.advance(14), /checkpoint/);

    // Explicit, separate completion fixture: Mira chooses Hold; G3 declares a fresh
    // fixed Roll 55. This continuation is not retroactively part of the original.
    const thirdAttack = await f.swing(g3, f.mira, 55);
    await holdParticipantInitiativeInTransaction(tx, f.context, f.mira);
    await f.resolve(rowanSecond);
    const unaware = await f.window(thirdAttack, f.mira);
    await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, unaware.id, { decision: "ineligible", reason: "The original awareness ruling: Mira does not yet know she is attacked." });
    await assert.rejects(declareDefenseInterventionInTransaction(tx, f.context, f.player(f.mira), { opportunityId: unaware.id, reactionType: "dodge", protectedTargetCharacterId: f.mira }, { method: "entered", enteredTotal: 94 }), /pending|eligible|reconciled/);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    const frozenState = await f.engine();
    assert.equal((await readActiveManaInTransaction(tx, f.mira)).pools[0].currentMana, 17);
    await assert.rejects(f.advance(14), /Combat is paused/);
    assert.deepEqual(await f.engine(), frozenState);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
    await cancelActionDeclarationInTransaction(tx, f.context, f.god, thirdAttack, "Separate completion fixture: G.O.D. stops the attack before consequences.");
    await f.advance(13);
    await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player(f.rowan), rowanSecond);
    const before = await f.engine();
    await persistInitiativeEngineInTransaction(tx, f.context, before, closeInitiativeRuntime(before));
    const context = await lockEncounterCloseoutContextInTransaction(tx, f.encounterId, f.godId);
    const commands = [{ kind: "creature" as const, defeatedParticipantId: g1, mode: "full-to-each" as const, recipientCharacterIds: [f.rowan, f.mira], requestKey: crypto.randomUUID() },
      { kind: "encounter" as const, amountPerCharacter: 10, recipientCharacterIds: [f.rowan, f.mira], requestKey: crypto.randomUUID() }];
    const closed = await finalizeEncounterCloseoutInTransaction(tx, context, { awards: [], combatXpDecisions: commands });
    assert.equal(closed.encounter.status, "completed");
    assert.deepEqual(closed.recipients.map(({ currentExperience }) => currentExperience), [25, 21]);
    assert.equal((await readActiveManaInTransaction(tx, f.mira)).pools[0].currentMana, 17);
    assert.equal(await f.init(f.rowan), 13); assert.equal(await f.init(f.mira), 18); assert.equal(await f.init(g2), 14);
    for (const id of [f.rowan, f.mira]) assert.equal((await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, id)))[0].totalDamage, 0);
    assert.equal((await finalizeEncounterCloseoutInTransaction(tx, await lockEncounterCloseoutContextInTransaction(tx, f.encounterId, f.godId), { awards: [], combatXpDecisions: commands })).rewards.length, 4);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});
