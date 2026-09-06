import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { campaign } from "./campaign-schema";
import { item } from "./item-schema";
import { campaignCharacter, campaignCharacterItemInstance } from "./realm-schema";
import { shop, shopOffering } from "./shop-schema";
import { campaignSessionScene } from "./tabletop-operations-schema";
import { town } from "./town-schema";

export const shopVisitPlacementKind = pgEnum("shop_visit_placement_kind", [
  "town",
  "independent",
]);

export const shopVisitMode = pgEnum("shop_visit_mode", [
  "roleplay",
  "shopping",
]);

export const shopVisitStatus = pgEnum("shop_visit_status", [
  "active",
  "ended",
]);

export const shopVisitMemberStatus = pgEnum("shop_visit_member_status", [
  "active",
  "ended",
]);

export const shopVisitMemberExitKind = pgEnum("shop_visit_member_exit_kind", [
  "player-left",
  "god-removed",
  "visit-ended",
  "lifecycle-ended",
  "permission-lost",
]);

/**
 * Shop visits deliberately retain their placement source as historical data.
 * The Scene, Campaign, Shop, and optional Town remain real constrained records;
 * the mutable placement row is validated and locked by the service at entry.
 */
export const campaignSessionSceneShopVisit = pgTable(
  "campaign_session_scene_shop_visit",
  {
    id: serial("id").primaryKey(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    shopId: integer("shop_id").notNull(),
    placementKind: shopVisitPlacementKind("placement_kind").notNull(),
    townId: integer("town_id"),
    mode: shopVisitMode("mode").default("shopping").notNull(),
    status: shopVisitStatus("status").default("active").notNull(),
    closedShopOverride: boolean("closed_shop_override").default(false).notNull(),
    closedShopOverrideReason: text("closed_shop_override_reason").default("").notNull(),
    startedByUserId: text("started_by_user_id").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedByUserId: text("ended_by_user_id"),
    endedAt: timestamp("ended_at"),
    endReason: text("end_reason").default("").notNull(),
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
      name: "campaign_session_scene_shop_visit_scene_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.shopId, table.campaignId],
      foreignColumns: [shop.id, shop.campaignId],
      name: "campaign_session_scene_shop_visit_shop_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.townId, table.campaignId],
      foreignColumns: [town.id, town.campaignId],
      name: "campaign_session_scene_shop_visit_town_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.startedByUserId],
      foreignColumns: [user.id],
      name: "campaign_session_scene_shop_visit_started_by_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.endedByUserId],
      foreignColumns: [user.id],
      name: "campaign_session_scene_shop_visit_ended_by_fk",
    }).onDelete("restrict"),
    unique("campaign_session_scene_shop_visit_hierarchy_uq").on(
      table.id,
      table.sceneId,
      table.sessionId,
      table.campaignId,
    ),
    uniqueIndex("campaign_session_scene_shop_visit_one_active_shop_uq")
      .on(table.sceneId, table.shopId)
      .where(sql`${table.status} = 'active'`),
    index("campaign_session_scene_shop_visit_scene_status_idx").on(
      table.sceneId,
      table.status,
      table.startedAt,
      table.id,
    ),
    index("campaign_session_scene_shop_visit_shop_history_idx").on(
      table.shopId,
      table.startedAt,
      table.id,
    ),
    check(
      "campaign_session_scene_shop_visit_placement_valid",
      sql`(
        (${table.placementKind} = 'town' AND ${table.townId} IS NOT NULL)
        OR (${table.placementKind} = 'independent' AND ${table.townId} IS NULL)
      )`,
    ),
    check(
      "campaign_session_scene_shop_visit_override_valid",
      sql`(
        (${table.closedShopOverride} = false AND ${table.closedShopOverrideReason} = '')
        OR (${table.closedShopOverride} = true AND length(trim(${table.closedShopOverrideReason})) > 0)
      )`,
    ),
    check(
      "campaign_session_scene_shop_visit_state_valid",
      sql`(
        (${table.status} = 'active' AND ${table.endedAt} IS NULL AND ${table.endedByUserId} IS NULL AND ${table.endReason} = '')
        OR (${table.status} = 'ended' AND ${table.endedAt} IS NOT NULL AND ${table.endedByUserId} IS NOT NULL AND length(trim(${table.endReason})) > 0)
      )`,
    ),
    check(
      "campaign_session_scene_shop_visit_reason_lengths_valid",
      sql`length(${table.closedShopOverrideReason}) <= 1000 AND length(${table.endReason}) <= 1000`,
    ),
  ],
);

export const campaignSessionSceneShopVisitMember = pgTable(
  "campaign_session_scene_shop_visit_member",
  {
    id: serial("id").primaryKey(),
    visitId: integer("visit_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    status: shopVisitMemberStatus("status").default("active").notNull(),
    enteredByUserId: text("entered_by_user_id").notNull(),
    enteredAt: timestamp("entered_at").defaultNow().notNull(),
    exitedByUserId: text("exited_by_user_id"),
    exitedAt: timestamp("exited_at"),
    exitKind: shopVisitMemberExitKind("exit_kind"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.visitId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionSceneShopVisit.id,
        campaignSessionSceneShopVisit.sceneId,
        campaignSessionSceneShopVisit.sessionId,
        campaignSessionSceneShopVisit.campaignId,
      ],
      name: "campaign_session_scene_shop_visit_member_visit_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.characterId, table.campaignId],
      foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId],
      name: "campaign_session_scene_shop_visit_member_character_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.enteredByUserId],
      foreignColumns: [user.id],
      name: "campaign_session_scene_shop_visit_member_entered_by_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.exitedByUserId],
      foreignColumns: [user.id],
      name: "campaign_session_scene_shop_visit_member_exited_by_fk",
    }).onDelete("restrict"),
    uniqueIndex("campaign_session_scene_shop_visit_member_one_active_character_uq")
      .on(table.characterId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("campaign_session_scene_shop_visit_member_one_active_visit_character_uq")
      .on(table.visitId, table.characterId)
      .where(sql`${table.status} = 'active'`),
    index("campaign_session_scene_shop_visit_member_visit_status_idx").on(
      table.visitId,
      table.status,
      table.enteredAt,
      table.id,
    ),
    index("campaign_session_scene_shop_visit_member_character_history_idx").on(
      table.characterId,
      table.enteredAt,
      table.id,
    ),
    check(
      "campaign_session_scene_shop_visit_member_state_valid",
      sql`(
        (${table.status} = 'active' AND ${table.exitedAt} IS NULL AND ${table.exitedByUserId} IS NULL AND ${table.exitKind} IS NULL)
        OR (${table.status} = 'ended' AND ${table.exitedAt} IS NOT NULL AND ${table.exitedByUserId} IS NOT NULL AND ${table.exitKind} IS NOT NULL)
      )`,
    ),
  ],
);

export const shopCommerceOperationKind = pgEnum("shop_commerce_operation_kind", [
  "submit-purchase",
  "submit-sale",
  "god-purchase",
  "approve-request",
  "reject-request",
  "accept-terms",
  "cancel-request",
  "give-money",
  "character-balance-correction",
  "shop-balance-correction",
]);

export const shopTransactionRequestKind = pgEnum("shop_transaction_request_kind", [
  "purchase",
  "sale",
]);

export const shopTransactionRequestStatus = pgEnum("shop_transaction_request_status", [
  "pending",
  "owner-review",
  "completed",
  "rejected",
  "cancelled",
]);

export const shopTransactionKind = pgEnum("shop_transaction_kind", [
  "purchase",
  "sale",
]);

export const shopMoneyEventKind = pgEnum("shop_money_event_kind", [
  "purchase-character-debit",
  "purchase-shop-credit",
  "sale-shop-debit",
  "sale-character-credit",
  "grant-character-credit",
  "character-balance-correction",
  "shop-balance-correction",
]);

export const shopResaleInstanceStatus = pgEnum("shop_resale_instance_status", [
  "in-stock",
  "sold",
]);

export const shopCommerceOperation = pgTable(
  "shop_commerce_operation",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    submissionKey: text("submission_key").notNull(),
    intentHash: text("intent_hash").notNull(),
    kind: shopCommerceOperationKind("kind").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("shop_commerce_operation_actor_submission_uq").on(table.actorUserId, table.submissionKey),
    index("shop_commerce_operation_campaign_history_idx").on(table.campaignId, table.createdAt, table.id),
    check("shop_commerce_operation_submission_nonblank", sql`length(trim(${table.submissionKey})) > 0 AND length(${table.submissionKey}) <= 160`),
    check("shop_commerce_operation_hash_nonblank", sql`length(trim(${table.intentHash})) > 0 AND length(${table.intentHash}) <= 128`),
  ],
);

export const shopTransactionRequest = pgTable(
  "shop_transaction_request",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull(),
    shopId: integer("shop_id").notNull(),
    characterId: integer("character_id").notNull(),
    visitId: integer("visit_id").references(() => campaignSessionSceneShopVisit.id, { onDelete: "restrict" }),
    visitMemberId: integer("visit_member_id").references(() => campaignSessionSceneShopVisitMember.id, { onDelete: "restrict" }),
    originOperationId: integer("origin_operation_id").notNull().references(() => shopCommerceOperation.id, { onDelete: "restrict" }),
    kind: shopTransactionRequestKind("kind").notNull(),
    status: shopTransactionRequestStatus("status").default("pending").notNull(),
    termsVersion: integer("terms_version").default(1).notNull(),
    ownerAcceptedTermsVersion: integer("owner_accepted_terms_version"),
    godApprovedTermsVersion: integer("god_approved_terms_version"),
    requestedByUserId: text("requested_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, { onDelete: "restrict" }),
    transactionOverride: boolean("transaction_override").default(false).notNull(),
    transactionOverrideReason: text("transaction_override_reason").default("").notNull(),
    narrativeNote: text("narrative_note").default("").notNull(),
    resolutionReason: text("resolution_reason").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    foreignKey({ columns: [table.shopId, table.campaignId], foreignColumns: [shop.id, shop.campaignId], name: "shop_transaction_request_shop_campaign_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.characterId, table.campaignId], foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId], name: "shop_transaction_request_character_campaign_fk" }).onDelete("restrict"),
    unique("shop_transaction_request_origin_operation_uq").on(table.originOperationId),
    unique("shop_transaction_request_scope_uq").on(table.id, table.campaignId, table.shopId, table.characterId),
    index("shop_transaction_request_shop_status_idx").on(table.shopId, table.status, table.createdAt, table.id),
    index("shop_transaction_request_character_status_idx").on(table.characterId, table.status, table.createdAt, table.id),
    index("shop_transaction_request_visit_status_idx").on(table.visitId, table.status, table.createdAt, table.id),
    check("shop_transaction_request_terms_version_valid", sql`${table.termsVersion} > 0 AND (${table.ownerAcceptedTermsVersion} IS NULL OR ${table.ownerAcceptedTermsVersion} > 0) AND (${table.godApprovedTermsVersion} IS NULL OR ${table.godApprovedTermsVersion} > 0)`),
    check("shop_transaction_request_visit_identity_valid", sql`(${table.visitId} IS NULL AND ${table.visitMemberId} IS NULL) OR (${table.visitId} IS NOT NULL AND ${table.visitMemberId} IS NOT NULL)`),
    check("shop_transaction_request_override_valid", sql`(${table.transactionOverride} = false AND ${table.transactionOverrideReason} = '') OR (${table.transactionOverride} = true AND length(trim(${table.transactionOverrideReason})) > 0)`),
    check("shop_transaction_request_text_lengths_valid", sql`length(${table.transactionOverrideReason}) <= 1000 AND length(${table.narrativeNote}) <= 1000 AND length(${table.resolutionReason}) <= 1000`),
    check("shop_transaction_request_lifecycle_valid", sql`(${table.status} IN ('pending','owner-review') AND ${table.resolvedAt} IS NULL AND ${table.resolvedByUserId} IS NULL AND ${table.resolutionReason} = '') OR (${table.status} IN ('completed','rejected','cancelled') AND ${table.resolvedAt} IS NOT NULL AND ${table.resolvedByUserId} IS NOT NULL)`),
  ],
);

export const shopTransactionRequestLine = pgTable(
  "shop_transaction_request_line",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id").notNull().references(() => shopTransactionRequest.id, { onDelete: "cascade" }),
    offeringId: integer("offering_id").references(() => shopOffering.id, { onDelete: "set null" }),
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "restrict" }),
    itemInstanceId: integer("item_instance_id").references(() => campaignCharacterItemInstance.id, { onDelete: "restrict" }),
    fulfillmentKind: text("fulfillment_kind").notNull(),
    quantity: integer("quantity").notNull(),
    quotedUnitPriceCredits: doublePrecision("quoted_unit_price_credits").notNull(),
    currentUnitPriceCredits: doublePrecision("current_unit_price_credits").notNull(),
    itemCanonicalIdSnapshot: text("item_canonical_id_snapshot").notNull(),
    itemNameSnapshot: text("item_name_snapshot").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    unique("shop_transaction_request_line_order_uq").on(table.requestId, table.sortOrder),
    index("shop_transaction_request_line_item_idx").on(table.itemId, table.requestId),
    index("shop_transaction_request_line_instance_idx").on(table.itemInstanceId),
    check("shop_transaction_request_line_fulfillment_valid", sql`${table.fulfillmentKind} IN ('inventory-transfer','service-narrative')`),
    check("shop_transaction_request_line_quantity_valid", sql`${table.quantity} > 0 AND (${table.itemInstanceId} IS NULL OR ${table.quantity} = 1)`),
    check("shop_transaction_request_line_prices_valid", sql`${table.quotedUnitPriceCredits} >= 0 AND ${table.currentUnitPriceCredits} >= 0`),
    check("shop_transaction_request_line_identity_nonblank", sql`length(trim(${table.itemCanonicalIdSnapshot})) > 0 AND length(trim(${table.itemNameSnapshot})) > 0`),
    check("shop_transaction_request_line_sort_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const shopTransaction = pgTable(
  "shop_transaction",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id").notNull().references(() => shopTransactionRequest.id, { onDelete: "restrict" }),
    executionOperationId: integer("execution_operation_id").notNull().references(() => shopCommerceOperation.id, { onDelete: "restrict" }),
    campaignId: integer("campaign_id").notNull(),
    shopId: integer("shop_id").notNull(),
    characterId: integer("character_id").notNull(),
    kind: shopTransactionKind("kind").notNull(),
    totalCredits: doublePrecision("total_credits").notNull(),
    currencySystemSnapshot: text("currency_system_snapshot").notNull(),
    currencySnapshotJson: jsonb("currency_snapshot_json").notNull(),
    policySnapshotJson: jsonb("policy_snapshot_json").notNull(),
    narrativeNote: text("narrative_note").default("").notNull(),
    transactionOverride: boolean("transaction_override").default(false).notNull(),
    transactionOverrideReason: text("transaction_override_reason").default("").notNull(),
    completedByUserId: text("completed_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.requestId, table.campaignId, table.shopId, table.characterId], foreignColumns: [shopTransactionRequest.id, shopTransactionRequest.campaignId, shopTransactionRequest.shopId, shopTransactionRequest.characterId], name: "shop_transaction_request_scope_fk" }).onDelete("restrict"),
    unique("shop_transaction_request_uq").on(table.requestId),
    unique("shop_transaction_execution_operation_uq").on(table.executionOperationId),
    unique("shop_transaction_scope_uq").on(table.id, table.campaignId, table.shopId, table.characterId),
    index("shop_transaction_shop_history_idx").on(table.shopId, table.completedAt, table.id),
    index("shop_transaction_character_history_idx").on(table.characterId, table.completedAt, table.id),
    check("shop_transaction_total_valid", sql`${table.totalCredits} >= 0`),
    check("shop_transaction_currency_system_valid", sql`${table.currencySystemSnapshot} IN ('Credits','Derived Currency')`),
    check("shop_transaction_currency_snapshot_object", sql`jsonb_typeof(${table.currencySnapshotJson}) = 'object'`),
    check("shop_transaction_policy_snapshot_object", sql`jsonb_typeof(${table.policySnapshotJson}) = 'object'`),
    check("shop_transaction_note_length_valid", sql`length(${table.narrativeNote}) <= 1000`),
    check("shop_transaction_override_valid", sql`(${table.transactionOverride} = false AND ${table.transactionOverrideReason} = '') OR (${table.transactionOverride} = true AND length(trim(${table.transactionOverrideReason})) > 0)`),
  ],
);

export const shopTransactionLine = pgTable(
  "shop_transaction_line",
  {
    id: serial("id").primaryKey(),
    transactionId: integer("transaction_id").notNull().references(() => shopTransaction.id, { onDelete: "cascade" }),
    requestLineId: integer("request_line_id").notNull().references(() => shopTransactionRequestLine.id, { onDelete: "restrict" }),
    offeringId: integer("offering_id").references(() => shopOffering.id, { onDelete: "set null" }),
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "restrict" }),
    sourceItemInstanceId: integer("source_item_instance_id").references(() => campaignCharacterItemInstance.id, { onDelete: "restrict" }),
    acquiredItemInstanceId: integer("acquired_item_instance_id").references(() => campaignCharacterItemInstance.id, { onDelete: "restrict" }),
    fulfillmentKind: text("fulfillment_kind").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCredits: doublePrecision("unit_price_credits").notNull(),
    totalCredits: doublePrecision("total_credits").notNull(),
    itemCanonicalIdSnapshot: text("item_canonical_id_snapshot").notNull(),
    itemNameSnapshot: text("item_name_snapshot").notNull(),
    ownershipSnapshotJson: jsonb("ownership_snapshot_json").default(sql`'{}'::jsonb`).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    unique("shop_transaction_line_request_line_uq").on(table.requestLineId),
    unique("shop_transaction_line_order_uq").on(table.transactionId, table.sortOrder),
    index("shop_transaction_line_item_idx").on(table.itemId, table.transactionId),
    index("shop_transaction_line_source_instance_idx").on(table.sourceItemInstanceId),
    index("shop_transaction_line_acquired_instance_idx").on(table.acquiredItemInstanceId),
    check("shop_transaction_line_fulfillment_valid", sql`${table.fulfillmentKind} IN ('inventory-transfer','service-narrative')`),
    check("shop_transaction_line_quantity_valid", sql`${table.quantity} > 0`),
    check("shop_transaction_line_price_valid", sql`${table.unitPriceCredits} >= 0 AND ${table.totalCredits} >= 0`),
    check("shop_transaction_line_identity_nonblank", sql`length(trim(${table.itemCanonicalIdSnapshot})) > 0 AND length(trim(${table.itemNameSnapshot})) > 0`),
    check("shop_transaction_line_ownership_snapshot_object", sql`jsonb_typeof(${table.ownershipSnapshotJson}) = 'object'`),
    check("shop_transaction_line_sort_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const shopMoneyEvent = pgTable(
  "shop_money_event",
  {
    id: serial("id").primaryKey(),
    operationId: integer("operation_id").notNull().references(() => shopCommerceOperation.id, { onDelete: "restrict" }),
    transactionId: integer("transaction_id").references(() => shopTransaction.id, { onDelete: "restrict" }),
    campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "cascade" }),
    characterId: integer("character_id").references(() => campaignCharacter.id, { onDelete: "restrict" }),
    shopId: integer("shop_id").references(() => shop.id, { onDelete: "restrict" }),
    kind: shopMoneyEventKind("kind").notNull(),
    amountCredits: doublePrecision("amount_credits").notNull(),
    balanceBeforeCredits: doublePrecision("balance_before_credits").notNull(),
    balanceAfterCredits: doublePrecision("balance_after_credits").notNull(),
    reason: text("reason").notNull(),
    currencySnapshotJson: jsonb("currency_snapshot_json").notNull(),
    actorUserId: text("actor_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("shop_money_event_operation_kind_uq").on(table.operationId, table.kind),
    index("shop_money_event_character_history_idx").on(table.characterId, table.createdAt, table.id),
    index("shop_money_event_shop_history_idx").on(table.shopId, table.createdAt, table.id),
    check("shop_money_event_owner_valid", sql`${table.characterId} IS NOT NULL OR ${table.shopId} IS NOT NULL`),
    check("shop_money_event_balances_valid", sql`${table.balanceBeforeCredits} >= 0 AND ${table.balanceAfterCredits} >= 0`),
    check("shop_money_event_amount_finite", sql`${table.amountCredits} <> 'Infinity'::float8 AND ${table.amountCredits} <> '-Infinity'::float8 AND ${table.amountCredits} = ${table.amountCredits}`),
    check("shop_money_event_reason_valid", sql`length(trim(${table.reason})) > 0 AND length(${table.reason}) <= 1000`),
    check("shop_money_event_currency_snapshot_object", sql`jsonb_typeof(${table.currencySnapshotJson}) = 'object'`),
  ],
);

export const shopResaleItemInstance = pgTable(
  "shop_resale_item_instance",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull(),
    shopId: integer("shop_id").notNull(),
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "restrict" }),
    sourceCharacterId: integer("source_character_id").notNull(),
    sourceItemInstanceId: integer("source_item_instance_id").notNull().references(() => campaignCharacterItemInstance.id, { onDelete: "restrict" }),
    acquiredTransactionId: integer("acquired_transaction_id").notNull().references(() => shopTransaction.id, { onDelete: "restrict" }),
    soldTransactionId: integer("sold_transaction_id").references(() => shopTransaction.id, { onDelete: "restrict" }),
    status: shopResaleInstanceStatus("status").default("in-stock").notNull(),
    currentCharges: integer("current_charges").notNull(),
    stateSnapshotJson: jsonb("state_snapshot_json").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.shopId, table.campaignId], foreignColumns: [shop.id, shop.campaignId], name: "shop_resale_item_instance_shop_campaign_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.sourceCharacterId, table.campaignId], foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId], name: "shop_resale_item_instance_character_campaign_fk" }).onDelete("restrict"),
    unique("shop_resale_item_instance_source_uq").on(table.sourceItemInstanceId),
    index("shop_resale_item_instance_stock_idx").on(table.shopId, table.itemId, table.status, table.id),
    check("shop_resale_item_instance_charges_valid", sql`${table.currentCharges} >= 0`),
    check("shop_resale_item_instance_state_snapshot_object", sql`jsonb_typeof(${table.stateSnapshotJson}) = 'object'`),
    check("shop_resale_item_instance_lifecycle_valid", sql`(${table.status} = 'in-stock' AND ${table.soldTransactionId} IS NULL) OR (${table.status} = 'sold' AND ${table.soldTransactionId} IS NOT NULL)`),
  ],
);
