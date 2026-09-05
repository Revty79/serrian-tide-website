import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const LIFECYCLE_AUDIT_ACTIONS = [
  "archive",
  "restore",
  "delete",
] as const;

export const LIFECYCLE_ENTITY_KINDS = [
  "campaign",
  "player-character",
  "race-npc",
  "creature-npc",
  "race",
  "creature",
  "skill",
  "item",
  "derived-ability",
  "campaign-session",
  "scene",
  "encounter",
  "campaign-player",
  "user-account",
] as const;

export type LifecycleAuditAction =
  (typeof LIFECYCLE_AUDIT_ACTIONS)[number];

export type LifecycleEntityKind =
  (typeof LIFECYCLE_ENTITY_KINDS)[number];

/**
 * Append-only lifecycle history. Target, Campaign, and owner identities are
 * deliberate snapshots rather than foreign keys so a deletion event survives
 * the entity graph it records. Only the acting User remains referentially
 * protected. A separately guarded administrator workflow can delete only a
 * clean User account with no prior audit attribution.
 */
export const lifecycleAuditEvent = pgTable(
  "lifecycle_audit_event",
  {
    id: serial("id").primaryKey(),
    action: text("action").notNull(),
    entityKind: text("entity_kind").notNull(),
    targetId: text("target_id").notNull(),
    targetName: text("target_name").notNull(),
    campaignIdSnapshot: integer("campaign_id_snapshot"),
    ownerUserIdSnapshot: text("owner_user_id_snapshot"),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    reason: text("reason").default("").notNull(),
    dependencySummaryJson: jsonb("dependency_summary_json")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("lifecycle_audit_event_target_idx").on(
      table.entityKind,
      table.targetId,
      table.createdAt,
      table.id,
    ),
    index("lifecycle_audit_event_campaign_idx").on(
      table.campaignIdSnapshot,
      table.createdAt,
      table.id,
    ),
    index("lifecycle_audit_event_actor_idx").on(
      table.actorUserId,
      table.createdAt,
      table.id,
    ),
    check(
      "lifecycle_audit_event_action_valid",
      sql`${table.action} IN ('archive', 'restore', 'delete')`,
    ),
    check(
      "lifecycle_audit_event_entity_kind_valid",
      sql`${table.entityKind} IN (
        'campaign',
        'player-character',
        'race-npc',
        'creature-npc',
        'race',
        'creature',
        'skill',
        'item',
        'derived-ability',
        'campaign-session',
        'scene',
        'encounter',
        'campaign-player',
        'user-account'
      )`,
    ),
    check(
      "lifecycle_audit_event_target_id_nonblank",
      sql`length(trim(${table.targetId})) > 0`,
    ),
    check(
      "lifecycle_audit_event_target_name_nonblank",
      sql`length(trim(${table.targetName})) > 0`,
    ),
    check(
      "lifecycle_audit_event_campaign_id_valid",
      sql`${table.campaignIdSnapshot} IS NULL OR ${table.campaignIdSnapshot} > 0`,
    ),
    check(
      "lifecycle_audit_event_owner_snapshot_valid",
      sql`${table.ownerUserIdSnapshot} IS NULL OR length(trim(${table.ownerUserIdSnapshot})) > 0`,
    ),
    check(
      "lifecycle_audit_event_reason_length_valid",
      sql`length(${table.reason}) <= 1000`,
    ),
    check(
      "lifecycle_audit_event_dependency_summary_object",
      sql`jsonb_typeof(${table.dependencySummaryJson}) = 'object'`,
    ),
  ],
);
