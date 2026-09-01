import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, count, eq, like } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign } from "@/db/campaign-schema";
import { campaignSession } from "@/db/tabletop-operations-schema";

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
  return created.id;
}

after(async () => {
  await pool.end();
});

test("Session metadata and lifecycle timestamps persist through the generated schema", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const campaignId = await insertTemporaryCampaign(tx);
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
    const campaignId = await insertTemporaryCampaign(tx);
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

test("transaction-only validation leaves no fixture Campaigns or users", async () => {
  const [[campaignCount], [userCount]] = await Promise.all([
    db.select({ value: count() }).from(campaign).where(eq(campaign.name, "Tabletop Transaction Test")),
    db.select({ value: count() }).from(user).where(like(user.id, "tabletop-test-user-%")),
  ]);
  assert.equal(Number(campaignCount?.value ?? 0), 0);
  assert.equal(Number(userCount?.value ?? 0), 0);
});
