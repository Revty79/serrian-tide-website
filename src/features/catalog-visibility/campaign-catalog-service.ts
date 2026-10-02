import "server-only";
import { loadRecursiveSkillLibrary } from "@/features/skills/recursive-skill-library-service";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { race } from "@/db/race-schema";
import { item, itemTagCatalog, itemTagLink } from "@/db/item-schema";
import { campaignRace, campaignAllowedRace, campaignInventoryItem, campaignInventoryTag } from "@/db/realm-schema";
import { buildCampaignInventoryPool, createCampaignInventoryPersistence, sortCampaignInventoryTags, type CampaignInventoryItemRecord } from "@/features/campaigns/campaign-inventory";
import type { CampaignReferenceData } from "@/app/heavens/campaigns/actions";
import { catalogAncestorIds, catalogBrowseWhere, catalogSourceLabel, getCatalogBrowseState, itemDiscoveryWhere } from "./catalog-query";
import { itemTagDiscoveryWhere } from "./item-catalog-service";

/** The caller authorizes Campaign access; discovery belongs to its creator. */
export async function loadCampaignCatalogReferences(creatorId: string, campaignId?: number): Promise<CampaignReferenceData> {
  const [world, playable, retainedTags] = campaignId ? await Promise.all([
    db.select({ id: campaignRace.raceId }).from(campaignRace).where(eq(campaignRace.campaignId, campaignId)),
    db.select({ id: campaignAllowedRace.raceId }).from(campaignAllowedRace).where(eq(campaignAllowedRace.campaignId, campaignId)),
    db.select({ id: campaignInventoryTag.tagId }).from(campaignInventoryTag).where(eq(campaignInventoryTag.campaignId, campaignId)),
  ]) : [[], [], []];
  const retained = new Set([...world, ...playable].map(({ id }) => id));
  const visibility = await getCatalogBrowseState(creatorId, "race");
  const fields = { id: race.id, name: race.name, size: race.size, parentRaceId: race.parentRaceId, isSystemCanon: race.isSystemCanon, createdByUserId: race.createdByUserId };
  const matches = await db.select(fields).from(race).where(catalogBrowseWhere(race, creatorId, visibility, isNull(race.archivedAt))).orderBy(asc(race.name), asc(race.id));
  const matchIds = new Set(matches.map(({ id }) => id));
  const included = visibility.enabled ? await catalogAncestorIds("race", [...new Set([...matchIds, ...retained])]) : [...retained];
  const additional = included.filter((id) => !matchIds.has(id));
  if (additional.length) matches.push(...await db.select(fields).from(race).where(inArray(race.id, additional)));
  const tags = await db.select({ id: itemTagCatalog.id, name: itemTagCatalog.name, tagGroup: itemTagCatalog.tagGroup, description: itemTagCatalog.description })
    .from(itemTagCatalog).where(await itemTagDiscoveryWhere(creatorId, retainedTags.map(({ id }) => id)));
  return { skillLibrary: await loadRecursiveSkillLibrary(), races: matches.map(({ isSystemCanon, createdByUserId, ...row }) => ({ ...row,
    catalogSource: catalogSourceLabel({ isSystemCanon, createdByUserId }, creatorId, !matchIds.has(row.id) && !retained.has(row.id)),
    existingSelection: retained.has(row.id) && !matchIds.has(row.id),
    existingPlayableSelection: playable.some(({ id }) => id === row.id),
  })), tags: sortCampaignInventoryTags(tags) };
}

const itemFields = { id: item.id, canonicalId: item.canonicalId, name: item.name, catalogScope: item.catalogScope,
  equipmentGroup: item.equipmentGroup, recordType: item.recordType, family: item.family, category: item.category, credits: item.credits,
  isSystemCanon: item.isSystemCanon, createdByUserId: item.createdByUserId };

export async function loadCampaignItemChoices(creatorId: string, input: { campaignId: number | null; selectedTagIds: number[]; selectedItemIds: number[] }) {
  const selection = createCampaignInventoryPersistence(input.selectedTagIds, input.selectedItemIds);
  const retainedRows = input.campaignId ? await db.select({ id: campaignInventoryItem.itemId }).from(campaignInventoryItem).where(eq(campaignInventoryItem.campaignId, input.campaignId)) : [];
  const retained = new Set(retainedRows.map(({ id }) => id));
  const visible = await itemDiscoveryWhere(creatorId, isNull(item.archivedAt));
  const [tagged, selected] = await Promise.all([
    selection.tagIds.length ? db.select({ tagId: itemTagLink.tagId, ...itemFields }).from(itemTagLink).innerJoin(item, eq(item.id, itemTagLink.itemId))
      .where(and(inArray(itemTagLink.tagId, selection.tagIds), visible)) : [],
    selection.itemIds.length ? db.select({ ...itemFields, discoverable: visible! }).from(item)
      .where(and(inArray(item.id, selection.itemIds), or(visible, retained.size ? inArray(item.id, [...retained]) : undefined))) : [],
  ]);
  const record = ({ isSystemCanon, createdByUserId, ...row }: Omit<typeof tagged[number], "tagId">): CampaignInventoryItemRecord => ({
    id: row.id, canonicalId: row.canonicalId, name: row.name, recordType: row.recordType, family: row.family, category: row.category, credits: row.credits,
    catalogScope: row.catalogScope === "inventory" ? "inventory" : "equipment",
    equipmentGroup: ["weapon", "armor", "general"].includes(row.equipmentGroup ?? "") ? row.equipmentGroup as "weapon" | "armor" | "general" : null,
    catalogSource: catalogSourceLabel({ isSystemCanon, createdByUserId }, creatorId),
  });
  return buildCampaignInventoryPool([tagged.map(record)], selected.map((row) => ({ ...record(row), existingSelection: !row.discoverable && retained.has(row.id) })));
}
