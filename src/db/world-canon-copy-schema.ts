import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { world } from "./world-schema";

/** Preparation has no live target World. Only the final transaction publishes it. */
export const worldCanonCopy = pgTable("world_canon_copy", {
  requestId: text("request_id").primaryKey(), sourceWorldId: text("source_world_id").notNull().references(() => world.id, { onDelete: "restrict" }),
  actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }), inputHash: text("input_hash").notNull(),
  targetWorldId: text("target_world_id").notNull().unique(), targetTimelineId: text("target_timeline_id").notNull(),
  phase: integer("phase").notNull().default(0), cursor: text("cursor").notNull().default(""), rows: integer("rows").notNull().default(0),
  status: text("status").notNull().default("preparing"), createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => [unique("world_canon_copy_actor_request_uq").on(t.requestId,t.actorId), index("world_canon_copy_actor_idx").on(t.actorId,t.createdAt),
  check("world_canon_copy_valid",sql`${t.inputHash} ~ '^[a-f0-9]{64}$' AND ${t.phase}>=0 AND ${t.rows}>=0 AND length(${t.cursor})<=512 AND ${t.status} IN ('preparing','accepted')`)]);

export const worldCanonCopyIdentity = pgTable("world_canon_copy_identity", {
  requestId: text("request_id").notNull().references(() => worldCanonCopy.requestId, { onDelete: "restrict" }),
  sourceId: text("source_id").notNull(), targetId: text("target_id").notNull(),
}, t => [primaryKey({columns:[t.requestId,t.sourceId]}), unique("world_canon_copy_target_identity_uq").on(t.requestId,t.targetId)]);

export const worldCanonCopyRow = pgTable("world_canon_copy_row", {
  requestId: text("request_id").notNull().references(() => worldCanonCopy.requestId, { onDelete: "restrict" }),
  family: text("family").notNull(), key: text("record_key").notNull(), payload: jsonb("payload").$type<Record<string,unknown>>().notNull(),
  ready: integer("ready").notNull().default(0),
}, t => [primaryKey({columns:[t.requestId,t.family,t.key]}), index("world_canon_copy_pending_idx").on(t.requestId,t.ready,t.family,t.key),
  check("world_canon_copy_row_valid",sql`${t.ready} IN (0,1) AND length(${t.family}) BETWEEN 1 AND 80 AND length(${t.key}) BETWEEN 1 AND 512 AND jsonb_typeof(${t.payload})='object' AND octet_length(${t.payload}::text)<=16777216`)]);
