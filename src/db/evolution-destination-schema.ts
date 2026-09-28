import { check, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CreatedEvolutionDestination } from "@/features/evolutions/evolution-destination";

/** Durable retry receipts, not definition ownership or Evolution relationships.
 * Snapshot IDs intentionally have no foreign keys: deleting a definition, path or
 * account must not allow an old uncertain request to create a second destination.
 */
export const evolutionDestinationCreation = pgTable("evolution_destination_creation", {
  requestKey: text("request_key").primaryKey(),
  actorUserId: text("actor_user_id").notNull(),
  requestHash: text("request_hash").notNull(),
  result: jsonb("result").$type<CreatedEvolutionDestination>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [
  check("evolution_destination_creation_identity", sql`length(${table.requestKey}) = 36 AND length(${table.requestHash}) = 64 AND length(trim(${table.actorUserId})) > 0`),
  check("evolution_destination_creation_result", sql`jsonb_typeof(${table.result}) = 'object' AND ${table.result}->>'kind' IN ('race','creature')`),
]);
