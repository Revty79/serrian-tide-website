import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const siteAppearanceSetting = pgTable(
  "site_appearance_setting",
  {
    key: text("key").primaryKey(),
    presetId: text("preset_id").notNull(),
    pageBackground: text("page_background").notNull(),
    surfaceBackground: text("surface_background").notNull(),
    primaryAccent: text("primary_accent").notNull(),
    secondaryAccent: text("secondary_accent").notNull(),
    mainText: text("main_text").notNull(),
    mutedText: text("muted_text").notNull(),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("site_appearance_singleton_key", sql`${table.key} = 'site'`),
    check("site_appearance_preset_valid", sql`${table.presetId} IN ('serrian-tide', 'classic')`),
    check("site_appearance_page_background_hex", sql`${table.pageBackground} ~ '^#[0-9A-F]{6}$'`),
    check("site_appearance_surface_background_hex", sql`${table.surfaceBackground} ~ '^#[0-9A-F]{6}$'`),
    check("site_appearance_primary_accent_hex", sql`${table.primaryAccent} ~ '^#[0-9A-F]{6}$'`),
    check("site_appearance_secondary_accent_hex", sql`${table.secondaryAccent} ~ '^#[0-9A-F]{6}$'`),
    check("site_appearance_main_text_hex", sql`${table.mainText} ~ '^#[0-9A-F]{6}$'`),
    check("site_appearance_muted_text_hex", sql`${table.mutedText} ~ '^#[0-9A-F]{6}$'`),
  ],
);
