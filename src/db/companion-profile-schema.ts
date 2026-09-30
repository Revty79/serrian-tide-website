import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { campaign } from "./campaign-schema";
import { campaignCharacter, campaignCreatureNpcProfile } from "./realm-schema";
import type { CompanionCombatPreference, CompanionControl, CompanionProfileCommand, CompanionRole } from "@/features/creatures/companion-profile";

export const companionProfile = pgTable("companion_profile", {
  characterId: integer("character_id").primaryKey().references(() => campaignCreatureNpcProfile.characterId, { onDelete: "restrict" }),
  campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "restrict" }),
  // Notes can exist before a G.O.D. deliberately configures behavior. Neither choice is inferred.
  controlModel: text("control_model").$type<CompanionControl>(),
  combatPreference: text("combat_preference").$type<CompanionCombatPreference>(),
  relationshipNotes: text("relationship_notes").notNull().default(""),
  requiresOwnerReview: boolean("requires_owner_review").notNull().default(false),
  revision: integer("revision").notNull(),
  updatedByUserId: text("updated_by_user_id").references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, table => [
  foreignKey({ name: "companion_profile_campaign_fk", columns: [table.characterId, table.campaignId], foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId] }).onDelete("restrict"),
  index("companion_profile_campaign_idx").on(table.campaignId),
  check("companion_profile_choices_valid", sql`(${table.controlModel} IS NULL AND ${table.combatPreference} IS NULL) OR (${table.controlModel} IS NOT NULL AND ${table.combatPreference} IS NOT NULL AND ${table.controlModel} IN ('player-directed','owner-commands','god-directed') AND ${table.combatPreference} IN ('normally-joins','normally-stays-out','decide-at-start'))`),
  check("companion_profile_notes_valid", sql`length(${table.relationshipNotes}) <= 1000`),
  check("companion_profile_revision_valid", sql`${table.revision} > 0`),
]);
export const companionProfileRole = pgTable("companion_profile_role", {
  characterId: integer("character_id").notNull().references(() => companionProfile.characterId, { onDelete: "cascade" }),
  role: text("role").$type<CompanionRole>().notNull(),
  otherLabel: text("other_label").notNull().default(""),
  maximumRiders: integer("maximum_riders"),
  mountNotes: text("mount_notes").notNull().default(""),
}, table => [
  primaryKey({ columns: [table.characterId, table.role] }),
  check("companion_profile_role_valid", sql`${table.role} IN ('companion','mount','familiar','pack-working','guard-combat','scout-utility','other')`),
  check("companion_profile_other_valid", sql`(${table.role} = 'other' AND length(btrim(${table.otherLabel})) BETWEEN 1 AND 120 AND ${table.otherLabel} ~ '[[:alnum:]]') OR (${table.role} <> 'other' AND ${table.otherLabel} = '')`),
  check("companion_profile_mount_valid", sql`(${table.role} = 'mount' AND ${table.maximumRiders} IS NOT NULL AND ${table.maximumRiders} > 0 AND length(${table.mountNotes}) <= 500) OR (${table.role} <> 'mount' AND ${table.maximumRiders} IS NULL AND ${table.mountNotes} = '')`),
]);
export const companionProfileEvent = pgTable("companion_profile_event", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "restrict" }),
  characterId: integer("character_id").notNull().references(() => campaignCharacter.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
  requestKey: text("request_key").notNull(),
  revision: integer("revision").notNull(),
  command: jsonb("command").$type<CompanionProfileCommand | { operation: "ownership-review"; previousOwnerCharacterId: number | null; ownerCharacterId: number | null }>().notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [
  unique("companion_profile_event_request_uq").on(table.characterId, table.requestKey),
  unique("companion_profile_event_revision_uq").on(table.characterId, table.revision),
  index("companion_profile_event_campaign_idx").on(table.campaignId),
  check("companion_profile_event_revision_valid", sql`${table.revision} > 0`),
]);
