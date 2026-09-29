import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { race } from "@/db/race-schema";
import { creature } from "@/db/creature-schema";
import { skill } from "@/db/skill-schema";
import { derivedAbility } from "@/db/derived-ability-schema";
import { item } from "@/db/item-schema";
import { getCatalogBrowseState, type CatalogBrowseState } from "./catalog-query";
import type { CatalogKey } from "./catalog-visibility";
import { parseAdminCatalogBrowse, UNATTRIBUTED_CREATOR, type AdminCatalogBrowse } from "./admin-catalog-browse";

/** Authoring lists only. Discovery and retained game references use the personal preference. */
export async function getCatalogManagementState(actorId: string, catalog: CatalogKey, input?: AdminCatalogBrowse): Promise<CatalogBrowseState> {
  const options = parseAdminCatalogBrowse(input);
  const [visibility, assignments] = await Promise.all([
    getCatalogBrowseState(actorId, catalog),
    db.select({ role: userRole.role }).from(userRole).where(and(eq(userRole.userId, actorId), eq(userRole.role, "admin"))),
  ]);
  if (!assignments.length) {
    if (input !== undefined) throw new Error("Administrator access is required for catalog user controls and All.");
    return visibility;
  }
  const table = { race, creature, skill, derivedAbility, equipment: item, inventory: item }[catalog];
  const scope = catalog === "equipment" || catalog === "inventory" ? eq(item.catalogScope, catalog) : undefined;
  const rows = await db.selectDistinct({ id: table.createdByUserId, label: catalogCreatorName(table.createdByUserId) }).from(table).where(scope);
  const creators = rows.map(({ id, label }) => ({ id: id ?? UNATTRIBUTED_CREATOR, label }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  return { ...visibility, admin: { options, creators } };
}

/** Never expose account email addresses in catalog attribution. */
export function catalogCreatorName(column: AnyPgColumn) {
  return sql<string>`coalesce((select coalesce(nullif(${user.displayUsername}, ''), nullif(${user.username}, ''), nullif(${user.name}, ''), ${user.id}) from ${user} where ${user.id} = ${column}), 'No recorded creator')`;
}

export function catalogCreatorLabel(state: CatalogBrowseState, creatorId: string | null): string | undefined {
  return state.admin?.creators.find(({ id }) => id === (creatorId ?? UNATTRIBUTED_CREATOR))?.label;
}

export function catalogManagementOrder(table: { id: AnyPgColumn; createdByUserId: AnyPgColumn }, name: AnyPgColumn, state: CatalogBrowseState) {
  return state.admin?.options.sortBy === "user"
    ? [asc(sql`lower(${catalogCreatorName(table.createdByUserId)})`), asc(table.createdByUserId), asc(name), asc(table.id)]
    : [asc(name), asc(table.id)];
}
