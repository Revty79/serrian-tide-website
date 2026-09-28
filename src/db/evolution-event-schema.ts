import { sql } from "drizzle-orm";
import { check, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { campaign } from "./campaign-schema";
import { campaignCharacter } from "./realm-schema";
import { race } from "./race-schema";
import { creature, creatureEvolutionPath } from "./creature-schema";
import { raceEvolutionPath } from "./race-evolution-schema";
import type { EvolutionEventEvidence } from "@/features/evolutions/evolution-execution";

// History is deliberately restrictive. Only explicit Campaign graph deletion removes it.
const common = () => ({
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "restrict" }),
  characterId: integer("character_id").notNull().references(() => campaignCharacter.id, { onDelete: "restrict" }),
  executedByUserId: text("executed_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
  pathVersion: integer("path_version").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  requestHash: text("request_hash").notNull(),
  evidence: jsonb("evidence").$type<EvolutionEventEvidence>().notNull(),
});
export const raceEvolutionEvent = pgTable("race_evolution_events", {
  ...common(),
  pathId: integer("path_id").notNull().references(() => raceEvolutionPath.id, { onDelete: "restrict" }),
  sourceRaceId: integer("source_race_id").notNull().references(() => race.id, { onDelete: "restrict" }),
  destinationRaceId: integer("destination_race_id").notNull().references(() => race.id, { onDelete: "restrict" }),
}, table => [
  index("race_evolution_event_individual").on(table.characterId, table.id),
  index("race_evolution_event_campaign").on(table.campaignId),
  index("race_evolution_event_path").on(table.pathId),
  check("race_evolution_event_transition", sql`${table.sourceRaceId} <> ${table.destinationRaceId} AND ${table.pathVersion} > 0`),
]);
export const creatureEvolutionEvent = pgTable("creature_evolution_events", {
  ...common(),
  pathId: integer("path_id").notNull().references(() => creatureEvolutionPath.id, { onDelete: "restrict" }),
  sourceCreatureId: integer("source_creature_id").notNull().references(() => creature.id, { onDelete: "restrict" }),
  destinationCreatureId: integer("destination_creature_id").notNull().references(() => creature.id, { onDelete: "restrict" }),
  sourceBaselineSnapshotJson: text("source_baseline_snapshot_json").notNull(),
  sourceCurrentSnapshotJson: text("source_current_snapshot_json").notNull(),
  destinationBaselineSnapshotJson: text("destination_baseline_snapshot_json").notNull(),
  destinationCurrentSnapshotJson: text("destination_current_snapshot_json").notNull(),
  hpAdjustment: doublePrecision("hp_adjustment").notNull(),
}, table => [
  index("creature_evolution_event_individual").on(table.characterId, table.id),
  index("creature_evolution_event_campaign").on(table.campaignId),
  index("creature_evolution_event_path").on(table.pathId),
  check("creature_evolution_event_transition", sql`${table.sourceCreatureId} <> ${table.destinationCreatureId} AND ${table.pathVersion} > 0`),
]);
