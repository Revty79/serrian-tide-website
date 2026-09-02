import type {
  ChatErrorCode,
  ChatHistoryPage,
  ChatMessageDto,
  ChatRoomDirectory,
} from "./chat";

export type ChatDirectoryRoom =
  | ChatRoomDirectory["globalRooms"][number]
  | ChatRoomDirectory["campaignRooms"][number]
  | ChatRoomDirectory["directConversations"][number];

export type ChatRoomMetadata = {
  title: string;
  scopeLabel: "Global" | "Campaign" | "Direct";
  contextLabel: string;
};

export type ChatRoomLoadToken = {
  roomSlug: string;
  sequence: number;
};

export type ChatSubmissionIdentity = {
  content: string;
  clientRequestId: string;
};

export type ChatLiveMessagePayload = {
  messageId: number;
};

export function terminalChatDestination(
  code: ChatErrorCode,
): "/login" | "/access" | null {
  if (code === "AUTH_REQUIRED") return "/login";
  if (code === "ACCESS_DENIED") return "/access";
  return null;
}

export function parseChatLiveMessagePayload(value: unknown): ChatLiveMessagePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== 1
    || !Number.isSafeInteger(row.messageId)
    || Number(row.messageId) <= 0
  ) return null;
  return { messageId: Number(row.messageId) };
}

export function parseChatLiveMessageData(value: string): ChatLiveMessagePayload | null {
  try {
    return parseChatLiveMessagePayload(JSON.parse(value));
  } catch {
    return null;
  }
}

export function isChatViewportNearNewest(input: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}, threshold = 80): boolean {
  return input.scrollHeight - input.clientHeight - input.scrollTop <= threshold;
}

export function flattenChatDirectory(directory: ChatRoomDirectory): ChatDirectoryRoom[] {
  const rooms = [
    ...directory.globalRooms,
    ...directory.campaignRooms,
    ...directory.directConversations,
  ];
  const bySlug = new Map<string, ChatDirectoryRoom>();
  for (const room of rooms) {
    if (!bySlug.has(room.slug)) bySlug.set(room.slug, room);
  }
  return [...bySlug.values()];
}

export function findChatDirectoryRoom(
  directory: ChatRoomDirectory,
  roomSlug: string | null | undefined,
): ChatDirectoryRoom | null {
  if (!roomSlug) return null;
  return flattenChatDirectory(directory).find((room) => room.slug === roomSlug) ?? null;
}

export function selectInitialChatRoomSlug(
  directory: ChatRoomDirectory,
  requestedRoomSlug: string | null | undefined,
): string | null {
  const requested = findChatDirectoryRoom(directory, requestedRoomSlug);
  if (requested) return requested.slug;
  const crossroads = findChatDirectoryRoom(directory, "crossroads");
  return crossroads?.slug ?? flattenChatDirectory(directory)[0]?.slug ?? null;
}

export function preserveChatRoomSelection(
  directory: ChatRoomDirectory,
  activeRoomSlug: string | null,
): string | null {
  return selectInitialChatRoomSlug(directory, activeRoomSlug);
}

export function reconcileChatRoomArchiveState(
  directory: ChatRoomDirectory,
  roomSlug: string,
  archived: boolean,
): ChatRoomDirectory {
  const update = <Room extends ChatDirectoryRoom>(room: Room): Room => (
    room.slug === roomSlug ? { ...room, archived } : room
  );
  return {
    globalRooms: directory.globalRooms.map(update),
    campaignRooms: directory.campaignRooms.map(update),
    directConversations: directory.directConversations.map(update),
  };
}

export function getChatRoomMetadata(room: ChatDirectoryRoom): ChatRoomMetadata {
  if (room.scope === "campaign") {
    return {
      title: room.name,
      scopeLabel: "Campaign",
      contextLabel: room.campaignName,
    };
  }
  if (room.scope === "direct") {
    return {
      title: room.partnerName,
      scopeLabel: "Direct",
      contextLabel: `Private conversation with ${room.partnerName}`,
    };
  }
  return {
    title: room.name,
    scopeLabel: "Global",
    contextLabel: "Open to every current Serrian Tide role",
  };
}

function chronologicalMessageOrder(left: ChatMessageDto, right: ChatMessageDto): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id - right.id;
}

export function mergeChatMessages(
  ...messageGroups: readonly (readonly ChatMessageDto[])[]
): ChatMessageDto[] {
  const byId = new Map<number, ChatMessageDto>();
  for (const messages of messageGroups) {
    for (const message of messages) byId.set(message.id, message);
  }
  return [...byId.values()].sort(chronologicalMessageOrder);
}

export function prependOlderChatMessages(
  currentMessages: readonly ChatMessageDto[],
  olderPage: Pick<ChatHistoryPage, "messages">,
): ChatMessageDto[] {
  return mergeChatMessages(olderPage.messages, currentMessages);
}

export function reconcilePostedChatMessage(
  currentMessages: readonly ChatMessageDto[],
  postedMessage: ChatMessageDto,
): ChatMessageDto[] {
  return mergeChatMessages(currentMessages, [postedMessage]);
}

export function reconcileLiveChatMessage(
  currentMessages: readonly ChatMessageDto[],
  authoritativeMessage: ChatMessageDto,
): ChatMessageDto[] {
  return mergeChatMessages(currentMessages, [authoritativeMessage]);
}

export function reconcileDeletedChatMessage(
  currentMessages: readonly ChatMessageDto[],
  deletedMessage: ChatMessageDto,
): ChatMessageDto[] {
  return currentMessages.map((message) => (
    message.id === deletedMessage.id ? deletedMessage : message
  ));
}

export function isCurrentChatRoomLoad(
  activeRoomSlug: string | null,
  activeToken: ChatRoomLoadToken,
  completedToken: ChatRoomLoadToken,
): boolean {
  return activeRoomSlug === completedToken.roomSlug
    && activeToken.roomSlug === completedToken.roomSlug
    && activeToken.sequence === completedToken.sequence;
}

export function getChatSubmissionIdentity(
  existing: ChatSubmissionIdentity | null,
  content: string,
  createRequestId: () => string,
): ChatSubmissionIdentity {
  if (existing?.content === content) return existing;
  return { content, clientRequestId: createRequestId() };
}

export function createChatClientRequestId(randomBytes: Uint8Array): string {
  if (randomBytes.length !== 16) {
    throw new Error("Chat request identity requires exactly 16 random bytes.");
  }
  return Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function retainChatSubmissionIdentityAfterDraftChange(
  existing: ChatSubmissionIdentity | null,
  content: string,
): ChatSubmissionIdentity | null {
  return existing?.content === content ? existing : null;
}
