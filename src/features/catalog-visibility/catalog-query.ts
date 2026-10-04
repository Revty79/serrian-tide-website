import "server-only";
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { catalogVisibilityScopeActivation } from "@/db/catalog-preferences-schema";
import { item } from "@/db/item-schema";
import { bindCatalogPreferenceOperations } from "./catalog-preference-service";
import { classifyCatalogContent, type CatalogKey, type CatalogContentSource, type CatalogVisibilityMode } from "./catalog-visibility";

import { UNATTRIBUTED_CREATOR, type AdminCatalogBrowse, type CatalogCreator } from "./admin-catalog-browse";

export type CatalogBrowseState = { mode: CatalogVisibilityMode; enabled: boolean; admin?: { options: AdminCatalogBrowse; creators: CatalogCreator[] } };
export type CatalogSourceLabel = "canon" | "mine" | "context" | "other";

export async function getCatalogBrowseState(currentUserId: string, catalog: CatalogKey): Promise<CatalogBrowseState> {
  const preferences = await bindCatalogPreferenceOperations(async () => currentUserId).read();
  const presence = await db.execute<{ present: boolean }>(sql`select to_regclass('public.catalog_visibility_scope_activation') is not null as present`);
  const activation = presence.rows[0].present ? await db.select({ key: catalogVisibilityScopeActivation.catalogKey })
    .from(catalogVisibilityScopeActivation).where(eq(catalogVisibilityScopeActivation.catalogKey, catalog)).limit(1) : [];
  return { mode: preferences[catalog], enabled: activation.length === 1 };
}

export function catalogVisibilityPredicate(table: { isSystemCanon: AnyPgColumn; createdByUserId: AnyPgColumn }, currentUserId: string, mode: CatalogVisibilityMode): SQL {
  const canon = eq(table.isSystemCanon, true);
  const mine = eq(table.createdByUserId, currentUserId);
  return mode === "canon" ? canon : mode === "mine" ? mine : or(canon, mine)!;
}

export function catalogBrowseWhere(table: { isSystemCanon: AnyPgColumn; createdByUserId: AnyPgColumn }, currentUserId: string, state: CatalogBrowseState, ...conditions: (SQL | undefined)[]) {
  const creatorId = state.admin?.options.creatorId;
  return and(...conditions,
    state.admin?.options.all ? undefined : catalogVisibilityPredicate(table, currentUserId, state.enabled || state.admin ? state.mode : "canon-and-mine"),
    creatorId ? creatorId === UNATTRIBUTED_CREATOR ? isNull(table.createdByUserId) : eq(table.createdByUserId, creatorId) : undefined);
}

/** Context may ignore a display preference, but never the catalog's access boundary. */
export function catalogContextWhere(table: { isSystemCanon: AnyPgColumn; createdByUserId: AnyPgColumn }, currentUserId: string, state: CatalogBrowseState) {
  return state.admin ? undefined : catalogVisibilityPredicate(table, currentUserId, "canon-and-mine");
}

/** Discovery across both Item scopes uses two independent preferences/activations. */
export async function itemDiscoveryWhere(currentUserId: string, ...conditions: (SQL | undefined)[]) {
  const [equipment, inventory] = await Promise.all([getCatalogBrowseState(currentUserId, "equipment"), getCatalogBrowseState(currentUserId, "inventory")]);
  return and(...conditions, or(
    catalogBrowseWhere(item, currentUserId, equipment, eq(item.catalogScope, "equipment")),
    catalogBrowseWhere(item, currentUserId, inventory, eq(item.catalogScope, "inventory")),
  ));
}

/** Caller supplies stored references separately from new, active discovery choices. */
export async function catalogCandidateWhere(catalog: CatalogKey, table: { id: AnyPgColumn; isSystemCanon: AnyPgColumn; createdByUserId: AnyPgColumn }, currentUserId: string, retainedIds: readonly number[], ...conditions: (SQL | undefined)[]) {
  const state = await getCatalogBrowseState(currentUserId, catalog);
  return or(catalogBrowseWhere(table, currentUserId, state, ...conditions), retainedIds.length ? inArray(table.id, [...retainedIds]) : undefined);
}

export function catalogSourceLabel(row: CatalogContentSource, currentUserId: string, context = false): CatalogSourceLabel {
  return context ? "context" : classifyCatalogContent(row, currentUserId);
}

/** Expand only upward, in SQL. UNION makes corrupt cycles finite; no sibling rows. */
export async function catalogAncestorIds(catalog: "race" | "creature" | "skill" | "item", seedIds: readonly number[]): Promise<number[]> {
  if (!seedIds.length) return [];
  const seeds = sql.join(seedIds.map((id) => sql`${id}::integer`), sql`, `);
  const edges = catalog === "skill"
    ? sql`select skill_id as child_id, related_skill_id as parent_id from skill_relationship where lower(trim(relationship_type)) = 'parent'`
    : catalog === "race" ? sql`select id as child_id, parent_race_id as parent_id from races`
    : catalog === "creature" ? sql`select id as child_id, parent_creature_id as parent_id from creatures`
    : sql`select id as child_id, parent_item_id as parent_id from items`;
  const result = await db.execute<{ id: number }>(sql`with recursive edges as (${edges}), ancestors(id) as (
    select unnest(array[${seeds}]) union select edges.parent_id from edges join ancestors on edges.child_id = ancestors.id where edges.parent_id is not null
  ) select id from ancestors`);
  return result.rows.map((row) => row.id);
}
