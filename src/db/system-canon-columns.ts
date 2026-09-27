import { sql } from "drizzle-orm";
import { boolean, check, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export function systemCanonColumns() {
  return {
    isSystemCanon: boolean("is_system_canon").default(false).notNull(),
    canonMarkedByUserId: text("canon_marked_by_user_id").references(() => user.id, { onDelete: "restrict" }),
    canonMarkedAt: timestamp("canon_marked_at"),
  };
}

export function systemCanonStateCheck(name: string, table: {
  isSystemCanon: AnyPgColumn; canonMarkedByUserId: AnyPgColumn; canonMarkedAt: AnyPgColumn;
}) {
  return check(`${name}_canon_state_valid`, sql`(
    (${table.isSystemCanon} = false AND ${table.canonMarkedByUserId} IS NULL AND ${table.canonMarkedAt} IS NULL)
    OR (${table.isSystemCanon} = true AND ${table.canonMarkedByUserId} IS NOT NULL AND ${table.canonMarkedAt} IS NOT NULL)
  )`);
}
