import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { and, eq, inArray, or } from "drizzle-orm";

import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { db, pool } from "@/db";
import { lifecycleAuditEvent } from "@/db/lifecycle-schema";
import {
  campaignCharacter,
  campaignCharacterSpellDocument,
} from "@/db/realm-schema";
import { skill, skillExtension, skillRelationship } from "@/db/skill-schema";
import {
  permanentlyDeleteLifecycleEntityForActor,
  previewLifecycleEntityForActor,
} from "@/features/lifecycle/lifecycle-service";
import type { LifecycleActor } from "@/features/lifecycle/types";
import { createEmptySpell, withCalculationSnapshot } from "@/features/spell-construction/utilities/spellFactory";
import { lockSpellFrameworkSkillReferenceInTransaction } from "@/features/skills/skill-framework-reference-service";

function assertSafeDevelopmentDatabase(): void {
  const configured = process.env.DATABASE_URL;
  assert.ok(configured, "DATABASE_URL is required.");
  const parsed = new URL(configured);
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname),
    "Framework-reference DB tests refuse non-loopback databases.",
  );
  assert.match(
    parsed.pathname.slice(1),
    /_dev$/,
    "Framework-reference DB tests require a database name ending in _dev.",
  );
}

assertSafeDevelopmentDatabase();

const marker = `framework-reference-db-${randomUUID()}`;
const actorId = `${marker}-owner`;
const actor: LifecycleActor = { userId: actorId, roles: ["god"] };
const skillIds: number[] = [];
let campaignId: number | undefined;
let characterId: number | undefined;

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function assertStillPending(promise: Promise<unknown>, label: string): Promise<void> {
  let state: "pending" | "settled" = "pending";
  const observed = promise.then(
    () => { state = "settled"; },
    () => { state = "settled"; },
  );
  await Promise.race([
    observed,
    new Promise<void>((resolve) => setTimeout(resolve, 100)),
  ]);
  assert.equal(state, "pending", label);
}

async function createSkill(
  suffix: string,
  options: { name?: string; tier?: number | null; archived?: boolean } = {},
): Promise<number> {
  const archived = options.archived ?? false;
  const [created] = await db.insert(skill).values({
    name: options.name ?? `${marker}-${suffix}`,
    tier: options.tier ?? null,
    createdByUserId: actorId,
    ...(archived
      ? {
          archivedAt: new Date(),
          archivedByUserId: actorId,
          archiveReason: marker,
        }
      : {}),
  }).returning({ id: skill.id });
  skillIds.push(created.id);
  return created.id;
}

async function createEligibleFramework(suffix: string): Promise<{
  frameworkSkillId: number;
  parentSkillId: number;
}> {
  const parentSkillId = await createSkill(`${suffix}-parent`, { name: "Spellcraft" });
  const frameworkSkillId = await createSkill(`${suffix}-framework`, { tier: 2 });
  await db.insert(skillRelationship).values({
    skillId: frameworkSkillId,
    relatedSkillId: parentSkillId,
    relationshipType: "parent",
  });
  return { frameworkSkillId, parentSkillId };
}

function spellDocument(frameworkSkillId: number, suffix: string) {
  return withCalculationSnapshot({
    ...createEmptySpell(),
    id: `${marker}-${suffix}`,
    name: `${marker}-${suffix}`,
    frameworkSkillId,
  });
}

after(async () => {
  if (campaignId !== undefined) {
    await db.delete(campaign).where(eq(campaign.id, campaignId));
  }
  if (skillIds.length > 0) {
    await db.delete(skillExtension).where(inArray(skillExtension.skillId, skillIds));
    await db.delete(skillRelationship).where(or(
      inArray(skillRelationship.skillId, skillIds),
      inArray(skillRelationship.relatedSkillId, skillIds),
    ));
    await db.delete(skill).where(inArray(skill.id, skillIds));
  }
  await db.delete(lifecycleAuditEvent).where(eq(lifecycleAuditEvent.actorUserId, actorId));
  await db.delete(userRole).where(eq(userRole.userId, actorId));
  await db.delete(user).where(eq(user.id, actorId));

  const residue = await pool.query<{ value: number }>(
    `select (
      (select count(*) from campaign where created_by_user_id = $1)
      + (select count(*) from campaign_character where player_user_id = $1)
      + (select count(*) from skill where created_by_user_id = $1)
      + (select count(*) from lifecycle_audit_event where actor_user_id = $1)
      + (select count(*) from "user" where id = $1)
    )::int as value`,
    [actorId],
  );
  assert.equal(Number(residue.rows[0]?.value ?? -1), 0, "framework-reference fixtures must be removed");
  await pool.end();
});

test("framework Skill writers validate and serialize with lifecycle deletion", async () => {
  await db.insert(user).values({
    id: actorId,
    name: marker,
    email: `${marker}@example.invalid`,
    emailVerified: true,
  });
  await db.insert(userRole).values({ userId: actorId, role: "god" });
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
    createdByUserId: actorId,
  }).returning({ id: campaign.id });
  campaignId = createdCampaign.id;
  await db.insert(campaignPlayer).values({ campaignId, userId: actorId });
  const [createdCharacter] = await db.insert(campaignCharacter).values({
    campaignId,
    playerUserId: actorId,
    name: `${marker}-character`,
    isNpc: false,
  }).returning({ id: campaignCharacter.id });
  characterId = createdCharacter.id;

  const missingIdResult = await pool.query<{ id: number }>(
    "select (coalesce(max(id), 0) + 1000000)::int as id from skill",
  );
  await assert.rejects(
    db.transaction((tx) => lockSpellFrameworkSkillReferenceInTransaction(
      tx,
      missingIdResult.rows[0].id,
      "Spellcraft/Talismanism/Faith",
    )),
    /Sphere Skill no longer exists/,
  );

  const archivedSkillId = await createSkill("archived-framework", {
    tier: 2,
    archived: true,
  });
  await assert.rejects(
    db.transaction((tx) => lockSpellFrameworkSkillReferenceInTransaction(
      tx,
      archivedSkillId,
      "Spellcraft/Talismanism/Faith",
    )),
    /Sphere Skill is archived/,
  );

  const ineligibleSkillId = await createSkill("ineligible-framework", { tier: 2 });
  await assert.rejects(
    db.transaction((tx) => lockSpellFrameworkSkillReferenceInTransaction(
      tx,
      ineligibleSkillId,
      "Spellcraft/Talismanism/Faith",
    )),
    /no longer attached to the required Skill tree/,
  );

  const characterRace = await createEligibleFramework("character-writer-first");
  const characterDocument = spellDocument(
    characterRace.frameworkSkillId,
    "character-writer-first-document",
  );
  const characterLockAcquired = deferred();
  const releaseCharacterWriter = deferred();
  const characterWriter = db.transaction(async (tx) => {
    await lockSpellFrameworkSkillReferenceInTransaction(
      tx,
      characterDocument.frameworkSkillId,
      characterDocument.tradition,
    );
    characterLockAcquired.resolve();
    await releaseCharacterWriter.promise;
    await tx.insert(campaignCharacterSpellDocument).values({
      characterId: characterId!,
      documentId: characterDocument.id,
      name: characterDocument.name,
      tradition: characterDocument.tradition,
      documentJson: JSON.stringify(characterDocument),
      inSpellbook: true,
    });
  });
  await characterLockAcquired.promise;
  const characterDeletion = permanentlyDeleteLifecycleEntityForActor(
    { entityKind: "skill", entityId: characterRace.frameworkSkillId },
    actor,
  );
  try {
    await assertStillPending(
      characterDeletion,
      "Skill deletion must wait for the Character spell writer's reference row lock",
    );
  } finally {
    releaseCharacterWriter.resolve();
  }
  await characterWriter;
  await assert.rejects(
    characterDeletion,
    /Saved Character spell documents using this framework Skill \(1\)/,
  );
  await db.delete(skillRelationship).where(eq(
    skillRelationship.skillId,
    characterRace.frameworkSkillId,
  ));
  const characterPreview = await previewLifecycleEntityForActor(
    { entityKind: "skill", entityId: characterRace.frameworkSkillId },
    actor,
  );
  assert.equal(
    characterPreview.dependencies.find(({ label }) => label === "Parent relationships")?.count,
    0,
  );
  assert.equal(
    characterPreview.dependencies.find(
      ({ label }) => label === "Saved Character spell documents using this framework Skill",
    )?.count,
    1,
  );

  const extensionRace = await createEligibleFramework("extension-writer-first");
  const extensionSourceSkillId = await createSkill("extension-writer-first-source");
  const extensionDocument = spellDocument(
    extensionRace.frameworkSkillId,
    "extension-writer-first-document",
  );
  const extensionLockAcquired = deferred();
  const releaseExtensionWriter = deferred();
  const extensionWriter = db.transaction(async (tx) => {
    await lockSpellFrameworkSkillReferenceInTransaction(
      tx,
      extensionDocument.frameworkSkillId,
      extensionDocument.tradition,
    );
    extensionLockAcquired.resolve();
    await releaseExtensionWriter.promise;
    await tx.insert(skillExtension).values({
      skillId: extensionSourceSkillId,
      extensionType: "spell-construction",
      schemaVersion: extensionDocument.schemaVersion,
      dataJson: JSON.stringify(extensionDocument),
    });
  });
  await extensionLockAcquired.promise;
  const extensionDeletion = permanentlyDeleteLifecycleEntityForActor(
    { entityKind: "skill", entityId: extensionRace.frameworkSkillId },
    actor,
  );
  try {
    await assertStillPending(
      extensionDeletion,
      "Skill deletion must wait for the extension writer's reference row lock",
    );
  } finally {
    releaseExtensionWriter.resolve();
  }
  await extensionWriter;
  await assert.rejects(
    extensionDeletion,
    /Other spell-construction Skill extensions using this framework Skill \(1\)/,
  );
  await db.delete(skillRelationship).where(eq(
    skillRelationship.skillId,
    extensionRace.frameworkSkillId,
  ));
  const extensionPreview = await previewLifecycleEntityForActor(
    { entityKind: "skill", entityId: extensionRace.frameworkSkillId },
    actor,
  );
  assert.equal(
    extensionPreview.dependencies.find(({ label }) => label === "Parent relationships")?.count,
    0,
  );
  assert.equal(
    extensionPreview.dependencies.find(
      ({ label }) => label === "Other spell-construction Skill extensions using this framework Skill",
    )?.count,
    1,
  );

  for (const writerKind of ["character", "extension"] as const) {
    const staleTargetId = await createSkill(`${writerKind}-delete-first-target`, { tier: 2 });
    const staleDocument = spellDocument(staleTargetId, `${writerKind}-delete-first-document`);
    const extensionSourceId = writerKind === "extension"
      ? await createSkill("extension-delete-first-source")
      : undefined;
    const deletionHasLock = deferred();
    const releaseDeletion = deferred();
    const deletion = permanentlyDeleteLifecycleEntityForActor(
      { entityKind: "skill", entityId: staleTargetId },
      actor,
      undefined,
      {
        async afterAudit() {
          deletionHasLock.resolve();
          await releaseDeletion.promise;
        },
      },
    );
    await deletionHasLock.promise;

    const staleWriter = db.transaction(async (tx) => {
      await lockSpellFrameworkSkillReferenceInTransaction(
        tx,
        staleDocument.frameworkSkillId,
        staleDocument.tradition,
      );
      if (writerKind === "character") {
        await tx.insert(campaignCharacterSpellDocument).values({
          characterId: characterId!,
          documentId: staleDocument.id,
          name: staleDocument.name,
          tradition: staleDocument.tradition,
          documentJson: JSON.stringify(staleDocument),
          inSpellbook: false,
        });
      } else {
        await tx.insert(skillExtension).values({
          skillId: extensionSourceId!,
          extensionType: "spell-construction",
          schemaVersion: staleDocument.schemaVersion,
          dataJson: JSON.stringify(staleDocument),
        });
      }
    });
    try {
      await assertStillPending(
        staleWriter,
        `${writerKind} writer must wait while lifecycle deletion owns the Skill row lock`,
      );
    } finally {
      releaseDeletion.resolve();
    }
    await deletion;
    await assert.rejects(staleWriter, /Sphere Skill no longer exists/);

    if (writerKind === "character") {
      const rows = await db.select({ id: campaignCharacterSpellDocument.id })
        .from(campaignCharacterSpellDocument)
        .where(and(
          eq(campaignCharacterSpellDocument.characterId, characterId!),
          eq(campaignCharacterSpellDocument.documentId, staleDocument.id),
        ));
      assert.equal(rows.length, 0, "the stale Character spell JSON must not be written");
    } else {
      const rows = await db.select({ id: skillExtension.id })
        .from(skillExtension)
        .where(and(
          eq(skillExtension.skillId, extensionSourceId!),
          eq(skillExtension.extensionType, "spell-construction"),
        ));
      assert.equal(rows.length, 0, "the stale Skill extension JSON must not be written");
    }
  }
});
