import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaignCharacterActiveCondition, campaignCharacterActiveMana, campaignCharacterItem, campaignCharacterItemInstance } from "@/db/realm-schema";
import { itemEffect } from "@/db/item-schema";
import { skillExtension } from "@/db/skill-schema";
import { campaignSessionEncounter, campaignSessionScene, campaignSessionCalledCheckRequest, campaignSessionRoll, campaignSessionEffectDurationBinding } from "@/db/tabletop-operations-schema";
import { tabletopSourceUseRequest, tabletopSourceUseEvent } from "@/db/tabletop-source-use-schema";
import { cancelSourceUseInTransaction, completeSourceUseInTransaction, executeUnruledSourceUseInTransaction, readSourceUseRequestsInTransaction, requestSourceUseInTransaction, ruleSourceUseInTransaction } from "@/features/tabletop-operations/source-use-service";
import { answerCalledCheckInTransaction, answerHighLowInTransaction, callHighLowInTransaction, issueCalledCheckInTransaction, issueHighLowInTransaction, readPlayerCalledCheckWorkspaceInTransaction } from "@/features/tabletop-operations/called-check-service";
import { tabletopToolsFixture } from "./fixtures/tabletop-tools-fixture";
import type { TabletopSourceUse } from "@/features/tabletop-operations/source-use";
import { previewTabletopLifecycleEntityForActor } from "@/features/lifecycle/tabletop-lifecycle-service";
import { previewLifecycleEntityForActor } from "@/features/lifecycle/lifecycle-service";

assert.equal(process.env.SERRIAN_DISPOSABLE_TABLETOP_TABS, "true");
const url = new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/serrian_tabletop_tabs_dev");
assert.notEqual(url.port, "5432");
after(() => pool.end());

test("Tabletop spell and item rulings preserve ownership, costs, history, and atomic one-time completion", async (t) => {
  const f = await db.transaction((tx) => tabletopToolsFixture(tx, "source-requests"));
  const player = { userId: f.playerId, role: "player" as const }, god = { userId: f.godId, role: "god" as const };
  const source: TabletopSourceUse = { kind: "spell", request: { casterCharacterId: f.heroId, source: { kind: "catalog", allocationId: f.learned.allocation.id }, selections: { targetGroups: {}, applications: {} } } };
  const itemSource: TabletopSourceUse = { kind: "item", request: { sourceCharacterId: f.heroId, itemId: f.manualItem.id, itemInstanceId: null, targetCharacterId: null, effectSelections: {} } };
  const submit = (selected: TabletopSourceUse = source, key = crypto.randomUUID()) => db.transaction((tx) => requestSourceUseInTransaction(tx, player, { sessionId: f.sessionId, source: selected, intent: "Cross the quay without disturbing the guards.", idempotencyKey: key }));
  const approve = (requestId: number) => db.transaction((tx) => ruleSourceUseInTransaction(tx, god, { requestId, decision: "approved", ruling: "The passage reaches the far landing. The guards do not notice." }));
  const complete = (requestId: number) => db.transaction((tx) => completeSourceUseInTransaction(tx, player, requestId));
  const manaSpent = async () => (await db.select().from(campaignCharacterActiveMana).where(eq(campaignCharacterActiveMana.characterId, f.heroId)))[0]?.manaSpent ?? 0;
  const quantity = async () => (await db.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.heroId), eq(campaignCharacterItem.itemId, f.manualItem.id))))[0]?.quantity ?? 0;

  await t.test("request and approval spend nothing; completion and concurrent retries spend exactly once", async () => {
    const key = crypto.randomUUID();
    const id = await submit(source, key);
    assert.equal(await submit(source, key), id);
    assert.equal(await manaSpent(), 0);
    await assert.rejects(complete(id), /approve/);
    await approve(id); await approve(id);
    assert.equal(await manaSpent(), 0);
    const one = await complete(id);
    const again = await complete(id);
    assert.deepEqual(again, one);
    assert.equal(one.kind, "spell");
    assert.ok(await manaSpent() > 0);
    const spent = await manaSpent();
    const itemId = await submit(itemSource);
    assert.equal(await quantity(), 3);
    await approve(itemId);
    const replies = await Promise.all([complete(itemId), complete(itemId)]);
    assert.deepEqual(replies[0], replies[1]);
    assert.equal(await quantity(), 2);
    assert.equal(await manaSpent(), spent);
    const events = await db.select().from(tabletopSourceUseEvent).where(eq(tabletopSourceUseEvent.requestId, itemId));
    assert.deepEqual(events.map(({ status }) => status), ["pending", "approved", "completed"]);
  });
  await t.test("lifecycle previews preserve source-use requests and events at their actual ownership scope", async () => {
    const actor = { userId: f.godId, roles: ["god"] };
    for (const [entityKind, entityId] of [["campaign-session", f.sessionId], ["scene", f.sceneId], ["encounter", f.encounterId]] as const) {
      const preview = await previewTabletopLifecycleEntityForActor({ entityKind, entityId }, actor);
      const history = preview.dependencies.find(({ label }) => label === "Tabletop Spell and Item ruling history");
      if (entityKind === "encounter") assert.equal(history, undefined);
      else {
        assert.equal(history?.count, 8);
        assert.equal(history.blocking, true);
      }
    }
    const campaign = await previewLifecycleEntityForActor({ entityKind: "campaign", entityId: f.campaignId }, actor);
    assert.equal(campaign.dependencies.find(({ label }) => label === "Tabletop Spell and Item ruling history")?.count, 8);
    const character = await previewLifecycleEntityForActor({ entityKind: "player-character", entityId: f.heroId }, actor);
    const history = character.dependencies.find(({ label }) => label === "Tabletop Spell and Item ruling requests");
    assert.equal(history?.count, 2);
    assert.equal(history.blocking, true);
  });
  await t.test("rejection, cancellation and forged direct manual uses leave resources unchanged", async () => {
    const id = await submit(itemSource);
    await db.transaction((tx) => ruleSourceUseInTransaction(tx, god, { requestId: id, decision: "rejected", ruling: "Not possible from here." }));
    await assert.rejects(complete(id), /approve/);
    const cancel = await submit(itemSource);
    await approve(cancel);
    await db.transaction((tx) => cancelSourceUseInTransaction(tx, player, cancel));
    await assert.rejects(complete(cancel), /approve/);
    await assert.rejects(db.transaction((tx) => executeUnruledSourceUseInTransaction(tx, player, itemSource)), /ruling/);
    await assert.rejects(db.transaction((tx) => executeUnruledSourceUseInTransaction(tx, player, source)), /ruling/);
    assert.equal(await quantity(), 2);
  });
  await t.test("changed source, exhausted resources and closed Scene cannot consume an approval", async () => {
    const stale = await submit(itemSource); await approve(stale);
    await db.update(itemEffect).set({ effectJson: { kind: "manual", title: "Changed route", description: "Different meaning." } }).where(eq(itemEffect.itemId, f.manualItem.id));
    await assert.rejects(complete(stale), /changed/);
    assert.equal(await quantity(), 2);
    await db.transaction((tx) => cancelSourceUseInTransaction(tx, player, stale));
    const empty = await submit(itemSource); await approve(empty);
    await db.delete(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.heroId), eq(campaignCharacterItem.itemId, f.manualItem.id)));
    await assert.rejects(complete(empty));
    assert.equal((await db.select().from(tabletopSourceUseRequest).where(eq(tabletopSourceUseRequest.id, empty)))[0].status, "approved");
    await db.transaction((tx) => cancelSourceUseInTransaction(tx, player, empty));
    const closed = await submit(); await approve(closed);
    await db.update(campaignSessionScene).set({ status: "completed", completedAt: new Date() }).where(eq(campaignSessionScene.id, f.sceneId));
    await assert.rejects(complete(closed), /Scene/);
    await db.transaction((tx) => cancelSourceUseInTransaction(tx, player, closed));
    await db.update(campaignSessionScene).set({ status: "active", completedAt: null }).where(eq(campaignSessionScene.id, f.sceneId));
  });
  await t.test("wrong Player, non-owner G.O.D., raw Spell payloads, revoked role and active combat are rejected", async () => {
    const id = await submit();
    await assert.rejects(db.transaction((tx) => completeSourceUseInTransaction(tx, { userId: f.godId, role: "player" }, id)), /not available/);
    await assert.rejects(db.transaction((tx) => ruleSourceUseInTransaction(tx, { userId: f.playerId, role: "god" }, { requestId: id, decision: "approved", ruling: "Forged." })), /not available/);
    await assert.rejects(submit({ kind: "spell", request: { ...source.request, source: { kind: "raw-formula", document: f.spell, circumstance: "normal" } } } as never), /owned catalog/);
    await db.delete(userRole).where(and(eq(userRole.userId, f.playerId), eq(userRole.role, "player")));
    await assert.rejects(approve(id), /not available/);
    await db.insert(userRole).values({ userId: f.playerId, role: "player" });
    await approve(id);
    await db.update(campaignSessionEncounter).set({ status: "active", completedAt: null }).where(eq(campaignSessionEncounter.id, f.encounterId));
    await assert.rejects(complete(id), /Encounter controls/);
    await assert.rejects(submit(), /Encounter controls/);
    await db.update(campaignSessionEncounter).set({ status: "completed", completedAt: new Date() }).where(eq(campaignSessionEncounter.id, f.encounterId));
    const view = await db.transaction((tx) => readSourceUseRequestsInTransaction(tx, player, { characterId: f.heroId }));
    assert.ok(view.some((row) => row.id === id && row.status === "approved"));
    assert.ok(view.every((row) => row.snapshot.signature === ""));
    await db.transaction((tx) => cancelSourceUseInTransaction(tx, player, id));
    await db.update(skillExtension).set({ dataJson: JSON.stringify(f.spell) }).where(eq(skillExtension.skillId, f.learned.spellSkill.id));
    assert.equal((await db.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, f.magazineCopy.id)))[0].loadedRounds, 0);
  });
});

test("Tabletop scene effects bind to the active Scene and rejected duration uses roll back resources and effects", async () => {
  const f = await db.transaction((tx) => tabletopToolsFixture(tx, "source-duration"));
  const actor = { userId: f.playerId, role: "player" as const };
  const source: TabletopSourceUse = { kind: "item", request: { sourceCharacterId: f.heroId, itemId: f.potion.id, itemInstanceId: null, targetCharacterId: null, effectSelections: {} } };
  const effect = { kind: "condition.apply", name: "Tabletop ward", description: "Exact fixture effect.", duration: { kind: "scene" } };
  await db.update(itemEffect).set({ effectJson: effect }).where(eq(itemEffect.itemId, f.potion.id));
  const execute = () => db.transaction((tx) => executeUnruledSourceUseInTransaction(tx, actor, source));
  const quantity = async () => (await db.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.heroId), eq(campaignCharacterItem.itemId, f.potion.id))))[0].quantity;
  await execute();
  assert.equal(await quantity(), 2);
  const [binding] = await db.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.characterId, f.heroId));
  assert.equal(binding.sceneId, f.sceneId);
  assert.ok(binding.conditionId);
  const count = async () => (await db.select().from(campaignCharacterActiveCondition).where(eq(campaignCharacterActiveCondition.characterId, f.heroId))).length;
  assert.equal(await count(), 1);
  await db.update(itemEffect).set({ effectJson: { ...effect, duration: { kind: "combat-steps", value: 2 } } }).where(eq(itemEffect.itemId, f.potion.id));
  await assert.rejects(execute(), /Encounter controls/);
  assert.equal(await quantity(), 2);
  assert.equal(await count(), 1);
  await db.update(itemEffect).set({ effectJson: effect }).where(eq(itemEffect.itemId, f.potion.id));
  await db.update(campaignSessionScene).set({ status: "completed", completedAt: new Date() }).where(eq(campaignSessionScene.id, f.sceneId));
  await assert.rejects(execute(), /active Scene/);
  assert.equal(await quantity(), 2);
  assert.equal(await count(), 1);
});

test("Called Checks and High/Low take the respondent's method and preserve frozen targets and retry identity", async () => {
  const f = await db.transaction((tx) => tabletopToolsFixture(tx, "roll-choice"));
  const player = { kind: "player" as const, userId: f.playerId, characterId: f.heroId };
  for (const [issued, selected] of [["random", "entered"], ["entered", "random"]] as const) {
    const batch = await db.transaction((tx) => issueCalledCheckInTransaction(tx, f.godId, { sessionId: f.sessionId, source: { kind: "attribute", attributeKey: "DEX" },
      purpose: "Chosen roll method", recipientScope: "one", recipientCharacterIds: [f.heroId], visibility: "table", rollMethod: issued, idempotencyKey: crypto.randomUUID() }));
    const [request] = await db.select().from(campaignSessionCalledCheckRequest).where(eq(campaignSessionCalledCheckRequest.batchId, batch));
    const answer = { requestId: request.id, method: selected, enteredTotal: selected === "entered" ? 42 : null, idempotencyKey: crypto.randomUUID() };
    const id = await db.transaction((tx) => answerCalledCheckInTransaction(tx, player, answer));
    assert.equal(await db.transaction((tx) => answerCalledCheckInTransaction(tx, player, answer)), id);
    const [roll] = await db.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.id, id));
    assert.equal(roll.method, selected);
    assert.equal(roll.targetNumber, request.originalTarget);
    await assert.rejects(db.transaction((tx) => answerCalledCheckInTransaction(tx, player, { ...answer, method: issued })), /different Roll/);
    const view = await db.transaction((tx) => readPlayerCalledCheckWorkspaceInTransaction(tx, f.heroId, f.playerId));
    assert.equal(view?.calledChecks.find((row) => row.id === request.id)?.resultMethod, selected);
  }
  const highLow = await db.transaction((tx) => issueHighLowInTransaction(tx, f.godId, { sessionId: f.sessionId, mode: "player-calls-rolls", participantCharacterId: f.heroId,
    visibility: "table", purpose: "Choose after calling", idempotencyKey: crypto.randomUUID() }));
  const answer = { requestId: highLow, method: "entered" as const, enteredTotal: 100, idempotencyKey: crypto.randomUUID() };
  await assert.rejects(db.transaction((tx) => answerHighLowInTransaction(tx, player, answer)), /lock High or Low/i);
  await db.transaction((tx) => callHighLowInTransaction(tx, f.playerId, f.heroId, { requestId: highLow, side: "high", idempotencyKey: crypto.randomUUID() }));
  const id = await db.transaction((tx) => answerHighLowInTransaction(tx, player, answer));
  assert.equal(await db.transaction((tx) => answerHighLowInTransaction(tx, player, answer)), id);
  assert.equal((await db.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.id, id)))[0].method, "entered");
});
