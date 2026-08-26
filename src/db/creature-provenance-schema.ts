import { index, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

import { creature } from "./creature-schema";

/**
 * Canonical-source provenance carried forward from STSTandAlone.
 *
 * This is deliberately separate from ordinary Creature authoring data: it
 * records why a canonical Creature was considered safe to include and what
 * source/tradition it came from. G.O.D.-created Creature records do not need a
 * provenance row.
 */
export const creatureIpProvenance = pgTable(
  "creature_ip_provenance",
  {
    id: serial("id").primaryKey(),
    creatureId: integer("creature_id")
      .notNull()
      .references(() => creature.id, { onDelete: "cascade" }),
    canonicalName: text("canonical_name").default("").notNull(),
    basisCategory: text("basis_category").default("").notNull(),
    sourceTradition: text("source_tradition").default("").notNull(),
    copyrightIpNote: text("copyright_ip_note").default("").notNull(),
    reviewStatus: text("review_status").default("").notNull(),
  },
  (table) => [
    uniqueIndex("creature_ip_provenance_creature_uq").on(table.creatureId),
    index("creature_ip_provenance_review_idx").on(table.reviewStatus),
  ],
);
