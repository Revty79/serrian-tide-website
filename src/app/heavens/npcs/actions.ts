"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { item } from "@/db/item-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterItem,
  campaignCharacterProfile,
  campaignCreatureNpcProfile,
  campaignInventoryItem,
} from "@/db/realm-schema";
import { getCreature, type CreatureDraft } from "@/app/heavens/creatures/actions";
import { CHARACTER_ATTRIBUTE_KEYS } from "@/features/characters/models";
import { requireGod } from "@/lib/server-access";

export type CreatureNpcDraft = {
  characterId: number;
  campaignId: number;
  creatureId: number;
  creatureName: string;
  campaignName: string;
  name: string;
  personality: string;
  instanceNotes: string;
  hpAdjustment: number;
  baselineSnapshot: CreatureDraft;
  currentSnapshot: CreatureDraft;
  items: Array<{ itemId: number; quantity: number }>;
  authorizedItems: Array<{
    id: number;
    name: string;
    canonicalId: string;
    catalogScope: string;
    equipmentGroup: string | null;
    category: string;
    credits: number | null;
  }>;
};

async function requireOwner(campaignId: number) {
  const session = await requireGod();
  const [owned] = await db
    .select({ id: campaign.id })
    .from(campaign)
    .where(and(eq(campaign.id, campaignId), eq(campaign.createdByUserId, session.user.id)))
    .limit(1);
  if (!owned) throw new Error("Only the Campaign creator can manage its NPCs.");
  return session;
}

function snapshotFromAggregate(aggregate: Awaited<ReturnType<typeof getCreature>>): CreatureDraft {
  return {
    id: aggregate.id,
    core: { ...aggregate.core },
    attributes: aggregate.attributes.map((row) => ({ ...row })),
    movement: aggregate.movement.map((row) => ({ ...row })),
    hpPools: aggregate.hpPools.map((row) => ({ ...row })),
    hitLocations: aggregate.hitLocations.map((row) => ({ ...row })),
    attacks: aggregate.attacks.map((row) => ({ ...row })),
    skillLinks: aggregate.skillLinks.map((row) => ({ ...row })),
    abilities: aggregate.abilities.map((row) => ({ ...row })),
    defenses: aggregate.defenses.map((row) => ({ ...row })),
    uses: aggregate.uses.map((row) => ({ ...row })),
    derivedCreatures: [],
  };
}

function parseSnapshot(value: string, label: string): CreatureDraft {
  try {
    return JSON.parse(value) as CreatureDraft;
  } catch {
    throw new Error(`${label} contains unreadable Creature data.`);
  }
}

export async function createCreatureNpc(
  campaignId: number,
  creatureId: number,
): Promise<CreatureNpcDraft> {
  const session = await requireOwner(campaignId);
  const template = await getCreature(creatureId);
  if (!template) throw new Error("The selected master Creature no longer exists.");
  const snapshot = snapshotFromAggregate(template);
  const [campaignRow] = await db
    .select({ name: campaign.name, startingCredits: campaign.startingCreditAmount })
    .from(campaign)
    .where(eq(campaign.id, campaignId))
    .limit(1);
  if (!campaignRow) throw new Error("Campaign not found.");

  const characterId = await db.transaction(async (tx) => {
    const [created] = await tx.insert(campaignCharacter).values({
      campaignId,
      playerUserId: session.user.id,
      name: template.core.canonicalName,
      isNpc: true,
      npcKind: "creature",
    }).returning({ id: campaignCharacter.id });
    await tx.insert(campaignCharacterProfile).values({
      characterId: created.id,
      creditsRemaining: campaignRow.startingCredits,
    });
    await tx.insert(campaignCharacterAttribute).values(
      CHARACTER_ATTRIBUTE_KEYS.map((attributeKey) => ({ characterId: created.id, attributeKey, value: 25 })),
    );
    await tx.insert(campaignCreatureNpcProfile).values({
      characterId: created.id,
      creatureId,
      personality: "",
      instanceNotes: "",
      hpAdjustment: 0,
      baselineSnapshotJson: JSON.stringify(snapshot),
      currentSnapshotJson: JSON.stringify(snapshot),
    });
    return created.id;
  });

  revalidatePath("/heavens/npcs");
  return getCreatureNpc(characterId);
}

export async function getCreatureNpc(characterId: number): Promise<CreatureNpcDraft> {
  const [core] = await db
    .select({
      characterId: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      name: campaignCharacter.name,
      npcKind: campaignCharacter.npcKind,
      campaignName: campaign.name,
    })
    .from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .where(and(eq(campaignCharacter.id, characterId), eq(campaignCharacter.isNpc, true)))
    .limit(1);
  if (!core || core.npcKind !== "creature") throw new Error("Creature NPC not found.");
  await requireOwner(core.campaignId);

  const [profile] = await db
    .select()
    .from(campaignCreatureNpcProfile)
    .where(eq(campaignCreatureNpcProfile.characterId, characterId))
    .limit(1);
  if (!profile) throw new Error("Creature NPC profile is missing.");

  const [template, ownedItems, authorizedItems] = await Promise.all([
    getCreature(profile.creatureId),
    db.select({ itemId: campaignCharacterItem.itemId, quantity: campaignCharacterItem.quantity })
      .from(campaignCharacterItem)
      .where(eq(campaignCharacterItem.characterId, characterId)),
    db.select({
      id: item.id,
      name: item.name,
      canonicalId: item.canonicalId,
      catalogScope: item.catalogScope,
      equipmentGroup: item.equipmentGroup,
      category: item.category,
      credits: item.credits,
    }).from(campaignInventoryItem)
      .innerJoin(item, eq(item.id, campaignInventoryItem.itemId))
      .where(eq(campaignInventoryItem.campaignId, core.campaignId))
      .orderBy(asc(item.name)),
  ]);

  return {
    characterId,
    campaignId: core.campaignId,
    creatureId: profile.creatureId,
    creatureName: template?.core.canonicalName ?? `Creature ${profile.creatureId}`,
    campaignName: core.campaignName,
    name: core.name,
    personality: profile.personality,
    instanceNotes: profile.instanceNotes,
    hpAdjustment: profile.hpAdjustment,
    baselineSnapshot: parseSnapshot(profile.baselineSnapshotJson, "Baseline snapshot"),
    currentSnapshot: parseSnapshot(profile.currentSnapshotJson, "Current snapshot"),
    items: ownedItems,
    authorizedItems,
  };
}

export async function saveCreatureNpc(input: CreatureNpcDraft): Promise<CreatureNpcDraft> {
  await requireOwner(input.campaignId);
  const current = await getCreatureNpc(input.characterId);
  if (current.campaignId !== input.campaignId || current.creatureId !== input.creatureId) {
    throw new Error("Creature NPC identity cannot be changed.");
  }
  const name = input.name.trim();
  if (!name) throw new Error("Creature NPC Name is required.");
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

  const authorizedIds = new Set(current.authorizedItems.map(({ id }) => id));
  const seenItems = new Set<number>();
  const items = input.items.map((entry) => {
    if (!authorizedIds.has(entry.itemId)) throw new Error("Creature NPC inventory must use Campaign-authorized Items.");
    if (seenItems.has(entry.itemId)) throw new Error("An Item can only appear once in Creature NPC inventory.");
    if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) throw new Error("Creature NPC Item quantity must be a positive whole number.");
    seenItems.add(entry.itemId);
    return entry;
  });

  const normalizedSnapshot: CreatureDraft = {
    ...input.currentSnapshot,
    id: current.baselineSnapshot.id,
    core: {
      ...input.currentSnapshot.core,
      canonicalId: current.baselineSnapshot.core.canonicalId,
      canonicalName: current.baselineSnapshot.core.canonicalName,
      parentCreatureId: current.baselineSnapshot.core.parentCreatureId,
      parentCreatureName: current.baselineSnapshot.core.parentCreatureName,
      sourceSystem: current.baselineSnapshot.core.sourceSystem,
    },
    derivedCreatures: [],
  };

  await db.transaction(async (tx) => {
    await tx.update(campaignCharacter).set({ name, updatedAt: new Date() }).where(eq(campaignCharacter.id, input.characterId));
    await tx.update(campaignCreatureNpcProfile).set({
      personality: input.personality.trim(),
      instanceNotes: input.instanceNotes.trim(),
      hpAdjustment: input.hpAdjustment,
      currentSnapshotJson: JSON.stringify(normalizedSnapshot),
      updatedAt: new Date(),
    }).where(eq(campaignCreatureNpcProfile.characterId, input.characterId));
    await tx.delete(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, input.characterId));
    if (items.length) {
      const itemRows = await tx.select({ id: item.id, credits: item.credits }).from(item).where(inArray(item.id, items.map(({ itemId }) => itemId)));
      const prices = new Map(itemRows.map((row) => [row.id, row.credits ?? 0]));
      await tx.insert(campaignCharacterItem).values(items.map((entry) => ({
        characterId: input.characterId,
        itemId: entry.itemId,
        quantity: entry.quantity,
        unitCostCredits: prices.get(entry.itemId) ?? 0,
      })));
    }
  });

  revalidatePath("/heavens/npcs");
  revalidatePath(`/heavens/npcs/${input.characterId}`);
  return getCreatureNpc(input.characterId);
}
