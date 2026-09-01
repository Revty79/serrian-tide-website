import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, asc, count, eq, like } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { campaignCharacter } from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterParticipant,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";

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

async function insertEncounterFixture(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  const { campaignId, userId } = await insertTemporaryCampaign(tx);
  const participantId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Encounter Participant" });
  const secondParticipantId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Second Participant", isNpc: true });
  const rosterOnlyId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Roster Only", isNpc: true });
  const [session] = await tx.insert(campaignSession).values({
    campaignId,
    title: "Encounter Fixture Session",
    sequenceNumber: 1,
    status: "active",
    startedAt: new Date("2026-09-03T17:00:00.000Z"),
  }).returning({ id: campaignSession.id });
  assert.ok(session);
  await tx.insert(campaignSessionRoster).values([
    { sessionId: session.id, campaignId, characterId: participantId, sortOrder: 0 },
    { sessionId: session.id, campaignId, characterId: secondParticipantId, sortOrder: 1 },
    { sessionId: session.id, campaignId, characterId: rosterOnlyId, sortOrder: 2 },
  ]);
  const [scene] = await tx.insert(campaignSessionScene).values({
    sessionId: session.id,
    campaignId,
    sequenceNumber: 1,
    title: "Encounter Fixture Scene",
    status: "active",
    startedAt: new Date("2026-09-03T17:30:00.000Z"),
  }).returning({ id: campaignSessionScene.id });
  assert.ok(scene);
  await tx.insert(campaignSessionSceneMember).values([
    { sceneId: scene.id, sessionId: session.id, campaignId, characterId: participantId, sortOrder: 0 },
    { sceneId: scene.id, sessionId: session.id, campaignId, characterId: secondParticipantId, sortOrder: 1 },
  ]);
  const [encounter] = await tx.insert(campaignSessionEncounter).values({
    sceneId: scene.id,
    sessionId: session.id,
    campaignId,
    sequenceNumber: 1,
    title: "Roadside Ambush",
    encounterType: "combat",
    description: "A focused challenge.",
    godNotes: "No combat automation.",
  }).returning({ id: campaignSessionEncounter.id });
  assert.ok(encounter);
  return {
    campaignId,
    userId,
    sessionId: session.id,
    sceneId: scene.id,
    encounterId: encounter.id,
    participantId,
    secondParticipantId,
    rosterOnlyId,
  };
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

    const [rosterCount] = await tx.select({ value: count() }).from(campaignSessionRoster).where(eq(campaignSessionRoster.sessionId, session.id));
    const [characterCount] = await tx.select({ value: count() }).from(campaignCharacter).where(eq(campaignCharacter.id, characterId));
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

test("Scene metadata, lifecycle, and ordered membership persist without duplication", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId, userId } = await insertTemporaryCampaign(tx);
    const firstCharacterId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "First Scene Member" });
    const secondCharacterId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Second Scene Member", isNpc: true });
    const sessionStartedAt = new Date("2026-09-02T17:00:00.000Z");
    const [session] = await tx.insert(campaignSession).values({
      campaignId,
      title: "Scene Persistence",
      sequenceNumber: 1,
      status: "active",
      startedAt: sessionStartedAt,
    }).returning({ id: campaignSession.id });
    assert.ok(session);
    await tx.insert(campaignSessionRoster).values([
      { sessionId: session.id, campaignId, characterId: firstCharacterId, sortOrder: 0 },
      { sessionId: session.id, campaignId, characterId: secondCharacterId, sortOrder: 1 },
    ]);
    const [scene] = await tx.insert(campaignSessionScene).values({
      sessionId: session.id,
      campaignId,
      sequenceNumber: 1,
      title: "The Bridge",
      locationLabel: "Abandoned Highway Bridge",
      description: "Search the wreckage.",
      godNotes: "The captain is lying.",
    }).returning();
    assert.ok(scene);
    assert.equal(scene.status, "planned");
    assert.equal(scene.locationLabel, "Abandoned Highway Bridge");
    assert.equal(scene.description, "Search the wreckage.");
    assert.equal(scene.godNotes, "The captain is lying.");
    await tx.insert(campaignSessionSceneMember).values([
      { sceneId: scene.id, sessionId: session.id, campaignId, characterId: secondCharacterId, sortOrder: 1 },
      { sceneId: scene.id, sessionId: session.id, campaignId, characterId: firstCharacterId, sortOrder: 0 },
    ]);

    const startedAt = new Date("2026-09-02T18:00:00.000Z");
    const completedAt = new Date("2026-09-02T20:00:00.000Z");
    await tx.update(campaignSessionScene).set({ status: "active", startedAt }).where(eq(campaignSessionScene.id, scene.id));
    await tx.update(campaignSessionScene).set({ status: "completed", completedAt }).where(eq(campaignSessionScene.id, scene.id));
    await tx.update(campaignSessionScene).set({ status: "active", completedAt: null }).where(eq(campaignSessionScene.id, scene.id));
    const [reopened] = await tx.select().from(campaignSessionScene).where(eq(campaignSessionScene.id, scene.id));
    assert.equal(reopened?.status, "active");
    assert.equal(reopened?.startedAt?.toISOString(), startedAt.toISOString());
    assert.equal(reopened?.completedAt, null);
    const members = await tx
      .select({ characterId: campaignSessionSceneMember.characterId, sortOrder: campaignSessionSceneMember.sortOrder })
      .from(campaignSessionSceneMember)
      .where(eq(campaignSessionSceneMember.sceneId, scene.id))
      .orderBy(asc(campaignSessionSceneMember.sortOrder));
    assert.deepEqual(members, [
      { characterId: firstCharacterId, sortOrder: 0 },
      { characterId: secondCharacterId, sortOrder: 1 },
    ]);
    throw ROLLBACK;
  }), (error) => error === ROLLBACK);
});

test("the database prevents two active Scenes in one Session", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId } = await insertTemporaryCampaign(tx);
    const [session] = await tx.insert(campaignSession).values({
      campaignId,
      title: "One Active Scene",
      sequenceNumber: 1,
      status: "active",
      startedAt: new Date(),
    }).returning({ id: campaignSession.id });
    assert.ok(session);
    const [first, second] = await tx.insert(campaignSessionScene).values([
      { sessionId: session.id, campaignId, sequenceNumber: 1, title: "First" },
      { sessionId: session.id, campaignId, sequenceNumber: 2, title: "Second" },
    ]).returning({ id: campaignSessionScene.id });
    assert.ok(first && second);
    await tx.update(campaignSessionScene).set({ status: "active", startedAt: new Date() }).where(eq(campaignSessionScene.id, first.id));
    await tx.update(campaignSessionScene).set({ status: "active", startedAt: new Date() }).where(eq(campaignSessionScene.id, second.id));
  }), (error: unknown) => /campaign_session_scene_one_active_per_session_uq|duplicate key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));
});

test("the database rejects Scene members who are not in that Session Roster", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId, userId } = await insertTemporaryCampaign(tx);
    const unrosteredCharacterId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Not Rostered" });
    const [session] = await tx.insert(campaignSession).values({ campaignId, title: "Roster Gate", sequenceNumber: 1 }).returning({ id: campaignSession.id });
    assert.ok(session);
    const [scene] = await tx.insert(campaignSessionScene).values({ sessionId: session.id, campaignId, sequenceNumber: 1, title: "Closed Scene" }).returning({ id: campaignSessionScene.id });
    assert.ok(scene);
    await tx.insert(campaignSessionSceneMember).values({
      sceneId: scene.id,
      sessionId: session.id,
      campaignId,
      characterId: unrosteredCharacterId,
    });
  }), (error: unknown) => /campaign_session_scene_member_roster_fk|foreign key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));
});

test("the database rejects cross-Session and cross-Campaign Scene relationships", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const first = await insertTemporaryCampaign(tx);
    const second = await insertTemporaryCampaign(tx);
    const [foreignSession] = await tx.insert(campaignSession).values({
      campaignId: second.campaignId,
      title: "Foreign Session",
      sequenceNumber: 1,
    }).returning({ id: campaignSession.id });
    assert.ok(foreignSession);
    await tx.insert(campaignSessionScene).values({
      sessionId: foreignSession.id,
      campaignId: first.campaignId,
      sequenceNumber: 1,
      title: "Cross-Campaign Scene",
    });
  }), (error: unknown) => /campaign_session_scene_session_campaign_fk|foreign key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));

  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId, userId } = await insertTemporaryCampaign(tx);
    const characterId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Other Session Member" });
    const [firstSession, secondSession] = await tx.insert(campaignSession).values([
      { campaignId, title: "First Session", sequenceNumber: 1 },
      { campaignId, title: "Second Session", sequenceNumber: 2 },
    ]).returning({ id: campaignSession.id });
    assert.ok(firstSession && secondSession);
    await tx.insert(campaignSessionRoster).values({ sessionId: firstSession.id, campaignId, characterId });
    const [scene] = await tx.insert(campaignSessionScene).values({ sessionId: secondSession.id, campaignId, sequenceNumber: 1, title: "Second Session Scene" }).returning({ id: campaignSessionScene.id });
    assert.ok(scene);
    await tx.insert(campaignSessionSceneMember).values({
      sceneId: scene.id,
      sessionId: firstSession.id,
      campaignId,
      characterId,
    });
  }), (error: unknown) => /campaign_session_scene_member_scene_fk|foreign key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));
});

test("the database rejects duplicate Scene membership and protects referenced roster history", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId, userId } = await insertTemporaryCampaign(tx);
    const characterId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "One Scene Entry" });
    const [session] = await tx.insert(campaignSession).values({ campaignId, title: "Duplicate Scene Member", sequenceNumber: 1 }).returning({ id: campaignSession.id });
    assert.ok(session);
    await tx.insert(campaignSessionRoster).values({ sessionId: session.id, campaignId, characterId });
    const [scene] = await tx.insert(campaignSessionScene).values({ sessionId: session.id, campaignId, sequenceNumber: 1, title: "One Membership" }).returning({ id: campaignSessionScene.id });
    assert.ok(scene);
    const member = { sceneId: scene.id, sessionId: session.id, campaignId, characterId };
    await tx.insert(campaignSessionSceneMember).values(member);
    await tx.insert(campaignSessionSceneMember).values(member);
  }), (error: unknown) => /campaign_session_scene_member_scene_id_character_id_pk|duplicate key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));

  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId, userId } = await insertTemporaryCampaign(tx);
    const characterId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Historical Member" });
    const [session] = await tx.insert(campaignSession).values({ campaignId, title: "History Protection", sequenceNumber: 1 }).returning({ id: campaignSession.id });
    assert.ok(session);
    await tx.insert(campaignSessionRoster).values({ sessionId: session.id, campaignId, characterId });
    const [scene] = await tx.insert(campaignSessionScene).values({ sessionId: session.id, campaignId, sequenceNumber: 1, title: "Preserved Scene" }).returning({ id: campaignSessionScene.id });
    assert.ok(scene);
    await tx.insert(campaignSessionSceneMember).values({ sceneId: scene.id, sessionId: session.id, campaignId, characterId });
    await tx.delete(campaignSessionRoster).where(and(
      eq(campaignSessionRoster.sessionId, session.id),
      eq(campaignSessionRoster.characterId, characterId),
    ));
  }), (error: unknown) => /campaign_session_scene_member_roster_fk|foreign key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));
});

test("deleting a planned Scene cascades only Scene membership", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const { campaignId, userId } = await insertTemporaryCampaign(tx);
    const characterId = await insertTemporaryCharacter(tx, { campaignId, userId, name: "Scene Survivor" });
    const [session] = await tx.insert(campaignSession).values({ campaignId, title: "Scene Deletion", sequenceNumber: 1 }).returning({ id: campaignSession.id });
    assert.ok(session);
    await tx.insert(campaignSessionRoster).values({ sessionId: session.id, campaignId, characterId });
    const [scene] = await tx.insert(campaignSessionScene).values({ sessionId: session.id, campaignId, sequenceNumber: 1, title: "Disposable Scene" }).returning({ id: campaignSessionScene.id });
    assert.ok(scene);
    await tx.insert(campaignSessionSceneMember).values({ sceneId: scene.id, sessionId: session.id, campaignId, characterId });
    await tx.delete(campaignSessionScene).where(eq(campaignSessionScene.id, scene.id));

    const [memberCount] = await tx.select({ value: count() }).from(campaignSessionSceneMember).where(eq(campaignSessionSceneMember.sceneId, scene.id));
    const [sessionCount] = await tx.select({ value: count() }).from(campaignSession).where(eq(campaignSession.id, session.id));
    const [rosterCount] = await tx.select({ value: count() }).from(campaignSessionRoster).where(and(eq(campaignSessionRoster.sessionId, session.id), eq(campaignSessionRoster.characterId, characterId)));
    const [characterCount] = await tx.select({ value: count() }).from(campaignCharacter).where(eq(campaignCharacter.id, characterId));
    assert.equal(Number(memberCount?.value ?? 0), 0);
    assert.equal(Number(sessionCount?.value ?? 0), 1);
    assert.equal(Number(rosterCount?.value ?? 0), 1);
    assert.equal(Number(characterCount?.value ?? 0), 1);
    throw ROLLBACK;
  }), (error) => error === ROLLBACK);
});

test("Encounter metadata, lifecycle, and ordered Participants persist", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const fixture = await insertEncounterFixture(tx);
    await tx.insert(campaignSessionEncounterParticipant).values([
      {
        encounterId: fixture.encounterId,
        sceneId: fixture.sceneId,
        sessionId: fixture.sessionId,
        campaignId: fixture.campaignId,
        characterId: fixture.secondParticipantId,
        sortOrder: 1,
        prepNotes: "NPC enters from the east.",
      },
      {
        encounterId: fixture.encounterId,
        sceneId: fixture.sceneId,
        sessionId: fixture.sessionId,
        campaignId: fixture.campaignId,
        characterId: fixture.participantId,
        sortOrder: 0,
        prepNotes: "Player has the map.",
      },
    ]);
    const startedAt = new Date("2026-09-03T18:00:00.000Z");
    const completedAt = new Date("2026-09-03T19:00:00.000Z");
    await tx.update(campaignSessionEncounter).set({ status: "active", startedAt }).where(eq(campaignSessionEncounter.id, fixture.encounterId));
    await tx.update(campaignSessionEncounter).set({ status: "completed", completedAt }).where(eq(campaignSessionEncounter.id, fixture.encounterId));
    await tx.update(campaignSessionEncounter).set({ status: "active", completedAt: null }).where(eq(campaignSessionEncounter.id, fixture.encounterId));
    const [encounter] = await tx.select().from(campaignSessionEncounter).where(eq(campaignSessionEncounter.id, fixture.encounterId));
    assert.equal(encounter?.title, "Roadside Ambush");
    assert.equal(encounter?.encounterType, "combat");
    assert.equal(encounter?.description, "A focused challenge.");
    assert.equal(encounter?.godNotes, "No combat automation.");
    assert.equal(encounter?.status, "active");
    assert.equal(encounter?.startedAt?.toISOString(), startedAt.toISOString());
    assert.equal(encounter?.completedAt, null);
    const participants = await tx
      .select({
        characterId: campaignSessionEncounterParticipant.characterId,
        sortOrder: campaignSessionEncounterParticipant.sortOrder,
        prepNotes: campaignSessionEncounterParticipant.prepNotes,
      })
      .from(campaignSessionEncounterParticipant)
      .where(eq(campaignSessionEncounterParticipant.encounterId, fixture.encounterId))
      .orderBy(asc(campaignSessionEncounterParticipant.sortOrder));
    assert.deepEqual(participants, [
      { characterId: fixture.participantId, sortOrder: 0, prepNotes: "Player has the map." },
      { characterId: fixture.secondParticipantId, sortOrder: 1, prepNotes: "NPC enters from the east." },
    ]);
    throw ROLLBACK;
  }), (error) => error === ROLLBACK);
});

test("the database prevents two active Encounters in one Scene", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const fixture = await insertEncounterFixture(tx);
    const [second] = await tx.insert(campaignSessionEncounter).values({
      sceneId: fixture.sceneId,
      sessionId: fixture.sessionId,
      campaignId: fixture.campaignId,
      sequenceNumber: 2,
      title: "Second Encounter",
    }).returning({ id: campaignSessionEncounter.id });
    assert.ok(second);
    await tx.update(campaignSessionEncounter).set({ status: "active", startedAt: new Date() }).where(eq(campaignSessionEncounter.id, fixture.encounterId));
    await tx.update(campaignSessionEncounter).set({ status: "active", startedAt: new Date() }).where(eq(campaignSessionEncounter.id, second.id));
  }), (error: unknown) => /campaign_session_encounter_one_active_per_scene_uq|duplicate key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));
});

test("the database rejects non-Scene, duplicate, and cross-Scene/Session/Campaign Encounter Participants", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const fixture = await insertEncounterFixture(tx);
    await tx.insert(campaignSessionEncounterParticipant).values({
      encounterId: fixture.encounterId,
      sceneId: fixture.sceneId,
      sessionId: fixture.sessionId,
      campaignId: fixture.campaignId,
      characterId: fixture.rosterOnlyId,
    });
  }), (error: unknown) => /campaign_session_encounter_participant_scene_member_fk|foreign key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));

  await assert.rejects(db.transaction(async (tx) => {
    const fixture = await insertEncounterFixture(tx);
    const participant = {
      encounterId: fixture.encounterId,
      sceneId: fixture.sceneId,
      sessionId: fixture.sessionId,
      campaignId: fixture.campaignId,
      characterId: fixture.participantId,
    };
    await tx.insert(campaignSessionEncounterParticipant).values(participant);
    await tx.insert(campaignSessionEncounterParticipant).values(participant);
  }), (error: unknown) => /campaign_session_encounter_participant_encounter_id_character_id_pk|duplicate key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));

  await assert.rejects(db.transaction(async (tx) => {
    const fixture = await insertEncounterFixture(tx);
    const [otherScene] = await tx.insert(campaignSessionScene).values({
      sessionId: fixture.sessionId,
      campaignId: fixture.campaignId,
      sequenceNumber: 2,
      title: "Other Scene",
    }).returning({ id: campaignSessionScene.id });
    assert.ok(otherScene);
    await tx.insert(campaignSessionSceneMember).values({
      sceneId: otherScene.id,
      sessionId: fixture.sessionId,
      campaignId: fixture.campaignId,
      characterId: fixture.rosterOnlyId,
    });
    await tx.insert(campaignSessionEncounterParticipant).values({
      encounterId: fixture.encounterId,
      sceneId: otherScene.id,
      sessionId: fixture.sessionId,
      campaignId: fixture.campaignId,
      characterId: fixture.rosterOnlyId,
    });
  }), (error: unknown) => /campaign_session_encounter_participant_encounter_fk|foreign key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));

  await assert.rejects(db.transaction(async (tx) => {
    const fixture = await insertEncounterFixture(tx);
    const [otherSession] = await tx.insert(campaignSession).values({
      campaignId: fixture.campaignId,
      title: "Other Session",
      sequenceNumber: 2,
    }).returning({ id: campaignSession.id });
    assert.ok(otherSession);
    await tx.insert(campaignSessionRoster).values({ sessionId: otherSession.id, campaignId: fixture.campaignId, characterId: fixture.rosterOnlyId });
    const [otherScene] = await tx.insert(campaignSessionScene).values({
      sessionId: otherSession.id,
      campaignId: fixture.campaignId,
      sequenceNumber: 1,
      title: "Other Session Scene",
    }).returning({ id: campaignSessionScene.id });
    assert.ok(otherScene);
    await tx.insert(campaignSessionSceneMember).values({
      sceneId: otherScene.id,
      sessionId: otherSession.id,
      campaignId: fixture.campaignId,
      characterId: fixture.rosterOnlyId,
    });
    await tx.insert(campaignSessionEncounterParticipant).values({
      encounterId: fixture.encounterId,
      sceneId: otherScene.id,
      sessionId: otherSession.id,
      campaignId: fixture.campaignId,
      characterId: fixture.rosterOnlyId,
    });
  }), (error: unknown) => /campaign_session_encounter_participant_encounter_fk|foreign key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));

  await assert.rejects(db.transaction(async (tx) => {
    const fixture = await insertEncounterFixture(tx);
    const foreign = await insertTemporaryCampaign(tx);
    const foreignCharacterId = await insertTemporaryCharacter(tx, {
      campaignId: foreign.campaignId,
      userId: foreign.userId,
      name: "Foreign Participant",
    });
    const [foreignSession] = await tx.insert(campaignSession).values({
      campaignId: foreign.campaignId,
      title: "Foreign Session",
      sequenceNumber: 1,
    }).returning({ id: campaignSession.id });
    assert.ok(foreignSession);
    await tx.insert(campaignSessionRoster).values({ sessionId: foreignSession.id, campaignId: foreign.campaignId, characterId: foreignCharacterId });
    const [foreignScene] = await tx.insert(campaignSessionScene).values({
      sessionId: foreignSession.id,
      campaignId: foreign.campaignId,
      sequenceNumber: 1,
      title: "Foreign Scene",
    }).returning({ id: campaignSessionScene.id });
    assert.ok(foreignScene);
    await tx.insert(campaignSessionSceneMember).values({
      sceneId: foreignScene.id,
      sessionId: foreignSession.id,
      campaignId: foreign.campaignId,
      characterId: foreignCharacterId,
    });
    await tx.insert(campaignSessionEncounterParticipant).values({
      encounterId: fixture.encounterId,
      sceneId: foreignScene.id,
      sessionId: foreignSession.id,
      campaignId: foreign.campaignId,
      characterId: foreignCharacterId,
    });
  }), (error: unknown) => /campaign_session_encounter_participant_encounter_fk|foreign key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));
});

test("Encounter Participant history restricts Scene-member deletion", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const fixture = await insertEncounterFixture(tx);
    await tx.insert(campaignSessionEncounterParticipant).values({
      encounterId: fixture.encounterId,
      sceneId: fixture.sceneId,
      sessionId: fixture.sessionId,
      campaignId: fixture.campaignId,
      characterId: fixture.participantId,
    });
    await tx.delete(campaignSessionSceneMember).where(and(
      eq(campaignSessionSceneMember.sceneId, fixture.sceneId),
      eq(campaignSessionSceneMember.characterId, fixture.participantId),
    ));
  }), (error: unknown) => /campaign_session_encounter_participant_scene_member_fk|foreign key/i.test(String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error)));
});

test("deleting a planned Encounter cascades only its Participants", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const fixture = await insertEncounterFixture(tx);
    await tx.insert(campaignSessionEncounterParticipant).values({
      encounterId: fixture.encounterId,
      sceneId: fixture.sceneId,
      sessionId: fixture.sessionId,
      campaignId: fixture.campaignId,
      characterId: fixture.participantId,
    });
    await tx.delete(campaignSessionEncounter).where(eq(campaignSessionEncounter.id, fixture.encounterId));
    const [participantCount] = await tx.select({ value: count() }).from(campaignSessionEncounterParticipant).where(eq(campaignSessionEncounterParticipant.encounterId, fixture.encounterId));
    const [sceneCount] = await tx.select({ value: count() }).from(campaignSessionScene).where(eq(campaignSessionScene.id, fixture.sceneId));
    const [memberCount] = await tx.select({ value: count() }).from(campaignSessionSceneMember).where(and(eq(campaignSessionSceneMember.sceneId, fixture.sceneId), eq(campaignSessionSceneMember.characterId, fixture.participantId)));
    const [sessionCount] = await tx.select({ value: count() }).from(campaignSession).where(eq(campaignSession.id, fixture.sessionId));
    const [characterCount] = await tx.select({ value: count() }).from(campaignCharacter).where(eq(campaignCharacter.id, fixture.participantId));
    assert.equal(Number(participantCount?.value ?? 0), 0);
    assert.equal(Number(sceneCount?.value ?? 0), 1);
    assert.equal(Number(memberCount?.value ?? 0), 1);
    assert.equal(Number(sessionCount?.value ?? 0), 1);
    assert.equal(Number(characterCount?.value ?? 0), 1);
    throw ROLLBACK;
  }), (error) => error === ROLLBACK);
});

test("transaction-only validation leaves no fixture Campaigns or users", async () => {
  const [[campaignCount], [userCount]] = await Promise.all([
    db.select({ value: count() }).from(campaign).where(eq(campaign.name, "Tabletop Transaction Test")),
    db.select({ value: count() }).from(user).where(like(user.id, "tabletop-test-user-%")),
  ]);
  assert.equal(Number(campaignCount?.value ?? 0), 0);
  assert.equal(Number(userCount?.value ?? 0), 0);
});
