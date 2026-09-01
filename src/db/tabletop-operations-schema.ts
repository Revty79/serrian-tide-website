import { relations, sql } from "drizzle-orm";
import {
  check,
  boolean,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { campaign } from "./campaign-schema";
import { campaignCharacter } from "./realm-schema";

export const campaignSessionStatus = pgEnum("campaign_session_status", [
  "planned",
  "active",
  "completed",
]);

export const campaignSessionSceneStatus = pgEnum("campaign_session_scene_status", [
  "planned",
  "active",
  "completed",
]);

export const campaignSessionEncounterStatus = pgEnum("campaign_session_encounter_status", [
  "planned",
  "active",
  "completed",
]);

export const campaignSessionEncounterType = pgEnum("campaign_session_encounter_type", [
  "combat",
  "social",
  "exploration",
  "chase",
  "hazard",
  "other",
]);

export const campaignSessionEncounterInitiativeStatus = pgEnum(
  "campaign_session_encounter_initiative_status",
  ["active", "closed"],
);

export const campaignSessionEncounterInitiativeParticipantStatus = pgEnum(
  "campaign_session_encounter_initiative_participant_status",
  ["active", "holding", "passed", "suspended"],
);

export const campaignSessionEncounterPendingActionStatus = pgEnum(
  "campaign_session_encounter_pending_action_status",
  ["active", "interrupted", "completed", "abandoned", "ended"],
);

export const campaignSessionEncounterActionSourceKind = pgEnum(
  "campaign_session_encounter_action_source_kind",
  ["weapon", "creature-attack", "spell", "item", "creature-ability"],
);

export const campaignSessionEncounterActionResolutionStatus = pgEnum(
  "campaign_session_encounter_action_resolution_status",
  ["pending", "resolved", "cancelled", "needs-ruling"],
);

export const campaignSessionEncounterReactionType = pgEnum(
  "campaign_session_encounter_reaction_type",
  ["dodge", "block", "parry", "no-reaction"],
);

export const campaignSessionEncounterReactionStatus = pgEnum(
  "campaign_session_encounter_reaction_status",
  ["declared", "resolved", "cancelled", "needs-ruling"],
);

export const campaignSession = pgTable(
  "campaign_session",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    status: campaignSessionStatus("status").default("planned").notNull(),
    plannedFor: date("planned_for", { mode: "string" }),
    godNotes: text("god_notes").default("").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("campaign_session_campaign_id_idx").on(table.campaignId),
    uniqueIndex("campaign_session_id_campaign_uq").on(table.id, table.campaignId),
    index("campaign_session_campaign_status_idx").on(table.campaignId, table.status),
    uniqueIndex("campaign_session_campaign_sequence_uq").on(
      table.campaignId,
      table.sequenceNumber,
    ),
    uniqueIndex("campaign_session_one_active_per_campaign_uq")
      .on(table.campaignId)
      .where(sql`${table.status} = 'active'`),
    check("campaign_session_title_nonblank", sql`length(trim(${table.title})) > 0`),
    check("campaign_session_sequence_positive", sql`${table.sequenceNumber} > 0`),
    check(
      "campaign_session_lifecycle_timestamps_valid",
      sql`(
        (${table.status} = 'planned' AND ${table.startedAt} IS NULL AND ${table.completedAt} IS NULL)
        OR (${table.status} = 'active' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NULL)
        OR (${table.status} = 'completed' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const campaignSessionRoster = pgTable(
  "campaign_session_roster",
  {
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    prepNotes: text("prep_notes").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.characterId] }),
    foreignKey({
      columns: [table.sessionId, table.campaignId],
      foreignColumns: [campaignSession.id, campaignSession.campaignId],
      name: "campaign_session_roster_session_campaign_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.characterId, table.campaignId],
      foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId],
      name: "campaign_session_roster_character_campaign_fk",
    }).onDelete("cascade"),
    index("campaign_session_roster_session_order_idx").on(table.sessionId, table.sortOrder),
    index("campaign_session_roster_character_idx").on(table.characterId, table.campaignId),
    check("campaign_session_roster_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignSessionScene = pgTable(
  "campaign_session_scene",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    title: text("title").notNull(),
    status: campaignSessionSceneStatus("status").default("planned").notNull(),
    locationLabel: text("location_label").default("").notNull(),
    description: text("description").default("").notNull(),
    godNotes: text("god_notes").default("").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId, table.campaignId],
      foreignColumns: [campaignSession.id, campaignSession.campaignId],
      name: "campaign_session_scene_session_campaign_fk",
    }).onDelete("cascade"),
    uniqueIndex("campaign_session_scene_id_session_campaign_uq").on(
      table.id,
      table.sessionId,
      table.campaignId,
    ),
    uniqueIndex("campaign_session_scene_session_sequence_uq").on(
      table.sessionId,
      table.sequenceNumber,
    ),
    uniqueIndex("campaign_session_scene_one_active_per_session_uq")
      .on(table.sessionId)
      .where(sql`${table.status} = 'active'`),
    index("campaign_session_scene_session_status_idx").on(table.sessionId, table.status),
    index("campaign_session_scene_session_order_idx").on(table.sessionId, table.sequenceNumber),
    check("campaign_session_scene_title_nonblank", sql`length(trim(${table.title})) > 0`),
    check("campaign_session_scene_sequence_positive", sql`${table.sequenceNumber} > 0`),
    check(
      "campaign_session_scene_lifecycle_timestamps_valid",
      sql`(
        (${table.status} = 'planned' AND ${table.startedAt} IS NULL AND ${table.completedAt} IS NULL)
        OR (${table.status} = 'active' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NULL)
        OR (${table.status} = 'completed' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const campaignSessionSceneMember = pgTable(
  "campaign_session_scene_member",
  {
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sceneId, table.characterId] }),
    foreignKey({
      columns: [table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionScene.id,
        campaignSessionScene.sessionId,
        campaignSessionScene.campaignId,
      ],
      name: "campaign_session_scene_member_scene_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sessionId, table.characterId],
      foreignColumns: [campaignSessionRoster.sessionId, campaignSessionRoster.characterId],
      name: "campaign_session_scene_member_roster_fk",
    }).onDelete("restrict"),
    index("campaign_session_scene_member_scene_order_idx").on(table.sceneId, table.sortOrder),
    index("campaign_session_scene_member_roster_idx").on(table.sessionId, table.characterId),
    check("campaign_session_scene_member_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignSessionEncounter = pgTable(
  "campaign_session_encounter",
  {
    id: serial("id").primaryKey(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    title: text("title").notNull(),
    status: campaignSessionEncounterStatus("status").default("planned").notNull(),
    encounterType: campaignSessionEncounterType("encounter_type").default("other").notNull(),
    description: text("description").default("").notNull(),
    godNotes: text("god_notes").default("").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionScene.id,
        campaignSessionScene.sessionId,
        campaignSessionScene.campaignId,
      ],
      name: "campaign_session_encounter_scene_fk",
    }).onDelete("cascade"),
    uniqueIndex("campaign_session_encounter_id_scene_session_campaign_uq").on(
      table.id,
      table.sceneId,
      table.sessionId,
      table.campaignId,
    ),
    uniqueIndex("campaign_session_encounter_scene_sequence_uq").on(
      table.sceneId,
      table.sequenceNumber,
    ),
    uniqueIndex("campaign_session_encounter_one_active_per_scene_uq")
      .on(table.sceneId)
      .where(sql`${table.status} = 'active'`),
    index("campaign_session_encounter_scene_status_idx").on(table.sceneId, table.status),
    index("campaign_session_encounter_scene_order_idx").on(table.sceneId, table.sequenceNumber),
    check("campaign_session_encounter_title_nonblank", sql`length(trim(${table.title})) > 0`),
    check("campaign_session_encounter_sequence_positive", sql`${table.sequenceNumber} > 0`),
    check(
      "campaign_session_encounter_lifecycle_timestamps_valid",
      sql`(
        (${table.status} = 'planned' AND ${table.startedAt} IS NULL AND ${table.completedAt} IS NULL)
        OR (${table.status} = 'active' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NULL)
        OR (${table.status} = 'completed' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const campaignSessionEncounterParticipant = pgTable(
  "campaign_session_encounter_participant",
  {
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    prepNotes: text("prep_notes").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.encounterId, table.characterId] }),
    uniqueIndex("campaign_session_encounter_participant_runtime_identity_uq").on(
      table.encounterId,
      table.sceneId,
      table.sessionId,
      table.campaignId,
      table.characterId,
    ),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounter.id,
        campaignSessionEncounter.sceneId,
        campaignSessionEncounter.sessionId,
        campaignSessionEncounter.campaignId,
      ],
      name: "campaign_session_encounter_participant_encounter_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sceneId, table.characterId],
      foreignColumns: [campaignSessionSceneMember.sceneId, campaignSessionSceneMember.characterId],
      name: "campaign_session_encounter_participant_scene_member_fk",
    }).onDelete("restrict"),
    index("campaign_session_encounter_participant_order_idx").on(table.encounterId, table.sortOrder),
    index("campaign_session_encounter_participant_scene_member_idx").on(table.sceneId, table.characterId),
    check("campaign_session_encounter_participant_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignSessionEncounterInitiative = pgTable(
  "campaign_session_encounter_initiative",
  {
    encounterId: integer("encounter_id").primaryKey(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    status: campaignSessionEncounterInitiativeStatus("status").default("active").notNull(),
    roundNumber: integer("round_number").default(1).notNull(),
    stepNumber: integer("step_number").default(1).notNull(),
    timelineInitiative: doublePrecision("timeline_initiative").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounter.id,
        campaignSessionEncounter.sceneId,
        campaignSessionEncounter.sessionId,
        campaignSessionEncounter.campaignId,
      ],
      name: "campaign_session_encounter_initiative_encounter_fk",
    }).onDelete("cascade"),
    uniqueIndex("campaign_session_encounter_initiative_runtime_identity_uq").on(
      table.encounterId,
      table.sceneId,
      table.sessionId,
      table.campaignId,
    ),
    index("campaign_session_encounter_initiative_campaign_status_idx").on(table.campaignId, table.status),
    check("campaign_session_encounter_initiative_round_positive", sql`${table.roundNumber} > 0`),
    check("campaign_session_encounter_initiative_step_positive", sql`${table.stepNumber} > 0`),
    check("campaign_session_encounter_initiative_timeline_nonnegative", sql`${table.timelineInitiative} >= 0`),
    check(
      "campaign_session_encounter_initiative_lifecycle_valid",
      sql`(
        (${table.status} = 'active' AND ${table.closedAt} IS NULL)
        OR (${table.status} = 'closed' AND ${table.closedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const campaignSessionEncounterInitiativeParticipant = pgTable(
  "campaign_session_encounter_initiative_participant",
  {
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    normalTotalInitiative: doublePrecision("normal_total_initiative").notNull(),
    currentInitiative: doublePrecision("current_initiative").notNull(),
    participationStatus: campaignSessionEncounterInitiativeParticipantStatus("participation_status").default("active").notNull(),
    deferredInitiativeCost: doublePrecision("deferred_initiative_cost").default(0).notNull(),
    lastSatisfiedStep: integer("last_satisfied_step").default(0).notNull(),
    movementMode: text("movement_mode").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.encounterId, table.characterId] }),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounterInitiative.encounterId,
        campaignSessionEncounterInitiative.sceneId,
        campaignSessionEncounterInitiative.sessionId,
        campaignSessionEncounterInitiative.campaignId,
      ],
      name: "campaign_session_encounter_initiative_participant_runtime_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId, table.characterId],
      foreignColumns: [
        campaignSessionEncounterParticipant.encounterId,
        campaignSessionEncounterParticipant.sceneId,
        campaignSessionEncounterParticipant.sessionId,
        campaignSessionEncounterParticipant.campaignId,
        campaignSessionEncounterParticipant.characterId,
      ],
      name: "campaign_session_encounter_initiative_participant_encounter_participant_fk",
    }).onDelete("restrict"),
    uniqueIndex("campaign_session_encounter_initiative_participant_runtime_identity_uq").on(
      table.encounterId,
      table.sceneId,
      table.sessionId,
      table.campaignId,
      table.characterId,
    ),
    index("campaign_session_encounter_initiative_participant_current_idx").on(
      table.encounterId,
      table.currentInitiative,
    ),
    index("campaign_session_encounter_initiative_participant_status_idx").on(
      table.encounterId,
      table.participationStatus,
    ),
    check("campaign_session_encounter_initiative_participant_normal_positive", sql`${table.normalTotalInitiative} > 0`),
    check("campaign_session_encounter_initiative_participant_deferred_nonnegative", sql`${table.deferredInitiativeCost} >= 0`),
    check("campaign_session_encounter_initiative_participant_step_nonnegative", sql`${table.lastSatisfiedStep} >= 0`),
  ],
);

export const campaignSessionEncounterPendingAction = pgTable(
  "campaign_session_encounter_pending_action",
  {
    id: serial("id").primaryKey(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    actorCharacterId: integer("actor_character_id").notNull(),
    label: text("label").notNull(),
    actionKind: text("action_kind").default("generic").notNull(),
    allowsMultiRound: boolean("allows_multi_round").default(false).notNull(),
    originalInitiativeCost: doublePrecision("original_initiative_cost").notNull(),
    initiativeSpent: doublePrecision("initiative_spent").default(0).notNull(),
    remainingInitiativeCost: doublePrecision("remaining_initiative_cost").notNull(),
    startInitiative: doublePrecision("start_initiative").notNull(),
    startTimelineInitiative: doublePrecision("start_timeline_initiative").notNull(),
    expectedCompletionInitiative: doublePrecision("expected_completion_initiative").notNull(),
    status: campaignSessionEncounterPendingActionStatus("status").default("active").notNull(),
    startedRound: integer("started_round").notNull(),
    completedRound: integer("completed_round"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId, table.actorCharacterId],
      foreignColumns: [
        campaignSessionEncounterInitiativeParticipant.encounterId,
        campaignSessionEncounterInitiativeParticipant.sceneId,
        campaignSessionEncounterInitiativeParticipant.sessionId,
        campaignSessionEncounterInitiativeParticipant.campaignId,
        campaignSessionEncounterInitiativeParticipant.characterId,
      ],
      name: "campaign_session_encounter_pending_action_actor_fk",
    }).onDelete("cascade"),
    uniqueIndex("campaign_session_encounter_pending_action_one_active_actor_uq")
      .on(table.encounterId, table.actorCharacterId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("campaign_session_encounter_pending_action_hierarchy_uq").on(
      table.id,
      table.encounterId,
      table.sceneId,
      table.sessionId,
      table.campaignId,
    ),
    uniqueIndex("campaign_session_encounter_pending_action_actor_hierarchy_uq").on(
      table.id,
      table.encounterId,
      table.sceneId,
      table.sessionId,
      table.campaignId,
      table.actorCharacterId,
    ),
    index("campaign_session_encounter_pending_action_timeline_idx").on(
      table.encounterId,
      table.status,
      table.expectedCompletionInitiative,
    ),
    index("campaign_session_encounter_pending_action_actor_history_idx").on(
      table.encounterId,
      table.actorCharacterId,
      table.createdAt,
    ),
    check("campaign_session_encounter_pending_action_label_nonblank", sql`length(trim(${table.label})) > 0`),
    check("campaign_session_encounter_pending_action_original_cost_positive", sql`${table.originalInitiativeCost} > 0`),
    check("campaign_session_encounter_pending_action_spent_nonnegative", sql`${table.initiativeSpent} >= 0`),
    check("campaign_session_encounter_pending_action_remaining_nonnegative", sql`${table.remainingInitiativeCost} >= 0`),
    check("campaign_session_encounter_pending_action_start_timeline_nonnegative", sql`${table.startTimelineInitiative} >= 0`),
    check("campaign_session_encounter_pending_action_started_round_positive", sql`${table.startedRound} > 0`),
    check("campaign_session_encounter_pending_action_completed_round_positive", sql`${table.completedRound} IS NULL OR ${table.completedRound} > 0`),
  ],
);

export const campaignSessionEncounterPendingActionSource = pgTable(
  "campaign_session_encounter_pending_action_source",
  {
    id: serial("id").primaryKey(),
    pendingActionId: integer("pending_action_id").notNull(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    sourceCharacterId: integer("source_character_id").notNull(),
    sourceKind: campaignSessionEncounterActionSourceKind("source_kind").notNull(),
    sourceRef: text("source_ref").notNull(),
    sourceInstanceId: integer("source_instance_id"),
    payloadJson: text("payload_json").notNull(),
    resolutionStatus: campaignSessionEncounterActionResolutionStatus("resolution_status")
      .default("pending")
      .notNull(),
    resolvedAt: timestamp("resolved_at"),
    resolutionSummary: text("resolution_summary").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("campaign_session_encounter_pending_action_source_action_uq").on(table.pendingActionId),
    foreignKey({
      columns: [table.pendingActionId, table.encounterId, table.sceneId, table.sessionId, table.campaignId, table.sourceCharacterId],
      foreignColumns: [
        campaignSessionEncounterPendingAction.id,
        campaignSessionEncounterPendingAction.encounterId,
        campaignSessionEncounterPendingAction.sceneId,
        campaignSessionEncounterPendingAction.sessionId,
        campaignSessionEncounterPendingAction.campaignId,
        campaignSessionEncounterPendingAction.actorCharacterId,
      ],
      name: "campaign_session_encounter_pending_action_source_action_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId, table.sourceCharacterId],
      foreignColumns: [
        campaignSessionEncounterParticipant.encounterId,
        campaignSessionEncounterParticipant.sceneId,
        campaignSessionEncounterParticipant.sessionId,
        campaignSessionEncounterParticipant.campaignId,
        campaignSessionEncounterParticipant.characterId,
      ],
      name: "campaign_session_encounter_pending_action_source_participant_fk",
    }).onDelete("restrict"),
    index("campaign_session_encounter_pending_action_source_history_idx").on(
      table.encounterId,
      table.resolutionStatus,
      table.createdAt,
    ),
    index("campaign_session_encounter_pending_action_source_character_idx").on(
      table.encounterId,
      table.sourceCharacterId,
      table.createdAt,
    ),
    check("campaign_session_encounter_pending_action_source_ref_nonblank", sql`length(trim(${table.sourceRef})) > 0`),
    check("campaign_session_encounter_pending_action_source_payload_nonblank", sql`length(trim(${table.payloadJson})) > 0`),
    check(
      "campaign_session_encounter_pending_action_source_resolution_valid",
      sql`(
        (${table.resolutionStatus} = 'pending' AND ${table.resolvedAt} IS NULL)
        OR (${table.resolutionStatus} <> 'pending' AND ${table.resolvedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const campaignSessionEncounterReaction = pgTable(
  "campaign_session_encounter_reaction",
  {
    id: serial("id").primaryKey(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    pendingActionId: integer("pending_action_id").notNull(),
    reactorCharacterId: integer("reactor_character_id").notNull(),
    reactionType: campaignSessionEncounterReactionType("reaction_type").notNull(),
    defendingItemId: integer("defending_item_id"),
    defendingInstanceId: integer("defending_instance_id"),
    committedInitiativeCost: doublePrecision("committed_initiative_cost").notNull(),
    status: campaignSessionEncounterReactionStatus("status").default("declared").notNull(),
    outcome: text("outcome").default("").notNull(),
    defenderFinalCost: doublePrecision("defender_final_cost"),
    attackerAdditionalCost: doublePrecision("attacker_additional_cost"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.pendingActionId, table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounterPendingAction.id,
        campaignSessionEncounterPendingAction.encounterId,
        campaignSessionEncounterPendingAction.sceneId,
        campaignSessionEncounterPendingAction.sessionId,
        campaignSessionEncounterPendingAction.campaignId,
      ],
      name: "campaign_session_encounter_reaction_action_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId, table.reactorCharacterId],
      foreignColumns: [
        campaignSessionEncounterInitiativeParticipant.encounterId,
        campaignSessionEncounterInitiativeParticipant.sceneId,
        campaignSessionEncounterInitiativeParticipant.sessionId,
        campaignSessionEncounterInitiativeParticipant.campaignId,
        campaignSessionEncounterInitiativeParticipant.characterId,
      ],
      name: "campaign_session_encounter_reaction_reactor_fk",
    }).onDelete("restrict"),
    uniqueIndex("campaign_session_encounter_reaction_one_declared_reactor_uq")
      .on(table.pendingActionId, table.reactorCharacterId)
      .where(sql`${table.status} = 'declared'`),
    index("campaign_session_encounter_reaction_history_idx").on(
      table.encounterId,
      table.pendingActionId,
      table.createdAt,
    ),
    check("campaign_session_encounter_reaction_cost_positive", sql`${table.committedInitiativeCost} > 0`),
    check("campaign_session_encounter_reaction_final_cost_nonnegative", sql`${table.defenderFinalCost} IS NULL OR ${table.defenderFinalCost} >= 0`),
    check("campaign_session_encounter_reaction_attacker_cost_nonnegative", sql`${table.attackerAdditionalCost} IS NULL OR ${table.attackerAdditionalCost} >= 0`),
    check(
      "campaign_session_encounter_reaction_resolution_valid",
      sql`(
        (${table.status} = 'declared' AND ${table.resolvedAt} IS NULL)
        OR (${table.status} <> 'declared' AND ${table.resolvedAt} IS NOT NULL)
      )`,
    ),
    check(
      "campaign_session_encounter_reaction_defending_item_valid",
      sql`(
        (${table.reactionType} IN ('block', 'parry') AND ${table.defendingItemId} IS NOT NULL)
        OR (${table.reactionType} IN ('dodge', 'no-reaction') AND ${table.defendingItemId} IS NULL AND ${table.defendingInstanceId} IS NULL)
      )`,
    ),
  ],
);

export const campaignSessionRelations = relations(campaignSession, ({ one, many }) => ({
  campaign: one(campaign, {
    fields: [campaignSession.campaignId],
    references: [campaign.id],
  }),
  roster: many(campaignSessionRoster),
  scenes: many(campaignSessionScene),
}));

export const campaignSessionRosterRelations = relations(campaignSessionRoster, ({ one, many }) => ({
  session: one(campaignSession, {
    fields: [campaignSessionRoster.sessionId],
    references: [campaignSession.id],
  }),
  character: one(campaignCharacter, {
    fields: [campaignSessionRoster.characterId],
    references: [campaignCharacter.id],
  }),
  sceneMemberships: many(campaignSessionSceneMember),
}));

export const campaignSessionSceneRelations = relations(campaignSessionScene, ({ one, many }) => ({
  session: one(campaignSession, {
    fields: [campaignSessionScene.sessionId],
    references: [campaignSession.id],
  }),
  members: many(campaignSessionSceneMember),
  encounters: many(campaignSessionEncounter),
}));

export const campaignSessionSceneMemberRelations = relations(campaignSessionSceneMember, ({ one, many }) => ({
  scene: one(campaignSessionScene, {
    fields: [campaignSessionSceneMember.sceneId],
    references: [campaignSessionScene.id],
  }),
  roster: one(campaignSessionRoster, {
    fields: [campaignSessionSceneMember.sessionId, campaignSessionSceneMember.characterId],
    references: [campaignSessionRoster.sessionId, campaignSessionRoster.characterId],
  }),
  encounterParticipations: many(campaignSessionEncounterParticipant),
}));

export const campaignSessionEncounterRelations = relations(campaignSessionEncounter, ({ one, many }) => ({
  scene: one(campaignSessionScene, {
    fields: [campaignSessionEncounter.sceneId],
    references: [campaignSessionScene.id],
  }),
  participants: many(campaignSessionEncounterParticipant),
  initiativeRuntime: one(campaignSessionEncounterInitiative),
}));

export const campaignSessionEncounterParticipantRelations = relations(campaignSessionEncounterParticipant, ({ one }) => ({
  encounter: one(campaignSessionEncounter, {
    fields: [campaignSessionEncounterParticipant.encounterId],
    references: [campaignSessionEncounter.id],
  }),
  sceneMember: one(campaignSessionSceneMember, {
    fields: [campaignSessionEncounterParticipant.sceneId, campaignSessionEncounterParticipant.characterId],
    references: [campaignSessionSceneMember.sceneId, campaignSessionSceneMember.characterId],
  }),
  initiativeState: one(campaignSessionEncounterInitiativeParticipant),
}));

export const campaignSessionEncounterInitiativeRelations = relations(campaignSessionEncounterInitiative, ({ one, many }) => ({
  encounter: one(campaignSessionEncounter, {
    fields: [campaignSessionEncounterInitiative.encounterId],
    references: [campaignSessionEncounter.id],
  }),
  participants: many(campaignSessionEncounterInitiativeParticipant),
  pendingActions: many(campaignSessionEncounterPendingAction),
}));

export const campaignSessionEncounterInitiativeParticipantRelations = relations(campaignSessionEncounterInitiativeParticipant, ({ one, many }) => ({
  runtime: one(campaignSessionEncounterInitiative, {
    fields: [campaignSessionEncounterInitiativeParticipant.encounterId],
    references: [campaignSessionEncounterInitiative.encounterId],
  }),
  encounterParticipant: one(campaignSessionEncounterParticipant, {
    fields: [
      campaignSessionEncounterInitiativeParticipant.encounterId,
      campaignSessionEncounterInitiativeParticipant.characterId,
    ],
    references: [
      campaignSessionEncounterParticipant.encounterId,
      campaignSessionEncounterParticipant.characterId,
    ],
  }),
  pendingActions: many(campaignSessionEncounterPendingAction),
}));

export const campaignSessionEncounterPendingActionRelations = relations(campaignSessionEncounterPendingAction, ({ one }) => ({
  runtime: one(campaignSessionEncounterInitiative, {
    fields: [campaignSessionEncounterPendingAction.encounterId],
    references: [campaignSessionEncounterInitiative.encounterId],
  }),
  actor: one(campaignSessionEncounterInitiativeParticipant, {
    fields: [
      campaignSessionEncounterPendingAction.encounterId,
      campaignSessionEncounterPendingAction.actorCharacterId,
    ],
    references: [
      campaignSessionEncounterInitiativeParticipant.encounterId,
      campaignSessionEncounterInitiativeParticipant.characterId,
    ],
  }),
}));

export type CampaignSessionStatus = (typeof campaignSessionStatus.enumValues)[number];
export type CampaignSessionSceneStatus = (typeof campaignSessionSceneStatus.enumValues)[number];
export type CampaignSessionEncounterStatus = (typeof campaignSessionEncounterStatus.enumValues)[number];
export type CampaignSessionEncounterType = (typeof campaignSessionEncounterType.enumValues)[number];
export type CampaignSessionEncounterInitiativeStatus = (typeof campaignSessionEncounterInitiativeStatus.enumValues)[number];
export type CampaignSessionEncounterInitiativeParticipantStatus = (typeof campaignSessionEncounterInitiativeParticipantStatus.enumValues)[number];
export type CampaignSessionEncounterPendingActionStatus = (typeof campaignSessionEncounterPendingActionStatus.enumValues)[number];
