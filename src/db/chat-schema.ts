import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { campaign } from "./campaign-schema";

export const chatRoomScope = pgEnum("chat_room_scope", [
  "global",
  "campaign",
]);

export const chatMessageStatus = pgEnum("chat_message_status", [
  "active",
  "deleted",
]);

export const chatRoom = pgTable(
  "chat_room",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    scope: chatRoomScope("scope").notNull(),
    campaignId: integer("campaign_id").references(() => campaign.id, {
      onDelete: "cascade",
    }),
    isArchived: boolean("is_archived").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("chat_room_slug_uq").on(table.slug),
    index("chat_room_campaign_id_idx").on(table.campaignId),
    check(
      "chat_room_slug_valid",
      sql`${table.slug} = trim(${table.slug})
        AND length(${table.slug}) BETWEEN 1 AND 80
        AND ${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    check(
      "chat_room_name_valid",
      sql`${table.name} = trim(${table.name})
        AND length(${table.name}) BETWEEN 1 AND 100`,
    ),
    check(
      "chat_room_scope_campaign_valid",
      sql`(
        (${table.scope} = 'global' AND ${table.campaignId} IS NULL)
        OR (${table.scope} = 'campaign' AND ${table.campaignId} IS NOT NULL)
      )`,
    ),
  ],
);

export const chatMessage = pgTable(
  "chat_message",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id")
      .notNull()
      .references(() => chatRoom.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    clientRequestId: text("client_request_id").notNull(),
    content: text("content").notNull(),
    status: chatMessageStatus("status").default("active").notNull(),
    deletedAt: timestamp("deleted_at"),
    deletedByUserId: text("deleted_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    deletionReason: text("deletion_reason").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("chat_message_author_request_uq").on(
      table.authorUserId,
      table.clientRequestId,
    ),
    index("chat_message_room_history_idx").on(
      table.roomId,
      table.createdAt,
      table.id,
    ),
    index("chat_message_author_history_idx").on(
      table.authorUserId,
      table.createdAt,
      table.id,
    ),
    check(
      "chat_message_client_request_id_valid",
      sql`${table.clientRequestId} = trim(${table.clientRequestId})
        AND length(${table.clientRequestId}) BETWEEN 1 AND 100`,
    ),
    check(
      "chat_message_content_valid",
      sql`${table.content} ~ '[^[:space:]]'
        AND length(${table.content}) <= 1000`,
    ),
    check(
      "chat_message_deletion_reason_length_valid",
      sql`length(${table.deletionReason}) <= 500`,
    ),
    check(
      "chat_message_lifecycle_valid",
      sql`(
        ${table.status} = 'active'
        AND ${table.deletedAt} IS NULL
        AND ${table.deletedByUserId} IS NULL
        AND ${table.deletionReason} = ''
      ) OR (
        ${table.status} = 'deleted'
        AND ${table.deletedAt} IS NOT NULL
        AND ${table.deletedByUserId} IS NOT NULL
      )`,
    ),
  ],
);

export const chatRoomRelations = relations(chatRoom, ({ one, many }) => ({
  campaign: one(campaign, {
    fields: [chatRoom.campaignId],
    references: [campaign.id],
  }),
  messages: many(chatMessage),
}));

export const chatMessageRelations = relations(chatMessage, ({ one }) => ({
  room: one(chatRoom, {
    fields: [chatMessage.roomId],
    references: [chatRoom.id],
  }),
  author: one(user, {
    relationName: "chatMessageAuthor",
    fields: [chatMessage.authorUserId],
    references: [user.id],
  }),
  deletedBy: one(user, {
    relationName: "chatMessageDeletedBy",
    fields: [chatMessage.deletedByUserId],
    references: [user.id],
  }),
}));

export type ChatRoomScope = (typeof chatRoomScope.enumValues)[number];
export type ChatMessageStatus = (typeof chatMessageStatus.enumValues)[number];
