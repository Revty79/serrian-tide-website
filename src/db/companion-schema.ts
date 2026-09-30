import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { campaign } from "./campaign-schema";
import { item } from "./item-schema";
import { campaignCharacter, campaignCharacterItemInstance, campaignCreatureNpcProfile } from "./realm-schema";
import type { CompanionDisposition, CompanionDispositionCommand } from "@/features/creatures/companion-disposition";

// Disabled profiles retain the established exact-copy tracking strategy.
export const creatureVesselProfile = pgTable("creature_vessel_profile", {
  itemId: integer("item_id").primaryKey().references(() => item.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
});

// Disposition and optional binding are a single atomic relationship, not Item contents.
export const ownedCreatureDisposition = pgTable("owned_creature_disposition", {
  characterId: integer("character_id").primaryKey().references(() => campaignCreatureNpcProfile.characterId, { onDelete: "restrict" }),
  campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "restrict" }),
  disposition: text("disposition").$type<CompanionDisposition>().notNull(),
  awayNote: text("away_note").notNull().default(""),
  vesselInstanceId: integer("vessel_instance_id"),
  vesselItemId: integer("vessel_item_id").references(() => creatureVesselProfile.itemId, { onDelete: "restrict" }),
  revision: integer("revision").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, table => [
  foreignKey({ name: "owned_creature_disposition_campaign_fk", columns: [table.characterId, table.campaignId], foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId] }).onDelete("restrict"),
  foreignKey({ name: "owned_creature_vessel_exact_fk", columns: [table.vesselInstanceId, table.vesselItemId], foreignColumns: [campaignCharacterItemInstance.id, campaignCharacterItemInstance.itemId] }).onDelete("restrict"),
  unique("owned_creature_vessel_one_creature").on(table.vesselInstanceId),
  index("owned_creature_disposition_campaign_idx").on(table.campaignId),
  check("owned_creature_disposition_valid", sql`${table.disposition} IN ('accompanying','vessel-bound','away')`),
  check("owned_creature_disposition_binding_valid", sql`(${table.disposition} = 'vessel-bound' AND ${table.vesselInstanceId} IS NOT NULL AND ${table.vesselItemId} IS NOT NULL) OR (${table.disposition} IN ('accompanying','away') AND ${table.vesselInstanceId} IS NULL AND ${table.vesselItemId} IS NULL)`),
  check("owned_creature_disposition_note_valid", sql`length(${table.awayNote}) <= 240 AND (${table.disposition} = 'away' OR ${table.awayNote} = '')`),
  check("owned_creature_disposition_revision_valid", sql`${table.revision} > 0`),
]);

export const companionDispositionEvent = pgTable("companion_disposition_event", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "restrict" }),
  characterId: integer("character_id").notNull().references(() => campaignCharacter.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
  requestKey: text("request_key").notNull(),
  revision: integer("revision").notNull(),
  command: jsonb("command").$type<CompanionDispositionCommand | { operation: "ownership-removed"; previousOwnerCharacterId: number }>().notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [
  unique("companion_disposition_event_request_uq").on(table.characterId, table.requestKey),
  unique("companion_disposition_event_revision_uq").on(table.characterId, table.revision),
  index("companion_disposition_event_campaign_idx").on(table.campaignId),
  check("companion_disposition_event_revision_valid", sql`${table.revision} > 0`),
]);
