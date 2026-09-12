import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { campaignCharacter, campaignCharacterAttribute } from "@/db/realm-schema";
import { weaponProfile } from "@/db/item-schema";
import { campaignSessionEncounterInitiative as runtime, campaignSessionEncounterInitiativeParticipant as enrollment, campaignSessionEncounterActionDeclaration as declaration, campaignSessionEncounterParticipant as member, campaignSessionRoll as roll } from "@/db/tabletop-operations-schema";
import { previewCombatChoiceInTransaction, submitCombatChoiceInTransaction } from "@/features/combat-screen/choice-service";
import { physicalPercentile, type CombatSubmission } from "@/features/combat-screen/choice-types";
import { applyRoutineCombatConsequencesInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { declareDefenseInterventionInTransaction, previewDefenseInterventionInTransaction, resolveDeclaredDefensesInTransaction, resolveDeclaredDefensesIfReadyInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { holdParticipantInitiativeInTransaction, passParticipantInitiativeInTransaction, loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { readCombatProjectionInTransaction } from "@/features/tabletop-operations/combat-projection-service";
import { readOpenDeclarationCheckpoint } from "@/features/tabletop-operations/declaration-checkpoint-service";
import { reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { campaignSessionEncounterResponderOpportunity as response } from "@/db/tabletop-operations-schema";
import { ruleOrdinaryAttackConsequenceInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { spawnEncounterCreaturesInTransaction } from "@/features/tabletop-operations/creature-spawn-service";
import { combatNextInput, type CombatOperations } from "@/features/combat-screen/next-input";
import type { CombatScreenData } from "@/features/combat-screen/screen-types";
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

test("busy-response cleanup stays sealed until every simultaneous choice is made", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx);
    await tx.update(runtime).set({ timelineInitiative: 24 }).where(eq(runtime.encounterId, f.encounterId));
    await tx.update(enrollment).set({ currentInitiative: 24, participationStatus: "active" }).where(and(eq(enrollment.encounterId, f.encounterId), eq(enrollment.characterId, f.occurrences[0])));
    await tx.update(enrollment).set({ participationStatus: "active" }).where(and(eq(enrollment.encounterId, f.encounterId), eq(enrollment.characterId, f.defenderId)));
    const first = await submitCombatChoiceInTransaction(tx, f.context, f.god, { requestKey: crypto.randomUUID(), choice: { participantId: f.occurrences[0], targetIds: [f.heroId], source: { kind: "creature-attack", ref: "fixture-shortsword", name: "Shortsword", itemId: null, instanceId: null, description: "" } }, roll: { method: "entered", enteredTotal: 20 } });
    assert.ok("declarationId" in first);
    const readOpportunity = async () => (await tx.select().from(response).where(and(eq(response.declarationId, first.declarationId), eq(response.responderCharacterId, f.heroId))))[0];
    const engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, engine, advanceInitiativeTimeline(engine, 22));
    await submitCombatChoiceInTransaction(tx, f.context, f.player, f.input);
    assert.ok(await readOpenDeclarationCheckpoint(tx, f.encounterId));
    assert.equal((await readOpportunity()).status, "pending", "an earlier public window must not reveal the sealed action choice");
    const visible = await readCombatProjectionInTransaction(tx, f.context, f.god);
    assert.equal(visible.entities.find((entry) => entry.participantId === f.heroId)!.currentAction, null);
    assert.equal(visible.declarations.some((entry) => entry.actorCharacterId === f.heroId), false);
    await assert.rejects(reconcileResponderOpportunityInTransaction(tx, f.context, f.god, (await readOpportunity()).id, { decision: "allow" }), /sealed/);
    await holdParticipantInitiativeInTransaction(tx, f.context, f.defenderId);
    assert.equal(await readOpenDeclarationCheckpoint(tx, f.encounterId), null);
    assert.equal((await readOpportunity()).status, "ineligible");
    assert.ok((await readCombatProjectionInTransaction(tx, f.context, f.god)).entities.find((entry) => entry.participantId === f.heroId)!.currentAction);
    throw rollback;
  }), (error) => error === rollback);
});

for (const declineFirst of [false, true]) test(`a free Player crosses an attack, chooses a different target and leaves no busy prompts; no-reaction first=${declineFirst}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx);
    await tx.insert(campaignCharacterAttribute).values({ characterId: f.heroId, attributeKey: "CON", value: 50 });
    await tx.update(enrollment).set({ currentInitiative: 20 }).where(and(eq(enrollment.encounterId, f.encounterId), eq(enrollment.characterId, f.heroId)));
    await tx.update(enrollment).set({ participationStatus: "active" }).where(and(eq(enrollment.encounterId, f.encounterId), eq(enrollment.characterId, f.occurrences[0])));
    const first = await submitCombatChoiceInTransaction(tx, f.context, f.god, { requestKey: crypto.randomUUID(), choice: { participantId: f.occurrences[0], targetIds: [f.heroId], source: { kind: "creature-attack", ref: "fixture-shortsword", name: "Shortsword", itemId: null, instanceId: null, description: "" } }, roll: { method: "entered", enteredTotal: 20 } });
    assert.ok("declarationId" in first);
    const readOpportunity = async () => (await tx.select().from(response).where(and(eq(response.declarationId, first.declarationId), eq(response.responderCharacterId, f.heroId))))[0];
    const opportunity = await readOpportunity();
    assert.ok(opportunity);
    await assert.rejects(tx.transaction((savepoint) => reconcileResponderOpportunityInTransaction(savepoint, f.context, f.god, opportunity.id, { decision: "allow" })), /Advance/);
    let engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, engine, advanceInitiativeTimeline(engine, 20));
    await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, opportunity.id, { decision: "allow" });
    let projection = await readCombatProjectionInTransaction(tx, f.context, f.player);
    let hero = projection.entities.find((entry) => entry.participantId === f.heroId)!;
    assert.equal(hero.mustChooseNow, true); assert.equal(hero.canRespondNow, true);
    const operations = { sealed: false, plans: [], defenses: { reactions: [] }, firearms: { attacks: [] } } as unknown as CombatOperations;
    const next = combatNextInput({ pause: projection.pause, projection } as CombatScreenData, operations);
    assert.equal(next.kind === "inspect" && next.focus, "action");
    if (declineFirst) {
      const noReaction = { opportunityId: opportunity.id, reactionType: "no-reaction" as const, protectedTargetCharacterId: f.heroId };
      const id = await declareDefenseInterventionInTransaction(tx, f.context, f.player, noReaction);
      assert.equal(await declareDefenseInterventionInTransaction(tx, f.context, f.player, noReaction), id);
      projection = await readCombatProjectionInTransaction(tx, f.context, f.player);
      hero = projection.entities.find((entry) => entry.participantId === f.heroId)!;
      assert.equal(hero.currentInitiative, 20); assert.equal(hero.mustChooseNow, true); assert.equal(hero.participationStatus, "active");
    }
    const second = await submitCombatChoiceInTransaction(tx, f.context, f.player, { ...f.input, choice: { ...f.input.choice, targetIds: [f.occurrences[1]] }, roll: { method: "entered", enteredTotal: 20 } });
    assert.ok("declarationId" in second);
    const secondRow = (await tx.select().from(declaration).where(eq(declaration.id, second.declarationId)))[0];
    assert.deepEqual((secondRow.lockedSnapshotJson as { targetCharacterIds: number[] }).targetCharacterIds, [f.occurrences[1]]);
    assert.equal((await readOpportunity()).status, declineFirst ? "response-declared" : "ineligible");
    assert.equal((await tx.select().from(response).where(eq(response.declarationId, second.declarationId))).length, 0, "the original attacker is busy and gets no response prompt");
    if (!declineFirst) {
      // Emulate an unanswered opportunity retained from the superseded busy-defense rule.
      await tx.update(response).set({ status: "pending", requiresGodConfirmation: false, reconciledAt: null, reconciledByUserId: null }).where(eq(response.id, opportunity.id));
      const request = { opportunityId: opportunity.id, reactionType: "dodge" as const, protectedTargetCharacterId: f.heroId };
      await assert.rejects(previewDefenseInterventionInTransaction(tx, f.context, f.player, request), /unfinished action/);
      for (const reactionType of ["dodge", "block", "intervention", "no-reaction"] as const) {
        await assert.rejects(tx.transaction((savepoint) => declareDefenseInterventionInTransaction(savepoint, f.context, f.player, { ...request, reactionType })), /unfinished action/);
      }
      const busy = (await readCombatProjectionInTransaction(tx, f.context, f.player)).entities.find((entry) => entry.participantId === f.heroId)!;
      assert.equal(busy.canActNow, false); assert.equal(busy.canRespondNow, false); assert.deepEqual(busy.responseOpportunityIds, []);
      await assert.rejects(tx.transaction((savepoint) => submitCombatChoiceInTransaction(savepoint, f.context, f.player, { ...f.input, requestKey: crypto.randomUUID() })), /unfinished action/);
      await resolveDeclaredDefensesIfReadyInTransaction(tx, f.context, f.god, first.declarationId);
      assert.equal((await readOpportunity()).status, "ineligible", "retained busy prompts reconcile without a fabricated defense");
    }
    engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, engine, advanceInitiativeTimeline(engine, 18));
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, first.declarationId);
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, first.declarationId)).status, "applied");
    await passParticipantInitiativeInTransaction(tx, f.context, f.occurrences[0]);
    engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, engine, advanceInitiativeTimeline(engine, 16));
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.player, second.declarationId);
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, second.declarationId)).status, "applied");
    assert.equal((await tx.select().from(roll).where(eq(roll.encounterId, f.encounterId))).length, 2);
    assert.equal((await readCombatProjectionInTransaction(tx, f.context, f.player)).entities.find((entry) => entry.participantId === f.heroId)!.mustChooseNow, true);
    throw rollback;
  }), (error) => error === rollback);
});
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

test("screen attacks reject their own actor before spending, including the firearm entry path", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx), before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    for (const firearm of [undefined, { firingModeId: 1, aimInitiative: 0, firingDurationInitiative: 1 }]) {
      const choice = { ...f.input.choice, targetIds: [f.heroId], ...(firearm ? { firearm } : {}) };
      await assert.rejects(previewCombatChoiceInTransaction(tx, f.context, f.player, choice), /another combatant/);
      await assert.rejects(tx.transaction((savepoint) => submitCombatChoiceInTransaction(savepoint, f.context, f.player, { ...f.input, choice })), /another combatant/);
      if (firearm) await assert.rejects(tx.transaction((savepoint) => submitCombatChoiceInTransaction(savepoint, f.context, f.player, { ...f.input, choice: { ...choice, source: { ...choice.source, kind: "spell" } } })), /another combatant/);
    }
    assert.deepEqual(await loadInitiativeEngineInTransaction(tx, f.encounterId), before);
    assert.equal((await tx.select().from(declaration).where(eq(declaration.encounterId, f.encounterId))).length, 0);
    assert.equal((await tx.select().from(roll).where(eq(roll.encounterId, f.encounterId))).length, 0);
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
