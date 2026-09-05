import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const skill = pgTable(
  "skill",
  {
    id: serial("id").primaryKey(),

    name: text("name").notNull(),

    classification: text("classification")
      .default("standard")
      .notNull(),

    tier: integer("tier"),

    primaryAttribute: text("primary_attribute"),

    secondaryAttribute: text("secondary_attribute"),

    definition: text("definition")
      .default("")
      .notNull(),

    /*
     * Audit/history only.
     *
     * A creator does NOT privately own a Skill.
     * Skills are shared Serrian Tide system content.
     */
    createdByUserId: text("created_by_user_id")
      .references(() => user.id, {
        onDelete: "set null",
      }),

    /*
     * Used to identify imported/core records and
     * prevent duplicate imports.
     */
    sourceSystem: text("source_system"),

    sourceExternalId: text("source_external_id"),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),

    archivedAt: timestamp("archived_at"),

    archivedByUserId: text("archived_by_user_id")
      .references(() => user.id, {
        onDelete: "set null",
      }),

    archiveReason: text("archive_reason")
      .default("")
      .notNull(),
  },
  (table) => [
    check(
      "skill_name_not_blank",
      sql`length(trim(${table.name})) > 0`,
    ),

    check(
      "skill_classification_not_blank",
      sql`length(trim(${table.classification})) > 0`,
    ),

    check(
      "skill_tier_positive",
      sql`${table.tier} IS NULL OR ${table.tier} > 0`,
    ),

    index("skill_classification_idx").on(
      table.classification,
      table.name,
      table.id,
    ),

    index("skill_created_by_user_idx").on(
      table.createdByUserId,
      table.name,
      table.id,
    ),

    index("skill_archive_idx").on(
      table.archivedAt,
      table.name,
      table.id,
    ),

    index("skill_name_idx").on(
      table.name,
      table.id,
    ),

    index("skill_primary_attribute_idx").on(
      table.primaryAttribute,
      table.name,
      table.id,
    ),

    index("skill_secondary_attribute_idx").on(
      table.secondaryAttribute,
      table.name,
      table.id,
    ),

    index("skill_tier_idx").on(
      table.tier,
      table.name,
      table.id,
    ),

    uniqueIndex("skill_source_identity_idx")
      .on(
        table.sourceSystem,
        table.sourceExternalId,
      )
      .where(
        sql`
          ${table.sourceSystem} IS NOT NULL
          AND ${table.sourceExternalId} IS NOT NULL
        `,
      ),

    check(
      "skill_archive_state_valid",
      sql`(
        (${table.archivedAt} IS NULL AND ${table.archivedByUserId} IS NULL AND ${table.archiveReason} = '')
        OR ${table.archivedAt} IS NOT NULL
      )`,
    ),
  ],
);

export const skillRelationship = pgTable(
  "skill_relationship",
  {
    id: serial("id").primaryKey(),

    skillId: integer("skill_id")
      .notNull()
      .references(() => skill.id, {
        onDelete: "restrict",
      }),

    relatedSkillId: integer("related_skill_id")
      .notNull()
      .references(() => skill.id, {
        onDelete: "restrict",
      }),

    relationshipType: text("relationship_type")
      .default("parent")
      .notNull(),

    sortOrder: integer("sort_order")
      .default(0)
      .notNull(),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "skill_relationship_type_not_blank",
      sql`length(trim(${table.relationshipType})) > 0`,
    ),

    check(
      "skill_relationship_not_self",
      sql`${table.skillId} <> ${table.relatedSkillId}`,
    ),

    uniqueIndex("skill_relationship_unique_idx").on(
      table.skillId,
      table.relatedSkillId,
      table.relationshipType,
    ),

    index("skill_relationship_skill_idx").on(
      table.skillId,
      table.relationshipType,
      table.sortOrder,
      table.id,
    ),

    index("skill_relationship_related_idx").on(
      table.relatedSkillId,
      table.relationshipType,
      table.sortOrder,
      table.id,
    ),
  ],
);

export const skillExtension = pgTable(
  "skill_extension",
  {
    id: serial("id").primaryKey(),

    skillId: integer("skill_id")
      .notNull()
      .references(() => skill.id, {
        onDelete: "cascade",
      }),

    extensionType: text("extension_type")
      .notNull(),

    schemaVersion: integer("schema_version")
      .notNull(),

    /*
     * Intentionally stored as text rather than
     * converting the old archive to JSONB.
     *
     * This preserves the STSTandAlone extension
     * documents without changing their representation
     * during migration.
     */
    dataJson: text("data_json")
      .notNull(),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "skill_extension_type_not_blank",
      sql`length(trim(${table.extensionType})) > 0`,
    ),

    check(
      "skill_extension_schema_version_positive",
      sql`${table.schemaVersion} > 0`,
    ),

    check(
      "skill_extension_data_not_blank",
      sql`length(trim(${table.dataJson})) > 0`,
    ),

    uniqueIndex("skill_extension_unique_idx").on(
      table.skillId,
      table.extensionType,
    ),

    index("skill_extension_type_idx").on(
      table.extensionType,
      table.skillId,
    ),
  ],
);

export const skillRelations = relations(
  skill,
  ({ one, many }) => ({
    creator: one(user, {
      fields: [skill.createdByUserId],
      references: [user.id],
    }),

    relationships: many(skillRelationship, {
      relationName: "skillRelationships",
    }),

    relatedBy: many(skillRelationship, {
      relationName: "relatedSkillRelationships",
    }),

    extensions: many(skillExtension),
  }),
);

export const skillRelationshipRelations =
  relations(
    skillRelationship,
    ({ one }) => ({
      skill: one(skill, {
        fields: [skillRelationship.skillId],
        references: [skill.id],
        relationName: "skillRelationships",
      }),

      relatedSkill: one(skill, {
        fields: [
          skillRelationship.relatedSkillId,
        ],
        references: [skill.id],
        relationName:
          "relatedSkillRelationships",
      }),
    }),
  );

export const skillExtensionRelations =
  relations(
    skillExtension,
    ({ one }) => ({
      skill: one(skill, {
        fields: [skillExtension.skillId],
        references: [skill.id],
      }),
    }),
  );
