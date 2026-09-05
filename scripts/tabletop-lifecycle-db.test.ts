import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { and, eq, inArray } from "drizzle-orm";

import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign } from "@/db/campaign-schema";
import { db, pool } from "@/db";
import { lifecycleAuditEvent } from "@/db/lifecycle-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionScene,
} from "@/db/tabletop-operations-schema";
import { assertPermanentDeletionEnabled } from "@/features/lifecycle/policy";
import {
  assertTabletopPermanentDeletionAllowed,
  prepareTabletopLifecycleMutationInTransaction,
  previewTabletopLifecycleEntityForActor,
  recordTabletopLifecycleAuditInTransaction,
} from "@/features/lifecycle/tabletop-lifecycle-service";
import type {
  TabletopLifecycleEntityKind,
  TabletopLifecycleTargetInput,
} from "@/features/lifecycle/tabletop-lifecycle-types";
import type { LifecycleActor } from "@/features/lifecycle/types";

function assertSafeDevelopmentDatabase(): void {
  const configured = process.env.DATABASE_URL;
  assert.ok(configured, "DATABASE_URL is required.");
  const parsed = new URL(configured);
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname),
    "Tabletop lifecycle DB tests refuse non-loopback databases.",
  );
  assert.match(
    parsed.pathname.slice(1),
    /_dev$/,
    "Tabletop lifecycle DB tests require a database name ending in _dev.",
  );
}

assertSafeDevelopmentDatabase();

const marker = `tabletop-lifecycle-db-${randomUUID()}`;
const ownerId = `${marker}-owner`;
const administratorId = `${marker}-administrator`;
const otherGodId = `${marker}-other-god`;
const fixtureUserIds = [ownerId, administratorId, otherGodId];
const campaignIds: number[] = [];

const owner: LifecycleActor = { userId: ownerId, roles: ["god"] };
const administrator: LifecycleActor = {
  userId: administratorId,
  roles: ["admin"],
};
const otherGod: LifecycleActor = { userId: otherGodId, roles: ["god"] };

after(async () => {
  await db.delete(lifecycleAuditEvent).where(
    inArray(lifecycleAuditEvent.actorUserId, fixtureUserIds),
  );
  for (const campaignId of [...campaignIds].reverse()) {
    await db.delete(campaign).where(eq(campaign.id, campaignId));
  }
  await db.delete(userRole).where(inArray(userRole.userId, fixtureUserIds));
  await db.delete(user).where(inArray(user.id, fixtureUserIds));

  const remaining = await pool.query<{ value: number }>(
    `select (
      (select count(*) from campaign where name like $1)
      + (select count(*) from campaign_session where title like $1)
      + (select count(*) from campaign_session_scene where title like $1)
      + (select count(*) from campaign_session_encounter where title like $1)
      + (select count(*) from "user" where id = any($2::text[]))
      + (select count(*) from lifecycle_audit_event where actor_user_id = any($2::text[]))
    )::int as value`,
    [`${marker}%`, fixtureUserIds],
  );
  assert.equal(
    Number(remaining.rows[0]?.value ?? -1),
    0,
    "all Tabletop lifecycle fixtures must be removed",
  );
  await pool.end();
});

async function createCampaign(name: string): Promise<number> {
  const [created] = await db.insert(campaign).values({
    name,
    attributePoints: 100,
    skillPoints: 100,
    maxStartingSkill: 25,
    pointsToUnlockNextTier: 10,
    maxPointsInSkill: 100,
    startingCreditAmount: 100,
    currencySystem: "Credits",
    fatePointMethod: "Assigned",
    assignedFatePoints: 0,
    createdByUserId: ownerId,
  }).returning({ id: campaign.id });
  campaignIds.push(created.id);
  return created.id;
}

async function createHierarchy(
  campaignId: number,
  suffix: string,
  sequenceNumber: number,
  status: "planned" | "active" = "planned",
): Promise<{ sessionId: number; sceneId: number; encounterId: number }> {
  const startedAt = status === "active" ? new Date() : null;
  const [session] = await db.insert(campaignSession).values({
    campaignId,
    title: `${marker}-${suffix}-session`,
    sequenceNumber,
    status,
    startedAt,
  }).returning({ id: campaignSession.id });
  const [scene] = await db.insert(campaignSessionScene).values({
    campaignId,
    sessionId: session.id,
    title: `${marker}-${suffix}-scene`,
    sequenceNumber: 1,
    status,
    startedAt,
  }).returning({ id: campaignSessionScene.id });
  const [encounter] = await db.insert(campaignSessionEncounter).values({
    campaignId,
    sessionId: session.id,
    sceneId: scene.id,
    title: `${marker}-${suffix}-encounter`,
    sequenceNumber: 1,
    status,
    startedAt,
  }).returning({ id: campaignSessionEncounter.id });
  return { sessionId: session.id, sceneId: scene.id, encounterId: encounter.id };
}

async function auditTransition(
  target: TabletopLifecycleTargetInput,
  action: "archive" | "restore",
): Promise<void> {
  await db.transaction(async (tx) => {
    const lifecycle = await prepareTabletopLifecycleMutationInTransaction(
      tx,
      target,
      administrator,
    );
    const values = action === "archive"
      ? { status: "completed" as const, completedAt: new Date() }
      : { status: "active" as const, completedAt: null };
    if (target.entityKind === "campaign-session") {
      await tx.update(campaignSession).set(values).where(eq(campaignSession.id, target.entityId));
    } else if (target.entityKind === "scene") {
      await tx.update(campaignSessionScene).set(values).where(eq(campaignSessionScene.id, target.entityId));
    } else {
      await tx.update(campaignSessionEncounter).set(values).where(eq(campaignSessionEncounter.id, target.entityId));
    }
    await recordTabletopLifecycleAuditInTransaction(
      tx,
      administrator,
      action,
      lifecycle.root,
      lifecycle.preview,
    );
  });
}

async function deletePreparedRoot(
  target: TabletopLifecycleTargetInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const lifecycle = await prepareTabletopLifecycleMutationInTransaction(
      tx,
      target,
      administrator,
    );
    assertTabletopPermanentDeletionAllowed(lifecycle.preview);
    await recordTabletopLifecycleAuditInTransaction(
      tx,
      administrator,
      "delete",
      lifecycle.root,
      lifecycle.preview,
    );
    if (target.entityKind === "campaign-session") {
      await tx.delete(campaignSession).where(and(
        eq(campaignSession.id, target.entityId),
        eq(campaignSession.status, "planned"),
      ));
    } else if (target.entityKind === "scene") {
      await tx.delete(campaignSessionScene).where(and(
        eq(campaignSessionScene.id, target.entityId),
        eq(campaignSessionScene.status, "planned"),
      ));
    } else {
      await tx.delete(campaignSessionEncounter).where(and(
        eq(campaignSessionEncounter.id, target.entityId),
        eq(campaignSessionEncounter.status, "planned"),
      ));
    }
  });
}

test("Tabletop lifecycle previews, owner/admin policy, audit, blockers, gate, and deletion execute against PostgreSQL", async () => {
  await db.insert(user).values(fixtureUserIds.map((id, index) => ({
    id,
    name: `${marker}-${index}`,
    email: `${marker}-${index}@example.invalid`,
    emailVerified: true,
  })));
  await db.insert(userRole).values([
    { userId: ownerId, role: "god" },
    { userId: administratorId, role: "admin" },
    { userId: otherGodId, role: "god" },
  ]);

  const campaignId = await createCampaign(`${marker}-campaign`);
  const safe = await createHierarchy(campaignId, "safe", 1);
  const safeTargets: TabletopLifecycleTargetInput[] = [
    { entityKind: "campaign-session", entityId: safe.sessionId },
    { entityKind: "scene", entityId: safe.sceneId },
    { entityKind: "encounter", entityId: safe.encounterId },
  ];

  for (const target of safeTargets) {
    const ownerPreview = await previewTabletopLifecycleEntityForActor(target, owner);
    const adminPreview = await previewTabletopLifecycleEntityForActor(target, administrator);
    assert.equal(ownerPreview.entityKind, target.entityKind);
    assert.equal(adminPreview.canDelete, true);
    assert.ok(adminPreview.dependencies.length >= 8);
    await assert.rejects(
      previewTabletopLifecycleEntityForActor(target, otherGod),
      /creator or an administrator/,
    );
  }
  assert.equal(
    (await previewTabletopLifecycleEntityForActor(safeTargets[0], administrator))
      .dependencies.find(({ label }) => label === "Scenes")?.count,
    1,
  );
  assert.equal(
    (await previewTabletopLifecycleEntityForActor(safeTargets[1], administrator))
      .dependencies.find(({ label }) => label === "Encounters")?.count,
    1,
  );

  await assert.rejects(
    db.transaction(async (tx) => {
      const lifecycle = await prepareTabletopLifecycleMutationInTransaction(
        tx,
        safeTargets[0],
        administrator,
      );
      await recordTabletopLifecycleAuditInTransaction(
        tx,
        administrator,
        "delete",
        lifecycle.root,
        lifecycle.preview,
      );
      throw new Error("forced Tabletop lifecycle rollback");
    }),
    /forced Tabletop lifecycle rollback/,
  );
  assert.equal(
    (await db.select({ id: campaignSession.id }).from(campaignSession).where(
      eq(campaignSession.id, safe.sessionId),
    )).length,
    1,
  );

  await deletePreparedRoot(safeTargets[0]);
  assert.equal(
    (await db.select({ id: campaignSessionScene.id }).from(campaignSessionScene).where(
      eq(campaignSessionScene.id, safe.sceneId),
    )).length,
    0,
    "preparation-only Scene and Encounter children must follow safe Session deletion",
  );

  const sceneDelete = await createHierarchy(campaignId, "scene-delete", 4);
  await deletePreparedRoot({ entityKind: "scene", entityId: sceneDelete.sceneId });
  assert.equal(
    (await db.select({ id: campaignSession.id }).from(campaignSession).where(
      eq(campaignSession.id, sceneDelete.sessionId),
    )).length,
    1,
    "deleting one Scene must preserve its parent Session",
  );
  assert.equal(
    (await db.select({ id: campaignSessionEncounter.id }).from(campaignSessionEncounter).where(
      eq(campaignSessionEncounter.id, sceneDelete.encounterId),
    )).length,
    0,
    "a planned Encounter is preparation owned by its deleted Scene",
  );

  const encounterDelete = await createHierarchy(campaignId, "encounter-delete", 5);
  await deletePreparedRoot({ entityKind: "encounter", entityId: encounterDelete.encounterId });
  assert.equal(
    (await db.select({ id: campaignSessionScene.id }).from(campaignSessionScene).where(
      eq(campaignSessionScene.id, encounterDelete.sceneId),
    )).length,
    1,
    "deleting one Encounter must preserve its parent Scene and Session",
  );

  const historical = await createHierarchy(campaignId, "historical", 2, "active");
  const transitionTargets: Array<[TabletopLifecycleEntityKind, number]> = [
    ["encounter", historical.encounterId],
    ["scene", historical.sceneId],
    ["campaign-session", historical.sessionId],
  ];
  for (const [entityKind, entityId] of transitionTargets) {
    await auditTransition({ entityKind, entityId }, "archive");
    await auditTransition({ entityKind, entityId }, "restore");
  }

  const blocked = await createHierarchy(campaignId, "blocked", 3);
  await db.insert(campaignSessionEncounterInitiative).values({
    campaignId,
    sessionId: blocked.sessionId,
    sceneId: blocked.sceneId,
    encounterId: blocked.encounterId,
    timelineInitiative: 20,
  });
  const blockedPreview = await previewTabletopLifecycleEntityForActor(
    { entityKind: "encounter", entityId: blocked.encounterId },
    owner,
  );
  assert.equal(blockedPreview.canDelete, false);
  assert.equal(
    blockedPreview.dependencies.find(({ label }) => label === "Initiative runtime and history")?.count,
    1,
  );
  assert.throws(
    () => assertTabletopPermanentDeletionAllowed(blockedPreview),
    /Initiative runtime and history \(1\)/,
  );

  const mutableEnvironment = process.env as Record<string, string | undefined>;
  const previousNodeEnvironment = mutableEnvironment.NODE_ENV;
  const previousDeletionSetting = mutableEnvironment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION;
  mutableEnvironment.NODE_ENV = "production";
  mutableEnvironment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION = "false";
  try {
    assert.throws(() => assertPermanentDeletionEnabled(), /disabled in production/);
    const productionPreview = await previewTabletopLifecycleEntityForActor(
      { entityKind: "encounter", entityId: blocked.encounterId },
      owner,
    );
    assert.equal(productionPreview.permanentDeletionEnabled, false);
    assert.equal(productionPreview.canDelete, false);
  } finally {
    if (previousNodeEnvironment === undefined) delete mutableEnvironment.NODE_ENV;
    else mutableEnvironment.NODE_ENV = previousNodeEnvironment;
    if (previousDeletionSetting === undefined) {
      delete mutableEnvironment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION;
    } else {
      mutableEnvironment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION = previousDeletionSetting;
    }
  }

  const auditRows = await db.select({
    action: lifecycleAuditEvent.action,
    entityKind: lifecycleAuditEvent.entityKind,
  }).from(lifecycleAuditEvent).where(eq(
    lifecycleAuditEvent.actorUserId,
    administratorId,
  ));
  assert.ok(auditRows.some(({ action }) => action === "delete"));
  for (const entityKind of ["campaign-session", "scene", "encounter"]) {
    assert.ok(auditRows.some((row) => row.entityKind === entityKind && row.action === "delete"));
  }
  for (const [entityKind] of transitionTargets) {
    assert.ok(auditRows.some((row) => row.entityKind === entityKind && row.action === "archive"));
    assert.ok(auditRows.some((row) => row.entityKind === entityKind && row.action === "restore"));
  }
});
