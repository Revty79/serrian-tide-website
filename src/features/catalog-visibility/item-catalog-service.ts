import "server-only";
import { getCatalogManagementState, catalogManagementOrder, catalogCreatorLabel } from "./admin-catalog-query";
import type { AdminCatalogBrowse } from "./admin-catalog-browse";
import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { item, itemTagCatalog, itemTagLink, itemRuntimeProfile, weaponProfile, armorProfile, type ItemCatalogScope } from "@/db/item-schema";
import type { ItemFacets, ItemLibraryFilters, ItemLibraryResult } from "@/app/heavens/items/actions";
import type { ItemUseMode } from "@/features/items/item-runtime";
import { catalogContextWhere, catalogAncestorIds, catalogBrowseWhere, catalogSourceLabel, getCatalogBrowseState, itemDiscoveryWhere } from "./catalog-query";
import { orderCatalogLineage } from "./catalog-lineage";

async function itemPool(actorId: string, scope: ItemCatalogScope, archived: boolean, review: boolean, adminBrowse?: AdminCatalogBrowse) {
  if (!["equipment", "inventory"].includes(scope)) throw new Error("Unknown Item catalog scope.");
  const visibility = await getCatalogManagementState(actorId, scope, adminBrowse);
  if (review) {
    const [admin] = await db.select({ id: userRole.userId }).from(userRole).where(and(eq(userRole.userId, actorId), eq(userRole.role, "admin")));
    if (!admin) throw new Error("Administrator access is required for Needs Canon Review.");
  }
  const conditions = [eq(item.catalogScope, scope), archived ? isNotNull(item.archivedAt) : isNull(item.archivedAt)];
  return { visibility, where: review ? catalogBrowseWhere(item, actorId, { ...visibility, admin: { ...visibility.admin!, options: { ...visibility.admin!.options, all: true } } }, ...conditions, eq(item.isSystemCanon, false)) : catalogBrowseWhere(item, actorId, visibility, ...conditions) };
}

const summaryFields = {
  id: item.id, canonicalId: item.canonicalId, name: item.name, catalogScope: item.catalogScope,
  equipmentGroup: item.equipmentGroup, recordType: item.recordType, family: item.family, category: item.category,
  isMagical: item.isMagical, useMode: itemRuntimeProfile.useMode, archivedAt: item.archivedAt,
  parentId: item.parentItemId, isSystemCanon: item.isSystemCanon, createdByUserId: item.createdByUserId,
};

export async function loadItemCatalog(actorId: string, filters: ItemLibraryFilters): Promise<ItemLibraryResult> {
  const { visibility, where: poolWhere } = await itemPool(actorId, filters.catalogScope, Boolean(filters.archived), Boolean(filters.needsCanonReview), filters.adminBrowse);
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 40)));
  const conditions: (SQL | undefined)[] = [poolWhere];
  const search = filters.search?.trim();
  if (search) conditions.push(or(ilike(item.name, `%${search}%`), ilike(item.canonicalId, `%${search}%`)));
  if (filters.equipmentGroup?.trim()) conditions.push(eq(item.equipmentGroup, filters.equipmentGroup.trim()));
  if (filters.recordType?.trim()) conditions.push(eq(item.recordType, filters.recordType.trim()));
  if (filters.category?.trim()) conditions.push(eq(item.category, filters.category.trim()));
  if (filters.tag?.trim()) conditions.push(sql`exists(select 1 from ${itemTagLink} join ${itemTagCatalog} on ${itemTagCatalog.id} = ${itemTagLink.tagId} where ${itemTagLink.itemId} = ${item.id} and ${itemTagCatalog.name} = ${filters.tag.trim()})`);
  const where = and(...conditions);
  const [countRow] = await db.select({ value: count() }).from(item).where(where);
  const total = Number(countRow?.value ?? 0);
  const rows = await db.select(summaryFields).from(item).leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
    .where(where).orderBy(...catalogManagementOrder(item, item.name, visibility)).limit(pageSize).offset((page - 1) * pageSize);
  const matches = new Set(rows.map(({ id }) => id));
  if (matches.size) {
    const context = (await catalogAncestorIds("item", [...matches])).filter((id) => !matches.has(id));
    if (context.length) rows.push(...await db.select(summaryFields).from(item).leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id)).where(and(inArray(item.id, context), catalogContextWhere(item, actorId, visibility))));
  }
  const ids = rows.map(({ id }) => id);
  const [tags, weapons, armor] = ids.length ? await Promise.all([
    db.select({ itemId: itemTagLink.itemId, name: itemTagCatalog.name }).from(itemTagLink).innerJoin(itemTagCatalog, eq(itemTagCatalog.id, itemTagLink.tagId)).where(inArray(itemTagLink.itemId, ids)).orderBy(asc(itemTagCatalog.name)),
    db.select({ itemId: weaponProfile.itemId }).from(weaponProfile).where(inArray(weaponProfile.itemId, ids)),
    db.select({ itemId: armorProfile.itemId }).from(armorProfile).where(inArray(armorProfile.itemId, ids)),
  ]) : [[], [], []];
  return { visibility, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)),
    items: orderCatalogLineage(rows).map(({ isSystemCanon, createdByUserId, ...row }) => ({
      ...row, creatorLabel: catalogCreatorLabel(visibility, createdByUserId), catalogSource: catalogSourceLabel({ isSystemCanon, createdByUserId }, actorId, !matches.has(row.id)),
      archivedAt: row.archivedAt?.toISOString() ?? null, useMode: (row.useMode ?? "none") as ItemUseMode,
      tags: tags.filter((tag) => tag.itemId === row.id).map(({ name }) => name),
      hasWeaponProfile: weapons.some(({ itemId }) => itemId === row.id), hasArmorProfile: armor.some(({ itemId }) => itemId === row.id),
    })),
  };
}

export async function loadItemFacets(actorId: string, scope: ItemCatalogScope, archived = false, review = false, adminBrowse?: AdminCatalogBrowse): Promise<ItemFacets> {
  const { where } = await itemPool(actorId, scope, archived, review, adminBrowse);
  const [types, categories, tags] = await Promise.all([
    db.selectDistinct({ value: item.recordType }).from(item).where(where).orderBy(asc(item.recordType)),
    db.selectDistinct({ value: item.category }).from(item).where(where).orderBy(asc(item.category)),
    db.selectDistinct({ value: itemTagCatalog.name }).from(itemTagCatalog).innerJoin(itemTagLink, eq(itemTagLink.tagId, itemTagCatalog.id)).innerJoin(item, eq(item.id, itemTagLink.itemId)).where(where).orderBy(asc(itemTagCatalog.name)),
  ]);
  return { recordTypes: types.map(({ value }) => value.trim()).filter(Boolean), categories: categories.map(({ value }) => value.trim()).filter(Boolean), tags: tags.map(({ value }) => value.trim()).filter(Boolean) };
}

/** Tags remain shared metadata. Only choices used by visible Items (or retained IDs) appear. */
export async function itemTagDiscoveryWhere(actorId: string, retainedTagIds: number[] = [], scope?: ItemCatalogScope) {
  const where = scope
    ? catalogBrowseWhere(item, actorId, await getCatalogBrowseState(actorId, scope), eq(item.catalogScope, scope), isNull(item.archivedAt))
    : await itemDiscoveryWhere(actorId, isNull(item.archivedAt));
  return or(retainedTagIds.length ? inArray(itemTagCatalog.id, retainedTagIds) : undefined,
    sql`exists(select 1 from ${itemTagLink} join ${item} on ${item.id} = ${itemTagLink.itemId} where ${itemTagLink.tagId} = ${itemTagCatalog.id} and ${where})`);
}
