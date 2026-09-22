import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, eq } from "drizzle-orm";

if (process.env.SERRIAN_DISPOSABLE_SCENES !== "true"
  || !/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_multiple_scenes_dev$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run the disposable multiple-Scene harness.");
}

// Only the HTTP authentication/cache boundaries are substituted. The actual
// server actions, ownership checks, transactions and database writes run below.
const actors = new AsyncLocalStorage();
const access = async () => {
  const userId = actors.getStore();
  if (!userId) throw new Error("Test action requires an authenticated actor.");
  return { user: { id: userId } };
};
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, {
  namedExports: {
    requireGod: access, requirePlayer: access, requireSession: access,
    requireAdmin: access, requireRole: access, requireCampaignOwner: access, requireCampaignAccess: access,
    requireAccessContext: async () => ({ session: await access(), roles: ["god"] }),
    requireGodOrAdminAccessContext: async () => ({ session: await access(), roles: ["god"] }),
  },
});
mock.module("next/cache", { namedExports: { revalidatePath() {} } });

const { db, pool } = await import("../src/db/index.ts");
const { user } = await import("../src/db/auth-schema.ts");
const { userRole } = await import("../src/db/authorization-schema.ts");
const { campaign, campaignPlayer } = await import("../src/db/campaign-schema.ts");
const { campaignCharacter, campaignCharacterProfile, campaignCharacterAttribute } = await import("../src/db/realm-schema.ts");
const { town, townNpcAssociation } = await import("../src/db/town-schema.ts");
const { campaignSession: sessions, campaignSessionScene: scenes, campaignSessionSceneMember: members,
  campaignSessionRoster: roster, campaignSessionEncounter: encounters } = await import("../src/db/tabletop-operations-schema.ts");
const actions = await import("../src/app/heavens/tabletop/scene-actions.ts");
const encounterActions = await import("../src/app/heavens/tabletop/encounter-actions.ts");
const sessionActions = await import("../src/app/heavens/tabletop/actions.ts");
const { readPlayerTabletopRuntimeInTransaction } = await import("../src/features/tabletop-operations/player-tabletop-console-service.ts");
const { lockSessionCloseoutContextInTransaction, readSessionCloseoutInTransaction } = await import("../src/features/tabletop-operations/session-closeout-service.ts");
const { placeTownInSceneInTransaction } = await import("../src/features/tabletop-operations/location-placement-service.ts");
after(() => pool.end());

async function fixture() {
  return db.transaction(async (tx) => {
    const ownerId = `scene-god-${crypto.randomUUID()}`, playerId = `scene-player-${crypto.randomUUID()}`;
    await tx.insert(user).values([ownerId, playerId].map((id) => ({ id, name: id, email: `${id}@example.invalid`, username: id })));
    await tx.insert(userRole).values([{ userId: ownerId, role: "god" }, { userId: playerId, role: "player" }]);
    const [root] = await tx.insert(campaign).values({ name: "Split-party Campaign", createdByUserId: ownerId,
      attributePoints: 0, skillPoints: 0, maxStartingSkill: 0, pointsToUnlockNextTier: 0, maxPointsInSkill: 100,
      startingCreditAmount: 0, currencySystem: "Credits", fatePointMethod: "Assigned", assignedFatePoints: 0 }).returning();
    await tx.insert(campaignPlayer).values([{ campaignId: root.id, userId: ownerId }, { campaignId: root.id, userId: playerId }]);
    const [session] = await tx.insert(sessions).values({ campaignId: root.id, title: "Split-party Session", sequenceNumber: 1, status: "active", startedAt: new Date() }).returning();
    const cast = await tx.insert(campaignCharacter).values(["Sarah", "Kennith", "Rebecca", "Town Guide"].map((name, i) => ({
      campaignId: root.id, playerUserId: i === 3 ? ownerId : playerId, name, isNpc: i === 3, npcKind: "race", npcBuildMode: i === 3 ? "detailed" : null,
    }))).returning();
    for (const character of cast) {
      await tx.insert(campaignCharacterProfile).values({ characterId: character.id });
      await tx.insert(campaignCharacterAttribute).values(["STR", "DEX", "CON", "INT", "WIS", "CHR"].map((attributeKey) => ({ characterId: character.id, attributeKey, value: 30 })));
    }
    await tx.insert(roster).values(cast.map((character, sortOrder) => ({ sessionId: session.id, campaignId: root.id, characterId: character.id, sortOrder })));
    const sceneRows = await tx.insert(scenes).values(["Junction", "Cedar & Steel", "South Gate", "Unused"].map((title, i) => ({
      sessionId: session.id, campaignId: root.id, title, sequenceNumber: i + 1,
    }))).returning();
    return { ownerId, playerId, campaignId: root.id, sessionId: session.id, cast, scenes: sceneRows };
  });
}
const act = (f, callback) => actors.run(f.ownerId, callback);
const add = (f, scene, character) => act(f, () => actions.addCampaignSessionSceneMember(f.scenes[scene].id, f.cast[character].id));
const start = (f, scene) => act(f, () => actions.startCampaignSessionScene(f.scenes[scene].id));
const complete = (f, scene) => act(f, () => actions.completeCampaignSessionScene(f.scenes[scene].id));
const reopen = (f, scene) => act(f, () => actions.reopenCampaignSessionScene(f.scenes[scene].id));
const sceneRow = async (f, index) => (await db.select().from(scenes).where(eq(scenes.id, f.scenes[index].id)))[0];
const closeout = (f) => db.transaction(async (tx) => readSessionCloseoutInTransaction(tx, await lockSessionCloseoutContextInTransaction(tx, f.sessionId, f.ownerId)));

test("actual Scene actions start three disjoint Scenes and Player Tabletop resolves each Character", async () => {
  const f = await fixture();
  for (let i = 0; i < 3; i++) { await add(f, i, i); await start(f, i); }
  for (let i = 0; i < 3; i++) {
    const state = await db.transaction((tx) => readPlayerTabletopRuntimeInTransaction(tx, f.cast[i].id, f.playerId));
    assert.equal(state.hierarchy.scene.id, f.scenes[i].id);
    assert.equal(state.hierarchy.session.id, f.sessionId);
  }
  assert.deepEqual((await closeout(f)).activeContext.scenes.map(({ title }) => title), ["Junction", "Cedar & Steel", "South Gate"]);
});

test("planned overlap is allowed; starting blocks with Character and active Scene names and no writes", async () => {
  const f = await fixture();
  await add(f, 0, 1); await start(f, 0); await add(f, 1, 1);
  const before = await sceneRow(f, 1);
  await assert.rejects(start(f, 1), /Kennith.*active Scene.*Junction.*Remove/);
  assert.deepEqual(await sceneRow(f, 1), before);
  await act(f, () => actions.removeCampaignSessionSceneMember(f.scenes[0].id, f.cast[1].id));
  await start(f, 1);
  assert.equal((await sceneRow(f, 0)).status, "active");
  assert.equal((await sceneRow(f, 1)).status, "active");
});

test("reopening checks overlap and preserves the original start timestamp after the conflict clears", async () => {
  const f = await fixture();
  await add(f, 0, 1); await start(f, 0); await complete(f, 0);
  const historical = await sceneRow(f, 0);
  await add(f, 1, 1); await start(f, 1);
  await assert.rejects(reopen(f, 0), /Kennith.*Cedar & Steel/);
  assert.deepEqual(await sceneRow(f, 0), historical);
  await complete(f, 1); await reopen(f, 0);
  const restored = await sceneRow(f, 0);
  assert.deepEqual(restored.startedAt, historical.startedAt);
  assert.equal(restored.completedAt, null);
  assert.equal(restored.sequenceNumber, historical.sequenceNumber);
});

test("active membership rejects shared Characters and NPCs; planned membership remains valid", async () => {
  const f = await fixture();
  await add(f, 0, 0); await add(f, 0, 3); await start(f, 0); await start(f, 1);
  for (const i of [0, 3]) {
    await assert.rejects(add(f, 1, i), /already participating.*Junction/);
    await add(f, 2, i);
  }
  assert.equal((await db.select().from(members).where(eq(members.sceneId, f.scenes[1].id))).length, 0);
  await assert.rejects(start(f, 2), /already participating/);
});

test("simultaneous conflicting starts allow exactly one Scene to activate", async () => {
  const f = await fixture(); await add(f, 0, 0); await add(f, 1, 0);
  const results = await Promise.allSettled([start(f, 0), start(f, 1)]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.match(String(results.find(({ status }) => status === "rejected").reason), /already participating/);
});

test("simultaneous member additions to separate active Scenes allow only one", async () => {
  const f = await fixture(); await start(f, 0); await start(f, 1);
  const results = await Promise.allSettled([add(f, 0, 0), add(f, 1, 0)]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.match(String(results.find(({ status }) => status === "rejected").reason), /already participating/);
});

test("concurrent activation and active membership cannot assign the same Character twice", async () => {
  const f = await fixture(); await add(f, 0, 0); await start(f, 1);
  const results = await Promise.allSettled([start(f, 0), add(f, 1, 0)]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.match(String(results.find(({ status }) => status === "rejected").reason), /already participating/);
});

test("Player Tabletop retains its defensive error for corrupt overlapping memberships", async () => {
  const f = await fixture(); await add(f, 0, 0); await start(f, 0); await start(f, 1);
  await db.insert(members).values({ sceneId: f.scenes[1].id, sessionId: f.sessionId, campaignId: f.campaignId, characterId: f.cast[0].id });
  await assert.rejects(db.transaction((tx) => readPlayerTabletopRuntimeInTransaction(tx, f.cast[0].id, f.playerId)), /ambiguous active Scene hierarchy/);
});

test("closeout blocks on all active Scenes until the last completes; unused prep stays a warning", async () => {
  const f = await fixture(); for (let i = 0; i < 3; i++) await start(f, i);
  const [unused] = await db.insert(encounters).values({ campaignId: f.campaignId, sessionId: f.sessionId, sceneId: f.scenes[3].id, sequenceNumber: 1, title: "Unused Encounter", encounterType: "combat" }).returning();
  assert.ok(unused);
  for (let i = 0; i < 3; i++) {
    const view = await closeout(f);
    assert.equal(view.scenes.active, 3 - i);
    assert.equal(view.activeContext.scenes.length, 3 - i);
    assert.equal(view.blockers.filter(({ code }) => code === "scene-active").length, 3 - i);
    await assert.rejects(act(f, () => sessionActions.completeCampaignSession(f.sessionId)), /blocked/);
    await complete(f, i);
  }
  const ready = await closeout(f);
  assert.equal(ready.canFinalize, true);
  assert.deepEqual(ready.warnings.map(({ code }) => code), ["planned-scenes", "planned-encounters"]);
  await act(f, () => sessionActions.completeCampaignSession(f.sessionId));
  assert.equal((await db.select().from(sessions).where(eq(sessions.id, f.sessionId)))[0].status, "completed");
});

test("independent Scenes each run an Encounter; duplicate active Encounters in one Scene still fail", async () => {
  const f = await fixture(); await start(f, 0); await start(f, 1);
  const rows = await db.insert(encounters).values([0, 1, 0].map((i, n) => ({ campaignId: f.campaignId, sessionId: f.sessionId, sceneId: f.scenes[i].id,
    sequenceNumber: n === 2 ? 2 : 1, title: `Encounter ${n}`, encounterType: "combat" }))).returning();
  await act(f, () => encounterActions.startCampaignSessionEncounter(rows[0].id));
  await act(f, () => encounterActions.startCampaignSessionEncounter(rows[1].id));
  await assert.rejects(act(f, () => encounterActions.startCampaignSessionEncounter(rows[2].id)), /active Encounter/);
  await assert.rejects(db.update(encounters).set({ status: "active", startedAt: new Date() }).where(eq(encounters.id, rows[2].id)), /Failed query|duplicate/);
  const view = await closeout(f);
  assert.deepEqual(view.activeContext.encounters.map(({ sceneId }) => sceneId), [f.scenes[0].id, f.scenes[1].id]);
  assert.equal(view.blockers.filter(({ code }) => code === "encounter-active").length, 2);
  await assert.rejects(complete(f, 0), /active Encounter/);
});

test("ownership, parent Session lifecycle, Scene sequence and single active Session remain enforced", async () => {
  const f = await fixture(), other = await fixture();
  await assert.rejects(actors.run(other.ownerId, () => actions.startCampaignSessionScene(f.scenes[0].id)), /owner|manage|own/i);
  await assert.rejects(actors.run(other.ownerId, () => actions.addCampaignSessionSceneMember(f.scenes[0].id, f.cast[0].id)), /owner|manage|own/i);
  const [second] = await db.insert(sessions).values({ campaignId: f.campaignId, title: "Second", sequenceNumber: 2 }).returning();
  await assert.rejects(act(f, () => sessionActions.startCampaignSession(second.id)), /active Session/);
  await assert.rejects(db.update(sessions).set({ status: "active", startedAt: new Date() }).where(eq(sessions.id, second.id)), /Failed query|duplicate/);
  await assert.rejects(db.insert(scenes).values({ campaignId: f.campaignId, sessionId: f.sessionId, title: "Duplicate Sequence", sequenceNumber: 1 }), /Failed query|duplicate/);
  await db.update(sessions).set({ status: "planned", startedAt: null }).where(eq(sessions.id, f.sessionId));
  await assert.rejects(start(f, 0), /only while its Session is active/);
  await db.update(sessions).set({ status: "completed", startedAt: new Date(), completedAt: new Date() }).where(eq(sessions.id, f.sessionId));
  await assert.rejects(add(f, 0, 0), /completed Session/);
});

test("Town NPC auto-membership cannot bypass active-Scene exclusion and rolls back placement", async () => {
  const f = await fixture(); await add(f, 0, 3); await start(f, 0); await start(f, 1);
  const [place] = await db.insert(town).values({ campaignId: f.campaignId, name: "Test Town", category: "Town" }).returning();
  await db.insert(townNpcAssociation).values({ townId: place.id, campaignId: f.campaignId, npcCharacterId: f.cast[3].id });
  await assert.rejects(db.transaction((tx) => placeTownInSceneInTransaction(tx, f.scenes[1].id, place.id, {}, f.ownerId)), /Town Guide.*Junction/);
  assert.equal((await pool.query("select count(*)::int n from campaign_session_scene_town where scene_id=$1", [f.scenes[1].id])).rows[0].n, 0);
  await db.transaction((tx) => placeTownInSceneInTransaction(tx, f.scenes[2].id, place.id, {}, f.ownerId));
  assert.equal((await db.select().from(members).where(and(eq(members.sceneId, f.scenes[2].id), eq(members.characterId, f.cast[3].id)))).length, 1);
  await assert.rejects(start(f, 2), /Town Guide.*Junction/);
});
