import "server-only";

import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { chatMessage, chatRoom, chatRoomMember, type ChatRoomScope } from "@/db/chat-schema";

import {
  CHAT_HISTORY_LIMIT,
  CHAT_RATE_MIN_INTERVAL_MS,
  CHAT_RATE_WINDOW_MAX_MESSAGES,
  CHAT_RATE_WINDOW_MS,
  CHAT_USER_SEARCH_LIMIT,
  DIRECT_CHAT_ROOM_NAME,
  ChatError,
  assertChatRoleAccess,
  assertChatRoomAccess,
  decodeChatCursor,
  encodeChatCursor,
  getCampaignGeneralChatName,
  getCampaignGeneralChatSlug,
  getDirectChatSlug,
  mayDeleteChatMessage,
  normalizeChatClientRequestId,
  normalizeChatContent,
  normalizeChatDeletionReason,
  normalizeChatMessageId,
  normalizeChatRoomSlug,
  normalizeDirectMessageTargetUserId,
  normalizeDirectMessageUserSearch,
  resolveChatDisplayName,
  type ChatAccessContext,
  type ChatHistoryPage,
  type ChatMessageDto,
  type ChatRoomDirectory,
  type ChatWorkspaceBootstrap,
  type DeleteChatMessageInput,
  type DirectConversation,
  type DirectMessageUserSearchResult,
  type PostChatMessageInput,
  type PostChatMessageResult,
} from "./chat";
import { selectInitialChatRoomSlug } from "./chat-interface";

export type ChatTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ResolvedRoom = {
  id: number;
  slug: string;
  name: string;
  scope: ChatRoomScope;
  campaignId: number | null;
  isArchived: boolean;
  campaignCreatorUserId: string | null;
  campaignMemberUserId: string | null;
  directMemberUserId: string | null;
};

type MessageRow = {
  id: number;
  roomId: number;
  authorUserId: string;
  clientRequestId: string;
  content: string;
  status: "active" | "deleted";
  createdAt: Date;
  authorDisplayUsername: string | null;
  authorUsername: string | null;
  authorName: string;
};

function unavailableRoom(): never {
  throw new ChatError("ROOM_UNAVAILABLE", "That Chat room is unavailable.");
}

function unavailableMessage(): never {
  throw new ChatError("MESSAGE_UNAVAILABLE", "That Chat message is unavailable.");
}

function toMessageDto(
  row: MessageRow,
  actor: ChatAccessContext,
  room: Pick<ResolvedRoom, "slug" | "name">,
): ChatMessageDto {
  const deleted = row.status === "deleted";
  return {
    id: row.id,
    room: { slug: room.slug, name: room.name },
    authorName: resolveChatDisplayName({
      displayUsername: row.authorDisplayUsername,
      username: row.authorUsername,
      name: row.authorName,
    }),
    content: deleted ? null : row.content,
    createdAt: row.createdAt.toISOString(),
    deleted,
    canDelete: !deleted && mayDeleteChatMessage(actor, row.authorUserId),
    isOwn: actor.userId === row.authorUserId,
  };
}

async function resolveChatActor(
  tx: ChatTransaction,
  userId: string,
  lock: boolean,
): Promise<ChatAccessContext> {
  const userQuery = tx
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      displayUsername: user.displayUsername,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const [account] = lock
    ? await userQuery.for("update", { of: user })
    : await userQuery;
  if (!account) {
    throw new ChatError("AUTH_REQUIRED", "You must be signed in.");
  }

  const roleRows = await tx
    .select({ role: userRole.role })
    .from(userRole)
    .where(eq(userRole.userId, account.id));
  const roles = assertChatRoleAccess(roleRows.map(({ role }) => role));
  return {
    userId: account.id,
    displayName: resolveChatDisplayName(account),
    roles,
    isAdmin: roles.includes("admin"),
  };
}

async function resolveAuthorizedRoom(
  tx: ChatTransaction,
  actor: ChatAccessContext,
  roomSlug: string,
): Promise<ResolvedRoom> {
  const [room] = await tx
    .select({
      id: chatRoom.id,
      slug: chatRoom.slug,
      name: chatRoom.name,
      scope: chatRoom.scope,
      campaignId: chatRoom.campaignId,
      isArchived: chatRoom.isArchived,
      campaignCreatorUserId: campaign.createdByUserId,
      campaignMemberUserId: campaignPlayer.userId,
      directMemberUserId: chatRoomMember.userId,
    })
    .from(chatRoom)
    .leftJoin(campaign, eq(campaign.id, chatRoom.campaignId))
    .leftJoin(
      campaignPlayer,
      and(
        eq(campaignPlayer.campaignId, chatRoom.campaignId),
        eq(campaignPlayer.userId, actor.userId),
      ),
    )
    .leftJoin(
      chatRoomMember,
      and(
        eq(chatRoomMember.roomId, chatRoom.id),
        eq(chatRoomMember.userId, actor.userId),
      ),
    )
    .where(eq(chatRoom.slug, roomSlug))
    .limit(1);
  if (!room) unavailableRoom();
  assertChatRoomAccess(actor, room);
  return room;
}

export async function synchronizeCampaignGeneralChatRoomInTransaction(
  tx: ChatTransaction,
  input: { campaignId: number; campaignName: string },
): Promise<{ slug: string; name: string }> {
  const slug = getCampaignGeneralChatSlug(input.campaignId);
  const name = getCampaignGeneralChatName(input.campaignName);
  await tx
    .insert(chatRoom)
    .values({
      slug,
      name,
      scope: "campaign",
      campaignId: input.campaignId,
      isArchived: false,
    })
    .onConflictDoNothing({ target: chatRoom.slug });
  const [room] = await tx
    .select({
      id: chatRoom.id,
      scope: chatRoom.scope,
      campaignId: chatRoom.campaignId,
    })
    .from(chatRoom)
    .where(eq(chatRoom.slug, slug))
    .limit(1)
    .for("update", { of: chatRoom });
  if (!room || room.scope !== "campaign" || room.campaignId !== input.campaignId) {
    throw new ChatError("REQUEST_FAILED", "The Campaign Chat room could not be synchronized.");
  }
  await tx
    .update(chatRoom)
    .set({ name, updatedAt: sql`clock_timestamp()` })
    .where(eq(chatRoom.id, room.id));
  return { slug, name };
}

function byNameThenSlug(
  left: { name: string; slug: string },
  right: { name: string; slug: string },
): number {
  return left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug);
}

export async function listAccessibleChatRoomsInTransaction(
  tx: ChatTransaction,
  actorUserId: string,
): Promise<ChatRoomDirectory> {
  const actor = await resolveChatActor(tx, actorUserId, false);
  const globalRows = await tx
    .select({
      slug: chatRoom.slug,
      name: chatRoom.name,
      archived: chatRoom.isArchived,
    })
    .from(chatRoom)
    .where(eq(chatRoom.scope, "global"));
  const campaignRows = await tx
    .select({
      slug: chatRoom.slug,
      name: chatRoom.name,
      archived: chatRoom.isArchived,
      campaignId: campaign.id,
      campaignName: campaign.name,
    })
    .from(chatRoom)
    .innerJoin(campaign, eq(campaign.id, chatRoom.campaignId))
    .leftJoin(campaignPlayer, and(
      eq(campaignPlayer.campaignId, campaign.id),
      eq(campaignPlayer.userId, actor.userId),
    ))
    .where(and(
      eq(chatRoom.scope, "campaign"),
      or(
        eq(campaign.createdByUserId, actor.userId),
        eq(campaignPlayer.userId, actor.userId),
      ),
    ));
  const directRows = await tx
    .select({
      id: chatRoom.id,
      slug: chatRoom.slug,
      name: chatRoom.name,
      archived: chatRoom.isArchived,
    })
    .from(chatRoom)
    .innerJoin(chatRoomMember, and(
      eq(chatRoomMember.roomId, chatRoom.id),
      eq(chatRoomMember.userId, actor.userId),
    ))
    .where(eq(chatRoom.scope, "direct"));

  const directIds = [...new Set(directRows.map(({ id }) => id))];
  const partnerRows = directIds.length
    ? await tx.select({
        roomId: chatRoomMember.roomId,
        userId: user.id,
        displayUsername: user.displayUsername,
        username: user.username,
        name: user.name,
      })
        .from(chatRoomMember)
        .innerJoin(user, eq(user.id, chatRoomMember.userId))
        .where(and(
          inArray(chatRoomMember.roomId, directIds),
          ne(chatRoomMember.userId, actor.userId),
        ))
        .orderBy(asc(chatRoomMember.roomId), asc(user.id))
    : [];
  const partnerByRoom = new Map<number, string>();
  for (const row of partnerRows) {
    if (!partnerByRoom.has(row.roomId)) {
      partnerByRoom.set(row.roomId, resolveChatDisplayName(row));
    }
  }

  const globalRooms = [...new Map(globalRows.map((room) => [room.slug, {
    ...room,
    scope: "global" as const,
  }])).values()].sort(byNameThenSlug);
  const campaignRooms = [...new Map(campaignRows.map((room) => [room.slug, {
    ...room,
    scope: "campaign" as const,
  }])).values()].sort(byNameThenSlug);
  const directConversations = [...new Map(directRows.map((room) => [room.slug, {
    slug: room.slug,
    name: room.name,
    scope: "direct" as const,
    archived: room.archived,
    partnerName: partnerByRoom.get(room.id) ?? DIRECT_CHAT_ROOM_NAME,
  }])).values()].sort((left, right) => (
    left.partnerName.localeCompare(right.partnerName) || left.slug.localeCompare(right.slug)
  ));
  return { globalRooms, campaignRooms, directConversations };
}

function unavailableUser(): never {
  throw new ChatError("USER_UNAVAILABLE", "That Chat user is unavailable.");
}

export async function getOrCreateDirectConversationInTransaction(
  tx: ChatTransaction,
  actorUserId: string,
  targetUserIdValue: unknown,
): Promise<DirectConversation> {
  const targetUserId = normalizeDirectMessageTargetUserId(targetUserIdValue);
  const participantIds = [actorUserId, targetUserId].sort();
  const accounts = await tx.select({
    id: user.id,
    name: user.name,
    username: user.username,
    displayUsername: user.displayUsername,
  })
    .from(user)
    .where(inArray(user.id, participantIds))
    .orderBy(asc(user.id))
    .for("update", { of: user });
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const actorAccount = accountById.get(actorUserId);
  if (!actorAccount) {
    throw new ChatError("AUTH_REQUIRED", "You must be signed in.");
  }

  const roleRows = await tx.select({ userId: userRole.userId, role: userRole.role })
    .from(userRole)
    .where(inArray(userRole.userId, participantIds));
  const rolesByUser = new Map<string, Array<(typeof roleRows)[number]["role"]>>();
  for (const row of roleRows) {
    const assigned = rolesByUser.get(row.userId) ?? [];
    assigned.push(row.role);
    rolesByUser.set(row.userId, assigned);
  }
  assertChatRoleAccess(rolesByUser.get(actorUserId) ?? []);
  if (actorUserId === targetUserId) {
    throw new ChatError("INVALID_INPUT", "You cannot start a direct conversation with yourself.");
  }
  const targetAccount = accountById.get(targetUserId);
  if (!targetAccount) unavailableUser();
  if (!(rolesByUser.get(targetUserId)?.length)) unavailableUser();

  const slug = getDirectChatSlug(actorUserId, targetUserId);
  let [room] = await tx.select({
    id: chatRoom.id,
    slug: chatRoom.slug,
    name: chatRoom.name,
    scope: chatRoom.scope,
    campaignId: chatRoom.campaignId,
    archived: chatRoom.isArchived,
  }).from(chatRoom).where(eq(chatRoom.slug, slug)).limit(1).for("update", { of: chatRoom });
  const created = !room;
  if (!room) {
    [room] = await tx.insert(chatRoom).values({
      slug,
      name: DIRECT_CHAT_ROOM_NAME,
      scope: "direct",
      campaignId: null,
      isArchived: false,
    }).returning({
      id: chatRoom.id,
      slug: chatRoom.slug,
      name: chatRoom.name,
      scope: chatRoom.scope,
      campaignId: chatRoom.campaignId,
      archived: chatRoom.isArchived,
    });
  }
  if (!room || room.scope !== "direct" || room.campaignId !== null) unavailableRoom();
  if (created) {
    await tx.insert(chatRoomMember).values(participantIds.map((userId) => ({
      roomId: room!.id,
      userId,
    })));
  }
  const memberships = await tx.select({ userId: chatRoomMember.userId })
    .from(chatRoomMember)
    .where(eq(chatRoomMember.roomId, room.id))
    .orderBy(asc(chatRoomMember.userId));
  if (
    memberships.length !== 2
    || memberships.some(({ userId }, index) => userId !== participantIds[index])
  ) unavailableRoom();

  return {
    slug: room.slug,
    name: room.name,
    scope: "direct",
    archived: room.archived,
    partnerName: resolveChatDisplayName(targetAccount),
  };
}

export async function searchDirectMessageUsersInTransaction(
  tx: ChatTransaction,
  actorUserId: string,
  searchValue: unknown,
): Promise<DirectMessageUserSearchResult[]> {
  await resolveChatActor(tx, actorUserId, false);
  const search = normalizeDirectMessageUserSearch(searchValue);
  const matches = await tx.select({
    userId: user.id,
    displayUsername: user.displayUsername,
    username: user.username,
    name: user.name,
  })
    .from(user)
    .where(and(
      ne(user.id, actorUserId),
      sql`exists (select 1 from ${userRole} where ${userRole.userId} = ${user.id})`,
      or(
        sql`position(lower(${search}) in lower(coalesce(${user.displayUsername}, ''))) > 0`,
        sql`position(lower(${search}) in lower(coalesce(${user.username}, ''))) > 0`,
        sql`position(lower(${search}) in lower(${user.name})) > 0`,
      ),
    ))
    .orderBy(
      asc(sql`lower(coalesce(nullif(trim(${user.displayUsername}), ''), nullif(trim(${user.username}), ''), ${user.name}))`),
      asc(user.id),
    )
    .limit(CHAT_USER_SEARCH_LIMIT);
  return matches.map((match) => ({
    userId: match.userId,
    displayName: resolveChatDisplayName(match),
  }));
}

function messageSelection() {
  return {
    id: chatMessage.id,
    roomId: chatMessage.roomId,
    authorUserId: chatMessage.authorUserId,
    clientRequestId: chatMessage.clientRequestId,
    content: chatMessage.content,
    status: chatMessage.status,
    createdAt: chatMessage.createdAt,
    authorDisplayUsername: user.displayUsername,
    authorUsername: user.username,
    authorName: user.name,
  };
}

async function findRequestMessage(
  tx: ChatTransaction,
  actor: ChatAccessContext,
  clientRequestId: string,
): Promise<MessageRow | undefined> {
  const [existing] = await tx
    .select(messageSelection())
    .from(chatMessage)
    .innerJoin(user, eq(user.id, chatMessage.authorUserId))
    .where(and(
      eq(chatMessage.authorUserId, actor.userId),
      eq(chatMessage.clientRequestId, clientRequestId),
    ))
    .limit(1);
  return existing;
}

function resolveIdempotentMessage(
  existing: MessageRow,
  room: ResolvedRoom,
  content: string,
  actor: ChatAccessContext,
): PostChatMessageResult {
  if (existing.roomId !== room.id || existing.content !== content) {
    throw new ChatError(
      "REQUEST_ID_COLLISION",
      "That message request ID has already been used for a different request.",
    );
  }
  return { message: toMessageDto(existing, actor, room), created: false };
}

async function enforcePostRateLimit(tx: ChatTransaction, actorUserId: string): Promise<void> {
  const recent = await tx
    .select({
      ageMilliseconds: sql<string>`extract(epoch from (clock_timestamp() - ${chatMessage.createdAt})) * 1000`,
    })
    .from(chatMessage)
    .where(and(
      eq(chatMessage.authorUserId, actorUserId),
      gt(chatMessage.createdAt, sql`clock_timestamp() - interval '60 seconds'`),
    ))
    .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
    .limit(CHAT_RATE_WINDOW_MAX_MESSAGES);

  const latestAge = recent[0] ? Number(recent[0].ageMilliseconds) : null;
  if (latestAge !== null) {
    const retryAfterMs = Math.max(
      1,
      CHAT_RATE_MIN_INTERVAL_MS - latestAge,
    );
    if (latestAge < CHAT_RATE_MIN_INTERVAL_MS) {
      throw new ChatError("RATE_LIMITED", "Please wait before sending another message.", {
        retryable: true,
        retryAfterMs,
      });
    }
  }

  if (recent.length >= CHAT_RATE_WINDOW_MAX_MESSAGES) {
    const oldestAge = Number(recent.at(-1)!.ageMilliseconds);
    throw new ChatError("RATE_LIMITED", "Too many messages were sent recently. Please try again shortly.", {
      retryable: true,
      retryAfterMs: Math.max(1, CHAT_RATE_WINDOW_MS - oldestAge),
    });
  }
}

export async function loadChatHistoryInTransaction(
  tx: ChatTransaction,
  actorUserId: string,
  input: { roomSlug: string; cursor?: string | null },
): Promise<ChatHistoryPage> {
  const roomSlug = normalizeChatRoomSlug(input.roomSlug);
  const cursor = decodeChatCursor(input.cursor);
  const actor = await resolveChatActor(tx, actorUserId, false);
  const room = await resolveAuthorizedRoom(tx, actor, roomSlug);
  const cursorCondition = cursor
    ? or(
        lt(chatMessage.createdAt, new Date(cursor.createdAt)),
        and(
          eq(chatMessage.createdAt, new Date(cursor.createdAt)),
          lt(chatMessage.id, cursor.id),
        ),
      )
    : undefined;
  const rows = await tx
    .select(messageSelection())
    .from(chatMessage)
    .innerJoin(user, eq(user.id, chatMessage.authorUserId))
    .where(and(eq(chatMessage.roomId, room.id), cursorCondition))
    .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
    .limit(CHAT_HISTORY_LIMIT + 1);
  const hasOlder = rows.length > CHAT_HISTORY_LIMIT;
  const visibleRows = rows.slice(0, CHAT_HISTORY_LIMIT);
  const oldest = visibleRows.at(-1);

  return {
    room: {
      slug: room.slug,
      name: room.name,
      scope: room.scope,
      archived: room.isArchived,
    },
    messages: visibleRows.reverse().map((row) => toMessageDto(row, actor, room)),
    hasOlder,
    olderCursor: hasOlder && oldest
      ? encodeChatCursor({ createdAt: oldest.createdAt.toISOString(), id: oldest.id })
      : null,
  };
}

export async function postChatMessageInTransaction(
  tx: ChatTransaction,
  actorUserId: string,
  input: PostChatMessageInput,
): Promise<PostChatMessageResult> {
  const roomSlug = normalizeChatRoomSlug(input.roomSlug);
  const content = normalizeChatContent(input.content);
  const clientRequestId = normalizeChatClientRequestId(input.clientRequestId);
  const actor = await resolveChatActor(tx, actorUserId, true);
  const room = await resolveAuthorizedRoom(tx, actor, roomSlug);

  const existing = await findRequestMessage(tx, actor, clientRequestId);
  if (existing) return resolveIdempotentMessage(existing, room, content, actor);
  if (room.isArchived) {
    throw new ChatError("ROOM_ARCHIVED", "That Chat room is archived and cannot receive new messages.");
  }
  await enforcePostRateLimit(tx, actor.userId);

  const [inserted] = await tx
    .insert(chatMessage)
    .values({
      roomId: room.id,
      authorUserId: actor.userId,
      clientRequestId,
      content,
      createdAt: sql`clock_timestamp()`,
    })
    .returning({
      id: chatMessage.id,
      roomId: chatMessage.roomId,
      authorUserId: chatMessage.authorUserId,
      clientRequestId: chatMessage.clientRequestId,
      content: chatMessage.content,
      status: chatMessage.status,
      createdAt: chatMessage.createdAt,
    });
  return {
    message: toMessageDto({
      ...inserted,
      authorDisplayUsername: null,
      authorUsername: null,
      authorName: actor.displayName,
    }, actor, room),
    created: true,
  };
}

export async function deleteChatMessageInTransaction(
  tx: ChatTransaction,
  actorUserId: string,
  input: DeleteChatMessageInput,
): Promise<ChatMessageDto> {
  const roomSlug = normalizeChatRoomSlug(input.roomSlug);
  const messageId = normalizeChatMessageId(input.messageId);
  const reason = normalizeChatDeletionReason(input.reason);
  const actor = await resolveChatActor(tx, actorUserId, false);
  const room = await resolveAuthorizedRoom(tx, actor, roomSlug);
  const [message] = await tx
    .select(messageSelection())
    .from(chatMessage)
    .innerJoin(user, eq(user.id, chatMessage.authorUserId))
    .where(and(eq(chatMessage.id, messageId), eq(chatMessage.roomId, room.id)))
    .limit(1)
    .for("update", { of: chatMessage });
  if (!message) unavailableMessage();
  if (!mayDeleteChatMessage(actor, message.authorUserId)) {
    throw new ChatError("ACCESS_DENIED", "You may delete only your own Chat messages.");
  }
  if (message.status === "deleted") return toMessageDto(message, actor, room);

  const [deleted] = await tx
    .update(chatMessage)
    .set({
      status: "deleted",
      deletedAt: sql`clock_timestamp()`,
      deletedByUserId: actor.userId,
      deletionReason: reason,
    })
    .where(eq(chatMessage.id, message.id))
    .returning({
      id: chatMessage.id,
      roomId: chatMessage.roomId,
      authorUserId: chatMessage.authorUserId,
      clientRequestId: chatMessage.clientRequestId,
      content: chatMessage.content,
      status: chatMessage.status,
      createdAt: chatMessage.createdAt,
    });
  return toMessageDto({
    ...deleted,
    authorDisplayUsername: message.authorDisplayUsername,
    authorUsername: message.authorUsername,
    authorName: message.authorName,
  }, actor, room);
}

export function loadChatHistory(
  actorUserId: string,
  input: { roomSlug: string; cursor?: string | null },
): Promise<ChatHistoryPage> {
  return db.transaction((tx) => loadChatHistoryInTransaction(tx, actorUserId, input));
}

export function postChatMessage(
  actorUserId: string,
  input: PostChatMessageInput,
): Promise<PostChatMessageResult> {
  return db.transaction((tx) => postChatMessageInTransaction(tx, actorUserId, input));
}

export function deleteChatMessage(
  actorUserId: string,
  input: DeleteChatMessageInput,
): Promise<ChatMessageDto> {
  return db.transaction((tx) => deleteChatMessageInTransaction(tx, actorUserId, input));
}

export function listAccessibleChatRooms(actorUserId: string): Promise<ChatRoomDirectory> {
  return db.transaction((tx) => listAccessibleChatRoomsInTransaction(tx, actorUserId));
}

export function getOrCreateDirectConversation(
  actorUserId: string,
  targetUserId: unknown,
): Promise<DirectConversation> {
  return db.transaction((tx) => (
    getOrCreateDirectConversationInTransaction(tx, actorUserId, targetUserId)
  ));
}

export function searchDirectMessageUsers(
  actorUserId: string,
  search: unknown,
): Promise<DirectMessageUserSearchResult[]> {
  return db.transaction((tx) => searchDirectMessageUsersInTransaction(tx, actorUserId, search));
}

export async function getChatWorkspaceBootstrapInTransaction(
  tx: ChatTransaction,
  actorUserId: string,
  requestedRoomSlug: string | null,
): Promise<ChatWorkspaceBootstrap> {
  const actor = await resolveChatActor(tx, actorUserId, false);
  const directory = await listAccessibleChatRoomsInTransaction(tx, actorUserId);
  const selectedRoomSlug = selectInitialChatRoomSlug(directory, requestedRoomSlug);
  const history = selectedRoomSlug
    ? await loadChatHistoryInTransaction(tx, actorUserId, { roomSlug: selectedRoomSlug })
    : null;
  return {
    displayName: actor.displayName,
    directory,
    selectedRoomSlug,
    history,
  };
}

export function getChatWorkspaceBootstrap(
  actorUserId: string,
  requestedRoomSlug: string | null,
): Promise<ChatWorkspaceBootstrap> {
  return db.transaction((tx) => (
    getChatWorkspaceBootstrapInTransaction(tx, actorUserId, requestedRoomSlug)
  ));
}
