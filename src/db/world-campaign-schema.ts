import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { campaign } from "./campaign-schema";
import { world, worldTimeline } from "./world-schema";

export const worldCampaignContext = pgTable("world_campaign_context", {
  id: text("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "restrict" }),
  worldId: text("world_id").notNull().references(() => world.id, { onDelete: "restrict" }),
  timelineId: text("timeline_id").notNull(),
  creatorId: text("creator_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  startingYear: bigint("starting_year", { mode: "number" }),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  removedAt: timestamp("removed_at"),
}, t => [
  unique("world_campaign_context_identity_uq").on(t.campaignId, t.worldId, t.timelineId),
  unique("world_campaign_context_campaign_uq").on(t.id, t.campaignId),
  foreignKey({ name: "world_campaign_context_timeline_fk", columns: [t.timelineId, t.worldId], foreignColumns: [worldTimeline.id, worldTimeline.worldId] }).onDelete("restrict"),
  index("world_campaign_context_world_idx").on(t.worldId, t.campaignId),
  index("world_campaign_context_creator_idx").on(t.creatorId),
  check("world_campaign_context_valid", sql`${t.revision} > 0 and (${t.startingYear} is null or abs(${t.startingYear}) <= 1000000000000)`),
]);
export const worldCampaignHome = pgTable("world_campaign_home", {
  campaignId: integer("campaign_id").primaryKey().references(() => campaign.id, { onDelete: "restrict" }),
  contextId: text("context_id"),
  revision: integer("revision").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => [
  foreignKey({ name: "world_campaign_home_context_fk", columns: [t.contextId, t.campaignId], foreignColumns: [worldCampaignContext.id, worldCampaignContext.campaignId] }).onDelete("restrict"),
  check("world_campaign_home_revision_valid", sql`${t.revision} > 0`),
]);
export const worldAuthoringSelection = pgTable("world_authoring_selection", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "restrict" }),
  contextId: text("context_id").references(() => worldCampaignContext.id, { onDelete: "restrict" }),
  viewingYear: bigint("viewing_year", { mode: "number" }),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => [check("world_authoring_selection_valid", sql`${t.revision} >= 0 and (${t.viewingYear} is null or (${t.contextId} is not null and abs(${t.viewingYear}) <= 1000000000000))`)]);
export const worldCampaignContextChange = pgTable("world_campaign_context_change", {
  id: serial("id").primaryKey(),
  contextId: text("context_id").notNull().references(() => worldCampaignContext.id, { onDelete: "restrict" }),
  actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, t => [index("world_campaign_context_change_idx").on(t.contextId, t.id), check("world_campaign_context_change_valid", sql`${t.action} in ('link','edit','remove','restore','home') and jsonb_typeof(${t.snapshot}) = 'object'`)]);
