import { sql } from "drizzle-orm";

import type { db } from "@/db";

import { normalizeChatMessageId, normalizeChatRoomSlug } from "./chat";

export const CHAT_LIVE_CHANNEL = "serrian_tide_chat";

export type ChatMessageInvalidation = {
  category: "message";
  roomSlug: string;
  messageId: number;
};

export type ChatDirectoryInvalidation = {
  category: "directory";
};

export type ChatInvalidation = ChatMessageInvalidation | ChatDirectoryInvalidation;

type ChatLiveTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function hasExactKeys(row: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(row).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
}

export function parseChatInvalidation(value: unknown): ChatInvalidation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.category === "directory") {
    return hasExactKeys(row, ["category"]) ? { category: "directory" } : null;
  }
  if (row.category !== "message" || !hasExactKeys(row, ["category", "messageId", "roomSlug"])) {
    return null;
  }
  try {
    return {
      category: "message",
      roomSlug: normalizeChatRoomSlug(row.roomSlug),
      messageId: normalizeChatMessageId(row.messageId),
    };
  } catch {
    return null;
  }
}

export function parseChatNotificationPayload(payload: string | undefined): ChatInvalidation | null {
  if (!payload) return null;
  try {
    return parseChatInvalidation(JSON.parse(payload));
  } catch {
    return null;
  }
}

export function messageInvalidationForRoom(
  event: ChatInvalidation,
  subscribedRoomSlug: string,
): { messageId: number } | null {
  return event.category === "message" && event.roomSlug === subscribedRoomSlug
    ? { messageId: event.messageId }
    : null;
}

/** PostgreSQL delivers pg_notify only if the caller-owned transaction commits. */
export async function publishChatInvalidationInTransaction(
  tx: ChatLiveTransaction,
  input: ChatInvalidation,
): Promise<void> {
  const event = parseChatInvalidation(input);
  if (!event) throw new Error("Chat live invalidation is invalid.");
  await tx.execute(sql`select pg_notify(${CHAT_LIVE_CHANNEL}, ${JSON.stringify(event)})`);
}

export function publishChatMessageInvalidationInTransaction(
  tx: ChatLiveTransaction,
  roomSlug: string,
  messageId: number,
): Promise<void> {
  return publishChatInvalidationInTransaction(tx, {
    category: "message",
    roomSlug,
    messageId,
  });
}

export function publishChatDirectoryInvalidationInTransaction(
  tx: ChatLiveTransaction,
): Promise<void> {
  return publishChatInvalidationInTransaction(tx, { category: "directory" });
}
