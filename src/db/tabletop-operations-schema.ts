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
import { user } from "./auth-schema";
import {
  campaignCharacter,
  campaignCharacterActiveCondition,
  campaignCharacterActiveModifier,
  campaignCharacterProfile,
} from "./realm-schema";

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

export const campaignSessionEffectDurationBindingStatus = pgEnum(
  "campaign_session_effect_duration_binding_status",
  ["active", "expired", "closed"],
);

export const campaignSessionEncounterRewardKind = pgEnum(
  "campaign_session_encounter_reward_kind",
  ["experience"],
);

export const campaignSessionRollMethod = pgEnum(
  "campaign_session_roll_method",
  ["random", "entered"],
);

export const campaignSessionRollVisibility = pgEnum(
  "campaign_session_roll_visibility",
  ["table", "god-only"],
);

export const campaignSessionRollPurpose = pgEnum(
  "campaign_session_roll_purpose",
  ["free", "attribute", "skill", "attack", "defense", "ability", "other"],
);

export const campaignSessionRollStatus = pgEnum(
  "campaign_session_roll_status",
  ["recorded", "voided"],
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
    uniqueIndex("campaign_session_encounter_reaction_hierarchy_uq").on(
      table.id,
      table.encounterId,
      table.sceneId,
      table.sessionId,
      table.campaignId,
    ),
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

export const campaignSessionEffectDurationBinding = pgTable(
  "campaign_session_effect_duration_binding",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull(),
    sessionId: integer("session_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    encounterId: integer("encounter_id"),
    characterId: integer("character_id").notNull(),
    conditionId: integer("condition_id"),
    modifierId: integer("modifier_id"),
    durationKind: text("duration_kind").notNull(),
    remainingValue: integer("remaining_value"),
    status: campaignSessionEffectDurationBindingStatus("status").default("active").notNull(),
    closedAt: timestamp("closed_at"),
    closeReason: text("close_reason").default("").notNull(),
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
      name: "campaign_session_effect_duration_binding_scene_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounter.id,
        campaignSessionEncounter.sceneId,
        campaignSessionEncounter.sessionId,
        campaignSessionEncounter.campaignId,
      ],
      name: "campaign_session_effect_duration_binding_encounter_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.characterId, table.campaignId],
      foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId],
      name: "campaign_session_effect_duration_binding_character_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conditionId, table.characterId],
      foreignColumns: [campaignCharacterActiveCondition.id, campaignCharacterActiveCondition.characterId],
      name: "campaign_session_effect_duration_binding_condition_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.modifierId, table.characterId],
      foreignColumns: [campaignCharacterActiveModifier.id, campaignCharacterActiveModifier.characterId],
      name: "campaign_session_effect_duration_binding_modifier_fk",
    }).onDelete("cascade"),
    uniqueIndex("campaign_session_effect_duration_binding_condition_uq")
      .on(table.conditionId)
      .where(sql`${table.conditionId} IS NOT NULL`),
    uniqueIndex("campaign_session_effect_duration_binding_modifier_uq")
      .on(table.modifierId)
      .where(sql`${table.modifierId} IS NOT NULL`),
    index("campaign_session_effect_duration_binding_encounter_status_idx").on(
      table.encounterId,
      table.status,
      table.durationKind,
    ),
    index("campaign_session_effect_duration_binding_scene_status_idx").on(
      table.sceneId,
      table.status,
      table.durationKind,
    ),
    index("campaign_session_effect_duration_binding_character_status_idx").on(
      table.characterId,
      table.status,
    ),
    check(
      "campaign_session_effect_duration_binding_effect_identity_valid",
      sql`num_nonnulls(${table.conditionId}, ${table.modifierId}) = 1`,
    ),
    check(
      "campaign_session_effect_duration_binding_kind_valid",
      sql`${table.durationKind} IN ('combat-steps','combat-rounds','scene')`,
    ),
    check(
      "campaign_session_effect_duration_binding_context_valid",
      sql`(
        ${table.durationKind} IN ('combat-steps','combat-rounds')
        AND ${table.encounterId} IS NOT NULL
        AND ${table.remainingValue} IS NOT NULL
        AND ${table.remainingValue} >= 0
      ) OR (
        ${table.durationKind} = 'scene'
        AND ${table.encounterId} IS NULL
        AND ${table.remainingValue} IS NULL
      )`,
    ),
    check(
      "campaign_session_effect_duration_binding_lifecycle_valid",
      sql`(
        ${table.status} = 'active'
        AND ${table.closedAt} IS NULL
        AND ${table.closeReason} = ''
        AND (${table.remainingValue} IS NULL OR ${table.remainingValue} > 0)
      ) OR (
        ${table.status} <> 'active'
        AND ${table.closedAt} IS NOT NULL
        AND length(trim(${table.closeReason})) > 0
      )`,
    ),
  ],
);

export const campaignSessionEncounterReward = pgTable(
  "campaign_session_encounter_reward",
  {
    id: serial("id").primaryKey(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    rewardKind: campaignSessionEncounterRewardKind("reward_kind").default("experience").notNull(),
    amount: doublePrecision("amount").notNull(),
    note: text("note").default("").notNull(),
    awardedAt: timestamp("awarded_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
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
      name: "campaign_session_encounter_reward_encounter_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.encounterId,
        table.sceneId,
        table.sessionId,
        table.campaignId,
        table.characterId,
      ],
      foreignColumns: [
        campaignSessionEncounterParticipant.encounterId,
        campaignSessionEncounterParticipant.sceneId,
        campaignSessionEncounterParticipant.sessionId,
        campaignSessionEncounterParticipant.campaignId,
        campaignSessionEncounterParticipant.characterId,
      ],
      name: "campaign_session_encounter_reward_participant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.characterId],
      foreignColumns: [campaignCharacterProfile.characterId],
      name: "campaign_session_encounter_reward_profile_fk",
    }).onDelete("restrict"),
    uniqueIndex("campaign_session_encounter_reward_character_kind_uq").on(
      table.encounterId,
      table.characterId,
      table.rewardKind,
    ),
    index("campaign_session_encounter_reward_history_idx").on(
      table.encounterId,
      table.awardedAt,
      table.id,
    ),
    check("campaign_session_encounter_reward_amount_positive", sql`${table.amount} > 0`),
    check("campaign_session_encounter_reward_kind_valid", sql`${table.rewardKind} = 'experience'`),
  ],
);

export const campaignSessionRoll = pgTable(
  "campaign_session_roll",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull(),
    sessionId: integer("session_id").notNull(),
    sceneId: integer("scene_id"),
    encounterId: integer("encounter_id"),
    rollerCharacterId: integer("roller_character_id"),
    targetCharacterId: integer("target_character_id"),
    pendingActionId: integer("pending_action_id"),
    reactionId: integer("reaction_id"),
    recordedByUserId: text("recorded_by_user_id").notNull(),
    method: campaignSessionRollMethod("method").notNull(),
    visibility: campaignSessionRollVisibility("visibility").default("god-only").notNull(),
    purposeKind: campaignSessionRollPurpose("purpose_kind").default("free").notNull(),
    label: text("label").default("").notNull(),
    resultTotal: integer("result_total").notNull(),
    targetNumber: doublePrecision("target_number"),
    notes: text("notes").default("").notNull(),
    roundNumber: integer("round_number"),
    stepNumber: integer("step_number"),
    status: campaignSessionRollStatus("status").default("recorded").notNull(),
    voidedAt: timestamp("voided_at"),
    voidReason: text("void_reason").default("").notNull(),
    voidedByUserId: text("voided_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId, table.campaignId],
      foreignColumns: [campaignSession.id, campaignSession.campaignId],
      name: "campaign_session_roll_session_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionScene.id,
        campaignSessionScene.sessionId,
        campaignSessionScene.campaignId,
      ],
      name: "campaign_session_roll_scene_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounter.id,
        campaignSessionEncounter.sceneId,
        campaignSessionEncounter.sessionId,
        campaignSessionEncounter.campaignId,
      ],
      name: "campaign_session_roll_encounter_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rollerCharacterId, table.campaignId],
      foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId],
      name: "campaign_session_roll_roller_character_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.targetCharacterId, table.campaignId],
      foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId],
      name: "campaign_session_roll_target_character_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.pendingActionId,
        table.encounterId,
        table.sceneId,
        table.sessionId,
        table.campaignId,
      ],
      foreignColumns: [
        campaignSessionEncounterPendingAction.id,
        campaignSessionEncounterPendingAction.encounterId,
        campaignSessionEncounterPendingAction.sceneId,
        campaignSessionEncounterPendingAction.sessionId,
        campaignSessionEncounterPendingAction.campaignId,
      ],
      name: "campaign_session_roll_pending_action_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.reactionId, table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounterReaction.id,
        campaignSessionEncounterReaction.encounterId,
        campaignSessionEncounterReaction.sceneId,
        campaignSessionEncounterReaction.sessionId,
        campaignSessionEncounterReaction.campaignId,
      ],
      name: "campaign_session_roll_reaction_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.recordedByUserId],
      foreignColumns: [user.id],
      name: "campaign_session_roll_recorded_by_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.voidedByUserId],
      foreignColumns: [user.id],
      name: "campaign_session_roll_voided_by_fk",
    }).onDelete("restrict"),
    index("campaign_session_roll_session_history_idx").on(table.sessionId, table.createdAt, table.id),
    index("campaign_session_roll_scene_history_idx").on(table.sceneId, table.createdAt, table.id),
    index("campaign_session_roll_encounter_history_idx").on(table.encounterId, table.createdAt, table.id),
    index("campaign_session_roll_roller_history_idx").on(table.rollerCharacterId, table.createdAt, table.id),
    index("campaign_session_roll_action_idx").on(table.pendingActionId, table.createdAt, table.id),
    index("campaign_session_roll_reaction_idx").on(table.reactionId, table.createdAt, table.id),
    index("campaign_session_roll_visibility_status_idx").on(table.sessionId, table.visibility, table.status),
    check(
      "campaign_session_roll_result_valid",
      sql`${table.resultTotal} BETWEEN 1 AND 100`,
    ),
    check(
      "campaign_session_roll_hierarchy_valid",
      sql`(
        (${table.sceneId} IS NULL AND ${table.encounterId} IS NULL)
        OR (${table.sceneId} IS NOT NULL)
      )
      AND (${table.pendingActionId} IS NULL OR ${table.encounterId} IS NOT NULL)
      AND (${table.reactionId} IS NULL OR ${table.encounterId} IS NOT NULL)`,
    ),
    check(
      "campaign_session_roll_initiative_snapshot_valid",
      sql`(
        ${table.roundNumber} IS NULL
        AND ${table.stepNumber} IS NULL
      ) OR (
        ${table.encounterId} IS NOT NULL
        AND ${table.roundNumber} > 0
        AND ${table.stepNumber} > 0
      )`,
    ),
    check("campaign_session_roll_label_length_valid", sql`length(${table.label}) <= 200`),
    check("campaign_session_roll_notes_length_valid", sql`length(${table.notes}) <= 2000`),
    check("campaign_session_roll_void_reason_length_valid", sql`length(${table.voidReason}) <= 500`),
    check(
      "campaign_session_roll_lifecycle_valid",
      sql`(
        ${table.status} = 'recorded'
        AND ${table.voidedAt} IS NULL
        AND ${table.voidReason} = ''
        AND ${table.voidedByUserId} IS NULL
      ) OR (
        ${table.status} = 'voided'
        AND ${table.voidedAt} IS NOT NULL
        AND length(trim(${table.voidReason})) > 0
        AND ${table.voidedByUserId} IS NOT NULL
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
  rolls: many(campaignSessionRoll),
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
  rolls: many(campaignSessionRoll),
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
  durationBindings: many(campaignSessionEffectDurationBinding),
  rewards: many(campaignSessionEncounterReward),
  rolls: many(campaignSessionRoll),
}));

export const campaignSessionRollRelations = relations(campaignSessionRoll, ({ one }) => ({
  session: one(campaignSession, {
    fields: [campaignSessionRoll.sessionId],
    references: [campaignSession.id],
  }),
  scene: one(campaignSessionScene, {
    fields: [campaignSessionRoll.sceneId],
    references: [campaignSessionScene.id],
  }),
  encounter: one(campaignSessionEncounter, {
    fields: [campaignSessionRoll.encounterId],
    references: [campaignSessionEncounter.id],
  }),
  roller: one(campaignCharacter, {
    fields: [campaignSessionRoll.rollerCharacterId],
    references: [campaignCharacter.id],
  }),
  target: one(campaignCharacter, {
    fields: [campaignSessionRoll.targetCharacterId],
    references: [campaignCharacter.id],
  }),
  pendingAction: one(campaignSessionEncounterPendingAction, {
    fields: [campaignSessionRoll.pendingActionId],
    references: [campaignSessionEncounterPendingAction.id],
  }),
  reaction: one(campaignSessionEncounterReaction, {
    fields: [campaignSessionRoll.reactionId],
    references: [campaignSessionEncounterReaction.id],
  }),
  recordedBy: one(user, {
    fields: [campaignSessionRoll.recordedByUserId],
    references: [user.id],
  }),
  voidedBy: one(user, {
    fields: [campaignSessionRoll.voidedByUserId],
    references: [user.id],
  }),
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
export type CampaignSessionEffectDurationBindingStatus = (typeof campaignSessionEffectDurationBindingStatus.enumValues)[number];
export type CampaignSessionEncounterRewardKind = (typeof campaignSessionEncounterRewardKind.enumValues)[number];
export type CampaignSessionRollMethod = (typeof campaignSessionRollMethod.enumValues)[number];
export type CampaignSessionRollVisibility = (typeof campaignSessionRollVisibility.enumValues)[number];
export type CampaignSessionRollPurpose = (typeof campaignSessionRollPurpose.enumValues)[number];
export type CampaignSessionRollStatus = (typeof campaignSessionRollStatus.enumValues)[number];
