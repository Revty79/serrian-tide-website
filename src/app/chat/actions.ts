"use server";

import { requireSession } from "@/lib/server-access";
import {
  deleteChatMessage,
  getOrCreateDirectConversation,
  listAccessibleChatRooms,
  loadChatHistory,
  loadChatMessage,
  postChatMessage,
  searchDirectMessageUsers,
} from "@/features/chat/chat-service";
import {
  ChatError,
  type ChatErrorCode,
  type ChatHistoryPage,
  type ChatMessageDto,
  type ChatRoomDirectory,
  type DeleteChatMessageInput,
  type DirectConversation,
  type DirectMessageUserSearchResult,
  type PostChatMessageInput,
  type PostChatMessageResult,
} from "@/features/chat/chat";

export type ChatActionError = {
  code: ChatErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs: number | null;
};

export type ChatActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ChatActionError };

function safeChatError(error: unknown): ChatActionError {
  if (error instanceof ChatError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
    };
  }
  if (error instanceof Error && error.message === "You must be signed in.") {
    return {
      code: "AUTH_REQUIRED",
      message: "You must be signed in.",
      retryable: false,
      retryAfterMs: null,
    };
  }
  return {
    code: "REQUEST_FAILED",
    message: "The Chat request could not be completed.",
    retryable: false,
    retryAfterMs: null,
  };
}

async function authenticatedChatAction<T>(
  operation: (userId: string) => Promise<T>,
): Promise<ChatActionResult<T>> {
  try {
    const session = await requireSession();
    return { ok: true, data: await operation(session.user.id) };
  } catch (error) {
    return { ok: false, error: safeChatError(error) };
  }
}

export async function loadChatHistoryAction(input: {
  roomSlug: string;
  cursor?: string | null;
}): Promise<ChatActionResult<ChatHistoryPage>> {
  return authenticatedChatAction((userId) => loadChatHistory(userId, input));
}

export async function loadOlderChatMessagesAction(input: {
  roomSlug: string;
  cursor: string;
}): Promise<ChatActionResult<ChatHistoryPage>> {
  return authenticatedChatAction((userId) => loadChatHistory(userId, input));
}

export async function loadChatMessageAction(input: {
  roomSlug: string;
  messageId: number;
}): Promise<ChatActionResult<ChatMessageDto>> {
  return authenticatedChatAction((userId) => loadChatMessage(userId, input));
}

export async function postChatMessageAction(
  input: PostChatMessageInput,
): Promise<ChatActionResult<PostChatMessageResult>> {
  return authenticatedChatAction((userId) => postChatMessage(userId, input));
}

export async function deleteChatMessageAction(
  input: DeleteChatMessageInput,
): Promise<ChatActionResult<ChatMessageDto>> {
  return authenticatedChatAction((userId) => deleteChatMessage(userId, input));
}

export async function listAccessibleChatRoomsAction(): Promise<ChatActionResult<ChatRoomDirectory>> {
  return authenticatedChatAction((userId) => listAccessibleChatRooms(userId));
}

export async function getOrCreateDirectConversationAction(input: {
  targetUserId: string;
}): Promise<ChatActionResult<DirectConversation>> {
  return authenticatedChatAction((userId) => (
    getOrCreateDirectConversation(userId, input.targetUserId)
  ));
}

export async function searchDirectMessageUsersAction(input: {
  search: string;
}): Promise<ChatActionResult<DirectMessageUserSearchResult[]>> {
  return authenticatedChatAction((userId) => searchDirectMessageUsers(userId, input.search));
}
