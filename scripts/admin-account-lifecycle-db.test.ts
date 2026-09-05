import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { account, session, user, verification } from "@/db/auth-schema";
import { userRole, type SerrianRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { chatRoom, chatRoomMember } from "@/db/chat-schema";
import { lifecycleAuditEvent } from "@/db/lifecycle-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { setUserRoleInTransaction } from "@/features/authorization/user-role-service";
import {
  permanentlyDeleteAdminAccount,
  previewAdminAccountDeletion,
} from "@/features/lifecycle/admin-account-lifecycle-service";

function assertSafeDevelopmentDatabase(): void {
  const configured = process.env.DATABASE_URL;
  assert.ok(configured, "DATABASE_URL is required.");
  const parsed = new URL(configured);
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname),
    "Admin account lifecycle DB tests refuse non-loopback databases.",
  );
  assert.match(
    parsed.pathname.slice(1),
    /_dev$/,
    "Admin account lifecycle DB tests require a database name ending in _dev.",
  );
}

assertSafeDevelopmentDatabase();

const marker = `admin-account-db-${randomUUID()}`;
const markerPattern = `${marker}%`;

type FixtureIdentity = {
  id: string;
  email: string;
  suffix: string;
};

type UserGraphSnapshot = {
  users: number;
  accounts: number;
  sessions: number;
  verifications: number;
  roles: number;
  campaignMemberships: number;
  chatMemberships: number;
  characters: number;
  deletionAudits: number;
};

function identity(suffix: string): FixtureIdentity {
  return {
    id: `${marker}-${suffix}`,
    email: `${marker}-${suffix}@example.invalid`,
    suffix,
  };
}

const administrator = identity("administrator");
const administratorSentinel = identity("administrator-sentinel");
const nonAdministrator = identity("non-administrator");
const cleanTarget = identity("clean-target");
const blockedTarget = identity("blocked-target");
const rollbackTarget = identity("rollback-target");
const verificationInsertRaceTarget = identity("verification-insert-race-target");
const verificationUpdateRaceTarget = identity("verification-update-race-target");

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitForBackendLock(pid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ wait_event_type: string | null }>(
      `select wait_event_type
       from pg_stat_activity
       where pid = $1`,
      [pid],
    );
    if (result.rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Backend ${pid} did not enter a database lock wait.`);
}

async function waitForAdministratorRosterWaiter(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ value: number | string }>(
      `select count(*)::int as value
       from pg_locks
       where locktype = 'advisory'
         and classid = 19372026
         and objid = 1
         and not granted`,
    );
    if (Number(result.rows[0]?.value ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Role mutation did not wait on the administrator-roster lock.");
}

async function createUserFixture(
  fixture: FixtureIdentity,
  role: SerrianRole,
): Promise<void> {
  await db.insert(user).values({
    id: fixture.id,
    name: `${marker} ${fixture.suffix}`,
    email: fixture.email,
    emailVerified: true,
  });
  await db.insert(userRole).values({ userId: fixture.id, role });
}

async function createCleanableAccountGraph(
  fixture: FixtureIdentity,
  campaignId: number,
  roomId: number,
): Promise<void> {
  const now = new Date();
  await db.insert(account).values({
    id: `${fixture.id}-account`,
    issuer: "credential",
    accountId: fixture.email,
    providerId: "credential",
    userId: fixture.id,
    password: `${marker}-not-a-real-password`,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(session).values({
    id: `${fixture.id}-session`,
    token: `${fixture.id}-token`,
    userId: fixture.id,
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(verification).values({
    id: `${fixture.id}-verification`,
    identifier: `${fixture.id}-verification`,
    value: fixture.id,
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(campaignPlayer).values({
    campaignId,
    userId: fixture.id,
  });
  await db.insert(chatRoomMember).values({
    roomId,
    userId: fixture.id,
  });
}

async function snapshotUserGraph(userId: string): Promise<UserGraphSnapshot> {
  const result = await pool.query<{
    users: number | string;
    accounts: number | string;
    sessions: number | string;
    verifications: number | string;
    roles: number | string;
    campaign_memberships: number | string;
    chat_memberships: number | string;
    characters: number | string;
    deletion_audits: number | string;
  }>(
    `select
       (select count(*) from "user" where id = $1)::int as users,
       (select count(*) from account where user_id = $1)::int as accounts,
       (select count(*) from session where user_id = $1)::int as sessions,
       (select count(*) from verification where value = $1)::int as verifications,
       (select count(*) from user_role where user_id = $1)::int as roles,
       (select count(*) from campaign_player where user_id = $1)::int as campaign_memberships,
       (select count(*) from chat_room_member where user_id = $1)::int as chat_memberships,
       (select count(*) from campaign_character where player_user_id = $1)::int as characters,
       (
         select count(*)
         from lifecycle_audit_event
         where action = 'delete'
           and entity_kind = 'user-account'
           and target_id = $1
       )::int as deletion_audits`,
    [userId],
  );
  const row = result.rows[0];
  assert.ok(row, "the User graph snapshot query must return one row");
  return {
    users: Number(row.users),
    accounts: Number(row.accounts),
    sessions: Number(row.sessions),
    verifications: Number(row.verifications),
    roles: Number(row.roles),
    campaignMemberships: Number(row.campaign_memberships),
    chatMemberships: Number(row.chat_memberships),
    characters: Number(row.characters),
    deletionAudits: Number(row.deletion_audits),
  };
}

async function cleanupFixtures(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `delete from lifecycle_audit_event
       where actor_user_id like $1 or target_id like $1`,
      [markerPattern],
    );
    await client.query(
      `delete from campaign_character
       where name like $1 or player_user_id like $1`,
      [markerPattern],
    );
    await client.query("delete from chat_room_member where user_id like $1", [markerPattern]);
    await client.query("delete from chat_room where slug like $1", [markerPattern]);
    await client.query("delete from campaign_player where user_id like $1", [markerPattern]);
    await client.query("delete from campaign where name like $1", [markerPattern]);
    await client.query(
      `delete from verification
       where id like $1 or identifier like $1 or value like $1`,
      [markerPattern],
    );
    await client.query("delete from session where id like $1 or user_id like $1", [markerPattern]);
    await client.query("delete from account where id like $1 or user_id like $1", [markerPattern]);
    await client.query("delete from user_role where user_id like $1", [markerPattern]);
    await client.query("delete from \"user\" where id like $1", [markerPattern]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

after(async () => {
  try {
    await cleanupFixtures();
    const remaining = await pool.query<{ value: number | string }>(
      `select (
        (select count(*) from "user" where id like $1)
        + (select count(*) from account where id like $1 or user_id like $1)
        + (select count(*) from session where id like $1 or user_id like $1)
        + (select count(*) from verification where id like $1 or identifier like $1 or value like $1)
        + (select count(*) from user_role where user_id like $1)
        + (select count(*) from campaign where name like $1)
        + (select count(*) from campaign_player where user_id like $1)
        + (select count(*) from campaign_character where name like $1 or player_user_id like $1)
        + (select count(*) from chat_room where slug like $1)
        + (select count(*) from chat_room_member where user_id like $1)
        + (select count(*) from lifecycle_audit_event where actor_user_id like $1 or target_id like $1)
      )::int as value`,
      [markerPattern],
    );
    assert.equal(
      Number(remaining.rows[0]?.value ?? -1),
      0,
      "all Admin account lifecycle fixtures must be removed",
    );
  } finally {
    await pool.end();
  }
});

test("Admin account deletion is authorized, fail-closed, scoped, audited, and atomic", async () => {
  await createUserFixture(administrator, "admin");
  await createUserFixture(administratorSentinel, "admin");
  await createUserFixture(nonAdministrator, "god");
  await createUserFixture(cleanTarget, "player");
  await createUserFixture(blockedTarget, "player");
  await createUserFixture(rollbackTarget, "player");
  await createUserFixture(verificationInsertRaceTarget, "player");
  await createUserFixture(verificationUpdateRaceTarget, "player");

  const [createdCampaign] = await db.insert(campaign).values({
    name: `${marker}-campaign`,
    attributePoints: 100,
    skillPoints: 100,
    maxStartingSkill: 25,
    pointsToUnlockNextTier: 10,
    maxPointsInSkill: 100,
    startingCreditAmount: 100,
    currencySystem: "Credits",
    fatePointMethod: "Assigned",
    assignedFatePoints: 0,
    createdByUserId: administrator.id,
  }).returning({ id: campaign.id });
  const [createdRoom] = await db.insert(chatRoom).values({
    slug: marker,
    name: `${marker} room`,
    scope: "direct",
    campaignId: null,
  }).returning({ id: chatRoom.id });

  await createCleanableAccountGraph(cleanTarget, createdCampaign.id, createdRoom.id);
  await createCleanableAccountGraph(rollbackTarget, createdCampaign.id, createdRoom.id);
  await createCleanableAccountGraph(
    administratorSentinel,
    createdCampaign.id,
    createdRoom.id,
  );
  await db.insert(campaignPlayer).values({
    campaignId: createdCampaign.id,
    userId: blockedTarget.id,
  });
  const [blockedCharacter] = await db.insert(campaignCharacter).values({
    campaignId: createdCampaign.id,
    playerUserId: blockedTarget.id,
    name: `${marker}-blocked-character`,
    isNpc: false,
  }).returning({ id: campaignCharacter.id });

  const cleanBeforeRejections = await snapshotUserGraph(cleanTarget.id);
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  const originalNodeEnvironment = mutableEnvironment.NODE_ENV;
  const originalDeletionFlag = mutableEnvironment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION;
  try {
    mutableEnvironment.NODE_ENV = "production";
    delete mutableEnvironment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION;
    await assert.rejects(
      permanentlyDeleteAdminAccount(nonAdministrator.id, {
        targetUserId: "",
        confirmationText: "",
        reason: "",
      }),
      /Administrator access is required/,
      "a non-Admin must not learn feature-gate or input-validation details",
    );
  } finally {
    if (originalNodeEnvironment === undefined) delete mutableEnvironment.NODE_ENV;
    else mutableEnvironment.NODE_ENV = originalNodeEnvironment;
    if (originalDeletionFlag === undefined) {
      delete mutableEnvironment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION;
    } else {
      mutableEnvironment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION = originalDeletionFlag;
    }
  }
  await assert.rejects(
    previewAdminAccountDeletion(nonAdministrator.id, cleanTarget.id),
    /Administrator access is required/,
  );
  await assert.rejects(
    permanentlyDeleteAdminAccount(nonAdministrator.id, {
      targetUserId: cleanTarget.id,
      confirmationText: `DELETE ${cleanTarget.email}`,
      reason: "Unauthorized deletion fixture",
    }),
    /Administrator access is required/,
  );
  assert.deepEqual(
    await snapshotUserGraph(cleanTarget.id),
    cleanBeforeRejections,
    "a non-administrator attempt must not mutate the target",
  );

  const selfPreview = await previewAdminAccountDeletion(
    administrator.id,
    administrator.id,
  );
  assert.equal(selfPreview.canDelete, false);
  assert.ok(
    selfPreview.prohibitions.includes("Administrators cannot delete their own account."),
  );
  await assert.rejects(
    permanentlyDeleteAdminAccount(administrator.id, {
      targetUserId: administrator.id,
      confirmationText: `DELETE ${administrator.email}`,
      reason: "Self-deletion fixture",
    }),
    /Administrators cannot delete their own account/,
  );
  assert.equal((await snapshotUserGraph(administrator.id)).users, 1);

  await assert.rejects(
    permanentlyDeleteAdminAccount(administrator.id, {
      targetUserId: cleanTarget.id,
      confirmationText: `DELETE ${cleanTarget.email}`,
      reason: "   ",
    }),
    /account-deletion reason is required/,
  );
  await assert.rejects(
    permanentlyDeleteAdminAccount(administrator.id, {
      targetUserId: cleanTarget.id,
      confirmationText: "DELETE the wrong account",
      reason: "Wrong-confirmation fixture",
    }),
    /Type exactly/,
  );
  assert.deepEqual(
    await snapshotUserGraph(cleanTarget.id),
    cleanBeforeRejections,
    "invalid reason and confirmation inputs must not mutate the target",
  );

  const blockedBefore = await snapshotUserGraph(blockedTarget.id);
  const blockedPreview = await previewAdminAccountDeletion(
    administrator.id,
    blockedTarget.id,
  );
  assert.equal(blockedPreview.canDelete, false);
  assert.equal(
    blockedPreview.blockers.find(
      ({ key }) => key === "campaign_character_player_user_id_user_id_fk",
    )?.count,
    1,
  );
  await assert.rejects(
    permanentlyDeleteAdminAccount(administrator.id, {
      targetUserId: blockedTarget.id,
      confirmationText: `DELETE ${blockedTarget.email}`,
      reason: "Blocked-character fixture",
    }),
    /blocked by retained content or history: Controlled player Characters and NPCs \(1\)/,
  );
  assert.deepEqual(
    await snapshotUserGraph(blockedTarget.id),
    blockedBefore,
    "a blocking Character must prevent every destructive account change",
  );
  assert.equal(
    (await db.select({ id: campaignCharacter.id })
      .from(campaignCharacter)
      .where(eq(campaignCharacter.id, blockedCharacter.id))).length,
    1,
    "the Character behind the blocker must survive",
  );

  const cleanPreview = await previewAdminAccountDeletion(
    administrator.id,
    cleanTarget.id,
  );
  assert.equal(cleanPreview.canDelete, true);
  assert.equal(cleanPreview.blockers.length, 0);
  const cleanupCounts = new Map(
    cleanPreview.cleanup.map(({ key, count }) => [key, count]),
  );
  assert.equal(cleanupCounts.get("account_user_id_user_id_fk"), 1);
  assert.equal(cleanupCounts.get("session_user_id_user_id_fk"), 1);
  assert.equal(cleanupCounts.get("user_role_user_id_user_id_fk"), 1);
  assert.equal(cleanupCounts.get("campaign_player_user_id_user_id_fk"), 1);
  assert.equal(cleanupCounts.get("chat_room_member_user_id_user_id_fk"), 1);
  assert.equal(cleanupCounts.get("verification_value_user_id_semantic_ref"), 1);

  const sentinelBefore = await snapshotUserGraph(administratorSentinel.id);
  const rollbackBefore = await snapshotUserGraph(rollbackTarget.id);
  const parentRowsBefore = await pool.query<{
    campaigns: number | string;
    rooms: number | string;
  }>(
    `select
       (select count(*) from campaign where id = $1)::int as campaigns,
       (select count(*) from chat_room where id = $2)::int as rooms`,
    [createdCampaign.id, createdRoom.id],
  );

  const deletionReason = "Guarded Admin account deletion integration fixture";
  const deleted = await permanentlyDeleteAdminAccount(administrator.id, {
    targetUserId: cleanTarget.id,
    confirmationText: `DELETE ${cleanTarget.email}`,
    reason: deletionReason,
  });
  assert.deepEqual(deleted, {
    deletedUserId: cleanTarget.id,
    deletedEmail: cleanTarget.email,
  });
  assert.deepEqual(await snapshotUserGraph(cleanTarget.id), {
    users: 0,
    accounts: 0,
    sessions: 0,
    verifications: 0,
    roles: 0,
    campaignMemberships: 0,
    chatMemberships: 0,
    characters: 0,
    deletionAudits: 1,
  });

  const [audit] = await db.select({
    action: lifecycleAuditEvent.action,
    entityKind: lifecycleAuditEvent.entityKind,
    targetId: lifecycleAuditEvent.targetId,
    targetName: lifecycleAuditEvent.targetName,
    ownerUserIdSnapshot: lifecycleAuditEvent.ownerUserIdSnapshot,
    actorUserId: lifecycleAuditEvent.actorUserId,
    reason: lifecycleAuditEvent.reason,
  }).from(lifecycleAuditEvent).where(eq(lifecycleAuditEvent.targetId, cleanTarget.id));
  assert.deepEqual(audit, {
    action: "delete",
    entityKind: "user-account",
    targetId: cleanTarget.id,
    targetName: cleanTarget.email,
    ownerUserIdSnapshot: cleanTarget.id,
    actorUserId: administrator.id,
    reason: deletionReason,
  });
  assert.deepEqual(
    await snapshotUserGraph(administratorSentinel.id),
    sentinelBefore,
    "successful deletion must preserve an unrelated administrator account graph",
  );
  const parentRowsAfter = await pool.query<{
    campaigns: number | string;
    rooms: number | string;
  }>(
    `select
       (select count(*) from campaign where id = $1)::int as campaigns,
       (select count(*) from chat_room where id = $2)::int as rooms`,
    [createdCampaign.id, createdRoom.id],
  );
  assert.deepEqual(
    parentRowsAfter.rows.map(({ campaigns, rooms }) => ({
      campaigns: Number(campaigns),
      rooms: Number(rooms),
    })),
    parentRowsBefore.rows.map(({ campaigns, rooms }) => ({
      campaigns: Number(campaigns),
      rooms: Number(rooms),
    })),
    "successful deletion must preserve unrelated parent records",
  );

  await assert.rejects(
    permanentlyDeleteAdminAccount(
      administrator.id,
      {
        targetUserId: rollbackTarget.id,
        confirmationText: `DELETE ${rollbackTarget.email}`,
        reason: "Injected rollback fixture",
      },
      {
        afterDelete() {
          throw new Error("Injected account-deletion rollback");
        },
      },
    ),
    /Injected account-deletion rollback/,
  );
  assert.deepEqual(
    await snapshotUserGraph(rollbackTarget.id),
    rollbackBefore,
    "the injected failure must roll back User, cleanup rows, and audit together",
  );

  const updateRaceVerificationId = `${marker}-verification-update-race`;
  const opaqueValue = `${marker}-opaque-verification-state`;
  const updatedOpaqueValue = `${marker}-updated-opaque-verification-state`;
  await db.insert(verification).values({
    id: updateRaceVerificationId,
    identifier: `${marker}-polymorphic-verification`,
    value: opaqueValue,
    expiresAt: new Date(Date.now() + 60_000),
  });
  await db
    .update(verification)
    .set({ value: updatedOpaqueValue })
    .where(eq(verification.id, updateRaceVerificationId));
  assert.equal(
    (await db
      .select({ value: verification.value })
      .from(verification)
      .where(eq(verification.id, updateRaceVerificationId)))[0]?.value,
    updatedOpaqueValue,
    "unrelated polymorphic verification values must remain writable",
  );

  const insertDeletionReached = deferred();
  const releaseInsertDeletion = deferred();
  const insertDeletionPromise = permanentlyDeleteAdminAccount(
    administrator.id,
    {
      targetUserId: verificationInsertRaceTarget.id,
      confirmationText: `DELETE ${verificationInsertRaceTarget.email}`,
      reason: "Concurrent verification INSERT guard fixture",
    },
    {
      async afterDelete() {
        insertDeletionReached.resolve();
        await releaseInsertDeletion.promise;
      },
    },
  );
  await insertDeletionReached.promise;

  const insertWriter = await pool.connect();
  const insertWriterPid = Number(
    (await insertWriter.query<{ pid: number }>("select pg_backend_pid()::int as pid"))
      .rows[0]?.pid,
  );
  const concurrentInsertId = `${marker}-concurrent-verification-insert`;
  const insertOutcomePromise = insertWriter
    .query(
      `insert into verification (id, identifier, value, expires_at)
       values ($1, $2, $3, now() + interval '1 minute')`,
      [
        concurrentInsertId,
        `reset-password:${marker}-concurrent-token`,
        verificationInsertRaceTarget.id,
      ],
    )
    .then(
      () => ({ ok: true as const, error: null }),
      (error: unknown) => ({ ok: false as const, error }),
    );
  try {
    await waitForBackendLock(insertWriterPid);
    releaseInsertDeletion.resolve();
    await insertDeletionPromise;
    const insertOutcome = await insertOutcomePromise;
    assert.equal(insertOutcome.ok, false);
    assert.equal(
      (insertOutcome.error as { code?: string }).code,
      "23503",
      "a password-reset INSERT queued behind deletion must fail as a deleted-User reference",
    );
    assert.equal(
      (insertOutcome.error as { constraint?: string }).constraint,
      "verification_value_deleted_user_guard",
    );
  } finally {
    releaseInsertDeletion.resolve();
    await Promise.allSettled([insertDeletionPromise, insertOutcomePromise]);
    insertWriter.release();
  }
  assert.equal(
    Number((await pool.query<{ value: number | string }>(
      `select count(*)::int as value
       from verification
       where id = $1 or value = $2`,
      [concurrentInsertId, verificationInsertRaceTarget.id],
    )).rows[0]?.value ?? -1),
    0,
    "the concurrent password-reset INSERT must leave no verification residue",
  );

  const updateDeletionReached = deferred();
  const releaseUpdateDeletion = deferred();
  const updateDeletionPromise = permanentlyDeleteAdminAccount(
    administrator.id,
    {
      targetUserId: verificationUpdateRaceTarget.id,
      confirmationText: `DELETE ${verificationUpdateRaceTarget.email}`,
      reason: "Concurrent verification UPDATE guard fixture",
    },
    {
      async afterDelete() {
        updateDeletionReached.resolve();
        await releaseUpdateDeletion.promise;
      },
    },
  );
  await updateDeletionReached.promise;

  const updateWriter = await pool.connect();
  const updateWriterPid = Number(
    (await updateWriter.query<{ pid: number }>("select pg_backend_pid()::int as pid"))
      .rows[0]?.pid,
  );
  const updateOutcomePromise = updateWriter
    .query(
      `update verification
       set value = $1, updated_at = now()
       where id = $2`,
      [verificationUpdateRaceTarget.id, updateRaceVerificationId],
    )
    .then(
      () => ({ ok: true as const, error: null }),
      (error: unknown) => ({ ok: false as const, error }),
    );
  try {
    await waitForBackendLock(updateWriterPid);
    releaseUpdateDeletion.resolve();
    await updateDeletionPromise;
    const updateOutcome = await updateOutcomePromise;
    assert.equal(updateOutcome.ok, false);
    assert.equal(
      (updateOutcome.error as { code?: string }).code,
      "23503",
      "an UPDATE queued behind deletion must fail as a deleted-User reference",
    );
    assert.equal(
      (updateOutcome.error as { constraint?: string }).constraint,
      "verification_value_deleted_user_guard",
    );
  } finally {
    releaseUpdateDeletion.resolve();
    await Promise.allSettled([updateDeletionPromise, updateOutcomePromise]);
    updateWriter.release();
  }
  assert.equal(
    (await db
      .select({ value: verification.value })
      .from(verification)
      .where(eq(verification.id, updateRaceVerificationId)))[0]?.value,
    updatedOpaqueValue,
    "the rejected UPDATE must preserve the unrelated polymorphic verification row",
  );

  const rosterDeletionReached = deferred();
  const releaseRosterDeletion = deferred();
  const rosterDeletionPromise = permanentlyDeleteAdminAccount(
    administrator.id,
    {
      targetUserId: administratorSentinel.id,
      confirmationText: `DELETE ${administratorSentinel.email}`,
      reason: "Concurrent administrator-roster serialization fixture",
    },
    {
      async afterDelete() {
        rosterDeletionReached.resolve();
        await releaseRosterDeletion.promise;
      },
    },
  );
  await rosterDeletionReached.promise;

  let demotionSettled = false;
  const demotionOutcomePromise = db
    .transaction((tx) => setUserRoleInTransaction(
      tx,
      administratorSentinel.id,
      {
        targetUserId: administrator.id,
        requestedRole: "admin",
        enabled: "false",
      },
    ))
    .then(
      () => ({ ok: true as const, error: null }),
      (error: unknown) => ({ ok: false as const, error }),
    )
    .finally(() => {
      demotionSettled = true;
    });
  try {
    await waitForAdministratorRosterWaiter();
    assert.equal(
      demotionSettled,
      false,
      "role mutation must remain queued while account deletion owns the roster lock",
    );
    releaseRosterDeletion.resolve();
    await rosterDeletionPromise;
    const demotionOutcome = await demotionOutcomePromise;
    assert.equal(demotionOutcome.ok, false);
    assert.match(
      String((demotionOutcome.error as Error).message),
      /Administrator access is required/,
      "the deleted administrator must be reauthorized after the roster lock is released",
    );
  } finally {
    releaseRosterDeletion.resolve();
    await Promise.allSettled([rosterDeletionPromise, demotionOutcomePromise]);
  }
  assert.equal(
    (await db
      .select({ role: userRole.role })
      .from(userRole)
      .where(eq(userRole.userId, administrator.id)))
      .filter(({ role }) => role === "admin").length,
    1,
    "the surviving administrator must retain Admin authority",
  );
  assert.equal((await snapshotUserGraph(administratorSentinel.id)).users, 0);
});
