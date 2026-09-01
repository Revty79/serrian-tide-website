import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, asc, count, eq, like } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { campaignSession, campaignSessionRoster } from "@/db/tabletop-operations-schema";

const ROLLBACK = new Error("ROLLBACK_TABLETOP_TEST");

function temporaryIdentity(label: string): string {
  return `tabletop-test-${label}-${crypto.randomUUID()}`;
}

async function insertTemporaryCampaign(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  const userId = temporaryIdentity("user");
  await tx.insert(user).values({
    id: userId,
    name: "Tabletop Test G.O.D.",
    email: `${userId}@example.invalid`,
    username: userId,
  });
  const [created] = await tx.insert(campaign).values({
    name: "Tabletop Transaction Test",
    overview: "Temporary transaction-only Campaign.",
    attributePoints: 0,
    skillPoints: 0,
    maxStartingSkill: 0,
    pointsToUnlockNextTier: 0,
    maxPointsInSkill: 0,
    startingCreditAmount: 0,
    currencySystem: "Credits",
    fatePointMethod: "Assigned",
    assignedFatePoints: 0,
    createdByUserId: userId,
  }).returning({ id: campaign.id });
  assert.ok(created);
  await tx.insert(campaignPlayer).values({ campaignId: created.id, userId });
  return { campaignId: created.id, userId };
}

async function insertTemporaryCharacter(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { campaignId: number; userId: string; name: string; isNpc?: boolean; npcKind?: "race" | "creature" },
) {
  const [created] = await tx.insert(campaignCharacter).values({
    campaignId: input.campaignId,
    playerUserId: input.userId,
    name: input.name,
    isNpc: input.isNpc ?? false,
    npcKind: input.npcKind ?? "race",
  }).returning({ id: campaignCharacter.id });
  assert.ok(created);
  return created.id;
}

after(async () => {
  await pool.end();
});

test("Session metadata and lifecycle timestamps persist through the generated schema", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId } = await insertTemporaryCampaign(tx);
    const startedAt = new Date("2026-09-01T18:00:00.000Z");
    const completedAt = new Date("2026-09-01T22:00:00.000Z");
    const [created] = await tx.insert(campaignSession).values({
      campaignId,
      title: "Session One",
      sequenceNumber: 1,
      plannedFor: "2026-09-14",
      godNotes: "Private notes survive persistence.",
    }).returning();
    assert.equal(created?.status, "planned");
    assert.equal(created?.plannedFor, "2026-09-14");
    assert.equal(created?.godNotes, "Private notes survive persistence.");
    assert.equal(created?.startedAt, null);
    assert.equal(created?.completedAt, null);

    await tx.update(campaignSession).set({ status: "active", startedAt }).where(eq(campaignSession.id, created!.id));
    await tx.update(campaignSession).set({ status: "completed", completedAt }).where(eq(campaignSession.id, created!.id));
    const [completed] = await tx.select().from(campaignSession).where(eq(campaignSession.id, created!.id));
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.startedAt?.toISOString(), startedAt.toISOString());
    assert.equal(completed?.completedAt?.toISOString(), completedAt.toISOString());

    await tx.update(campaignSession).set({ status: "active", completedAt: null }).where(eq(campaignSession.id, created!.id));
    const [reopened] = await tx.select().from(campaignSession).where(eq(campaignSession.id, created!.id));
    assert.equal(reopened?.status, "active");
    assert.equal(reopened?.startedAt?.toISOString(), startedAt.toISOString());
    assert.equal(reopened?.completedAt, null);
    throw ROLLBACK;
  }), (error) => error === ROLLBACK);
});

test("the database prevents two active Sessions in one Campaign", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId } = await insertTemporaryCampaign(tx);
    const [first, second] = await tx.insert(campaignSession).values([
      { campaignId, title: "First", sequenceNumber: 1 },
      { campaignId, title: "Second", sequenceNumber: 2 },
    ]).returning({ id: campaignSession.id });
    assert.ok(first && second);
    await tx.update(campaignSession).set({ status: "active", startedAt: new Date() }).where(eq(campaignSession.id, first.id));
    await tx.update(campaignSession).set({ status: "active", startedAt: new Date() }).where(and(
      eq(campaignSession.id, second.id),
      eq(campaignSession.campaignId, campaignId),
    ));
  }), (error: unknown) => {
    const message = error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
      : String(error);
    return /campaign_session_one_active_per_campaign_uq|duplicate key/i.test(message);
  });
});

test("Session roster persists references, order, notes, and all three Character kinds", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId, userId } = await insertTemporaryCampaign(tx);
    const pcId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Test Player Character" });
    const raceNpcId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Test Race NPC", isNpc: true });
    const creatureNpcId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Test Creature NPC", isNpc: true, npcKind: "creature" });
    const [session] = await tx.insert(campaignSession).values({
      campaignId,
      title: "Roster Persistence",
      sequenceNumber: 1,
    }).returning({ id: campaignSession.id });
    assert.ok(session);

    await tx.insert(campaignSessionRoster).values([
      { sessionId: session.id, campaignId, characterId: creatureNpcId, sortOrder: 2, prepNotes: "Creature entrance." },
      { sessionId: session.id, campaignId, characterId: pcId, sortOrder: 0, prepNotes: "Player hook." },
      { sessionId: session.id, campaignId, characterId: raceNpcId, sortOrder: 1, prepNotes: "NPC motive." },
    ]);
    const roster = await tx
      .select({ characterId: campaignSessionRoster.characterId, sortOrder: campaignSessionRoster.sortOrder, prepNotes: campaignSessionRoster.prepNotes })
      .from(campaignSessionRoster)
      .where(eq(campaignSessionRoster.sessionId, session.id))
      .orderBy(asc(campaignSessionRoster.sortOrder));
    assert.deepEqual(roster, [
      { characterId: pcId, sortOrder: 0, prepNotes: "Player hook." },
      { characterId: raceNpcId, sortOrder: 1, prepNotes: "NPC motive." },
      { characterId: creatureNpcId, sortOrder: 2, prepNotes: "Creature entrance." },
    ]);
    throw ROLLBACK;
  }), (error) => error === ROLLBACK);
});

test("completion and reopen preserve roster while roster removal preserves the Character", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId, userId } = await insertTemporaryCampaign(tx);
    const characterId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Persistent Character" });
    const [session] = await tx.insert(campaignSession).values({
      campaignId,
      title: "Lifecycle Roster",
      sequenceNumber: 1,
    }).returning({ id: campaignSession.id });
    assert.ok(session);
    await tx.insert(campaignSessionRoster).values({ sessionId: session.id, campaignId, characterId });

    const startedAt = new Date("2026-09-01T18:00:00.000Z");
    const completedAt = new Date("2026-09-01T22:00:00.000Z");
    await tx.update(campaignSession).set({ status: "active", startedAt }).where(eq(campaignSession.id, session.id));
    await tx.update(campaignSession).set({ status: "completed", completedAt }).where(eq(campaignSession.id, session.id));
    let [rosterCount] = await tx.select({ value: count() }).from(campaignSessionRoster).where(eq(campaignSessionRoster.sessionId, session.id));
    assert.equal(Number(rosterCount?.value ?? 0), 1);

    await tx.update(campaignSession).set({ status: "active", completedAt: null }).where(eq(campaignSession.id, session.id));
    [rosterCount] = await tx.select({ value: count() }).from(campaignSessionRoster).where(eq(campaignSessionRoster.sessionId, session.id));
    assert.equal(Number(rosterCount?.value ?? 0), 1);

    await tx.delete(campaignSessionRoster).where(and(
      eq(campaignSessionRoster.sessionId, session.id),
      eq(campaignSessionRoster.characterId, characterId),
    ));
    const [characterCount] = await tx.select({ value: count() }).from(campaignCharacter).where(eq(campaignCharacter.id, characterId));
    assert.equal(Number(characterCount?.value ?? 0), 1);
    throw ROLLBACK;
  }), (error) => error === ROLLBACK);
});

test("deleting a planned Session cascades only its roster membership", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId, userId } = await insertTemporaryCampaign(tx);
    const characterId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Still Existing" });
    const [session] = await tx.insert(campaignSession).values({ campaignId, title: "Disposable Plan", sequenceNumber: 1 }).returning({ id: campaignSession.id });
    assert.ok(session);
    await tx.insert(campaignSessionRoster).values({ sessionId: session.id, campaignId, characterId });
    await tx.delete(campaignSession).where(eq(campaignSession.id, session.id));

    const [[rosterCount], [characterCount]] = await Promise.all([
      tx.select({ value: count() }).from(campaignSessionRoster).where(eq(campaignSessionRoster.sessionId, session.id)),
      tx.select({ value: count() }).from(campaignCharacter).where(eq(campaignCharacter.id, characterId)),
    ]);
    assert.equal(Number(rosterCount?.value ?? 0), 0);
    assert.equal(Number(characterCount?.value ?? 0), 1);
    throw ROLLBACK;
  }), (error) => error === ROLLBACK);
});

test("the database rejects duplicate roster membership", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId, userId } = await insertTemporaryCampaign(tx);
    const characterId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Duplicate Candidate" });
    const [session] = await tx.insert(campaignSession).values({ campaignId, title: "Duplicate Guard", sequenceNumber: 1 }).returning({ id: campaignSession.id });
    assert.ok(session);
    await tx.insert(campaignSessionRoster).values({ sessionId: session.id, campaignId, characterId });
    await tx.insert(campaignSessionRoster).values({ sessionId: session.id, campaignId, characterId });
  }), (error: unknown) => /campaign_session_roster_session_id_character_id_pk|duplicate key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));
});

test("the database rejects cross-Campaign roster references", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const first = await insertTemporaryCampaign(tx);
    const second = await insertTemporaryCampaign(tx);
    const foreignCharacterId = await insertTemporaryCharacter(tx, {
      campaignId: second.campaignId,
      userId: second.userId,
      name: "Foreign Character",
    });
    const [session] = await tx.insert(campaignSession).values({ campaignId: first.campaignId, title: "Campaign Isolation", sequenceNumber: 1 }).returning({ id: campaignSession.id });
    assert.ok(session);
    await tx.insert(campaignSessionRoster).values({
      sessionId: session.id,
      campaignId: first.campaignId,
      characterId: foreignCharacterId,
    });
  }), (error: unknown) => /campaign_session_roster_character_campaign_fk|foreign key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));
});

test("transaction-only validation leaves no fixture Campaigns or users", async () => {
  const [[campaignCount], [userCount]] = await Promise.all([
    db.select({ value: count() }).from(campaign).where(eq(campaign.name, "Tabletop Transaction Test")),
    db.select({ value: count() }).from(user).where(like(user.id, "tabletop-test-user-%")),
  ]);
  assert.equal(Number(campaignCount?.value ?? 0), 0);
  assert.equal(Number(userCount?.value ?? 0), 0);
});
