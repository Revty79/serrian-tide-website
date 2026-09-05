import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { skill } from "./skill-schema";

export const RACE_SIZE_OPTIONS = [
  "Minuscule",
  "Tiny",
  "Small",
  "Medium",
  "Large",
  "Huge",
  "Gargantuan",
  "Colossal",
] as const;

export type RaceSize = (typeof RACE_SIZE_OPTIONS)[number];

export const race = pgTable(
  "races",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    legacyDescription: text("legacy_description").default("").notNull(),
    physicalCharacteristics: text("physical_characteristics").default("").notNull(),
    physicalDescription: text("physical_description").default("").notNull(),
    ageRangeText: text("age_range_text").default("").notNull(),
    ageMin: integer("age_min"),
    ageMax: integer("age_max"),
    size: text("size").default("").notNull(),
    baseMagic: doublePrecision("base_magic"),
    racialQuirkName: text("racial_quirk_name").default("").notNull(),
    quirkSuccessEffect: text("quirk_success_effect").default("").notNull(),
    quirkFailureEffect: text("quirk_failure_effect").default("").notNull(),
    commonLanguagesKnown: text("common_languages_known").default("").notNull(),
    commonArchetypes: text("common_archetypes").default("").notNull(),
    genreExamples: text("genre_examples").default("").notNull(),
    culturalMindset: text("cultural_mindset").default("").notNull(),
    outlookOnMagic: text("outlook_on_magic").default("").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sourceSystem: text("source_system"),
    sourceExternalId: text("source_external_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
    archivedByUserId: text("archived_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    archiveReason: text("archive_reason").default("").notNull(),
  },
  (table) => [
    uniqueIndex("races_source_identity_uq")
      .on(table.sourceSystem, table.sourceExternalId)
      .where(sql`${table.sourceSystem} IS NOT NULL AND ${table.sourceExternalId} IS NOT NULL`),
    index("races_name_idx").on(table.name),
    index("races_size_idx").on(table.size),
    index("races_archive_idx").on(
      table.archivedAt,
      table.name,
      table.id,
    ),
    check("races_name_nonblank", sql`length(trim(${table.name})) > 0`),
    check("races_age_min_valid", sql`${table.ageMin} IS NULL OR ${table.ageMin} >= 0`),
    check("races_age_max_valid", sql`${table.ageMax} IS NULL OR ${table.ageMax} >= 0`),
    check("races_age_order_valid", sql`${table.ageMin} IS NULL OR ${table.ageMax} IS NULL OR ${table.ageMin} <= ${table.ageMax}`),
    check(
      "races_archive_state_valid",
      sql`(
        (${table.archivedAt} IS NULL AND ${table.archivedByUserId} IS NULL AND ${table.archiveReason} = '')
        OR ${table.archivedAt} IS NOT NULL
      )`,
    ),
  ],
);

export const raceAttributeCap = pgTable(
  "race_attribute_caps",
  {
    id: serial("id").primaryKey(),
    raceId: integer("race_id")
      .notNull()
      .references(() => race.id, { onDelete: "cascade" }),
    attributeKey: text("attribute_key").notNull(),
    maxValue: doublePrecision("max_value").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("race_attribute_caps_race_id_idx").on(table.raceId),
    uniqueIndex("race_attribute_caps_race_attribute_uq").on(table.raceId, table.attributeKey),
    check("race_attribute_caps_attribute_nonblank", sql`length(trim(${table.attributeKey})) > 0`),
  ],
);

export const raceMovementMode = pgTable(
  "race_movement_modes",
  {
    id: serial("id").primaryKey(),
    raceId: integer("race_id")
      .notNull()
      .references(() => race.id, { onDelete: "cascade" }),
    movementMode: text("movement_mode").notNull(),
    baseValue: doublePrecision("base_value").notNull(),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("race_movement_modes_race_id_idx").on(table.raceId),
    check("race_movement_modes_name_nonblank", sql`length(trim(${table.movementMode})) > 0`),
  ],
);

export const raceSkillLink = pgTable(
  "race_skill_links",
  {
    id: serial("id").primaryKey(),
    raceId: integer("race_id")
      .notNull()
      .references(() => race.id, { onDelete: "cascade" }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skill.id, { onDelete: "restrict" }),
    linkType: text("link_type").notNull(),
    value: doublePrecision("value"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("race_skill_links_race_id_idx").on(table.raceId),
    index("race_skill_links_skill_id_idx").on(table.skillId),
    uniqueIndex("race_skill_links_identity_uq").on(table.raceId, table.skillId, table.linkType),
    check("race_skill_links_type_nonblank", sql`length(trim(${table.linkType})) > 0`),
  ],
);
