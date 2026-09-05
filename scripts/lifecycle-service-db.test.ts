import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { and, eq } from "drizzle-orm";

import { executeCharacterItemUseInCallerTransaction } from "@/app/characters/item-use-actions";
import { user } from "@/db/auth-schema";
import {
  campaign,
  campaignAllowedSystem,
  campaignDerivedCurrency,
  campaignPlayer,
} from "@/db/campaign-schema";
import { chatRoom } from "@/db/chat-schema";
import { creature } from "@/db/creature-schema";
import { derivedAbility, campaignAllowedDerivedAbility } from "@/db/derived-ability-schema";
import { db, pool } from "@/db";
import { item, itemEffect, itemRuntimeProfile } from "@/db/item-schema";
import { lifecycleAuditEvent } from "@/db/lifecycle-schema";
import { race } from "@/db/race-schema";
import {
  campaignAllowedRace,
  campaignCharacter,
  campaignCharacterActiveCondition,
  campaignCharacterActiveModifier,
  campaignCharacterAttribute,
  campaignCharacterCurrencyHolding,
  campaignCharacterItem,
  campaignCharacterProfile,
  campaignCharacterSkillAllocation,
  campaignCharacterSpellDocument,
  campaignInventoryItem,
} from "@/db/realm-schema";
import { skill, skillExtension } from "@/db/skill-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionRoster,
  campaignSessionScene,
} from "@/db/tabletop-operations-schema";
import { userRole } from "@/db/authorization-schema";
import {
  archiveLifecycleEntityForActor,
  permanentlyDeleteLifecycleEntityForActor,
  previewLifecycleEntityForActor,
  restoreLifecycleEntityForActor,
} from "@/features/lifecycle/lifecycle-service";
import { CAMPAIGN_GRAPH_DELETE_STEPS } from "@/features/lifecycle/campaign-delete-plan";
import { createEmptySpell, withCalculationSnapshot } from "@/features/spell-construction/utilities/spellFactory";
import type {
  LifecycleActor,
  LifecycleTargetInput,
} from "@/features/lifecycle/types";

function assertSafeDevelopmentDatabase(): void {
  const configured = process.env.DATABASE_URL;
  assert.ok(configured, "DATABASE_URL is required.");
  const parsed = new URL(configured);
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname),
    "Lifecycle DB tests refuse non-loopback databases.",
  );
  assert.match(
    parsed.pathname.slice(1),
    /_dev$/,
    "Lifecycle DB tests require a database name ending in _dev.",
  );
}

assertSafeDevelopmentDatabase();

const marker = `lifecycle-db-${randomUUID()}`;
const actorId = `${marker}-owner`;
const actor: LifecycleActor = { userId: actorId, roles: ["god"] };
const campaignIds: Array<{ id: number; name: string }> = [];
const sharedIds: Array<LifecycleTargetInput> = [];

type CampaignGraphSnapshot = Record<string, unknown[]>;

function quoteTrustedTableName(tableName: string): string {
  assert.match(tableName, /^[a-z_]+$/, "Campaign graph table names must be trusted identifiers.");
  return `"${tableName}"`;
}

async function snapshotCampaignGraph(campaignId: number): Promise<CampaignGraphSnapshot> {
  const snapshot: CampaignGraphSnapshot = {};
  const root = await pool.query<{ rows: unknown[] }>(
    `select coalesce(jsonb_agg(row_value order by row_value::text), '[]'::jsonb) as rows
     from (select to_jsonb(t) as row_value from campaign t where id = $1) campaign_snapshot`,
    [campaignId],
  );
  snapshot.campaign = root.rows[0]?.rows ?? [];

  for (const step of CAMPAIGN_GRAPH_DELETE_STEPS) {
    const predicate = step.scope === "campaign"
      ? "campaign_id = $1"
      : step.scope === "character"
        ? "character_id in (select id from campaign_character where campaign_id = $1)"
        : "room_id in (select id from chat_room where campaign_id = $1)";
    const rows = await pool.query<{ rows: unknown[] }>(
      `select coalesce(jsonb_agg(row_value order by row_value::text), '[]'::jsonb) as rows
       from (select to_jsonb(t) as row_value from ${quoteTrustedTableName(step.tableName)} t where ${predicate}) campaign_graph_snapshot`,
      [campaignId],
    );
    snapshot[step.tableName] = rows.rows[0]?.rows ?? [];
  }

  return snapshot;
}

after(async () => {
  for (const target of [...campaignIds].reverse()) {
    try {
      await permanentlyDeleteLifecycleEntityForActor(
        { entityKind: "campaign", entityId: target.id },
        actor,
        target.name,
      );
    } catch {
      // The assertions below verify normal cleanup. This fallback is followed
      // by an exact fixture check so a failed cleanup cannot pass silently.
    }
  }
  for (const target of [...sharedIds].reverse()) {
    try {
      await permanentlyDeleteLifecycleEntityForActor(target, actor);
    } catch {
      // See the zero-fixture assertion below.
    }
  }
  await db.delete(lifecycleAuditEvent).where(eq(lifecycleAuditEvent.actorUserId, actorId));
  await db.delete(userRole).where(eq(userRole.userId, actorId));
  await db.delete(user).where(eq(user.id, actorId));

  const remaining = await pool.query<{ value: number }>(
    `select (
      (select count(*) from campaign where name like $1)
      + (select count(*) from skill where name like $1)
      + (select count(*) from races where name like $1)
      + (select count(*) from creatures where canonical_name like $1)
      + (select count(*) from items where name like $1)
      + (select count(*) from derived_ability where name like $1)
      + (select count(*) from "user" where id = $2)
      + (select count(*) from lifecycle_audit_event where actor_user_id = $2)
    )::int as value`,
    [`${marker}%`, actorId],
  );
  assert.equal(Number(remaining.rows[0]?.value ?? -1), 0, "all lifecycle fixtures must be removed");
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
    createdByUserId: actorId,
  }).returning({ id: campaign.id });
  campaignIds.push({ id: created.id, name });
  await db.insert(campaignPlayer).values({ campaignId: created.id, userId: actorId });
  return created.id;
}

test("all lifecycle root SQL executes and Campaign deletion is scoped and atomic", async () => {
  await db.insert(user).values({
    id: actorId,
    name: marker,
    email: `${marker}@example.invalid`,
    emailVerified: true,
  });
  await db.insert(userRole).values({ userId: actorId, role: "god" });

  const campaignName = `${marker}-campaign`;
  const campaignId = await createCampaign(campaignName);
  const sentinelName = `${marker}-sentinel`;
  const sentinelCampaignId = await createCampaign(sentinelName);

  const [raceRow] = await db.insert(race).values({
    name: `${marker}-race`,
    createdByUserId: actorId,
  }).returning({ id: race.id });
  const [creatureRow] = await db.insert(creature).values({
    canonicalId: `TEST-${randomUUID().replaceAll("-", "").toUpperCase()}`,
    canonicalName: `${marker}-creature`,
    size: "Medium",
    createdByUserId: actorId,
  }).returning({ id: creature.id });
  const [skillRow] = await db.insert(skill).values({
    name: `${marker}-skill`,
    createdByUserId: actorId,
  }).returning({ id: skill.id });
  const [frameworkSkillRow] = await db.insert(skill).values({
    name: `${marker}-framework-skill`,
    createdByUserId: actorId,
  }).returning({ id: skill.id });
  const [spellSkillRow] = await db.insert(skill).values({
    name: `${marker}-spell-skill`,
    createdByUserId: actorId,
  }).returning({ id: skill.id });
  const semanticSpellDocument = withCalculationSnapshot({
    ...createEmptySpell(),
    id: `${marker}-semantic-spell`,
    name: `${marker}-semantic-spell`,
    frameworkSkillId: frameworkSkillRow.id,
  });
  const [itemRow] = await db.insert(item).values({
    canonicalId: `ITEM-${randomUUID().replaceAll("-", "").toUpperCase()}`,
    name: `${marker}-item`,
    catalogScope: "inventory",
    recordType: "test",
    family: "test",
    category: "test",
    priceBasis: "each",
    createdByUserId: actorId,
  }).returning({ id: item.id });
  const [runtimeItemRow] = await db.insert(item).values({
    canonicalId: `ITEM-${randomUUID().replaceAll("-", "").toUpperCase()}`,
    name: `${marker}-runtime-item`,
    catalogScope: "inventory",
    recordType: "test",
    family: "test",
    category: "test",
    priceBasis: "each",
    createdByUserId: actorId,
  }).returning({ id: item.id });
  await db.insert(itemRuntimeProfile).values({
    itemId: runtimeItemRow.id,
    useMode: "consume-item",
    quantityPerUse: 1,
    activationLabel: "Use",
  });
  await db.insert(itemEffect).values([
    {
      itemId: runtimeItemRow.id,
      schemaVersion: 2,
      sortOrder: 0,
      effectJson: {
        kind: "condition.apply",
        name: `${marker}-condition`,
        description: "Lifecycle Item reference fixture.",
        duration: { kind: "scene", value: null },
      },
    },
    {
      itemId: runtimeItemRow.id,
      schemaVersion: 2,
      sortOrder: 1,
      effectJson: {
        kind: "modifier.apply",
        label: `${marker}-modifier`,
        channel: "initiative",
        targetKey: "self",
        amount: 1,
        duration: { kind: "scene", value: null },
      },
    },
  ]);
  const [abilityRow] = await db.insert(derivedAbility).values({
    name: `${marker}-ability`,
    createdByUserId: actorId,
  }).returning({ id: derivedAbility.id });

  const sharedTargets: LifecycleTargetInput[] = [
    { entityKind: "race", entityId: raceRow.id },
    { entityKind: "creature", entityId: creatureRow.id },
    { entityKind: "skill", entityId: skillRow.id },
    { entityKind: "skill", entityId: frameworkSkillRow.id },
    { entityKind: "skill", entityId: spellSkillRow.id },
    { entityKind: "item", entityId: itemRow.id },
    { entityKind: "derived-ability", entityId: abilityRow.id },
  ];
  sharedIds.push(...sharedTargets);
  const runtimeItemTarget: LifecycleTargetInput = {
    entityKind: "item",
    entityId: runtimeItemRow.id,
  };
  sharedIds.push(runtimeItemTarget);

  // Next's generated environment declarations make NODE_ENV readonly at the
  // type level. This guarded test deliberately exercises both sides of the
  // runtime-only production gate, so isolate the mutable view and restore it
  // in finally.
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  const previousNodeEnvironment = mutableEnvironment.NODE_ENV;
  const previousDeletionSetting = mutableEnvironment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION;
  mutableEnvironment.NODE_ENV = "production";
  mutableEnvironment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION = "false";
  try {
    await assert.rejects(
      permanentlyDeleteLifecycleEntityForActor(sharedTargets[4], actor),
      /disabled in production by recovery protection/,
    );
    assert.equal(
      (await db.select({ id: derivedAbility.id }).from(derivedAbility).where(
        eq(derivedAbility.id, abilityRow.id),
      )).length,
      1,
      "the service-side production guard must leave the target untouched",
    );
  } finally {
    if (previousNodeEnvironment === undefined) delete mutableEnvironment.NODE_ENV;
    else mutableEnvironment.NODE_ENV = previousNodeEnvironment;
    if (previousDeletionSetting === undefined) {
      delete mutableEnvironment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION;
    } else {
      mutableEnvironment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION = previousDeletionSetting;
    }
  }

  const [playerCharacter] = await db.insert(campaignCharacter).values({
    campaignId,
    playerUserId: actorId,
    name: `${marker}-pc`,
    isNpc: false,
  }).returning({ id: campaignCharacter.id });
  const [raceNpc] = await db.insert(campaignCharacter).values({
    campaignId,
    playerUserId: actorId,
    name: `${marker}-race-npc`,
    isNpc: true,
    npcKind: "race",
    npcBuildMode: "detailed",
  }).returning({ id: campaignCharacter.id });
  const [creatureNpc] = await db.insert(campaignCharacter).values({
    campaignId,
    playerUserId: actorId,
    name: `${marker}-creature-npc`,
    isNpc: true,
    npcKind: "creature",
    npcBuildMode: "detailed",
  }).returning({ id: campaignCharacter.id });

  await db.insert(campaignCharacterProfile).values({
    characterId: raceNpc.id,
    raceId: raceRow.id,
  });
  await db.insert(campaignCharacterAttribute).values({
    characterId: raceNpc.id,
    attributeKey: "CON",
    value: 25,
  });
  await db.insert(campaignCharacterSkillAllocation).values({
    characterId: raceNpc.id,
    skillId: skillRow.id,
    points: 1,
  });
  await db.insert(campaignCharacterItem).values({
    characterId: raceNpc.id,
    itemId: itemRow.id,
    quantity: 1,
    unitCostCredits: 1,
  });
  const [currency] = await db.insert(campaignDerivedCurrency).values({
    campaignId,
    name: `${marker}-coin`,
    description: "test",
    creditsPerUnit: 1,
  }).returning({ id: campaignDerivedCurrency.id });
  await db.insert(campaignCharacterCurrencyHolding).values({
    characterId: raceNpc.id,
    currencyId: currency.id,
    quantity: 1,
  });
  await db.insert(campaignAllowedRace).values({ campaignId, raceId: raceRow.id });
  await db.insert(campaignInventoryItem).values({ campaignId, itemId: itemRow.id });
  await db.insert(campaignAllowedSystem).values({
    campaignId,
    system: "Derived Abilities",
  });
  await db.insert(campaignAllowedDerivedAbility).values({
    campaignId,
    derivedAbilityId: abilityRow.id,
  });
  const [room] = await db.insert(chatRoom).values({
    slug: marker,
    name: `${marker}-room`,
    scope: "campaign",
    campaignId,
  }).returning({ id: chatRoom.id });

  const [sessionRow] = await db.insert(campaignSession).values({
    campaignId,
    title: `${marker}-session`,
    sequenceNumber: 1,
  }).returning({ id: campaignSession.id });
  await db.insert(campaignSessionRoster).values({
    sessionId: sessionRow.id,
    campaignId,
    characterId: raceNpc.id,
    sortOrder: 0,
  });
  const [sceneRow] = await db.insert(campaignSessionScene).values({
    sessionId: sessionRow.id,
    campaignId,
    sequenceNumber: 1,
    title: `${marker}-scene`,
  }).returning({ id: campaignSessionScene.id });
  await db.insert(campaignSessionEncounter).values({
    sceneId: sceneRow.id,
    sessionId: sessionRow.id,
    campaignId,
    sequenceNumber: 1,
    title: `${marker}-encounter`,
  });

  const [sentinelCharacter] = await db.insert(campaignCharacter).values({
    campaignId: sentinelCampaignId,
    playerUserId: actorId,
    name: `${marker}-sentinel-character`,
    isNpc: false,
  }).returning({ id: campaignCharacter.id });
  await db.insert(campaignCharacterProfile).values({
    characterId: sentinelCharacter.id,
    backstory: "sentinel graph state",
  });
  const [sentinelCurrency] = await db.insert(campaignDerivedCurrency).values({
    campaignId: sentinelCampaignId,
    name: `${marker}-sentinel-coin`,
    description: "sentinel",
    creditsPerUnit: 2,
  }).returning({ id: campaignDerivedCurrency.id });
  await db.insert(campaignCharacterCurrencyHolding).values({
    characterId: sentinelCharacter.id,
    currencyId: sentinelCurrency.id,
    quantity: 3,
  });
  await db.insert(campaignAllowedSystem).values({
    campaignId: sentinelCampaignId,
    system: "Derived Abilities",
  });
  const [sentinelSession] = await db.insert(campaignSession).values({
    campaignId: sentinelCampaignId,
    title: `${marker}-sentinel-session`,
    sequenceNumber: 1,
  }).returning({ id: campaignSession.id });
  await db.insert(campaignSessionRoster).values({
    sessionId: sentinelSession.id,
    campaignId: sentinelCampaignId,
    characterId: sentinelCharacter.id,
    sortOrder: 0,
  });
  const [sentinelScene] = await db.insert(campaignSessionScene).values({
    sessionId: sentinelSession.id,
    campaignId: sentinelCampaignId,
    sequenceNumber: 1,
    title: `${marker}-sentinel-scene`,
  }).returning({ id: campaignSessionScene.id });
  await db.insert(campaignSessionEncounter).values({
    sceneId: sentinelScene.id,
    sessionId: sentinelSession.id,
    campaignId: sentinelCampaignId,
    sequenceNumber: 1,
    title: `${marker}-sentinel-encounter`,
  });
  await db.insert(chatRoom).values({
    slug: `${marker}-sentinel-room`,
    name: `${marker}-sentinel-room`,
    scope: "campaign",
    campaignId: sentinelCampaignId,
  });

  const targets: LifecycleTargetInput[] = [
    { entityKind: "campaign", entityId: campaignId },
    { entityKind: "player-character", entityId: playerCharacter.id },
    { entityKind: "race-npc", entityId: raceNpc.id },
    { entityKind: "creature-npc", entityId: creatureNpc.id },
    ...sharedTargets,
  ];
  for (const target of targets) {
    const preview = await previewLifecycleEntityForActor(target, actor);
    assert.equal(preview.entityKind, target.entityKind);
    assert.ok(preview.dependencies.length > 0);
    await archiveLifecycleEntityForActor(target, actor, marker);
    assert.equal((await previewLifecycleEntityForActor(target, actor)).archived, true);
    if (target.entityKind === "campaign") {
      const [archivedRoom] = await db.select({ archived: chatRoom.isArchived })
        .from(chatRoom)
        .where(eq(chatRoom.id, room.id));
      assert.equal(archivedRoom?.archived, true);
    }
    await restoreLifecycleEntityForActor(target, actor);
    assert.equal((await previewLifecycleEntityForActor(target, actor)).archived, false);
    if (target.entityKind === "campaign") {
      const [restoredRoom] = await db.select({ archived: chatRoom.isArchived })
        .from(chatRoom)
        .where(eq(chatRoom.id, room.id));
      assert.equal(restoredRoom?.archived, false);
    }
  }

  assert.equal(
    (await previewLifecycleEntityForActor(sharedTargets[0], actor)).canDelete,
    false,
    "referenced Race deletion must be blocked",
  );
  const semanticSkillTarget: LifecycleTargetInput = {
    entityKind: "skill",
    entityId: frameworkSkillRow.id,
  };
  assert.equal(
    (await previewLifecycleEntityForActor(semanticSkillTarget, actor)).canDelete,
    true,
    "the framework Skill begins without dependencies",
  );
  await db.insert(skillExtension).values({
    skillId: spellSkillRow.id,
    extensionType: "spell-construction",
    schemaVersion: semanticSpellDocument.schemaVersion,
    dataJson: JSON.stringify(semanticSpellDocument),
  });
  await db.insert(campaignCharacterSpellDocument).values({
    characterId: raceNpc.id,
    documentId: semanticSpellDocument.id,
    name: semanticSpellDocument.name,
    tradition: semanticSpellDocument.tradition,
    documentJson: JSON.stringify(semanticSpellDocument),
    inSpellbook: true,
  });
  const semanticSkillPreview = await previewLifecycleEntityForActor(
    semanticSkillTarget,
    actor,
  );
  assert.equal(semanticSkillPreview.canDelete, false);
  assert.equal(
    semanticSkillPreview.dependencies.find(
      ({ label }) => label === "Saved Character spell documents using this framework Skill",
    )?.count,
    1,
  );
  assert.equal(
    semanticSkillPreview.dependencies.find(
      ({ label }) => label === "Other spell-construction Skill extensions using this framework Skill",
    )?.count,
    1,
  );
  await assert.rejects(
    permanentlyDeleteLifecycleEntityForActor(semanticSkillTarget, actor),
    /Saved Character spell documents using this framework Skill \(1\).*Other spell-construction Skill extensions using this framework Skill \(1\)/,
    "the locked server-side deletion recheck must retain both semantic blockers",
  );
  await db.delete(skillExtension).where(eq(skillExtension.skillId, spellSkillRow.id));

  const staleRuntimeItemPreview = await previewLifecycleEntityForActor(
    runtimeItemTarget,
    actor,
  );
  assert.equal(staleRuntimeItemPreview.canDelete, true);
  assert.equal(
    staleRuntimeItemPreview.dependencies.find(
      ({ label }) => label === "Active and historical Item-sourced Conditions and Modifiers",
    )?.count,
    0,
  );
  await db.insert(campaignInventoryItem).values({
    campaignId,
    itemId: runtimeItemRow.id,
    sortOrder: 1,
  });
  await db.insert(campaignCharacterItem).values({
    characterId: raceNpc.id,
    itemId: runtimeItemRow.id,
    quantity: 1,
    unitCostCredits: 1,
  });

  let releaseItemWriter!: () => void;
  let reportFirstPersistedEffect!: () => void;
  const itemWriterRelease = new Promise<void>((resolve) => {
    releaseItemWriter = resolve;
  });
  const firstPersistedEffect = new Promise<void>((resolve) => {
    reportFirstPersistedEffect = resolve;
  });
  let persistedEffectCount = 0;
  const itemWriter = db.transaction(async (tx) => {
    const result = await executeCharacterItemUseInCallerTransaction(
      tx,
      {
        sourceCharacterId: raceNpc.id,
        itemId: runtimeItemRow.id,
        itemInstanceId: null,
        targetCharacterId: raceNpc.id,
        effectSelections: {},
      },
      actorId,
      async () => {
        persistedEffectCount += 1;
        if (persistedEffectCount === 1) {
          reportFirstPersistedEffect();
          await itemWriterRelease;
        }
      },
    );
    assert.equal(result.resource?.after, 0, "the last Item stack must be consumed");
    await tx.delete(campaignInventoryItem).where(and(
      eq(campaignInventoryItem.campaignId, campaignId),
      eq(campaignInventoryItem.itemId, runtimeItemRow.id),
    ));
  });
  await Promise.race([
    firstPersistedEffect,
    new Promise<never>((_, reject) => setTimeout(
      () => reject(new Error("Item writer did not persist its first effect in time.")),
      5_000,
    )),
  ]);

  let lockedDeletionSettled = false;
  const lockedDeletionAssertion = assert.rejects(
    permanentlyDeleteLifecycleEntityForActor(runtimeItemTarget, actor),
    /Active and historical Item-sourced Conditions and Modifiers \(2\)/,
    "the locked delete must recheck semantic Item references written after preview",
  ).finally(() => {
    lockedDeletionSettled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 75));
  const deletionSettledBeforeWriterCommit = lockedDeletionSettled;
  releaseItemWriter();
  await Promise.all([itemWriter, lockedDeletionAssertion]);
  assert.equal(
    deletionSettledBeforeWriterCommit,
    false,
    "Item lifecycle deletion must wait for the Item-use root lock",
  );
  assert.equal(persistedEffectCount, 2);
  assert.equal(
    (await db.select({ itemId: campaignCharacterItem.itemId })
      .from(campaignCharacterItem)
      .where(and(
        eq(campaignCharacterItem.characterId, raceNpc.id),
        eq(campaignCharacterItem.itemId, runtimeItemRow.id),
      ))).length,
    0,
    "the consumed last stack must not remain as an incidental deletion blocker",
  );

  const activeRuntimeItemPreview = await previewLifecycleEntityForActor(
    runtimeItemTarget,
    actor,
  );
  assert.equal(activeRuntimeItemPreview.canDelete, false);
  assert.equal(
    activeRuntimeItemPreview.dependencies.find(
      ({ label }) => label === "Active and historical Item-sourced Conditions and Modifiers",
    )?.count,
    2,
  );
  const historyTime = new Date();
  await db.update(campaignCharacterActiveCondition).set({
    resolvedAt: historyTime,
    resolutionNote: "Lifecycle history fixture.",
  }).where(and(
    eq(campaignCharacterActiveCondition.sourceKind, "item"),
    eq(campaignCharacterActiveCondition.sourceId, String(runtimeItemRow.id)),
  ));
  await db.update(campaignCharacterActiveModifier).set({
    endedAt: historyTime,
    endNote: "Lifecycle history fixture.",
  }).where(and(
    eq(campaignCharacterActiveModifier.sourceKind, "item"),
    eq(campaignCharacterActiveModifier.sourceId, String(runtimeItemRow.id)),
  ));
  const historicalRuntimeItemPreview = await previewLifecycleEntityForActor(
    runtimeItemTarget,
    actor,
  );
  assert.equal(
    historicalRuntimeItemPreview.dependencies.find(
      ({ label }) => label === "Active and historical Item-sourced Conditions and Modifiers",
    )?.count,
    2,
    "resolved Conditions and ended Modifiers remain Item deletion blockers",
  );
  await db.delete(campaignCharacterActiveCondition).where(and(
    eq(campaignCharacterActiveCondition.sourceKind, "item"),
    eq(campaignCharacterActiveCondition.sourceId, String(runtimeItemRow.id)),
  ));
  await db.delete(campaignCharacterActiveModifier).where(and(
    eq(campaignCharacterActiveModifier.sourceKind, "item"),
    eq(campaignCharacterActiveModifier.sourceId, String(runtimeItemRow.id)),
  ));
  assert.equal(
    (await previewLifecycleEntityForActor(runtimeItemTarget, actor)).canDelete,
    true,
  );

  await archiveLifecycleEntityForActor(runtimeItemTarget, actor, marker);
  await assert.rejects(
    db.transaction((tx) => executeCharacterItemUseInCallerTransaction(
      tx,
      {
        sourceCharacterId: raceNpc.id,
        itemId: runtimeItemRow.id,
        itemInstanceId: null,
        targetCharacterId: raceNpc.id,
        effectSelections: {},
      },
      actorId,
    )),
    /That Item is archived or no longer exists/,
  );
  await restoreLifecycleEntityForActor(runtimeItemTarget, actor);
  await permanentlyDeleteLifecycleEntityForActor(runtimeItemTarget, actor);
  sharedIds.splice(
    sharedIds.findIndex((candidate) => (
      candidate.entityKind === runtimeItemTarget.entityKind
      && candidate.entityId === runtimeItemTarget.entityId
    )),
    1,
  );
  await assert.rejects(
    db.transaction((tx) => executeCharacterItemUseInCallerTransaction(
      tx,
      {
        sourceCharacterId: raceNpc.id,
        itemId: runtimeItemRow.id,
        itemInstanceId: null,
        targetCharacterId: raceNpc.id,
        effectSelections: {},
      },
      actorId,
    )),
    /That Item is archived or no longer exists/,
  );

  assert.equal(
    (await previewLifecycleEntityForActor({ entityKind: "player-character", entityId: playerCharacter.id }, actor)).canDelete,
    true,
  );
  await permanentlyDeleteLifecycleEntityForActor(
    { entityKind: "player-character", entityId: playerCharacter.id },
    actor,
  );

  const sentinelBeforeTargetDeletion = await snapshotCampaignGraph(sentinelCampaignId);
  const campaignPreview = await previewLifecycleEntityForActor(
    { entityKind: "campaign", entityId: campaignId },
    actor,
  );
  assert.equal(campaignPreview.canDelete, true);
  assert.equal(
    campaignPreview.dependencies.find(({ label }) => label === "Sessions")?.count,
    1,
  );
  await assert.rejects(
    permanentlyDeleteLifecycleEntityForActor(
      { entityKind: "campaign", entityId: campaignId },
      actor,
      `${campaignName}-wrong`,
    ),
    /exact name/,
  );
  await permanentlyDeleteLifecycleEntityForActor(
    { entityKind: "campaign", entityId: campaignId },
    actor,
    campaignName,
  );
  campaignIds.splice(campaignIds.findIndex(({ id }) => id === campaignId), 1);

  assert.deepEqual(
    await snapshotCampaignGraph(sentinelCampaignId),
    sentinelBeforeTargetDeletion,
    "another Campaign's complete logical graph must remain unchanged",
  );
  assert.equal(
    (await db.select({ id: chatRoom.id }).from(chatRoom).where(eq(chatRoom.id, room.id))).length,
    0,
    "the deleted Campaign's Chat room is part of its graph",
  );

  for (const target of sharedTargets) {
    assert.equal((await previewLifecycleEntityForActor(target, actor)).canDelete, true);
    await permanentlyDeleteLifecycleEntityForActor(target, actor);
    sharedIds.splice(
      sharedIds.findIndex((candidate) => (
        candidate.entityKind === target.entityKind && candidate.entityId === target.entityId
      )),
      1,
    );
  }

  await assert.rejects(
    permanentlyDeleteLifecycleEntityForActor(
      { entityKind: "campaign", entityId: sentinelCampaignId },
      actor,
      sentinelName,
      {
        afterCampaignDeleteStep(tableName) {
          if (tableName === "campaign_player") throw new Error("forced lifecycle rollback");
        },
      },
    ),
    /forced lifecycle rollback/,
  );
  assert.deepEqual(
    await snapshotCampaignGraph(sentinelCampaignId),
    sentinelBeforeTargetDeletion,
    "a failed Campaign deletion must roll back every row in its complete logical graph",
  );
  await permanentlyDeleteLifecycleEntityForActor(
    { entityKind: "campaign", entityId: sentinelCampaignId },
    actor,
    sentinelName,
  );
  campaignIds.splice(campaignIds.findIndex(({ id }) => id === sentinelCampaignId), 1);

  const auditRows = await db.select({ action: lifecycleAuditEvent.action })
    .from(lifecycleAuditEvent)
    .where(eq(lifecycleAuditEvent.actorUserId, actorId));
  assert.ok(auditRows.some(({ action }) => action === "archive"));
  assert.ok(auditRows.some(({ action }) => action === "restore"));
  assert.ok(auditRows.some(({ action }) => action === "delete"));
});
