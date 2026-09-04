import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  boolean,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { campaign } from "./campaign-schema";
import { user } from "./auth-schema";
import { creature } from "./creature-schema";
import {
  campaignCharacter,
  campaignCharacterActiveCondition,
  campaignCharacterActiveModifier,
  campaignCharacterItemInstance,
  campaignCharacterProfile,
} from "./realm-schema";
import { item, weaponFiringMode, weaponProfile } from "./item-schema";
import { skill } from "./skill-schema";

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
  [
    "weapon",
    "creature-attack",
    "spell",
    "item",
    "creature-ability",
    "derived-ability",
    "skill",
    "attribute",
    "no-roll",
    "manual",
  ],
);

export const campaignSessionEncounterActionResolutionStatus = pgEnum(
  "campaign_session_encounter_action_resolution_status",
  ["pending", "resolved", "cancelled", "needs-ruling"],
);

export const campaignSessionEncounterReactionType = pgEnum(
  "campaign_session_encounter_reaction_type",
  ["dodge", "block", "parry", "no-reaction", "tackle", "intervention"],
);

export const campaignSessionEncounterReactionStatus = pgEnum(
  "campaign_session_encounter_reaction_status",
  ["declared", "resolved", "cancelled", "needs-ruling"],
);

export const campaignSessionEncounterActionDeclarationStatus = pgEnum(
  "campaign_session_encounter_action_declaration_status",
  [
    "draft",
    "locked",
    "committed",
    "rolling-ready",
    "rolling",
    "awaiting-god-ruling",
    "resolved",
    "cancelled",
    "interrupted",
    "abandoned",
  ],
);

export const campaignSessionEncounterResponderOpportunityStatus = pgEnum(
  "campaign_session_encounter_responder_opportunity_status",
  ["pending", "response-declared", "declined", "ineligible", "cancelled"],
);

export const campaignSessionEncounterResponderOpportunitySource = pgEnum(
  "campaign_session_encounter_responder_opportunity_source",
  ["initiative", "god-exception"],
);

export const campaignSessionEncounterEffectPlanStatus = pgEnum(
  "campaign_session_encounter_effect_plan_status",
  [
    "calculated",
    "requires-god-ruling",
    "approved",
    "applied",
    "partially-applied",
    "declined",
    "cancelled",
    "superseded",
    "application-failed",
  ],
);

export const campaignSessionEncounterEffectStatus = pgEnum(
  "campaign_session_encounter_effect_status",
  [
    "calculated",
    "requires-god-ruling",
    "approved",
    "applied",
    "declined",
    "manual-resolved",
    "application-failed",
  ],
);

export const campaignSessionEffectDurationBindingStatus = pgEnum(
  "campaign_session_effect_duration_binding_status",
  ["active", "expired", "closed"],
);

export const campaignSessionEncounterRewardKind = pgEnum(
  "campaign_session_encounter_reward_kind",
  ["experience"],
);

export const defenseSkillPathMapping = pgTable(
  "defense_skill_path_mapping",
  {
    id: serial("id").primaryKey(),
    defenseType: text("defense_type").default("dodge").notNull(),
    endpointSkillId: integer("endpoint_skill_id").notNull().references(() => skill.id, { onDelete: "restrict" }),
    conditional: boolean("conditional").default(false).notNull(),
    circumstanceLabel: text("circumstance_label").default("").notNull(),
    reviewState: text("review_state").default("review-required").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    notes: text("notes").default("").notNull(),
    updatedByUserId: text("updated_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("defense_skill_path_mapping_identity_uq").on(table.defenseType, table.endpointSkillId),
    index("defense_skill_path_mapping_review_idx").on(table.defenseType, table.reviewState, table.sortOrder, table.id),
    check("defense_skill_path_mapping_type_valid", sql`${table.defenseType} = 'dodge'`),
    check("defense_skill_path_mapping_review_valid", sql`${table.reviewState} IN ('review-required','approved')`),
    check("defense_skill_path_mapping_order_valid", sql`${table.sortOrder} >= 0`),
    check("defense_skill_path_mapping_condition_valid", sql`(${table.conditional} AND length(trim(${table.circumstanceLabel})) > 0) OR (NOT ${table.conditional} AND ${table.circumstanceLabel} = '')`),
  ],
);

export const campaignSessionRollMethod = pgEnum(
  "campaign_session_roll_method",
  ["random", "entered"],
);

export const campaignSessionRollVisibility = pgEnum(
  "campaign_session_roll_visibility",
  ["table", "private", "god-only"],
);

export const campaignSessionRollPurpose = pgEnum(
  "campaign_session_roll_purpose",
  ["free", "attribute", "skill", "attack", "defense", "ability", "other"],
);

export const campaignSessionRollStatus = pgEnum(
  "campaign_session_roll_status",
  ["recorded", "voided"],
);

export const campaignSessionRollAmendmentKind = pgEnum(
  "campaign_session_roll_amendment_kind",
  ["correction", "void", "ruling"],
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
    participantId: serial("participant_id").notNull(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    participantKind: text("participant_kind").default("campaign-character").notNull(),
    creatureId: integer("creature_id").references(() => creature.id, { onDelete: "restrict" }),
    displayLabel: text("display_label").default("").notNull(),
    creatureSnapshotJson: jsonb("creature_snapshot_json"),
    localStateJson: jsonb("local_state_json"),
    sortOrder: integer("sort_order").default(0).notNull(),
    prepNotes: text("prep_notes").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.encounterId, table.characterId] }),
    uniqueIndex("campaign_session_encounter_participant_id_uq").on(table.participantId),
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
    index("campaign_session_encounter_participant_order_idx").on(table.encounterId, table.sortOrder),
    index("campaign_session_encounter_participant_scene_member_idx").on(table.sceneId, table.characterId),
    check("campaign_session_encounter_participant_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
    check("campaign_session_encounter_participant_source_valid", sql`(
      (${table.participantKind} = 'campaign-character' AND ${table.characterId} > 0 AND ${table.creatureId} IS NULL AND ${table.creatureSnapshotJson} IS NULL)
      OR (${table.participantKind} = 'creature' AND ${table.characterId} < 0 AND ${table.creatureId} IS NOT NULL AND ${table.creatureSnapshotJson} IS NOT NULL AND length(trim(${table.displayLabel})) > 0)
    )`),
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
    additionalInitiativeCost: doublePrecision("additional_initiative_cost").default(0).notNull(),
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
    check("campaign_session_encounter_pending_action_additional_cost_nonnegative", sql`${table.additionalInitiativeCost} >= 0`),
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
    protectedTargetCharacterId: integer("protected_target_character_id"),
    targetCharacterId: integer("target_character_id"),
    opposesReactionId: integer("opposes_reaction_id").references(
      (): AnyPgColumn => campaignSessionEncounterReaction.id,
      { onDelete: "restrict" },
    ),
    reactionType: campaignSessionEncounterReactionType("reaction_type").notNull(),
    defendingItemId: integer("defending_item_id"),
    defendingInstanceId: integer("defending_instance_id"),
    committedInitiativeCost: doublePrecision("committed_initiative_cost").notNull(),
    status: campaignSessionEncounterReactionStatus("status").default("declared").notNull(),
    outcome: text("outcome").default("").notNull(),
    defenderFinalCost: doublePrecision("defender_final_cost"),
    attackerAdditionalCost: doublePrecision("attacker_additional_cost"),
    declarationSnapshotJson: jsonb("declaration_snapshot_json"),
    objectiveComparisonJson: jsonb("objective_comparison_json"),
    resolutionSnapshotJson: jsonb("resolution_snapshot_json"),
    rollRequired: boolean("roll_required"),
    godApprovalReason: text("god_approval_reason").default("").notNull(),
    declaredByUserId: text("declared_by_user_id"),
    godApprovedByUserId: text("god_approved_by_user_id"),
    rulingReason: text("ruling_reason").default("").notNull(),
    ruledByUserId: text("ruled_by_user_id"),
    ruledAt: timestamp("ruled_at"),
    originalActionDisposition: text("original_action_disposition"),
    reconciliationAppliedAt: timestamp("reconciliation_applied_at"),
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
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId, table.protectedTargetCharacterId],
      foreignColumns: [
        campaignSessionEncounterParticipant.encounterId,
        campaignSessionEncounterParticipant.sceneId,
        campaignSessionEncounterParticipant.sessionId,
        campaignSessionEncounterParticipant.campaignId,
        campaignSessionEncounterParticipant.characterId,
      ],
      name: "campaign_session_encounter_reaction_protected_target_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId, table.targetCharacterId],
      foreignColumns: [
        campaignSessionEncounterParticipant.encounterId,
        campaignSessionEncounterParticipant.sceneId,
        campaignSessionEncounterParticipant.sessionId,
        campaignSessionEncounterParticipant.campaignId,
        campaignSessionEncounterParticipant.characterId,
      ],
      name: "campaign_session_encounter_reaction_target_fk",
    }).onDelete("restrict"),
    foreignKey({ columns: [table.declaredByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_reaction_declared_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.godApprovedByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_reaction_god_approved_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.ruledByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_reaction_ruled_by_fk" }).onDelete("restrict"),
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
    check("campaign_session_encounter_reaction_cost_nonnegative", sql`${table.committedInitiativeCost} >= 0`),
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
        OR (${table.reactionType} NOT IN ('block', 'parry', 'dodge', 'no-reaction'))
      )`,
    ),
    check("campaign_session_encounter_reaction_declaration_snapshot_object", sql`${table.declarationSnapshotJson} IS NULL OR jsonb_typeof(${table.declarationSnapshotJson}) = 'object'`),
    check("campaign_session_encounter_reaction_comparison_snapshot_object", sql`${table.objectiveComparisonJson} IS NULL OR jsonb_typeof(${table.objectiveComparisonJson}) = 'object'`),
    check("campaign_session_encounter_reaction_resolution_snapshot_object", sql`${table.resolutionSnapshotJson} IS NULL OR jsonb_typeof(${table.resolutionSnapshotJson}) = 'object'`),
    check("campaign_session_encounter_reaction_pass_seven_identity_valid", sql`${table.declarationSnapshotJson} IS NULL OR (${table.protectedTargetCharacterId} IS NOT NULL AND ${table.declaredByUserId} IS NOT NULL AND ${table.rollRequired} IS NOT NULL)`),
    check("campaign_session_encounter_reaction_no_defense_cost_valid", sql`${table.declarationSnapshotJson} IS NULL OR ${table.reactionType} <> 'no-reaction' OR (${table.committedInitiativeCost} = 0 AND ${table.rollRequired} = false)`),
    check("campaign_session_encounter_reaction_ruling_valid", sql`(${table.ruledAt} IS NULL AND ${table.ruledByUserId} IS NULL) OR (${table.ruledAt} IS NOT NULL AND ${table.ruledByUserId} IS NOT NULL AND length(trim(${table.rulingReason})) > 0)`),
    check("campaign_session_encounter_reaction_disposition_valid", sql`${table.originalActionDisposition} IS NULL OR ${table.originalActionDisposition} IN ('continue','continue-modified','retarget','cancel','stopped','target-removed','awaiting-god-ruling')`),
  ],
);

export const campaignSessionEncounterReactionEvent = pgTable(
  "campaign_session_encounter_reaction_event",
  {
    id: serial("id").primaryKey(),
    reactionId: integer("reaction_id").notNull(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    fromStatus: campaignSessionEncounterReactionStatus("from_status"),
    toStatus: campaignSessionEncounterReactionStatus("to_status").notNull(),
    eventKind: text("event_kind").notNull(),
    reason: text("reason").default("").notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    actorUserId: text("actor_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.reactionId, table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounterReaction.id,
        campaignSessionEncounterReaction.encounterId,
        campaignSessionEncounterReaction.sceneId,
        campaignSessionEncounterReaction.sessionId,
        campaignSessionEncounterReaction.campaignId,
      ],
      name: "campaign_session_encounter_reaction_event_reaction_fk",
    }).onDelete("restrict"),
    foreignKey({ columns: [table.actorUserId], foreignColumns: [user.id], name: "campaign_session_encounter_reaction_event_actor_fk" }).onDelete("restrict"),
    index("campaign_session_encounter_reaction_event_history_idx").on(table.reactionId, table.createdAt, table.id),
    check("campaign_session_encounter_reaction_event_kind_nonblank", sql`length(trim(${table.eventKind})) > 0`),
    check("campaign_session_encounter_reaction_event_metadata_object", sql`jsonb_typeof(${table.metadata}) = 'object'`),
  ],
);

export const campaignSessionEncounterActionDeclaration = pgTable(
  "campaign_session_encounter_action_declaration",
  {
    id: serial("id").primaryKey(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    actorCharacterId: integer("actor_character_id").notNull(),
    pendingActionId: integer("pending_action_id"),
    supersedesDeclarationId: integer("supersedes_declaration_id"),
    status: campaignSessionEncounterActionDeclarationStatus("status").default("draft").notNull(),
    versionNumber: integer("version_number").default(1).notNull(),
    draftJson: jsonb("draft_json").notNull(),
    lockedSnapshotJson: jsonb("locked_snapshot_json"),
    rulingReason: text("ruling_reason").default("").notNull(),
    rulingNotes: text("ruling_notes").default("").notNull(),
    defenseResolutionJson: jsonb("defense_resolution_json"),
    defenseResolvedByUserId: text("defense_resolved_by_user_id"),
    defenseResolvedAt: timestamp("defense_resolved_at"),
    createdByUserId: text("created_by_user_id").notNull(),
    lockedByUserId: text("locked_by_user_id"),
    committedByUserId: text("committed_by_user_id"),
    endedByUserId: text("ended_by_user_id"),
    lockedAt: timestamp("locked_at"),
    committedAt: timestamp("committed_at"),
    endedAt: timestamp("ended_at"),
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
      name: "campaign_session_encounter_action_declaration_actor_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.pendingActionId, table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounterPendingAction.id,
        campaignSessionEncounterPendingAction.encounterId,
        campaignSessionEncounterPendingAction.sceneId,
        campaignSessionEncounterPendingAction.sessionId,
        campaignSessionEncounterPendingAction.campaignId,
      ],
      name: "campaign_session_encounter_action_declaration_pending_action_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.supersedesDeclarationId,
        table.encounterId,
        table.sceneId,
        table.sessionId,
        table.campaignId,
      ],
      foreignColumns: [
        table.id,
        table.encounterId,
        table.sceneId,
        table.sessionId,
        table.campaignId,
      ],
      name: "campaign_session_encounter_action_declaration_revision_fk",
    }).onDelete("restrict"),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_action_declaration_created_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.lockedByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_action_declaration_locked_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.committedByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_action_declaration_committed_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.endedByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_action_declaration_ended_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.defenseResolvedByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_action_declaration_defense_resolved_by_fk" }).onDelete("restrict"),
    uniqueIndex("campaign_session_encounter_action_declaration_pending_action_uq")
      .on(table.pendingActionId)
      .where(sql`${table.pendingActionId} IS NOT NULL`),
    uniqueIndex("campaign_session_encounter_action_declaration_supersedes_uq")
      .on(table.supersedesDeclarationId)
      .where(sql`${table.supersedesDeclarationId} IS NOT NULL`),
    unique("campaign_session_encounter_action_declaration_hierarchy_uq").on(
      table.id,
      table.encounterId,
      table.sceneId,
      table.sessionId,
      table.campaignId,
    ),
    unique("campaign_session_encounter_action_declaration_pending_hierarchy_uq").on(
      table.id,
      table.pendingActionId,
      table.encounterId,
      table.sceneId,
      table.sessionId,
      table.campaignId,
    ),
    index("campaign_session_encounter_action_declaration_status_idx").on(table.encounterId, table.status, table.createdAt),
    index("campaign_session_encounter_action_declaration_actor_idx").on(table.encounterId, table.actorCharacterId, table.createdAt),
    check("campaign_session_encounter_action_declaration_version_positive", sql`${table.versionNumber} > 0`),
    check("campaign_session_encounter_action_declaration_draft_object", sql`jsonb_typeof(${table.draftJson}) = 'object'`),
    check("campaign_session_encounter_action_declaration_snapshot_object", sql`${table.lockedSnapshotJson} IS NULL OR jsonb_typeof(${table.lockedSnapshotJson}) = 'object'`),
    check("campaign_session_encounter_action_declaration_defense_json_object", sql`${table.defenseResolutionJson} IS NULL OR jsonb_typeof(${table.defenseResolutionJson}) = 'object'`),
    check("campaign_session_encounter_action_declaration_defense_state_valid", sql`(${table.defenseResolutionJson} IS NULL AND ${table.defenseResolvedByUserId} IS NULL AND ${table.defenseResolvedAt} IS NULL) OR (${table.defenseResolutionJson} IS NOT NULL AND ${table.defenseResolvedByUserId} IS NOT NULL AND ${table.defenseResolvedAt} IS NOT NULL)`),
    check(
      "campaign_session_encounter_action_declaration_lifecycle_valid",
      sql`(
        ${table.status} = 'draft'
        AND ${table.pendingActionId} IS NULL
        AND ${table.lockedSnapshotJson} IS NULL
        AND ${table.lockedAt} IS NULL
        AND ${table.lockedByUserId} IS NULL
        AND ${table.committedAt} IS NULL
        AND ${table.committedByUserId} IS NULL
      ) OR (
        ${table.status} = 'locked'
        AND ${table.pendingActionId} IS NULL
        AND ${table.lockedSnapshotJson} IS NOT NULL
        AND ${table.lockedAt} IS NOT NULL
        AND ${table.lockedByUserId} IS NOT NULL
        AND ${table.committedAt} IS NULL
        AND ${table.committedByUserId} IS NULL
      ) OR (
        ${table.status} IN ('committed','rolling-ready','rolling','awaiting-god-ruling','resolved','interrupted','abandoned')
        AND ${table.pendingActionId} IS NOT NULL
        AND ${table.lockedSnapshotJson} IS NOT NULL
        AND ${table.lockedAt} IS NOT NULL
        AND ${table.lockedByUserId} IS NOT NULL
        AND ${table.committedAt} IS NOT NULL
        AND ${table.committedByUserId} IS NOT NULL
      ) OR (
        ${table.status} = 'cancelled'
        AND (
          (
            ${table.pendingActionId} IS NULL
            AND ${table.lockedSnapshotJson} IS NULL
            AND ${table.lockedAt} IS NULL
            AND ${table.lockedByUserId} IS NULL
            AND ${table.committedAt} IS NULL
            AND ${table.committedByUserId} IS NULL
          ) OR (
            ${table.pendingActionId} IS NULL
            AND ${table.lockedSnapshotJson} IS NOT NULL
            AND ${table.lockedAt} IS NOT NULL
            AND ${table.lockedByUserId} IS NOT NULL
            AND ${table.committedAt} IS NULL
            AND ${table.committedByUserId} IS NULL
          ) OR (
            ${table.pendingActionId} IS NOT NULL
            AND ${table.lockedSnapshotJson} IS NOT NULL
            AND ${table.lockedAt} IS NOT NULL
            AND ${table.lockedByUserId} IS NOT NULL
            AND ${table.committedAt} IS NOT NULL
            AND ${table.committedByUserId} IS NOT NULL
          )
        )
      )`,
    ),
    check(
      "campaign_session_encounter_action_declaration_end_valid",
      sql`(
        ${table.status} IN ('resolved','cancelled','abandoned')
        AND ${table.endedAt} IS NOT NULL
        AND ${table.endedByUserId} IS NOT NULL
      ) OR (
        ${table.status} NOT IN ('resolved','cancelled','abandoned')
        AND ${table.endedAt} IS NULL
        AND ${table.endedByUserId} IS NULL
      )`,
    ),
  ],
);

export const campaignSessionEncounterResponderOpportunity = pgTable(
  "campaign_session_encounter_responder_opportunity",
  {
    id: serial("id").primaryKey(),
    declarationId: integer("declaration_id").notNull(),
    pendingActionId: integer("pending_action_id").notNull(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    responderCharacterId: integer("responder_character_id").notNull(),
    reactionId: integer("reaction_id"),
    source: campaignSessionEncounterResponderOpportunitySource("source").notNull(),
    status: campaignSessionEncounterResponderOpportunityStatus("status").default("pending").notNull(),
    windowSequence: integer("window_sequence").default(1).notNull(),
    reachedAtInitiative: doublePrecision("reached_at_initiative").notNull(),
    reason: text("reason").notNull(),
    requiresGodConfirmation: boolean("requires_god_confirmation").default(true).notNull(),
    responseLabel: text("response_label").default("").notNull(),
    rulingReason: text("ruling_reason").default("").notNull(),
    createdByUserId: text("created_by_user_id"),
    reconciledByUserId: text("reconciled_by_user_id"),
    reconciledAt: timestamp("reconciled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.declarationId, table.pendingActionId, table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounterActionDeclaration.id,
        campaignSessionEncounterActionDeclaration.pendingActionId,
        campaignSessionEncounterActionDeclaration.encounterId,
        campaignSessionEncounterActionDeclaration.sceneId,
        campaignSessionEncounterActionDeclaration.sessionId,
        campaignSessionEncounterActionDeclaration.campaignId,
      ],
      name: "campaign_session_encounter_responder_opportunity_declaration_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId, table.responderCharacterId],
      foreignColumns: [
        campaignSessionEncounterInitiativeParticipant.encounterId,
        campaignSessionEncounterInitiativeParticipant.sceneId,
        campaignSessionEncounterInitiativeParticipant.sessionId,
        campaignSessionEncounterInitiativeParticipant.campaignId,
        campaignSessionEncounterInitiativeParticipant.characterId,
      ],
      name: "campaign_session_encounter_responder_opportunity_responder_fk",
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
      name: "campaign_session_encounter_responder_opportunity_reaction_fk",
    }).onDelete("restrict"),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_responder_opportunity_created_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.reconciledByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_responder_opportunity_reconciled_by_fk" }).onDelete("restrict"),
    uniqueIndex("campaign_session_encounter_responder_opportunity_character_uq").on(table.declarationId, table.windowSequence, table.responderCharacterId),
    index("campaign_session_encounter_responder_opportunity_status_idx").on(table.declarationId, table.status, table.reachedAtInitiative),
    check("campaign_session_encounter_responder_opportunity_window_positive", sql`${table.windowSequence} > 0`),
    check("campaign_session_encounter_responder_opportunity_reason_nonblank", sql`length(trim(${table.reason})) > 0`),
    check(
      "campaign_session_encounter_responder_opportunity_reconciliation_valid",
      sql`(
        ${table.status} = 'pending'
        AND ${table.reconciledAt} IS NULL
        AND ${table.reconciledByUserId} IS NULL
      ) OR (
        ${table.status} <> 'pending'
        AND ${table.reconciledAt} IS NOT NULL
        AND ${table.reconciledByUserId} IS NOT NULL
      )`,
    ),
    check("campaign_session_encounter_responder_opportunity_ineligible_reason", sql`${table.status} <> 'ineligible' OR length(trim(${table.rulingReason})) > 0`),
    check("campaign_session_encounter_responder_opportunity_exception_reason", sql`${table.source} <> 'god-exception' OR length(trim(${table.rulingReason})) > 0`),
    check("campaign_session_encounter_responder_opportunity_response_label", sql`${table.status} <> 'response-declared' OR length(trim(${table.responseLabel})) > 0`),
  ],
);

export const campaignSessionEncounterActionDeclarationEvent = pgTable(
  "campaign_session_encounter_action_declaration_event",
  {
    id: serial("id").primaryKey(),
    declarationId: integer("declaration_id").notNull(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    fromStatus: campaignSessionEncounterActionDeclarationStatus("from_status"),
    toStatus: campaignSessionEncounterActionDeclarationStatus("to_status").notNull(),
    eventKind: text("event_kind").notNull(),
    reason: text("reason").default("").notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    actorUserId: text("actor_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.declarationId, table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounterActionDeclaration.id,
        campaignSessionEncounterActionDeclaration.encounterId,
        campaignSessionEncounterActionDeclaration.sceneId,
        campaignSessionEncounterActionDeclaration.sessionId,
        campaignSessionEncounterActionDeclaration.campaignId,
      ],
      name: "campaign_session_encounter_action_declaration_event_declaration_fk",
    }).onDelete("restrict"),
    foreignKey({ columns: [table.actorUserId], foreignColumns: [user.id], name: "campaign_session_encounter_action_declaration_event_actor_fk" }).onDelete("restrict"),
    index("campaign_session_encounter_action_declaration_event_history_idx").on(table.declarationId, table.createdAt, table.id),
    check("campaign_session_encounter_action_declaration_event_kind_nonblank", sql`length(trim(${table.eventKind})) > 0`),
    check("campaign_session_encounter_action_declaration_event_metadata_object", sql`jsonb_typeof(${table.metadata}) = 'object'`),
  ],
);

export const campaignCharacterFirearmState = pgTable(
  "campaign_character_firearm_state",
  {
    itemInstanceId: integer("item_instance_id").primaryKey(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    itemId: integer("item_id").notNull(),
    weaponProfileId: integer("weapon_profile_id").notNull(),
    selectedFiringModeId: integer("selected_firing_mode_id").notNull(),
    loadedAmmunitionItemId: integer("loaded_ammunition_item_id"),
    loadedAmmunitionProfileId: integer("loaded_ammunition_profile_id"),
    loadedAmmunitionUnitCostCredits: doublePrecision("loaded_ammunition_unit_cost_credits"),
    loadedRounds: integer("loaded_rounds").default(0).notNull(),
    capacityRounds: integer("capacity_rounds"),
    capacitySource: text("capacity_source"),
    readinessMode: text("readiness_mode"),
    readinessModeSource: text("readiness_mode_source"),
    readied: boolean("readied").default(false).notNull(),
    requiresCycling: boolean("requires_cycling").default(false).notNull(),
    requiresRecoilRecovery: boolean("requires_recoil_recovery").default(false).notNull(),
    version: integer("version").default(1).notNull(),
    initializationKey: text("initialization_key").notNull(),
    initializedByUserId: text("initialized_by_user_id").notNull(),
    updatedByUserId: text("updated_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.characterId, table.campaignId],
      foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId],
      name: "campaign_character_firearm_state_character_campaign_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.itemInstanceId, table.characterId, table.itemId],
      foreignColumns: [
        campaignCharacterItemInstance.id,
        campaignCharacterItemInstance.characterId,
        campaignCharacterItemInstance.itemId,
      ],
      name: "campaign_character_firearm_state_owned_instance_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.weaponProfileId, table.itemId],
      foreignColumns: [weaponProfile.id, weaponProfile.itemId],
      name: "campaign_character_firearm_state_profile_item_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.selectedFiringModeId, table.weaponProfileId],
      foreignColumns: [weaponFiringMode.id, weaponFiringMode.weaponProfileId],
      name: "campaign_character_firearm_state_mode_profile_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.loadedAmmunitionProfileId, table.loadedAmmunitionItemId],
      foreignColumns: [weaponProfile.id, weaponProfile.itemId],
      name: "campaign_character_firearm_state_ammunition_profile_fk",
    }).onDelete("restrict"),
    foreignKey({ columns: [table.loadedAmmunitionItemId], foreignColumns: [item.id], name: "campaign_character_firearm_state_ammunition_item_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.initializedByUserId], foreignColumns: [user.id], name: "campaign_character_firearm_state_initialized_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.updatedByUserId], foreignColumns: [user.id], name: "campaign_character_firearm_state_updated_by_fk" }).onDelete("restrict"),
    unique("campaign_character_firearm_state_runtime_identity_uq").on(
      table.itemInstanceId,
      table.campaignId,
      table.characterId,
      table.itemId,
      table.weaponProfileId,
    ),
    unique("campaign_character_firearm_state_owner_identity_uq").on(
      table.itemInstanceId,
      table.campaignId,
      table.characterId,
    ),
    index("campaign_character_firearm_state_character_idx").on(table.campaignId, table.characterId, table.itemId),
    uniqueIndex("campaign_character_firearm_state_initialization_uq").on(table.campaignId, table.initializationKey),
    check("campaign_character_firearm_state_loaded_nonnegative", sql`${table.loadedRounds} >= 0`),
    check("campaign_character_firearm_state_capacity_positive", sql`${table.capacityRounds} IS NULL OR ${table.capacityRounds} > 0`),
    check("campaign_character_firearm_state_capacity_source_valid", sql`(${table.capacityRounds} IS NULL AND ${table.capacitySource} IS NULL) OR (${table.capacityRounds} IS NOT NULL AND ${table.capacitySource} IN ('canonical','god-ruling'))`),
    check("campaign_character_firearm_state_readiness_mode_valid", sql`(${table.readinessMode} IS NULL AND ${table.readinessModeSource} IS NULL) OR (${table.readinessMode} IN ('draw-is-ready','separate-ready-action') AND ${table.readinessModeSource} IN ('canonical','god-ruling'))`),
    check("campaign_character_firearm_state_readied_relationship_valid", sql`NOT ${table.readied} OR ${table.readinessMode} IS NOT NULL`),
    check("campaign_character_firearm_state_ammunition_identity_valid", sql`(${table.loadedRounds} = 0 AND ${table.loadedAmmunitionItemId} IS NULL AND ${table.loadedAmmunitionProfileId} IS NULL AND ${table.loadedAmmunitionUnitCostCredits} IS NULL) OR (${table.loadedRounds} > 0 AND ${table.loadedAmmunitionItemId} IS NOT NULL AND ${table.loadedAmmunitionProfileId} IS NOT NULL AND ${table.loadedAmmunitionUnitCostCredits} >= 0)`),
    check("campaign_character_firearm_state_within_capacity", sql`${table.capacityRounds} IS NULL OR ${table.loadedRounds} <= ${table.capacityRounds}`),
    check("campaign_character_firearm_state_version_positive", sql`${table.version} > 0`),
    check("campaign_character_firearm_state_initialization_nonblank", sql`length(trim(${table.initializationKey})) > 0`),
  ],
);

export const campaignCharacterFirearmPreparation = pgTable(
  "campaign_character_firearm_preparation",
  {
    id: serial("id").primaryKey(),
    itemInstanceId: integer("item_instance_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    itemId: integer("item_id").notNull(),
    weaponProfileId: integer("weapon_profile_id").notNull(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    actionDeclarationId: integer("action_declaration_id"),
    pendingActionId: integer("pending_action_id"),
    operation: text("operation").notNull(),
    status: text("status").notNull(),
    stateVersion: integer("state_version").notNull(),
    targetFiringModeId: integer("target_firing_mode_id"),
    ammunitionItemId: integer("ammunition_item_id"),
    ammunitionProfileId: integer("ammunition_profile_id"),
    requestedRounds: integer("requested_rounds"),
    replaceCurrentLoad: boolean("replace_current_load").default(false).notNull(),
    partialLoadDisposition: text("partial_load_disposition").default("none").notNull(),
    initiativeCost: integer("initiative_cost").notNull(),
    timingSource: text("timing_source").notNull(),
    frozenSnapshotJson: jsonb("frozen_snapshot_json").notNull(),
    reason: text("reason").default("").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    resolvedByUserId: text("resolved_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.itemInstanceId, table.campaignId, table.characterId, table.itemId, table.weaponProfileId],
      foreignColumns: [
        campaignCharacterFirearmState.itemInstanceId,
        campaignCharacterFirearmState.campaignId,
        campaignCharacterFirearmState.characterId,
        campaignCharacterFirearmState.itemId,
        campaignCharacterFirearmState.weaponProfileId,
      ],
      name: "campaign_character_firearm_preparation_state_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounter.id,
        campaignSessionEncounter.sceneId,
        campaignSessionEncounter.sessionId,
        campaignSessionEncounter.campaignId,
      ],
      name: "campaign_character_firearm_preparation_encounter_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.actionDeclarationId, table.pendingActionId, table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounterActionDeclaration.id,
        campaignSessionEncounterActionDeclaration.pendingActionId,
        campaignSessionEncounterActionDeclaration.encounterId,
        campaignSessionEncounterActionDeclaration.sceneId,
        campaignSessionEncounterActionDeclaration.sessionId,
        campaignSessionEncounterActionDeclaration.campaignId,
      ],
      name: "campaign_character_firearm_preparation_declaration_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.targetFiringModeId, table.weaponProfileId],
      foreignColumns: [weaponFiringMode.id, weaponFiringMode.weaponProfileId],
      name: "campaign_character_firearm_preparation_target_mode_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.ammunitionProfileId, table.ammunitionItemId],
      foreignColumns: [weaponProfile.id, weaponProfile.itemId],
      name: "campaign_character_firearm_preparation_ammunition_profile_fk",
    }).onDelete("restrict"),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [user.id], name: "campaign_character_firearm_preparation_created_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.resolvedByUserId], foreignColumns: [user.id], name: "campaign_character_firearm_preparation_resolved_by_fk" }).onDelete("restrict"),
    unique("campaign_character_firearm_preparation_hierarchy_uq").on(
      table.id,
      table.itemInstanceId,
      table.campaignId,
      table.characterId,
    ),
    uniqueIndex("campaign_character_firearm_preparation_idempotency_uq").on(table.campaignId, table.idempotencyKey),
    uniqueIndex("campaign_character_firearm_preparation_one_open_uq")
      .on(table.itemInstanceId)
      .where(sql`${table.status} IN ('pending','interrupted','requires-god-ruling')`),
    index("campaign_character_firearm_preparation_encounter_idx").on(table.encounterId, table.status, table.createdAt),
    check("campaign_character_firearm_preparation_operation_valid", sql`${table.operation} IN ('draw','ready','load','reload','unload','change-mode','cycle','recover-recoil')`),
    check("campaign_character_firearm_preparation_status_valid", sql`${table.status} IN ('pending','interrupted','completed','cancelled','requires-god-ruling','manual-handling')`),
    check("campaign_character_firearm_preparation_state_version_positive", sql`${table.stateVersion} > 0`),
    check("campaign_character_firearm_preparation_requested_rounds_valid", sql`${table.requestedRounds} IS NULL OR ${table.requestedRounds} > 0`),
    check("campaign_character_firearm_preparation_disposition_valid", sql`${table.partialLoadDisposition} IN ('none','retain','discard')`),
    check("campaign_character_firearm_preparation_cost_nonnegative", sql`${table.initiativeCost} >= 0`),
    check("campaign_character_firearm_preparation_timing_source_valid", sql`${table.timingSource} IN ('canonical','god-ruling')`),
    check("campaign_character_firearm_preparation_snapshot_object", sql`jsonb_typeof(${table.frozenSnapshotJson}) = 'object'`),
    check("campaign_character_firearm_preparation_idempotency_nonblank", sql`length(trim(${table.idempotencyKey})) > 0`),
    check("campaign_character_firearm_preparation_action_identity_valid", sql`(${table.actionDeclarationId} IS NULL AND ${table.pendingActionId} IS NULL AND ${table.initiativeCost} = 0) OR (${table.actionDeclarationId} IS NOT NULL AND ${table.pendingActionId} IS NOT NULL AND ${table.initiativeCost} > 0)`),
    check("campaign_character_firearm_preparation_reason_valid", sql`(${table.timingSource} <> 'god-ruling' AND ${table.partialLoadDisposition} <> 'discard' AND ${table.status} NOT IN ('requires-god-ruling','manual-handling')) OR length(trim(${table.reason})) > 0`),
    check("campaign_character_firearm_preparation_lifecycle_valid", sql`(${table.status} IN ('completed','cancelled','manual-handling') AND ${table.resolvedAt} IS NOT NULL AND ${table.resolvedByUserId} IS NOT NULL) OR (${table.status} IN ('pending','interrupted','requires-god-ruling') AND ${table.resolvedAt} IS NULL AND ${table.resolvedByUserId} IS NULL)`),
  ],
);

export const campaignCharacterFirearmEvent = pgTable(
  "campaign_character_firearm_event",
  {
    id: serial("id").primaryKey(),
    itemInstanceId: integer("item_instance_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    preparationId: integer("preparation_id"),
    eventKind: text("event_kind").notNull(),
    reason: text("reason").default("").notNull(),
    beforeStateJson: jsonb("before_state_json"),
    afterStateJson: jsonb("after_state_json"),
    metadataJson: jsonb("metadata_json").default(sql`'{}'::jsonb`).notNull(),
    actorUserId: text("actor_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.itemInstanceId, table.campaignId, table.characterId],
      foreignColumns: [
        campaignCharacterFirearmState.itemInstanceId,
        campaignCharacterFirearmState.campaignId,
        campaignCharacterFirearmState.characterId,
      ],
      name: "campaign_character_firearm_event_state_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.preparationId, table.itemInstanceId, table.campaignId, table.characterId],
      foreignColumns: [
        campaignCharacterFirearmPreparation.id,
        campaignCharacterFirearmPreparation.itemInstanceId,
        campaignCharacterFirearmPreparation.campaignId,
        campaignCharacterFirearmPreparation.characterId,
      ],
      name: "campaign_character_firearm_event_preparation_fk",
    }).onDelete("restrict"),
    foreignKey({ columns: [table.actorUserId], foreignColumns: [user.id], name: "campaign_character_firearm_event_actor_fk" }).onDelete("restrict"),
    index("campaign_character_firearm_event_history_idx").on(table.itemInstanceId, table.createdAt, table.id),
    index("campaign_character_firearm_event_campaign_idx").on(table.campaignId, table.createdAt, table.id),
    check("campaign_character_firearm_event_kind_nonblank", sql`length(trim(${table.eventKind})) > 0`),
    check("campaign_character_firearm_event_before_object", sql`${table.beforeStateJson} IS NULL OR jsonb_typeof(${table.beforeStateJson}) = 'object'`),
    check("campaign_character_firearm_event_after_object", sql`${table.afterStateJson} IS NULL OR jsonb_typeof(${table.afterStateJson}) = 'object'`),
    check("campaign_character_firearm_event_metadata_object", sql`jsonb_typeof(${table.metadataJson}) = 'object'`),
  ],
);

export const campaignSessionEncounterEffectPlan = pgTable(
  "campaign_session_encounter_effect_plan",
  {
    id: serial("id").primaryKey(),
    declarationId: integer("declaration_id").notNull(),
    pendingActionId: integer("pending_action_id").notNull(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    actorParticipantId: integer("actor_participant_id").notNull(),
    sourceKind: campaignSessionEncounterActionSourceKind("source_kind").notNull(),
    sourceIdentity: text("source_identity").notNull(),
    sourceId: text("source_id"),
    sourceInstanceId: integer("source_instance_id"),
    status: campaignSessionEncounterEffectPlanStatus("status").notNull(),
    targetSnapshotJson: jsonb("target_snapshot_json").notNull(),
    sourceSnapshotJson: jsonb("source_snapshot_json").notNull(),
    governingRollSnapshotJson: jsonb("governing_roll_snapshot_json"),
    defenseResolutionJson: jsonb("defense_resolution_json"),
    initiativeCommitmentJson: jsonb("initiative_commitment_json").notNull(),
    resourceCostsJson: jsonb("resource_costs_json").notNull(),
    sourceDivergenceJson: jsonb("source_divergence_json"),
    explanation: text("explanation").default("").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    reviewedByUserId: text("reviewed_by_user_id"),
    appliedByUserId: text("applied_by_user_id"),
    reviewedAt: timestamp("reviewed_at"),
    appliedAt: timestamp("applied_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("campaign_session_encounter_effect_plan_declaration_uq").on(table.declarationId),
    uniqueIndex("campaign_session_encounter_effect_plan_pending_action_uq").on(table.pendingActionId),
    unique("campaign_session_encounter_effect_plan_hierarchy_uq").on(
      table.id,
      table.encounterId,
      table.sceneId,
      table.sessionId,
      table.campaignId,
    ),
    foreignKey({
      columns: [table.declarationId, table.pendingActionId, table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounterActionDeclaration.id,
        campaignSessionEncounterActionDeclaration.pendingActionId,
        campaignSessionEncounterActionDeclaration.encounterId,
        campaignSessionEncounterActionDeclaration.sceneId,
        campaignSessionEncounterActionDeclaration.sessionId,
        campaignSessionEncounterActionDeclaration.campaignId,
      ],
      name: "campaign_session_encounter_effect_plan_declaration_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId, table.actorParticipantId],
      foreignColumns: [
        campaignSessionEncounterParticipant.encounterId,
        campaignSessionEncounterParticipant.sceneId,
        campaignSessionEncounterParticipant.sessionId,
        campaignSessionEncounterParticipant.campaignId,
        campaignSessionEncounterParticipant.characterId,
      ],
      name: "campaign_session_encounter_effect_plan_actor_fk",
    }).onDelete("restrict"),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_effect_plan_created_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.reviewedByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_effect_plan_reviewed_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.appliedByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_effect_plan_applied_by_fk" }).onDelete("restrict"),
    index("campaign_session_encounter_effect_plan_status_idx").on(table.encounterId, table.status, table.createdAt),
    check("campaign_session_encounter_effect_plan_source_identity_nonblank", sql`length(trim(${table.sourceIdentity})) > 0`),
    check("campaign_session_encounter_effect_plan_targets_array", sql`jsonb_typeof(${table.targetSnapshotJson}) = 'array'`),
    check("campaign_session_encounter_effect_plan_source_object", sql`jsonb_typeof(${table.sourceSnapshotJson}) = 'object'`),
    check("campaign_session_encounter_effect_plan_roll_object", sql`${table.governingRollSnapshotJson} IS NULL OR jsonb_typeof(${table.governingRollSnapshotJson}) = 'object'`),
    check("campaign_session_encounter_effect_plan_defense_object", sql`${table.defenseResolutionJson} IS NULL OR jsonb_typeof(${table.defenseResolutionJson}) = 'object'`),
    check("campaign_session_encounter_effect_plan_initiative_object", sql`jsonb_typeof(${table.initiativeCommitmentJson}) = 'object'`),
    check("campaign_session_encounter_effect_plan_costs_array", sql`jsonb_typeof(${table.resourceCostsJson}) = 'array'`),
    check("campaign_session_encounter_effect_plan_divergence_object", sql`${table.sourceDivergenceJson} IS NULL OR jsonb_typeof(${table.sourceDivergenceJson}) = 'object'`),
    check("campaign_session_encounter_effect_plan_review_state_valid", sql`(${table.reviewedAt} IS NULL AND ${table.reviewedByUserId} IS NULL) OR (${table.reviewedAt} IS NOT NULL AND ${table.reviewedByUserId} IS NOT NULL)`),
    check("campaign_session_encounter_effect_plan_application_state_valid", sql`(${table.appliedAt} IS NULL AND ${table.appliedByUserId} IS NULL) OR (${table.appliedAt} IS NOT NULL AND ${table.appliedByUserId} IS NOT NULL AND ${table.status} IN ('applied','partially-applied'))`),
  ],
);

export const campaignSessionEncounterEffect = pgTable(
  "campaign_session_encounter_effect",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id").notNull(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    targetParticipantId: integer("target_participant_id").notNull(),
    effectKey: text("effect_key").notNull(),
    effectType: text("effect_type").notNull(),
    sourceKind: campaignSessionEncounterActionSourceKind("source_kind").notNull(),
    sourceIdentity: text("source_identity").notNull(),
    authoredValueJson: jsonb("authored_value_json").notNull(),
    calculatedValueJson: jsonb("calculated_value_json"),
    finalValueJson: jsonb("final_value_json"),
    unit: text("unit").default("").notNull(),
    resource: text("resource").default("").notNull(),
    applicationSupported: boolean("application_supported").default(false).notNull(),
    godReviewRequired: boolean("god_review_required").default(false).notNull(),
    status: campaignSessionEncounterEffectStatus("status").notNull(),
    amendmentReason: text("amendment_reason").default("").notNull(),
    amendedByUserId: text("amended_by_user_id"),
    appliedResultJson: jsonb("applied_result_json"),
    appliedAt: timestamp("applied_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("campaign_session_encounter_effect_key_uq").on(table.planId, table.effectKey),
    foreignKey({
      columns: [table.planId, table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounterEffectPlan.id,
        campaignSessionEncounterEffectPlan.encounterId,
        campaignSessionEncounterEffectPlan.sceneId,
        campaignSessionEncounterEffectPlan.sessionId,
        campaignSessionEncounterEffectPlan.campaignId,
      ],
      name: "campaign_session_encounter_effect_plan_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId, table.targetParticipantId],
      foreignColumns: [
        campaignSessionEncounterParticipant.encounterId,
        campaignSessionEncounterParticipant.sceneId,
        campaignSessionEncounterParticipant.sessionId,
        campaignSessionEncounterParticipant.campaignId,
        campaignSessionEncounterParticipant.characterId,
      ],
      name: "campaign_session_encounter_effect_target_fk",
    }).onDelete("restrict"),
    foreignKey({ columns: [table.amendedByUserId], foreignColumns: [user.id], name: "campaign_session_encounter_effect_amended_by_fk" }).onDelete("restrict"),
    index("campaign_session_encounter_effect_status_idx").on(table.planId, table.status, table.id),
    index("campaign_session_encounter_effect_target_idx").on(table.encounterId, table.targetParticipantId, table.createdAt),
    check("campaign_session_encounter_effect_key_nonblank", sql`length(trim(${table.effectKey})) > 0`),
    check("campaign_session_encounter_effect_type_nonblank", sql`length(trim(${table.effectType})) > 0`),
    check("campaign_session_encounter_effect_source_nonblank", sql`length(trim(${table.sourceIdentity})) > 0`),
    check("campaign_session_encounter_effect_amendment_valid", sql`${table.amendedByUserId} IS NULL OR length(trim(${table.amendmentReason})) > 0`),
    check("campaign_session_encounter_effect_application_valid", sql`(${table.appliedAt} IS NULL AND ${table.appliedResultJson} IS NULL) OR (${table.appliedAt} IS NOT NULL AND ${table.appliedResultJson} IS NOT NULL AND ${table.status} IN ('applied','manual-resolved'))`),
  ],
);

export const campaignSessionEncounterEffectPlanEvent = pgTable(
  "campaign_session_encounter_effect_plan_event",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id").notNull(),
    encounterId: integer("encounter_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    fromStatus: campaignSessionEncounterEffectPlanStatus("from_status"),
    toStatus: campaignSessionEncounterEffectPlanStatus("to_status").notNull(),
    eventKind: text("event_kind").notNull(),
    reason: text("reason").default("").notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    actorUserId: text("actor_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.planId, table.encounterId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionEncounterEffectPlan.id,
        campaignSessionEncounterEffectPlan.encounterId,
        campaignSessionEncounterEffectPlan.sceneId,
        campaignSessionEncounterEffectPlan.sessionId,
        campaignSessionEncounterEffectPlan.campaignId,
      ],
      name: "campaign_session_encounter_effect_plan_event_plan_fk",
    }).onDelete("restrict"),
    foreignKey({ columns: [table.actorUserId], foreignColumns: [user.id], name: "campaign_session_encounter_effect_plan_event_actor_fk" }).onDelete("restrict"),
    index("campaign_session_encounter_effect_plan_event_history_idx").on(table.planId, table.createdAt, table.id),
    check("campaign_session_encounter_effect_plan_event_kind_nonblank", sql`length(trim(${table.eventKind})) > 0`),
    check("campaign_session_encounter_effect_plan_event_metadata_object", sql`jsonb_typeof(${table.metadata}) = 'object'`),
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
    mechanicalSnapshot: jsonb("mechanical_snapshot"),
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
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId, table.rollerCharacterId],
      foreignColumns: [
        campaignSessionEncounterParticipant.encounterId,
        campaignSessionEncounterParticipant.sceneId,
        campaignSessionEncounterParticipant.sessionId,
        campaignSessionEncounterParticipant.campaignId,
        campaignSessionEncounterParticipant.characterId,
      ],
      name: "campaign_session_roll_roller_encounter_participant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.encounterId, table.sceneId, table.sessionId, table.campaignId, table.targetCharacterId],
      foreignColumns: [
        campaignSessionEncounterParticipant.encounterId,
        campaignSessionEncounterParticipant.sceneId,
        campaignSessionEncounterParticipant.sessionId,
        campaignSessionEncounterParticipant.campaignId,
        campaignSessionEncounterParticipant.characterId,
      ],
      name: "campaign_session_roll_target_encounter_participant_fk",
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
    uniqueIndex("campaign_session_roll_amendment_owner_uq").on(table.id, table.campaignId, table.sessionId),
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
      "campaign_session_roll_mechanical_snapshot_valid",
      sql`${table.mechanicalSnapshot} IS NULL OR jsonb_typeof(${table.mechanicalSnapshot}) = 'object'`,
    ),
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

export const campaignSessionRollAmendment = pgTable(
  "campaign_session_roll_amendment",
  {
    id: serial("id").primaryKey(),
    rollId: integer("roll_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    sessionId: integer("session_id").notNull(),
    previousAmendmentId: integer("previous_amendment_id"),
    kind: campaignSessionRollAmendmentKind("kind").notNull(),
    reason: text("reason").notNull(),
    mechanicalSnapshot: jsonb("mechanical_snapshot"),
    rulingText: text("ruling_text").default("").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.rollId, table.campaignId, table.sessionId],
      foreignColumns: [campaignSessionRoll.id, campaignSessionRoll.campaignId, campaignSessionRoll.sessionId],
      name: "campaign_session_roll_amendment_roll_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.previousAmendmentId, table.rollId, table.campaignId, table.sessionId],
      foreignColumns: [table.id, table.rollId, table.campaignId, table.sessionId],
      name: "campaign_session_roll_amendment_previous_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.createdByUserId],
      foreignColumns: [user.id],
      name: "campaign_session_roll_amendment_created_by_fk",
    }).onDelete("restrict"),
    uniqueIndex("campaign_session_roll_amendment_chain_uq").on(
      table.id,
      table.rollId,
      table.campaignId,
      table.sessionId,
    ),
    uniqueIndex("campaign_session_roll_amendment_first_uq")
      .on(table.rollId)
      .where(sql`${table.previousAmendmentId} IS NULL`),
    uniqueIndex("campaign_session_roll_amendment_successor_uq")
      .on(table.previousAmendmentId)
      .where(sql`${table.previousAmendmentId} IS NOT NULL`),
    index("campaign_session_roll_amendment_history_idx").on(table.rollId, table.id),
    index("campaign_session_roll_amendment_session_idx").on(table.sessionId, table.rollId, table.id),
    check(
      "campaign_session_roll_amendment_reason_valid",
      sql`length(trim(${table.reason})) > 0 AND length(${table.reason}) <= 500`,
    ),
    check(
      "campaign_session_roll_amendment_ruling_length_valid",
      sql`length(${table.rulingText}) <= 2000`,
    ),
    check(
      "campaign_session_roll_amendment_content_valid",
      sql`(
        ${table.kind} = 'correction'
        AND ${table.mechanicalSnapshot} IS NOT NULL
        AND jsonb_typeof(${table.mechanicalSnapshot}) = 'object'
      ) OR (
        ${table.kind} = 'void'
        AND ${table.mechanicalSnapshot} IS NULL
        AND ${table.rulingText} = ''
      ) OR (
        ${table.kind} = 'ruling'
        AND ${table.mechanicalSnapshot} IS NULL
        AND length(trim(${table.rulingText})) > 0
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
  rollAmendments: many(campaignSessionRollAmendment),
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

export const campaignSessionRollRelations = relations(campaignSessionRoll, ({ one, many }) => ({
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
  amendments: many(campaignSessionRollAmendment),
}));

export const campaignSessionRollAmendmentRelations = relations(campaignSessionRollAmendment, ({ one, many }) => ({
  roll: one(campaignSessionRoll, {
    fields: [campaignSessionRollAmendment.rollId],
    references: [campaignSessionRoll.id],
  }),
  session: one(campaignSession, {
    fields: [campaignSessionRollAmendment.sessionId],
    references: [campaignSession.id],
  }),
  previous: one(campaignSessionRollAmendment, {
    fields: [campaignSessionRollAmendment.previousAmendmentId],
    references: [campaignSessionRollAmendment.id],
    relationName: "rollAmendmentChain",
  }),
  next: many(campaignSessionRollAmendment, { relationName: "rollAmendmentChain" }),
  createdBy: one(user, {
    fields: [campaignSessionRollAmendment.createdByUserId],
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
export type CampaignSessionEncounterActionDeclarationStatus = (typeof campaignSessionEncounterActionDeclarationStatus.enumValues)[number];
export type CampaignSessionEncounterResponderOpportunityStatus = (typeof campaignSessionEncounterResponderOpportunityStatus.enumValues)[number];
export type CampaignSessionEncounterResponderOpportunitySource = (typeof campaignSessionEncounterResponderOpportunitySource.enumValues)[number];
export type CampaignSessionEffectDurationBindingStatus = (typeof campaignSessionEffectDurationBindingStatus.enumValues)[number];
export type CampaignSessionEncounterRewardKind = (typeof campaignSessionEncounterRewardKind.enumValues)[number];
export type CampaignSessionRollMethod = (typeof campaignSessionRollMethod.enumValues)[number];
export type CampaignSessionRollVisibility = (typeof campaignSessionRollVisibility.enumValues)[number];
export type CampaignSessionRollPurpose = (typeof campaignSessionRollPurpose.enumValues)[number];
export type CampaignSessionRollStatus = (typeof campaignSessionRollStatus.enumValues)[number];
export type CampaignSessionRollAmendmentKind = (typeof campaignSessionRollAmendmentKind.enumValues)[number];
