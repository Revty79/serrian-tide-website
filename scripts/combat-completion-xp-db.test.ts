import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { campaignCharacterProfile } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as participant, campaignSessionEncounterReward as reward, campaignSessionEncounterRewardDecision as decision,
  campaignSessionEncounterInitiative as initiative } from "@/db/tabletop-operations-schema";
import { awardCombatExperienceInTransaction, type CombatExperienceDecisionInput } from "@/features/tabletop-operations/combat-xp-service";
import { setCombatFrozenInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { lockEncounterCloseoutContextInTransaction, finalizeEncounterCloseoutInTransaction } from "@/features/tabletop-operations/encounter-closeout-service";
import { cancelAuthoredActionBindingInTransaction, ruleOnInterruptedReactionInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { ruleCombatConditionInTransaction } from "@/features/tabletop-operations/combat-condition-service";
import { combatConditionState } from "@/features/tabletop-operations/combat-condition-state";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_COMBAT_XP");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function fixture(tx: Tx, label: string) {
  const f = await completionServiceFixture(tx, label);
  for (const id of f.occurrences) {
    const [row] = await tx.select().from(participant).where(eq(participant.characterId, id));
    await tx.update(participant).set({ localStateJson: { ...(row.localStateJson as object), defeat: {
      reason: "Explicit isolated fixture G.O.D. defeat", defeatValueXp: 3, credit: null, distribution: null, awards: [] } } }).where(eq(participant.characterId, id));
  }
  const request: CombatExperienceDecisionInput = { kind: "creature", defeatedParticipantId: f.occurrences[0], mode: "full-to-each",
    recipientCharacterIds: [f.heroId, f.defenderId], requestKey: crypto.randomUUID() };
  const xp = async () => {
    const rows = await tx.select().from(campaignCharacterProfile).where(and(eq(campaignCharacterProfile.characterId, f.heroId)));
    const [other] = await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.defenderId));
    return { hero: rows[0].experience, npc: other.experience, spent: [rows[0].totalExperience, other.totalExperience] };
  };
  return { ...f, request, xp };
}

test("an incapacitated Creature awards its authored XP once without changing condition, including after later death", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "incapacitated-xp"), id = f.occurrences[0];
    const [source] = await tx.select().from(participant).where(eq(participant.characterId, id));
    const local = { ...(source.localStateJson as Record<string, unknown>) }; delete local.defeat;
    await tx.update(participant).set({ localStateJson: local, creatureSnapshotJson: { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, killXp: 3 } } }).where(eq(participant.characterId, id));
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.god, f.request), /defeat or incapacitation/);
    await ruleCombatConditionInTransaction(tx, f.encounterId, f.god, { participantId: id, status: "incapacitated", expectedRevision: 0,
      initiativeTreatment: "preserve", reason: "The Creature is incapacitated, still alive.", requestKey: crypto.randomUUID() });
    const readLocal = async () => (await tx.select().from(participant).where(eq(participant.characterId, id)))[0].localStateJson as Record<string, unknown>;
    const condition = (await readLocal()).combatCondition, initial = await f.xp();
    assert.equal((await readLocal()).defeat, undefined);
    const result = await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, f.request);
    const value = 3;
    assert.equal((await f.xp()).hero, initial.hero + value);
    assert.deepEqual((await readLocal()).combatCondition, condition);
    assert.equal(combatConditionState(await readLocal()).status, "incapacitated");
    assert.equal((await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, f.request)).decisionId, result.decisionId);
    await ruleCombatConditionInTransaction(tx, f.encounterId, f.god, { participantId: id, status: "dead", expectedRevision: 1,
      reason: "Later death must not grant a second award for the same Creature.", requestKey: crypto.randomUUID() });
    assert.equal((await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, { ...f.request, requestKey: crypto.randomUUID() })).reused, true);
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.god, { ...f.request, recipientCharacterIds: [f.heroId], requestKey: crypto.randomUUID() }), /different immutable/);
    assert.equal((await f.xp()).hero, initial.hero + value);
    assert.equal((await tx.select().from(decision).where(eq(decision.encounterId, f.encounterId))).length, 1);
    throw rollback;
  }), (error) => error === rollback);
});

for (const mode of ["killer-only", "full-to-each", "shared-split"] as const) test(`${mode} Creature XP and full additional encounter XP are additive and immutable`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, mode);
    const command: CombatExperienceDecisionInput = { ...f.request, kind: "creature", defeatedParticipantId: f.occurrences[0], mode,
      recipientCharacterIds: mode === "killer-only" ? [f.heroId] : [f.heroId, f.defenderId],
      killerRuling: { characterId: f.heroId, reason: "G.O.D. credits this exact Creature defeat to the Hero." } };
    const initial = await f.xp();
    const result = await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, command);
    const expected = mode === "killer-only" ? [3, 0] : mode === "full-to-each" ? [3, 3] : [2, 1];
    assert.deepEqual(await f.xp(), { hero: initial.hero + expected[0], npc: initial.npc + expected[1], spent: initial.spent });
    assert.equal((await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, command)).decisionId, result.decisionId);
    assert.equal((await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, { ...command, requestKey: crypto.randomUUID() })).reused, true);
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.god, { ...command, mode: mode === "full-to-each" ? "shared-split" : "full-to-each" }), /different immutable/);
    const extra: CombatExperienceDecisionInput = { kind: "encounter", amountPerCharacter: 10, recipientCharacterIds: [f.heroId, f.defenderId], requestKey: crypto.randomUUID() };
    const encounterAward = await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, extra);
    assert.deepEqual(encounterAward.awards.map(({ amount }) => amount), [10, 10]);
    assert.equal((await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, extra)).reused, true);
    assert.deepEqual(await f.xp(), { hero: initial.hero + expected[0] + 10, npc: initial.npc + expected[1] + 10, spent: initial.spent });
    const [source] = await tx.select().from(participant).where(eq(participant.characterId, f.occurrences[0]));
    const [other] = await tx.select().from(participant).where(eq(participant.characterId, f.occurrences[1]));
    assert.equal(((source.localStateJson as { defeat: { awards: unknown[] } }).defeat.awards).length, 1);
    assert.equal(((other.localStateJson as { defeat: { awards: unknown[] } }).defeat.awards).length, 0);
    assert.equal((await tx.select().from(decision).where(eq(decision.encounterId, f.encounterId))).length, 2);
    const receipts = await tx.select().from(reward).where(eq(reward.encounterId, f.encounterId));
    assert.equal(receipts.reduce((sum, row) => sum + row.amount, 0), expected[0] + expected[1] + 20);
    throw rollback;
  }), (error) => error === rollback);
});

test("XP requires owner authority, exact eligibility, explicit missing killer ruling, and Resume", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "xp-authority");
    const initial = await f.xp();
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.player, f.request), /Campaign-owning/);
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, { authority: "god-owner", userId: "unrelated-admin" }, f.request), /creator|owner|Campaign/i);
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.god, { ...f.request, recipientCharacterIds: [f.rosterOnlyId] }), /exact Encounter/);
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.god, { ...f.request, kind: "creature", defeatedParticipantId: f.occurrences[0], mode: "killer-only", recipientCharacterIds: [f.heroId] }), /explicit G.O.D. ruling/);
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.god, { ...f.request, kind: "creature", defeatedParticipantId: f.occurrences[0], mode: "shared-split" }), /credited killer/);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.god, f.request), /Combat is paused/);
    assert.deepEqual(await f.xp(), initial);
    assert.equal((await tx.select().from(decision).where(eq(decision.encounterId, f.encounterId))).length, 0);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
    await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, f.request);
    assert.equal((await f.xp()).hero, initial.hero + 3);
    throw rollback;
  }), (error) => error === rollback);
});

test("two occurrences of one template receive separate awards and repeated closeout preserves the same receipts", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "xp-closeout");
    const commands: CombatExperienceDecisionInput[] = [f.request, { ...f.request, kind: "creature", defeatedParticipantId: f.occurrences[1], mode: "full-to-each", requestKey: crypto.randomUUID() },
      { kind: "encounter", amountPerCharacter: 10, recipientCharacterIds: [f.heroId, f.defenderId], requestKey: crypto.randomUUID() }];
    await cancelAuthoredActionBindingInTransaction(tx, f.context, f.pendingActionId, "Close the retained fixture's unexecuted historical binding without replaying it.");
    await ruleOnInterruptedReactionInTransaction(tx, f.context, f.reactionId, "keep");
    await tx.update(initiative).set({ status: "closed", closedAt: new Date() }).where(eq(initiative.encounterId, f.encounterId));
    const context = await lockEncounterCloseoutContextInTransaction(tx, f.encounterId, f.godId);
    const initial = await f.xp();
    const closed = await finalizeEncounterCloseoutInTransaction(tx, context, { awards: [], combatXpDecisions: commands });
    assert.equal(closed.encounter.status, "completed");
    assert.equal(closed.rewards.length, 6);
    const reconnected = await lockEncounterCloseoutContextInTransaction(tx, f.encounterId, f.godId);
    const again = await finalizeEncounterCloseoutInTransaction(tx, reconnected, { awards: [], combatXpDecisions: commands });
    assert.deepEqual(again.rewards, closed.rewards);
    assert.deepEqual(await f.xp(), { hero: initial.hero + 16, npc: initial.npc + 16, spent: initial.spent });
    throw rollback;
  }), (error) => error === rollback);
});

test("concurrent duplicate Creature and encounter awards commit one decision and one recipient increment", async () => {
  const f = await db.transaction((tx) => fixture(tx, "xp-concurrent"));
  const award = () => db.transaction((tx) => awardCombatExperienceInTransaction(tx, f.encounterId, f.god, f.request));
  const [first, second] = await Promise.all([award(), award()]);
  assert.equal(first.decisionId, second.decisionId);
  assert.equal(Number(first.reused) + Number(second.reused), 1);
  const extra: CombatExperienceDecisionInput = { kind: "encounter", amountPerCharacter: 10, recipientCharacterIds: [f.heroId, f.defenderId], requestKey: crypto.randomUUID() };
  const [a, b] = await Promise.all([1, 2].map(() => db.transaction((tx) => awardCombatExperienceInTransaction(tx, f.encounterId, f.god, extra))));
  assert.equal(a.decisionId, b.decisionId);
  const [hero] = await db.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId));
  assert.equal(hero.experience, 25);
  assert.equal((await db.select().from(reward).where(eq(reward.encounterId, f.encounterId))).length, 4);
});

test("a missed XP award can be made after combat ends without reopening it or replaying consequences", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "xp-after-close");
    const { forceEndCombatInTransaction } = await import("@/features/tabletop-operations/combat-force-end-service");
    await forceEndCombatInTransaction(tx, f.encounterId, f.god, "End the fight before distributing its earned XP.");
    const context = await lockEncounterCloseoutContextInTransaction(tx, f.encounterId, f.godId);
    assert.equal(context.encounterStatus, "completed");
    const initial = await f.xp();
    const before = (await tx.select().from(participant).where(eq(participant.encounterId, f.encounterId))).map(({ characterId, localStateJson }) => ({ characterId, localStateJson }));
    const closed = await finalizeEncounterCloseoutInTransaction(tx, context, { awards: [], combatXpDecisions: [f.request] });
    assert.equal(closed.encounter.status, "completed");
    assert.deepEqual(await f.xp(), { hero: initial.hero + 3, npc: initial.npc + 3, spent: initial.spent });
    const again = await finalizeEncounterCloseoutInTransaction(tx, context, { awards: [], combatXpDecisions: [f.request] });
    assert.deepEqual(again.rewards, closed.rewards);
    assert.equal((await tx.select().from(decision).where(eq(decision.encounterId, f.encounterId))).length, 1);
    const after = (await tx.select().from(participant).where(eq(participant.encounterId, f.encounterId))).map(({ characterId, localStateJson }) => ({ characterId, localStateJson }));
    for (const original of before) {
      const current = after.find((row) => row.characterId === original.characterId)!;
      if (original.localStateJson === null) { assert.equal(current.localStateJson, null); continue; }
      const prior = structuredClone(original.localStateJson) as Record<string, unknown>, next = structuredClone(current.localStateJson) as Record<string, unknown>;
      delete prior.defeat; delete next.defeat;
      assert.deepEqual(next, prior, "XP preserves Health, conditions, participation, and prior consequences");
    }
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});


test("NPC surrender stops choices and supports once-only G.O.D. XP and Fame without changing health", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "npc-surrender-awards");
    const { changeCombatParticipationInTransaction } = await import("@/features/tabletop-operations/combat-participation-service");
    const { readCombatProjectionInTransaction } = await import("@/features/tabletop-operations/combat-projection-service");
    const getProfile = async () => (await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)))[0];
    const initial = await getProfile();
    const command: CombatExperienceDecisionInput = { kind: "npc", defeatedParticipantId: f.defenderId, amountPerCharacter: 6, famePerCharacter: 2,
      recipientCharacterIds: [f.heroId], reason: "NPC yielded; G.O.D. selected this award.", requestKey: crypto.randomUUID() };
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.god, command), /death, incapacitation, or surrender/);
    const surrender = { participantId: f.defenderId, operation: "surrender" as const, requestKey: crypto.randomUUID(), expectedRevision: 0, reason: "NPC yields." };
    await assert.rejects(changeCombatParticipationInTransaction(tx, f.encounterId, f.player, surrender), /Campaign-owning/);
    await assert.rejects(changeCombatParticipationInTransaction(tx, f.encounterId, f.god, { ...surrender, participantId: f.heroId }), /exact NPC/);
    await changeCombatParticipationInTransaction(tx, f.encounterId, f.god, surrender);
    assert.equal((await changeCombatParticipationInTransaction(tx, f.encounterId, f.god, surrender)).reused, true);
    const projection = await readCombatProjectionInTransaction(tx, f.context, f.god);
    const npc = projection.entities.find((entry) => entry.participantId === f.defenderId)!;
    assert.equal(npc.canActNow, false); assert.equal(npc.canRespondNow, false); assert.equal(npc.mustChooseNow, false);
    assert.equal(npc.condition.status, "able"); assert.match(npc.statusText, /Surrendered/);
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.player, command), /Campaign-owning/);
    const awarded = await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, command);
    assert.equal(awarded.fameAwards[0].amount, 2);
    assert.equal((await getProfile()).fame, initial.fame + 2); assert.equal((await getProfile()).experience, initial.experience + 6);
    assert.equal((await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, command)).reused, true);
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.god, { ...command, famePerCharacter: 9 }), /immutable/);
    assert.equal((await getProfile()).fame, initial.fame + 2);
    const [member] = await tx.select().from(participant).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.defenderId)));
    assert.equal(combatConditionState(member.localStateJson).status, "able");
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

test("Creature kill Fame requires death and Player credit, preserves CR, and is independent of prior incapacitation XP", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "creature-kill-fame"), id = f.occurrences[0];
    await tx.update(participant).set({ creatureSnapshotJson: { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, challengeRating: 4 } } }).where(eq(participant.characterId, id));
    const initial = (await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)))[0];
    await ruleCombatConditionInTransaction(tx, f.encounterId, f.god, { participantId: id, status: "incapacitated", initiativeTreatment: "preserve", expectedRevision: 0, requestKey: crypto.randomUUID(), reason: "Unable to fight." });
    await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, f.request);
    const kill: CombatExperienceDecisionInput = { kind: "creature-kill-fame", defeatedParticipantId: id, killerCharacterId: f.heroId,
      recipientCharacterIds: [f.heroId], requestKey: crypto.randomUUID(), reason: "G.O.D. credits the Player's killing blow." };
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.god, kill), /requires recorded death/);
    await ruleCombatConditionInTransaction(tx, f.encounterId, f.god, { participantId: id, status: "dead", expectedRevision: 1, requestKey: crypto.randomUUID(), reason: "A later killing blow." });
    await assert.rejects(awardCombatExperienceInTransaction(tx, f.encounterId, f.god, { ...kill, killerCharacterId: f.defenderId, recipientCharacterIds: [f.defenderId] }), /Player Character/);
    const award = await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, kill);
    assert.equal(award.fameAwards[0].amount, 4);
    await tx.update(participant).set({ creatureSnapshotJson: { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, challengeRating: 9 } } }).where(eq(participant.characterId, id));
    assert.equal((await awardCombatExperienceInTransaction(tx, f.encounterId, f.god, kill)).reused, true);
    const after = (await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)))[0];
    assert.equal(after.fame, initial.fame + 4); assert.equal(after.experience, initial.experience + 3);
    assert.equal((await tx.select().from(decision).where(eq(decision.encounterId, f.encounterId))).length, 2);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});
