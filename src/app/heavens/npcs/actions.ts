"use server";

import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  CREATURE_CR_IMPACTS,
  creature,
  type CreatureCrImpact,
} from "@/db/creature-schema";
import { item, itemEffect, itemRuntimeProfile, weaponFiringMode, weaponProfile } from "@/db/item-schema";
import { race } from "@/db/race-schema";
import {
  campaignAllowedRace,
  campaignCharacter,
  campaignCharacterActiveHealthPool,
  campaignCharacterAttribute,
  campaignCharacterInjury,
  campaignCharacterItem,
  campaignCharacterItemInstance,
  campaignCharacterProfile,
  campaignCreatureNpcProfile,
  campaignInventoryItem,
} from "@/db/realm-schema";
import type { CreatureDraft } from "@/app/heavens/creatures/actions";
import {
  normalizeCreatureSnapshotAbilities,
} from "@/features/creatures/creature-ability";
import {
  assertCreatureCanonicalIdsSystemOwned,
  resolveSystemAssignedCreatureIds,
} from "@/features/creatures/creature-canonical-ids";
import {
  buildCreatureNpcSnapshot,
  createCreatureNpcInTransaction,
  normalizeCreatureNpcSnapshot,
  normalizeCreatureNpcSnapshotCore,
  parseCreatureNpcSnapshot,
  readCreatureNpcTemplateInTransaction,
  type CreatureNpcConstructorTransaction,
} from "@/features/creatures/creature-npc-constructor-service";
import { CHARACTER_ATTRIBUTE_KEYS } from "@/features/characters/models";
import {
  assertItemOwnershipStrategy,
  assertNoStackInstanceOwnershipCollision,
  getStartingItemInstanceCharges,
  planOwnedItemInstancePersistence,
  validateCurrentItemCharges,
  type DraftOwnedItemInstance,
} from "@/features/items/item-ownership";
import {
  DEFAULT_ITEM_RUNTIME_PROFILE,
  validateItemRuntimeProfile,
  type ItemRuntimeProfile,
  type ItemUseMode,
} from "@/features/items/item-runtime";
import {
  reconcileEquipmentAfterOwnershipMutationInTransaction,
  validateEquipmentOwnershipMutationInTransaction,
} from "@/features/items/equipment-state-service";
import { assertOwnedRootManager } from "@/features/lifecycle/policy";
import {
  assertNpcCanBeChanged,
  getDetailedNpcHref,
  needsNpcUpgrade,
  normalizeCreateNpcValues,
  normalizeSimpleNpcValues,
  type CreateNpcValues,
  type NpcArchiveStatus,
  type NpcBuildMode,
  type NpcOrigin,
} from "@/features/npcs/npc-workflow";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

export type CreatureNpcDraft = {
  characterId: number;
  campaignId: number;
  creatureId: number;
  creatureName: string;
  campaignName: string;
  name: string;
  roleLabel: string;
  buildMode: NpcBuildMode;
  status: NpcArchiveStatus;
  archivedAt: string | null;
  archiveReason: string;
  personality: string;
  instanceNotes: string;
  hpAdjustment: number;
  baselineSnapshot: CreatureDraft;
  currentSnapshot: CreatureDraft;
  items: Array<{ itemId: number; quantity: number; unitCostCredits: number }>;
  itemInstances: Array<DraftOwnedItemInstance & {
    currentCharges: number;
    acquiredAt: string | null;
  }>;
  authorizedItems: Array<{
    id: number;
    name: string;
    canonicalId: string;
    catalogScope: string;
    equipmentGroup: string | null;
    category: string;
    credits: number | null;
    isMagical: boolean;
    effectCount: number;
    runtimeProfile: ItemRuntimeProfile;
    weaponProfileId: number | null;
    isFirearm: boolean;
    archived: boolean;
  }>;
};

export type NpcOriginOption = {
  id: number;
  origin: NpcOrigin;
  name: string;
  detail: string;
};

export type NpcCampaignSummary = {
  id: number;
  name: string;
};

export type NpcArchiveRecord = {
  id: number;
  campaignId: number;
  name: string;
  roleLabel: string;
  npcKind: NpcOrigin;
  buildMode: NpcBuildMode;
  status: NpcArchiveStatus;
  archivedAt: string | null;
  archiveReason: string;
  sourceId: number | null;
  sourceName: string;
};

export type SimpleNpcDraft = NpcArchiveRecord & {
  personalityDescription: string;
  notes: string;
};

export type CreateNpcResult = {
  characterId: number;
  campaignId: number;
  origin: NpcOrigin;
  buildMode: NpcBuildMode;
  href: string | null;
};

type ItemRuntimeColumns = {
  runtimeUseMode: string | null;
  runtimeQuantityPerUse: number | null;
  runtimeMaximumCharges: number | null;
  runtimeChargesPerUse: number | null;
  runtimeRechargeNotes: string | null;
  runtimeActivationLabel: string | null;
  runtimeUseNotes: string | null;
};

function readItemRuntimeProfile(row: ItemRuntimeColumns): ItemRuntimeProfile {
  const validation = validateItemRuntimeProfile(
    row.runtimeUseMode === null
      ? DEFAULT_ITEM_RUNTIME_PROFILE
      : {
          useMode: row.runtimeUseMode as ItemUseMode,
          quantityPerUse: row.runtimeQuantityPerUse,
          maximumCharges: row.runtimeMaximumCharges,
          chargesPerUse: row.runtimeChargesPerUse,
          rechargeNotes: row.runtimeRechargeNotes,
          activationLabel: row.runtimeActivationLabel,
          useNotes: row.runtimeUseNotes,
        },
  );
  if (!validation.valid) throw new Error(validation.issues.map(({ message }) => message).join(" "));
  return validation.profile;
}

type NpcManagerContext = {
  actorUserId: string;
  campaignOwnerUserId: string;
  campaignName: string;
  startingCredits: number;
  campaignArchivedAt: Date | null;
};

async function requireOwner(campaignId: number): Promise<NpcManagerContext> {
  const access = await requireGodOrAdminAccessContext();
  const [campaignRow] = await db
    .select({
      createdByUserId: campaign.createdByUserId,
      name: campaign.name,
      startingCredits: campaign.startingCreditAmount,
      archivedAt: campaign.archivedAt,
    })
    .from(campaign)
    .where(eq(campaign.id, campaignId))
    .limit(1);
  if (!campaignRow) throw new Error("Campaign not found.");
  assertOwnedRootManager(
    { userId: access.session.user.id, roles: access.roles },
    campaignRow.createdByUserId,
    "Campaign",
  );
  return {
    actorUserId: access.session.user.id,
    campaignOwnerUserId: campaignRow.createdByUserId,
    campaignName: campaignRow.name,
    startingCredits: campaignRow.startingCredits,
    campaignArchivedAt: campaignRow.archivedAt,
  };
}

async function requireOwnerInTransaction(
  tx: CreatureNpcConstructorTransaction,
  campaignId: number,
  actorUserId: string,
): Promise<NpcManagerContext> {
  const [campaignRow] = await tx
    .select({
      createdByUserId: campaign.createdByUserId,
      name: campaign.name,
      startingCredits: campaign.startingCreditAmount,
      archivedAt: campaign.archivedAt,
    })
    .from(campaign)
    .where(eq(campaign.id, campaignId))
    .limit(1)
    .for("update");
  if (!campaignRow) throw new Error("Campaign not found.");
  const roleRows = await tx
    .select({ role: userRole.role })
    .from(userRole)
    .where(eq(userRole.userId, actorUserId));
  assertOwnedRootManager(
    { userId: actorUserId, roles: roleRows.map(({ role }) => role) },
    campaignRow.createdByUserId,
    "Campaign",
  );
  return {
    actorUserId,
    campaignOwnerUserId: campaignRow.createdByUserId,
    campaignName: campaignRow.name,
    startingCredits: campaignRow.startingCredits,
    campaignArchivedAt: campaignRow.archivedAt,
  };
}

function parseSnapshot(value: string, label: string, hpAdjustment = 0): CreatureDraft {
  return parseCreatureNpcSnapshot(value, label, hpAdjustment);
}

export async function createCreatureNpc(
  campaignId: number,
  creatureId: number,
): Promise<CreatureNpcDraft> {
  const manager = await requireOwner(campaignId);
  if (manager.campaignArchivedAt) {
    throw new Error("Restore this Campaign before creating an NPC.");
  }
  const [source] = await db.select({
    name: creature.canonicalName,
    roleLabel: creature.creatureType,
    fallbackRoleLabel: creature.family,
  }).from(creature).where(and(
    eq(creature.id, creatureId),
    isNull(creature.archivedAt),
  )).limit(1);
  if (!source) throw new Error("The selected master Creature is archived or no longer exists.");
  const created = await createNpc({
    campaignId,
    origin: "creature",
    buildMode: "detailed",
    sourceId: creatureId,
    name: source.name,
    roleLabel: source.roleLabel.trim() || source.fallbackRoleLabel.trim() || "Creature",
  });

  revalidatePath("/heavens/npcs");
  return getCreatureNpc(created.characterId);
}

export async function listNpcOrigins(campaignId: number): Promise<NpcOriginOption[]> {
  const manager = await requireOwner(campaignId);
  if (manager.campaignArchivedAt) return [];
  const raceRows = await db.select({
    id: race.id,
    name: race.name,
    detail: race.size,
  }).from(campaignAllowedRace)
    .innerJoin(race, eq(race.id, campaignAllowedRace.raceId))
    .where(and(
      eq(campaignAllowedRace.campaignId, campaignId),
      isNull(race.archivedAt),
    ))
    .orderBy(asc(campaignAllowedRace.sortOrder), asc(race.name), asc(race.id));
  const creatureRows = await db.select({
    id: creature.id,
    name: creature.canonicalName,
    family: creature.family,
    creatureType: creature.creatureType,
  }).from(creature)
    .where(isNull(creature.archivedAt))
    .orderBy(asc(creature.canonicalName), asc(creature.id));
  return [
    ...raceRows.map((entry) => ({
      id: entry.id,
      origin: "race" as const,
      name: entry.name,
      detail: entry.detail || "Race",
    })),
    ...creatureRows.map((entry) => ({
      id: entry.id,
      origin: "creature" as const,
      name: entry.name,
      detail: entry.creatureType || entry.family || "Creature",
    })),
  ];
}

export async function listNpcCampaigns(): Promise<NpcCampaignSummary[]> {
  const access = await requireGodOrAdminAccessContext();
  return db.select({ id: campaign.id, name: campaign.name })
    .from(campaign)
    .where(and(
      isNull(campaign.archivedAt),
      access.roles.includes("admin")
        ? undefined
        : eq(campaign.createdByUserId, access.session.user.id),
    ))
    .orderBy(asc(campaign.name), asc(campaign.id));
}

export async function createNpc(input: CreateNpcValues): Promise<CreateNpcResult> {
  const normalized = normalizeCreateNpcValues(input);
  const access = await requireGodOrAdminAccessContext();
  const characterId = await db.transaction(async (tx) => {
    const manager = await requireOwnerInTransaction(
      tx,
      normalized.campaignId,
      access.session.user.id,
    );
    if (manager.campaignArchivedAt) {
      throw new Error("Restore this Campaign before creating an NPC.");
    }
    await tx.insert(campaignPlayer).values({
      campaignId: normalized.campaignId,
      userId: manager.campaignOwnerUserId,
      isNpcController: true,
    }).onConflictDoNothing();

    if (normalized.origin === "race") {
      const [source] = await tx.select({ id: race.id })
        .from(race)
        .where(and(eq(race.id, normalized.sourceId), isNull(race.archivedAt)))
        .limit(1)
        .for("update");
      if (!source) {
        throw new Error("The selected origin Race is archived or no longer exists.");
      }
      const [allowed] = await tx.select({ raceId: campaignAllowedRace.raceId })
        .from(campaignAllowedRace)
        .where(and(
          eq(campaignAllowedRace.campaignId, normalized.campaignId),
          eq(campaignAllowedRace.raceId, normalized.sourceId),
        ))
        .limit(1);
      if (!allowed) throw new Error("The selected origin Race is not allowed in this Campaign.");
      const [created] = await tx.insert(campaignCharacter).values({
        campaignId: normalized.campaignId,
        playerUserId: manager.campaignOwnerUserId,
        name: normalized.name,
        isNpc: true,
        npcKind: "race",
        npcBuildMode: normalized.buildMode,
        npcRoleLabel: normalized.roleLabel,
      }).returning({ id: campaignCharacter.id });
      if (!created) throw new Error("Race NPC could not be created.");
      await tx.insert(campaignCharacterProfile).values({
        characterId: created.id,
        raceId: normalized.sourceId,
        personality: normalized.personalityDescription,
        backstory: normalized.notes,
        creditsRemaining: manager.startingCredits,
      });
      await tx.insert(campaignCharacterAttribute).values(
        CHARACTER_ATTRIBUTE_KEYS.map((attributeKey) => ({
          characterId: created.id,
          attributeKey,
          value: 25,
        })),
      );
      return created.id;
    }

    const template = await readCreatureNpcTemplateInTransaction(
      tx,
      normalized.sourceId,
      { activeOnly: true },
    );
    if (!template) {
      throw new Error("The selected master Creature is archived or no longer exists.");
    }
    return createCreatureNpcInTransaction(tx, {
      campaignId: normalized.campaignId,
      controllerUserId: manager.campaignOwnerUserId,
      creatureId: normalized.sourceId,
      name: normalized.name,
      roleLabel: normalized.roleLabel,
      buildMode: normalized.buildMode,
      personalityDescription: normalized.personalityDescription,
      notes: normalized.notes,
      snapshot: buildCreatureNpcSnapshot(template),
    });
  });

  revalidatePath("/heavens/npcs");
  revalidatePath("/heavens");
  return {
    characterId,
    campaignId: normalized.campaignId,
    origin: normalized.origin,
    buildMode: normalized.buildMode,
    href: normalized.buildMode === "detailed"
      ? getDetailedNpcHref({
          campaignId: normalized.campaignId,
          characterId,
          origin: normalized.origin,
        })
      : null,
  };
}

export async function listNpcArchive(
  campaignId: number,
  status: NpcArchiveStatus = "active",
): Promise<NpcArchiveRecord[]> {
  await requireOwner(campaignId);
  const rows = await db.select({
    id: campaignCharacter.id,
    campaignId: campaignCharacter.campaignId,
    name: campaignCharacter.name,
    roleLabel: campaignCharacter.npcRoleLabel,
    npcKind: campaignCharacter.npcKind,
    buildMode: campaignCharacter.npcBuildMode,
    archivedAt: campaignCharacter.archivedAt,
    archiveReason: campaignCharacter.archiveReason,
    raceId: campaignCharacterProfile.raceId,
    raceName: race.name,
    creatureId: campaignCreatureNpcProfile.creatureId,
    creatureName: creature.canonicalName,
  }).from(campaignCharacter)
    .leftJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id))
    .leftJoin(race, eq(race.id, campaignCharacterProfile.raceId))
    .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
    .leftJoin(creature, eq(creature.id, campaignCreatureNpcProfile.creatureId))
    .where(and(
      eq(campaignCharacter.campaignId, campaignId),
      eq(campaignCharacter.isNpc, true),
      status === "archived"
        ? isNotNull(campaignCharacter.archivedAt)
        : isNull(campaignCharacter.archivedAt),
    ))
    .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));

  return rows.map((row) => {
    const npcKind: NpcOrigin = row.npcKind === "creature" ? "creature" : "race";
    const sourceId = npcKind === "creature" ? row.creatureId : row.raceId;
    const sourceName = npcKind === "creature"
      ? row.creatureName ?? "Creature source unavailable"
      : row.raceName ?? "Race source unavailable";
    return {
      id: row.id,
      campaignId: row.campaignId,
      name: row.name,
      roleLabel: row.roleLabel,
      npcKind,
      buildMode: row.buildMode === "simple" ? "simple" : "detailed",
      status,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      archiveReason: row.archiveReason,
      sourceId,
      sourceName,
    };
  });
}

export async function getSimpleNpc(characterId: number): Promise<SimpleNpcDraft> {
  const [row] = await db.select({
    id: campaignCharacter.id,
    campaignId: campaignCharacter.campaignId,
    name: campaignCharacter.name,
    roleLabel: campaignCharacter.npcRoleLabel,
    npcKind: campaignCharacter.npcKind,
    buildMode: campaignCharacter.npcBuildMode,
    archivedAt: campaignCharacter.archivedAt,
    archiveReason: campaignCharacter.archiveReason,
    raceId: campaignCharacterProfile.raceId,
    raceName: race.name,
    racePersonality: campaignCharacterProfile.personality,
    raceNotes: campaignCharacterProfile.backstory,
    creatureId: campaignCreatureNpcProfile.creatureId,
    creatureName: creature.canonicalName,
    creaturePersonality: campaignCreatureNpcProfile.personality,
    creatureNotes: campaignCreatureNpcProfile.instanceNotes,
  }).from(campaignCharacter)
    .leftJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id))
    .leftJoin(race, eq(race.id, campaignCharacterProfile.raceId))
    .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
    .leftJoin(creature, eq(creature.id, campaignCreatureNpcProfile.creatureId))
    .where(and(eq(campaignCharacter.id, characterId), eq(campaignCharacter.isNpc, true)))
    .limit(1);
  if (!row || row.buildMode !== "simple") throw new Error("Simple NPC not found.");
  await requireOwner(row.campaignId);
  const npcKind: NpcOrigin = row.npcKind === "creature" ? "creature" : "race";
  return {
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    roleLabel: row.roleLabel,
    npcKind,
    buildMode: "simple",
    status: row.archivedAt ? "archived" : "active",
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archiveReason: row.archiveReason,
    sourceId: npcKind === "creature" ? row.creatureId : row.raceId,
    sourceName: npcKind === "creature"
      ? row.creatureName ?? "Creature source unavailable"
      : row.raceName ?? "Race source unavailable",
    personalityDescription: npcKind === "creature"
      ? row.creaturePersonality ?? ""
      : row.racePersonality ?? "",
    notes: npcKind === "creature" ? row.creatureNotes ?? "" : row.raceNotes ?? "",
  };
}

export async function saveSimpleNpc(input: SimpleNpcDraft): Promise<SimpleNpcDraft> {
  const normalized = normalizeSimpleNpcValues({
    characterId: input.id,
    campaignId: input.campaignId,
    name: input.name,
    roleLabel: input.roleLabel,
    personalityDescription: input.personalityDescription,
    notes: input.notes,
  });
  const access = await requireGodOrAdminAccessContext();
  await db.transaction(async (tx) => {
    await requireOwnerInTransaction(tx, normalized.campaignId, access.session.user.id);
    const [locked] = await tx.select({
      id: campaignCharacter.id,
      npcKind: campaignCharacter.npcKind,
      buildMode: campaignCharacter.npcBuildMode,
      archivedAt: campaignCharacter.archivedAt,
    }).from(campaignCharacter).where(and(
      eq(campaignCharacter.id, normalized.characterId),
      eq(campaignCharacter.campaignId, normalized.campaignId),
      eq(campaignCharacter.isNpc, true),
    )).limit(1).for("update");
    if (!locked || locked.buildMode !== "simple") throw new Error("Simple NPC not found.");
    assertNpcCanBeChanged({ archivedAt: locked.archivedAt, operation: "save" });
    await tx.update(campaignCharacter).set({
      name: normalized.name,
      npcRoleLabel: normalized.roleLabel,
      updatedAt: new Date(),
    }).where(eq(campaignCharacter.id, normalized.characterId));
    if (locked.npcKind === "creature") {
      const updated = await tx.update(campaignCreatureNpcProfile).set({
        personality: normalized.personalityDescription,
        instanceNotes: normalized.notes,
        updatedAt: new Date(),
      }).where(eq(campaignCreatureNpcProfile.characterId, normalized.characterId))
        .returning({ characterId: campaignCreatureNpcProfile.characterId });
      if (!updated.length) throw new Error("Creature NPC profile is missing.");
    } else {
      const updated = await tx.update(campaignCharacterProfile).set({
        personality: normalized.personalityDescription,
        backstory: normalized.notes,
        updatedAt: new Date(),
      }).where(eq(campaignCharacterProfile.characterId, normalized.characterId))
        .returning({ characterId: campaignCharacterProfile.characterId });
      if (!updated.length) throw new Error("Race NPC profile is missing.");
    }
  });
  revalidatePath("/heavens/npcs");
  return getSimpleNpc(normalized.characterId);
}

export async function upgradeNpcToDetailed(characterId: number): Promise<CreateNpcResult> {
  if (!Number.isSafeInteger(characterId) || characterId <= 0) {
    throw new Error("A saved NPC must be selected for upgrade.");
  }
  const access = await requireGodOrAdminAccessContext();
  const [target] = await db.select({ campaignId: campaignCharacter.campaignId })
    .from(campaignCharacter)
    .where(and(eq(campaignCharacter.id, characterId), eq(campaignCharacter.isNpc, true)))
    .limit(1);
  if (!target) throw new Error("NPC not found.");
  const upgraded = await db.transaction(async (tx) => {
    await requireOwnerInTransaction(tx, target.campaignId, access.session.user.id);
    const [locked] = await tx.select({
      id: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      npcKind: campaignCharacter.npcKind,
      buildMode: campaignCharacter.npcBuildMode,
      archivedAt: campaignCharacter.archivedAt,
    }).from(campaignCharacter).where(and(
      eq(campaignCharacter.id, characterId),
      eq(campaignCharacter.campaignId, target.campaignId),
      eq(campaignCharacter.isNpc, true),
    )).limit(1).for("update");
    if (!locked) throw new Error("NPC not found.");
    assertNpcCanBeChanged({ archivedAt: locked.archivedAt, operation: "upgrade" });
    const origin: NpcOrigin = locked.npcKind === "creature" ? "creature" : "race";
    const buildMode: NpcBuildMode = locked.buildMode === "simple" ? "simple" : "detailed";
    if (needsNpcUpgrade(buildMode)) {
      const [profile] = await tx.select({
        characterId: campaignCharacterProfile.characterId,
        raceId: campaignCharacterProfile.raceId,
      }).from(campaignCharacterProfile)
        .where(eq(campaignCharacterProfile.characterId, locked.id))
        .limit(1)
        .for("update");
      if (!profile) throw new Error("NPC Character profile is missing.");
      if (origin === "race" && profile.raceId === null) {
        throw new Error("Select a valid origin Race before upgrading this NPC.");
      }
      if (origin === "creature") {
        const [creatureProfile] = await tx.select({ characterId: campaignCreatureNpcProfile.characterId })
          .from(campaignCreatureNpcProfile)
          .where(eq(campaignCreatureNpcProfile.characterId, locked.id))
          .limit(1)
          .for("update");
        if (!creatureProfile) throw new Error("Creature NPC profile is missing.");
      }
      await tx.insert(campaignCharacterAttribute).values(
        CHARACTER_ATTRIBUTE_KEYS.map((attributeKey) => ({
          characterId: locked.id,
          attributeKey,
          value: 25,
        })),
      ).onConflictDoNothing();
      await tx.update(campaignCharacter).set({
        npcBuildMode: "detailed",
        updatedAt: new Date(),
      }).where(eq(campaignCharacter.id, locked.id));
    }
    return {
      characterId: locked.id,
      campaignId: locked.campaignId,
      origin,
    };
  });
  revalidatePath("/heavens/npcs");
  revalidatePath(`/heavens/npcs/${upgraded.characterId}`);
  revalidatePath(`/heavens/characters/${upgraded.characterId}`);
  return {
    ...upgraded,
    buildMode: "detailed",
    href: getDetailedNpcHref(upgraded),
  };
}

export async function getCreatureNpc(characterId: number): Promise<CreatureNpcDraft> {
  const [core] = await db
    .select({
      characterId: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      name: campaignCharacter.name,
      npcKind: campaignCharacter.npcKind,
      roleLabel: campaignCharacter.npcRoleLabel,
      buildMode: campaignCharacter.npcBuildMode,
      archivedAt: campaignCharacter.archivedAt,
      archiveReason: campaignCharacter.archiveReason,
      campaignName: campaign.name,
    })
    .from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .where(and(eq(campaignCharacter.id, characterId), eq(campaignCharacter.isNpc, true)))
    .limit(1);
  if (!core || core.npcKind !== "creature") throw new Error("Creature NPC not found.");
  await requireOwner(core.campaignId);

  const [profile] = await db
    .select({
      characterId: campaignCreatureNpcProfile.characterId,
      creatureId: campaignCreatureNpcProfile.creatureId,
      creatureName: creature.canonicalName,
      personality: campaignCreatureNpcProfile.personality,
      instanceNotes: campaignCreatureNpcProfile.instanceNotes,
      hpAdjustment: campaignCreatureNpcProfile.hpAdjustment,
      baselineSnapshotJson: campaignCreatureNpcProfile.baselineSnapshotJson,
      currentSnapshotJson: campaignCreatureNpcProfile.currentSnapshotJson,
    })
    .from(campaignCreatureNpcProfile)
    .innerJoin(creature, eq(creature.id, campaignCreatureNpcProfile.creatureId))
    .where(eq(campaignCreatureNpcProfile.characterId, characterId))
    .limit(1);
  if (!profile) throw new Error("Creature NPC profile is missing.");

  const [ownedItems, ownedItemInstances, authorizedItems] = await Promise.all([
    db.select({
      itemId: campaignCharacterItem.itemId,
      quantity: campaignCharacterItem.quantity,
      unitCostCredits: campaignCharacterItem.unitCostCredits,
      runtimeUseMode: itemRuntimeProfile.useMode,
      runtimeQuantityPerUse: itemRuntimeProfile.quantityPerUse,
      runtimeMaximumCharges: itemRuntimeProfile.maximumCharges,
      runtimeChargesPerUse: itemRuntimeProfile.chargesPerUse,
      runtimeRechargeNotes: itemRuntimeProfile.rechargeNotes,
      runtimeActivationLabel: itemRuntimeProfile.activationLabel,
      runtimeUseNotes: itemRuntimeProfile.useNotes,
      weaponProfileId: weaponProfile.id,
      isFirearm: sql<boolean>`coalesce(lower(trim(${weaponProfile.profileRecordType})) <> 'ammunition' and (${weaponProfile.ammunitionItemId} is not null or exists(select 1 from ${weaponFiringMode} where ${weaponFiringMode.weaponProfileId} = ${weaponProfile.id})), false)`,
    })
      .from(campaignCharacterItem)
      .innerJoin(item, eq(item.id, campaignCharacterItem.itemId))
      .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
      .leftJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
      .where(eq(campaignCharacterItem.characterId, characterId)),
    db.select({
      id: campaignCharacterItemInstance.id,
      itemId: campaignCharacterItemInstance.itemId,
      currentCharges: campaignCharacterItemInstance.currentCharges,
      unitCostCredits: campaignCharacterItemInstance.unitCostCredits,
      acquiredAt: campaignCharacterItemInstance.acquiredAt,
      runtimeUseMode: itemRuntimeProfile.useMode,
      runtimeQuantityPerUse: itemRuntimeProfile.quantityPerUse,
      runtimeMaximumCharges: itemRuntimeProfile.maximumCharges,
      runtimeChargesPerUse: itemRuntimeProfile.chargesPerUse,
      runtimeRechargeNotes: itemRuntimeProfile.rechargeNotes,
      runtimeActivationLabel: itemRuntimeProfile.activationLabel,
      runtimeUseNotes: itemRuntimeProfile.useNotes,
      weaponProfileId: weaponProfile.id,
      isFirearm: sql<boolean>`coalesce(lower(trim(${weaponProfile.profileRecordType})) <> 'ammunition' and (${weaponProfile.ammunitionItemId} is not null or exists(select 1 from ${weaponFiringMode} where ${weaponFiringMode.weaponProfileId} = ${weaponProfile.id})), false)`,
    })
      .from(campaignCharacterItemInstance)
      .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId))
      .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
      .leftJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
      .where(eq(campaignCharacterItemInstance.characterId, characterId))
      .orderBy(asc(campaignCharacterItemInstance.id)),
    db.select({
      id: item.id,
      name: item.name,
      canonicalId: item.canonicalId,
      catalogScope: item.catalogScope,
      equipmentGroup: item.equipmentGroup,
      category: item.category,
      archivedAt: item.archivedAt,
      credits: item.credits,
      isMagical: item.isMagical,
      effectCount: sql<number>`(select count(*)::int from ${itemEffect} where ${itemEffect.itemId} = ${item.id})`,
      runtimeUseMode: itemRuntimeProfile.useMode,
      runtimeQuantityPerUse: itemRuntimeProfile.quantityPerUse,
      runtimeMaximumCharges: itemRuntimeProfile.maximumCharges,
      runtimeChargesPerUse: itemRuntimeProfile.chargesPerUse,
      runtimeRechargeNotes: itemRuntimeProfile.rechargeNotes,
      runtimeActivationLabel: itemRuntimeProfile.activationLabel,
      runtimeUseNotes: itemRuntimeProfile.useNotes,
      weaponProfileId: weaponProfile.id,
      isFirearm: sql<boolean>`coalesce(lower(trim(${weaponProfile.profileRecordType})) <> 'ammunition' and (${weaponProfile.ammunitionItemId} is not null or exists(select 1 from ${weaponFiringMode} where ${weaponFiringMode.weaponProfileId} = ${weaponProfile.id})), false)`,
    }).from(campaignInventoryItem)
      .innerJoin(item, eq(item.id, campaignInventoryItem.itemId))
      .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
      .leftJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
      .where(eq(campaignInventoryItem.campaignId, core.campaignId))
      .orderBy(asc(item.name)),
  ]);

  assertNoStackInstanceOwnershipCollision({
    definitions: [
      ...ownedItems.map((entry) => ({ itemId: entry.itemId, runtimeProfile: readItemRuntimeProfile(entry), requiresExactInstance: entry.isFirearm })),
      ...ownedItemInstances.map((entry) => ({ itemId: entry.itemId, runtimeProfile: readItemRuntimeProfile(entry), requiresExactInstance: entry.isFirearm })),
    ],
    stacks: ownedItems,
    instances: ownedItemInstances,
  });

  return {
    characterId,
    campaignId: core.campaignId,
    creatureId: profile.creatureId,
    creatureName: profile.creatureName,
    campaignName: core.campaignName,
    name: core.name,
    roleLabel: core.roleLabel,
    buildMode: core.buildMode === "simple" ? "simple" : "detailed",
    status: core.archivedAt ? "archived" : "active",
    archivedAt: core.archivedAt?.toISOString() ?? null,
    archiveReason: core.archiveReason,
    personality: profile.personality,
    instanceNotes: profile.instanceNotes,
    hpAdjustment: profile.hpAdjustment,
    baselineSnapshot: parseSnapshot(profile.baselineSnapshotJson, "Baseline snapshot"),
    currentSnapshot: parseSnapshot(profile.currentSnapshotJson, "Current snapshot", profile.hpAdjustment),
    items: ownedItems.map(({ itemId, quantity, unitCostCredits }) => ({ itemId, quantity, unitCostCredits })),
    itemInstances: ownedItemInstances.map((entry) => ({
      draftId: entry.id,
      instanceId: entry.id,
      itemId: entry.itemId,
      currentCharges: validateCurrentItemCharges(entry.currentCharges),
      unitCostCredits: entry.unitCostCredits,
      acquiredAt: entry.acquiredAt.toISOString(),
    })),
    authorizedItems: authorizedItems.map((entry) => ({
      id: entry.id,
      name: entry.name,
      canonicalId: entry.canonicalId,
      catalogScope: entry.catalogScope,
      equipmentGroup: entry.equipmentGroup,
      category: entry.category,
      credits: entry.credits,
      isMagical: entry.isMagical,
      effectCount: entry.effectCount,
      runtimeProfile: readItemRuntimeProfile(entry),
      weaponProfileId: entry.weaponProfileId,
      isFirearm: entry.isFirearm,
      archived: entry.archivedAt !== null,
    })),
  };
}

export async function saveCreatureNpc(input: CreatureNpcDraft): Promise<CreatureNpcDraft> {
  const access = await requireGodOrAdminAccessContext();
  const current = await getCreatureNpc(input.characterId);
  if (current.campaignId !== input.campaignId || current.creatureId !== input.creatureId) {
    throw new Error("Creature NPC identity cannot be changed.");
  }
  const name = input.name.trim();
  const roleLabel = input.roleLabel.trim();
  if (!name) throw new Error("Creature NPC Name is required.");
  if (!roleLabel) throw new Error("NPC Role / Label is required.");
  if (current.buildMode !== "detailed") {
    throw new Error("Use the Simple NPC editor until this NPC is upgraded.");
  }
  assertNpcCanBeChanged({ archivedAt: current.archivedAt, operation: "save" });
  if (!Number.isFinite(input.hpAdjustment)) throw new Error("HP Adjustment must be a number.");
  if (input.currentSnapshot.core.canonicalId !== current.baselineSnapshot.core.canonicalId) {
    throw new Error("The Creature template identity cannot be changed on an individual NPC.");
  }

  const unique = (values: string[], label: string) => {
    const seen = new Set<string>();
    for (const raw of values) {
      const value = raw.trim();
      if (!value) throw new Error(`${label} is required.`);
      const key = value.toLowerCase();
      if (seen.has(key)) throw new Error(`${label} cannot be duplicated.`);
      seen.add(key);
    }
  };
  unique(input.currentSnapshot.attributes.map((row) => row.attributeKey), "Attribute");
  unique(input.currentSnapshot.movement.map((row) => row.movementMode), "Movement Mode");
  unique(input.currentSnapshot.hpPools.map((row) => row.canonicalId), "HP Pool ID");
  unique(input.currentSnapshot.attacks.map((row) => row.canonicalId), "Attack ID");
  unique(input.currentSnapshot.abilities.map((row) => row.canonicalId), "Ability ID");
  assertCreatureCanonicalIdsSystemOwned(input.currentSnapshot.hpPools, current.currentSnapshot.hpPools, "HP Pool");
  assertCreatureCanonicalIdsSystemOwned(input.currentSnapshot.attacks, current.currentSnapshot.attacks, "Attack");
  assertCreatureCanonicalIdsSystemOwned(input.currentSnapshot.abilities, current.currentSnapshot.abilities, "Ability");
  const normalizedAbilities = normalizeCreatureSnapshotAbilities(input.currentSnapshot).abilities.map((ability) => ({
    ...ability,
    crImpact: CREATURE_CR_IMPACTS.includes(ability.crImpact as CreatureCrImpact)
      ? ability.crImpact as CreatureCrImpact
      : "None" as CreatureCrImpact,
  }));
  const submittedSnapshot = {
    ...input.currentSnapshot,
    abilities: normalizedAbilities,
  };
  const assignedIds = resolveSystemAssignedCreatureIds(submittedSnapshot, false);
  const systemAssignedSnapshot = {
    ...submittedSnapshot,
    hpPools: submittedSnapshot.hpPools.map((pool, index) => ({
      ...pool,
      canonicalId: assignedIds.hpPoolCanonicalIds[index],
    })),
    hitLocations: submittedSnapshot.hitLocations.map((location, index) => ({
      ...location,
      hpPoolCanonicalId: assignedIds.hitLocationPoolCanonicalIds[index],
    })),
    attacks: submittedSnapshot.attacks.map((attack, index) => ({
      ...attack,
      canonicalId: assignedIds.attackCanonicalIds[index],
    })),
    abilities: submittedSnapshot.abilities.map((ability, index) => ({
      ...ability,
      canonicalId: assignedIds.abilityCanonicalIds[index],
    })),
  };

  const authorizedIds = new Set(current.authorizedItems.map(({ id }) => id));
  const authorizedById = new Map(current.authorizedItems.map((entry) => [entry.id, entry]));
  const seenItems = new Set<number>();
  const items = input.items.map((entry) => {
    if (!authorizedIds.has(entry.itemId)) throw new Error("Creature NPC inventory must use Campaign-authorized Items.");
    if (seenItems.has(entry.itemId)) throw new Error("An Item can only appear once in Creature NPC inventory.");
    if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) throw new Error("Creature NPC Item quantity must be a positive whole number.");
    seenItems.add(entry.itemId);
    const source = authorizedById.get(entry.itemId);
    if (!source) throw new Error("Creature NPC inventory must use Campaign-authorized Items.");
    const existing = current.items.find((owned) => owned.itemId === entry.itemId);
    if (source.archived && (!existing || entry.quantity > existing.quantity)) {
      throw new Error("Archived Items cannot be added to or increased in Creature NPC inventory.");
    }
    assertItemOwnershipStrategy(source.runtimeProfile, "stack", source.name, {
      requiresExactInstance: source.isFirearm,
      allowLegacyExactStack: true,
    });
    return {
      itemId: entry.itemId,
      quantity: entry.quantity,
      unitCostCredits: source.credits ?? existing?.unitCostCredits ?? 0,
    };
  });

  if (!Array.isArray(input.itemInstances)) throw new Error("Creature NPC Item instances are missing.");
  const existingInstances = new Map(
    current.itemInstances.flatMap((entry) => entry.instanceId === null ? [] : [[entry.instanceId, entry] as const]),
  );
  const seenDraftIds = new Set<number>();
  const seenInstanceIds = new Set<number>();
  const itemInstances = input.itemInstances.map((entry) => {
    if (!Number.isSafeInteger(entry.draftId) || seenDraftIds.has(entry.draftId)) {
      throw new Error("Every Creature NPC Item instance needs a distinct draft identity.");
    }
    seenDraftIds.add(entry.draftId);
    const source = authorizedById.get(entry.itemId);
    if (!source) throw new Error("Creature NPC Item instances must use Campaign-authorized Items.");
    assertItemOwnershipStrategy(source.runtimeProfile, "instance", source.name, {
      requiresExactInstance: source.isFirearm,
    });
    if (entry.instanceId === null) {
      if (entry.draftId >= 0) throw new Error("An unsaved Creature NPC Item instance needs a temporary draft identity.");
      if (source.archived) throw new Error("Archived Items cannot be added as new Creature NPC instances.");
      return {
        ...entry,
        currentCharges: getStartingItemInstanceCharges(source.runtimeProfile, source.isFirearm),
        unitCostCredits: source.credits ?? entry.unitCostCredits,
        acquiredAt: null,
      };
    }
    if (!Number.isInteger(entry.instanceId) || entry.instanceId <= 0 || seenInstanceIds.has(entry.instanceId)) {
      throw new Error("Creature NPC Item instance identity is invalid or duplicated.");
    }
    seenInstanceIds.add(entry.instanceId);
    const existing = existingInstances.get(entry.instanceId);
    if (
      !existing
      || existing.itemId !== entry.itemId
      || existing.currentCharges !== entry.currentCharges
      || Math.abs(existing.unitCostCredits - entry.unitCostCredits) > 0.000001
      || existing.acquiredAt !== entry.acquiredAt
    ) {
      throw new Error("Creature NPC Item instance state and acquisition data cannot be changed here.");
    }
    return entry;
  });
  assertNoStackInstanceOwnershipCollision({
    definitions: current.authorizedItems.map((entry) => ({ itemId: entry.id, runtimeProfile: entry.runtimeProfile, requiresExactInstance: entry.isFirearm })),
    stacks: items,
    instances: itemInstances,
  });

  const normalizedSnapshot = normalizeCreatureNpcSnapshot({
    ...systemAssignedSnapshot,
    id: current.baselineSnapshot.id,
    core: {
      ...normalizeCreatureNpcSnapshotCore(systemAssignedSnapshot.core),
      canonicalId: current.baselineSnapshot.core.canonicalId,
      canonicalName: current.baselineSnapshot.core.canonicalName,
      parentCreatureId: current.baselineSnapshot.core.parentCreatureId,
      parentCreatureName: current.baselineSnapshot.core.parentCreatureName,
      sourceSystem: current.baselineSnapshot.core.sourceSystem,
    },
    derivedCreatures: [],
  }, input.hpAdjustment);
  await db.transaction(async (tx) => {
    await requireOwnerInTransaction(tx, input.campaignId, access.session.user.id);
    const [lockedCharacter] = await tx
      .select({ archivedAt: campaignCharacter.archivedAt })
      .from(campaignCharacter)
      .where(eq(campaignCharacter.id, input.characterId))
      .limit(1)
      .for("update");
    if (!lockedCharacter) throw new Error("Creature NPC not found.");
    assertNpcCanBeChanged({ archivedAt: lockedCharacter.archivedAt, operation: "save" });
    const [lockedProfile] = await tx
      .select({
        currentSnapshotJson: campaignCreatureNpcProfile.currentSnapshotJson,
        hpAdjustment: campaignCreatureNpcProfile.hpAdjustment,
      })
      .from(campaignCreatureNpcProfile)
      .where(eq(campaignCreatureNpcProfile.characterId, input.characterId))
      .limit(1)
      .for("update");
    if (!lockedProfile) throw new Error("Creature NPC profile is missing.");
    const lockedSnapshot = parseSnapshot(
      lockedProfile.currentSnapshotJson,
      "Current snapshot",
      lockedProfile.hpAdjustment,
    );
    const nextPoolKeys = new Set(
      normalizedSnapshot.hpPools.map(({ canonicalId }) => canonicalId.toLocaleLowerCase("en-US")),
    );
    const removedPoolKeys = lockedSnapshot.hpPools
      .map(({ canonicalId }) => canonicalId)
      .filter((canonicalId) => !nextPoolKeys.has(canonicalId.toLocaleLowerCase("en-US")));
    if (removedPoolKeys.length) {
      const [damagedPool] = await tx
        .select({ poolKey: campaignCharacterActiveHealthPool.poolKey })
        .from(campaignCharacterActiveHealthPool)
        .where(and(
          eq(campaignCharacterActiveHealthPool.characterId, input.characterId),
          inArray(campaignCharacterActiveHealthPool.poolKey, removedPoolKeys),
          gt(campaignCharacterActiveHealthPool.damage, 0),
        ))
        .limit(1);
      const [unresolvedInjury] = await tx
        .select({ poolKey: campaignCharacterInjury.poolKey })
        .from(campaignCharacterInjury)
        .where(and(
          eq(campaignCharacterInjury.characterId, input.characterId),
          inArray(campaignCharacterInjury.poolKey, removedPoolKeys),
          eq(campaignCharacterInjury.resolved, false),
        ))
        .limit(1);
      const referencedPoolKey = damagedPool?.poolKey ?? unresolvedInjury?.poolKey;
      if (referencedPoolKey) {
        const currentPool = lockedSnapshot.hpPools.find(
          ({ canonicalId }) => canonicalId === referencedPoolKey,
        );
        throw new Error(
          `${currentPool?.poolName ?? referencedPoolKey} cannot be removed or assigned a new HP Pool ID while it has Active Damage or unresolved Injuries. Heal/resolve that state first.`,
        );
      }
    }
    await tx.update(campaignCharacter).set({
      name,
      npcRoleLabel: roleLabel,
      updatedAt: new Date(),
    }).where(eq(campaignCharacter.id, input.characterId));
    await tx.update(campaignCreatureNpcProfile).set({
      personality: input.personality.trim(),
      instanceNotes: input.instanceNotes.trim(),
      hpAdjustment: input.hpAdjustment,
      currentSnapshotJson: JSON.stringify(normalizedSnapshot),
      updatedAt: new Date(),
    }).where(eq(campaignCreatureNpcProfile.characterId, input.characterId));
    const { removedInstanceIds, newInstances } = planOwnedItemInstancePersistence({
      existingInstanceIds: current.itemInstances.flatMap(
        (entry) => entry.instanceId === null ? [] : [entry.instanceId],
      ),
      drafts: itemInstances,
    });
    await validateEquipmentOwnershipMutationInTransaction(tx, {
      characterId: input.characterId,
      nextStackQuantities: items,
      removedInstanceIds,
    });
    await tx.delete(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, input.characterId));
    if (items.length) {
      await tx.insert(campaignCharacterItem).values(items.map((entry) => ({
        characterId: input.characterId,
        itemId: entry.itemId,
        quantity: entry.quantity,
        unitCostCredits: entry.unitCostCredits,
      })));
    }
    if (removedInstanceIds.length) {
      await tx.delete(campaignCharacterItemInstance).where(and(
        eq(campaignCharacterItemInstance.characterId, input.characterId),
        inArray(campaignCharacterItemInstance.id, removedInstanceIds),
      ));
    }
    if (newInstances.length) {
      await tx.insert(campaignCharacterItemInstance).values(newInstances.map((entry) => ({
        characterId: input.characterId,
        itemId: entry.itemId,
        currentCharges: entry.currentCharges,
        unitCostCredits: entry.unitCostCredits,
      })));
    }
    await reconcileEquipmentAfterOwnershipMutationInTransaction(tx, input.characterId);
  });

  revalidatePath("/heavens/npcs");
  revalidatePath(`/heavens/npcs/${input.characterId}`);
  return getCreatureNpc(input.characterId);
}
