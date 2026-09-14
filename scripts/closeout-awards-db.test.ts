import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaignCharacterProfile } from "@/db/realm-schema";
import { campaignSession, campaignSessionScene, campaignSessionSceneMember } from "@/db/tabletop-operations-schema";
import { tabletopCloseoutAward, tabletopCloseoutAwardDecision } from "@/db/tabletop-closeout-award-schema";
import { applyCloseoutAwardsInTransaction, readCloseoutAwardViewInTransaction, readPlayerCloseoutAwardsInTransaction } from "@/features/tabletop-operations/closeout-award-service";
import { finalizeSessionCloseoutInTransaction, lockSessionCloseoutContextInTransaction } from "@/features/tabletop-operations/session-closeout-service";
import { previewTabletopLifecycleEntityForActor } from "@/features/lifecycle/tabletop-lifecycle-service";
import type { CloseoutAwardInput } from "@/features/tabletop-operations/closeout-awards";
import { closeoutAwardsFixture } from "./fixtures/closeout-awards-fixture";

assert.equal(process.env.SERRIAN_DISPOSABLE_TABLETOP_TABS, "true");
const url = new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/serrian_tabletop_tabs_dev");
assert.notEqual(url.port, "5432");
after(() => pool.end());

test("Scene and Session manual closeout awards are atomic, scoped, durable, and once-only", async (t) => {
  const f = await db.transaction((tx) => closeoutAwardsFixture(tx, "closeout-awards"));
  const other = await db.transaction((tx) => closeoutAwardsFixture(tx, "foreign-closeout"));
  const god = { userId: f.godId, roles: ["god"] };
  const target = { sessionId: f.sessionId, sceneId: f.sceneId };
  const input: CloseoutAwardInput = { awards: [{ characterId: f.heroId, experience: 5.5, fame: 3, quintessence: 2 }], note: "Secured the quay." };
  const profile = async () => (await db.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)))[0];
  const award = (value = input, actor = god) => db.transaction(async (tx) => {
    await applyCloseoutAwardsInTransaction(tx, target, actor, value);
    await tx.update(campaignSessionScene).set({ status: "completed", completedAt: new Date() }).where(eq(campaignSessionScene.id, f.sceneId));
  });

  await t.test("wrong G.O.D., Player, revoked roles, foreign recipients, and stale membership cannot grant", async () => {
    const before = await profile();
    await assert.rejects(award(input, { userId: other.godId, roles: ["god"] }));
    await assert.rejects(award(input, { userId: f.playerId, roles: ["player"] }));
    await assert.rejects(award({ ...input, awards: [{ ...input.awards[0], characterId: other.heroId }] }), /current member/);
    await db.delete(userRole).where(and(eq(userRole.userId, f.godId), eq(userRole.role, "god")));
    await assert.rejects(award(), /Campaign-owning/);
    await db.insert(userRole).values({ userId: f.godId, role: "god" });
    const [member] = await db.delete(campaignSessionSceneMember).where(and(eq(campaignSessionSceneMember.sceneId, f.sceneId), eq(campaignSessionSceneMember.characterId, f.heroId))).returning();
    await assert.rejects(award(), /current member/);
    await db.insert(campaignSessionSceneMember).values(member);
    assert.deepEqual(await profile(), before);
  });
  await t.test("late failure rolls back every balance and the award record", async () => {
    const before = await profile();
    await assert.rejects(db.transaction(async (tx) => { await applyCloseoutAwardsInTransaction(tx, target, god, input); throw new Error("late closeout failure"); }), /late closeout/);
    assert.deepEqual(await profile(), before);
    assert.equal((await db.select().from(tabletopCloseoutAwardDecision).where(eq(tabletopCloseoutAwardDecision.sessionId, f.sessionId))).length, 0);
  });
  await t.test("simultaneous close and exact retries grant once and preserve lifetime spending fields", async () => {
    await Promise.all([award(), award()]);
    await award();
    const after = await profile();
    assert.equal(after.experience, 15.5); assert.equal(after.fame, 5); assert.equal(after.quintessence, 6);
    assert.equal(after.totalExperience, 40); assert.equal(after.totalQuintessence, 12);
    const rows = await db.select().from(tabletopCloseoutAward).where(eq(tabletopCloseoutAward.characterId, f.heroId));
    assert.equal(rows.length, 1);
    const view = await db.transaction((tx) => readCloseoutAwardViewInTransaction(tx, target, god));
    assert.equal(view.decision?.note, input.note); assert.equal(view.decision?.awards[0].characterName, "Rowan");
  });
  await t.test("reopening and closing preserves the original award, refusing different amounts", async () => {
    await db.update(campaignSessionScene).set({ status: "active", completedAt: null }).where(eq(campaignSessionScene.id, f.sceneId));
    await assert.rejects(award({ ...input, awards: [{ ...input.awards[0], experience: 9 }] }), /already recorded/);
    await award({ awards: [], note: "" });
    assert.equal((await profile()).experience, 15.5);
  });
  await t.test("Session awards are additional, separately recorded, and do not reissue Scene awards", async () => {
    const finish = () => db.transaction(async (tx) => {
      const context = await lockSessionCloseoutContextInTransaction(tx, f.sessionId, god);
      await applyCloseoutAwardsInTransaction(tx, { sessionId: f.sessionId, sceneId: null }, god, input);
      return finalizeSessionCloseoutInTransaction(tx, context);
    });
    await finish(); await finish();
    assert.equal((await profile()).experience, 21); assert.equal((await profile()).fame, 8); assert.equal((await profile()).quintessence, 8);
    await db.update(campaignSession).set({ status: "active", completedAt: null }).where(eq(campaignSession.id, f.sessionId));
    await finish(); assert.equal((await profile()).experience, 21);
    const history = await db.transaction((tx) => readPlayerCloseoutAwardsInTransaction(tx, f.heroId, f.playerId));
    assert.equal(history.length, 2);
    assert.ok(history.some(({ sceneTitle }) => sceneTitle !== null)); assert.ok(history.some(({ sceneTitle }) => sceneTitle === null));
    await assert.rejects(db.transaction((tx) => readPlayerCloseoutAwardsInTransaction(tx, f.heroId, other.playerId)));
  });
  await t.test("lifecycle previews retain award history in the correct scope", async () => {
    for (const [entityKind, entityId, count] of [["scene", f.sceneId, 2], ["campaign-session", f.sessionId, 4]] as const) {
      const preview = await previewTabletopLifecycleEntityForActor({ entityKind, entityId }, god);
      const history = preview.dependencies.find(({ label }) => label === "Scene and Session award history");
      assert.equal(history?.count, count); assert.equal(history?.blocking, true);
    }
  });
});

test("a confirmed no-award closeout changes no profile and cannot later issue awards on reopen", async () => {
  const f = await db.transaction((tx) => closeoutAwardsFixture(tx, "zero-closeout"));
  const actor = { userId: f.godId, roles: ["god"] }, target = { sessionId: f.sessionId, sceneId: f.sceneId };
  const before = (await db.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)))[0];
  await db.transaction((tx) => applyCloseoutAwardsInTransaction(tx, target, actor, { awards: [], note: "No award for this Scene." }));
  assert.deepEqual((await db.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)))[0], before);
  await assert.rejects(db.transaction((tx) => applyCloseoutAwardsInTransaction(tx, target, actor, { awards: [{ characterId: f.heroId, experience: 1, fame: 0, quintessence: 0 }], note: "" })), /already recorded/);
});

test("blocked Session finalization rolls back proposed awards", async () => {
  const f = await db.transaction((tx) => closeoutAwardsFixture(tx, "blocked-closeout"));
  const god = { userId: f.godId, roles: ["god"] };
  await assert.rejects(db.transaction(async (tx) => {
    const context = await lockSessionCloseoutContextInTransaction(tx, f.sessionId, god);
    await applyCloseoutAwardsInTransaction(tx, { sessionId: f.sessionId, sceneId: null }, god, { awards: [{ characterId: f.heroId, experience: 2, fame: 3, quintessence: 4 }], note: "" });
    await finalizeSessionCloseoutInTransaction(tx, context);
  }), /Scene .* still active/);
  assert.equal((await db.select().from(tabletopCloseoutAwardDecision).where(eq(tabletopCloseoutAwardDecision.sessionId, f.sessionId))).length, 0);
  assert.equal((await db.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)))[0].experience, 10);
});
