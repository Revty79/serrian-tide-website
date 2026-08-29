import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  primaryKey,
  varchar,
} from "drizzle-orm/pg-core";

export const attributeScoreReference = pgTable(
  "attribute_score_reference",
  {
    attributeKey: varchar("attribute_key", { length: 3 }).notNull(),
    score: integer("score").notNull(),
    maxCarry: integer("max_carry"),
    maxLift: integer("max_lift"),
    maxSpheres: integer("max_spheres"),
    spellWeaving: integer("spell_weaving"),
    teachingBase: integer("teaching_base"),
    loyaltyBase: integer("loyalty_base"),
  },
  (table) => [
    primaryKey({ columns: [table.attributeKey, table.score] }),
    check(
      "attribute_score_reference_key_valid",
      sql`${table.attributeKey} IN ('STR', 'INT', 'WIS', 'CHR')`,
    ),
    check(
      "attribute_score_reference_score_range",
      sql`${table.score} BETWEEN 1 AND 100`,
    ),
    check(
      "attribute_score_reference_values_nonnegative",
      sql`(${table.maxCarry} IS NULL OR ${table.maxCarry} >= 0)
        AND (${table.maxLift} IS NULL OR ${table.maxLift} >= 0)
        AND (${table.maxSpheres} IS NULL OR ${table.maxSpheres} >= 0)
        AND (${table.spellWeaving} IS NULL OR ${table.spellWeaving} >= 0)
        AND (${table.teachingBase} IS NULL OR ${table.teachingBase} >= 0)
        AND (${table.loyaltyBase} IS NULL OR ${table.loyaltyBase} >= 0)`,
    ),
    check(
      "attribute_score_reference_fields_match_key",
      sql`(
          ${table.attributeKey} = 'STR'
          AND ${table.maxCarry} IS NOT NULL
          AND ${table.maxLift} IS NOT NULL
          AND ${table.maxSpheres} IS NULL
          AND ${table.spellWeaving} IS NULL
          AND ${table.teachingBase} IS NULL
          AND ${table.loyaltyBase} IS NULL
        ) OR (
          ${table.attributeKey} = 'INT'
          AND ${table.maxCarry} IS NULL
          AND ${table.maxLift} IS NULL
          AND ${table.maxSpheres} IS NOT NULL
          AND ${table.spellWeaving} IS NOT NULL
          AND ${table.teachingBase} IS NULL
          AND ${table.loyaltyBase} IS NULL
        ) OR (
          ${table.attributeKey} = 'WIS'
          AND ${table.maxCarry} IS NULL
          AND ${table.maxLift} IS NULL
          AND ${table.maxSpheres} IS NULL
          AND ${table.spellWeaving} IS NULL
          AND ${table.teachingBase} IS NOT NULL
          AND ${table.loyaltyBase} IS NULL
        ) OR (
          ${table.attributeKey} = 'CHR'
          AND ${table.maxCarry} IS NULL
          AND ${table.maxLift} IS NULL
          AND ${table.maxSpheres} IS NULL
          AND ${table.spellWeaving} IS NULL
          AND ${table.teachingBase} IS NULL
          AND ${table.loyaltyBase} IS NOT NULL
        )`,
    ),
  ],
);
