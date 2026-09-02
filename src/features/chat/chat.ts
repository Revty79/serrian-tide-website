import type { SerrianRole } from "@/db/authorization-schema";
import type { ChatRoomScope } from "@/db/chat-schema";

export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_CONTENT_MAX_LENGTH = 1_000;
export const CHAT_CLIENT_REQUEST_ID_MAX_LENGTH = 100;
export const CHAT_DELETION_REASON_MAX_LENGTH = 500;
export const CHAT_RATE_WINDOW_MS = 60_000;
export const CHAT_RATE_WINDOW_MAX_MESSAGES = 20;
export const CHAT_RATE_MIN_INTERVAL_MS = 1_000;

export type ChatErrorCode =
  | "AUTH_REQUIRED"
  | "ACCESS_DENIED"
  | "ROOM_UNAVAILABLE"
  | "ROOM_ARCHIVED"
  | "MESSAGE_UNAVAILABLE"
  | "INVALID_INPUT"
  | "REQUEST_ID_COLLISION"
  | "RATE_LIMITED"
  | "REQUEST_FAILED";

export class ChatError extends Error {
  readonly code: ChatErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    code: ChatErrorCode,
    message: string,
    options: { retryable?: boolean; retryAfterMs?: number | null } = {},
  ) {
    super(message);
    this.name = "ChatError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export type ChatAccessContext = {
  userId: string;
  displayName: string;
  roles: SerrianRole[];
  isAdmin: boolean;
};

export type ChatRoomAccessFacts = {
  scope: ChatRoomScope;
  campaignId: number | null;
  campaignCreatorUserId: string | null;
  campaignMemberUserId: string | null;
};

export type ChatMessageCursor = {
  createdAt: string;
  id: number;
};

export type ChatMessageDto = {
  id: number;
  room: {
    slug: string;
    name: string;
  };
  authorName: string;
  content: string | null;
  createdAt: string;
  deleted: boolean;
  canDelete: boolean;
};

export type ChatHistoryPage = {
  room: {
    slug: string;
    name: string;
    scope: ChatRoomScope;
    archived: boolean;
  };
  messages: ChatMessageDto[];
  hasOlder: boolean;
  olderCursor: string | null;
};

export type PostChatMessageInput = {
  roomSlug: string;
  content: string;
  clientRequestId: string;
};

export type PostChatMessageResult = {
  message: ChatMessageDto;
  created: boolean;
};

export type DeleteChatMessageInput = {
  roomSlug: string;
  messageId: number;
  reason?: string;
};

export function assertChatRoleAccess(roles: readonly SerrianRole[]): SerrianRole[] {
  const assigned = [...new Set(roles.filter((role): role is SerrianRole => (
    role === "admin" || role === "god" || role === "player"
  )))];
  if (!assigned.length) {
    throw new ChatError("ACCESS_DENIED", "A current Serrian Tide role is required to use Chat.");
  }
  return assigned;
}

export function resolveChatDisplayName(input: {
  displayUsername: string | null;
  username: string | null;
  name: string;
}): string {
  for (const candidate of [input.displayUsername, input.username, input.name]) {
    const visible = candidate?.trim();
    if (visible) return visible;
  }
  return "Serrian Tide User";
}

export function assertChatRoomAccess(
  actor: ChatAccessContext,
  room: ChatRoomAccessFacts,
): void {
  if (room.scope === "global") return;
  if (
    room.campaignId !== null
    && (room.campaignCreatorUserId === actor.userId || room.campaignMemberUserId === actor.userId)
  ) return;
  throw new ChatError("ROOM_UNAVAILABLE", "That Chat room is unavailable.");
}

export function normalizeChatRoomSlug(value: unknown): string {
  if (
    typeof value !== "string"
    || value !== value.trim()
    || value.length < 1
    || value.length > 80
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  ) {
    throw new ChatError("INVALID_INPUT", "Chat room is invalid.");
  }
  return value;
}

export function normalizeChatContent(value: unknown): string {
  if (typeof value !== "string" || !/\S/u.test(value)) {
    throw new ChatError("INVALID_INPUT", "Message content is required.");
  }
  if (value.length > CHAT_CONTENT_MAX_LENGTH) {
    throw new ChatError("INVALID_INPUT", `Messages cannot exceed ${CHAT_CONTENT_MAX_LENGTH} characters.`);
  }
  return value;
}

export function normalizeChatClientRequestId(value: unknown): string {
  if (
    typeof value !== "string"
    || value !== value.trim()
    || value.length < 1
    || value.length > CHAT_CLIENT_REQUEST_ID_MAX_LENGTH
  ) {
    throw new ChatError("INVALID_INPUT", "Message request ID is invalid.");
  }
  return value;
}

export function normalizeChatDeletionReason(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new ChatError("INVALID_INPUT", "Deletion reason is invalid.");
  }
  const reason = value.trim();
  if (reason.length > CHAT_DELETION_REASON_MAX_LENGTH) {
    throw new ChatError("INVALID_INPUT", `Deletion reason cannot exceed ${CHAT_DELETION_REASON_MAX_LENGTH} characters.`);
  }
  return reason;
}

export function normalizeChatMessageId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ChatError("INVALID_INPUT", "Chat message is invalid.");
  }
  return value;
}

export function encodeChatCursor(cursor: ChatMessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeChatCursor(value: unknown): ChatMessageCursor | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 500) {
    throw new ChatError("INVALID_INPUT", "Message-history cursor is invalid.");
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ChatMessageCursor>;
    if (
      typeof parsed.createdAt !== "string"
      || new Date(parsed.createdAt).toISOString() !== parsed.createdAt
      || !Number.isSafeInteger(parsed.id)
      || (parsed.id ?? 0) <= 0
    ) throw new Error("invalid cursor payload");
    return { createdAt: parsed.createdAt, id: parsed.id! };
  } catch {
    throw new ChatError("INVALID_INPUT", "Message-history cursor is invalid.");
  }
}

export function mayDeleteChatMessage(actor: ChatAccessContext, authorUserId: string): boolean {
  return actor.isAdmin || actor.userId === authorUserId;
}
