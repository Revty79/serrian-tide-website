"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  deleteChatMessageAction,
  getOrCreateDirectConversationAction,
  listAccessibleChatRoomsAction,
  loadChatHistoryAction,
  loadChatMessageAction,
  loadOlderChatMessagesAction,
  postChatMessageAction,
  searchDirectMessageUsersAction,
  type ChatActionError,
} from "./actions";
import {
  CHAT_CONTENT_MAX_LENGTH,
  CHAT_DELETION_REASON_MAX_LENGTH,
  type ChatMessageDto,
  type ChatRoomDirectory,
  type ChatWorkspaceBootstrap,
  type DirectMessageUserSearchResult,
} from "@/features/chat/chat";
import {
  findChatDirectoryRoom,
  getChatRoomMetadata,
  getChatSubmissionIdentity,
  isChatViewportNearNewest,
  isCurrentChatRoomLoad,
  mergeChatMessages,
  prependOlderChatMessages,
  preserveChatRoomSelection,
  reconcileChatRoomArchiveState,
  reconcileDeletedChatMessage,
  reconcileLiveChatMessage,
  reconcilePostedChatMessage,
  retainChatSubmissionIdentityAfterDraftChange,
  terminalChatDestination,
  type ChatRoomLoadToken,
  type ChatSubmissionIdentity,
} from "@/features/chat/chat-interface";
import { ChatLiveConnection } from "@/features/chat/chat-live-connection";

import styles from "./chat.module.css";

type RoomLoadState = "empty" | "loading" | "ready" | "error";

function stableTimestampLabel(isoValue: string): string {
  const date = new Date(isoValue);
  return Number.isNaN(date.valueOf())
    ? "Unknown time"
    : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function subscribeToHydration(): () => void {
  return () => undefined;
}

function LocalChatTime({ isoValue }: { isoValue: string }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const date = new Date(isoValue);
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  const label = hydrated && !Number.isNaN(date.valueOf())
    ? sameDay
      ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : date.toLocaleString([], {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
    : stableTimestampLabel(isoValue);

  return <time dateTime={isoValue}>{label}</time>;
}

function actionErrorMessage(error: ChatActionError): string {
  if (error.code === "RATE_LIMITED" && error.retryAfterMs) {
    const seconds = Math.max(1, Math.ceil(error.retryAfterMs / 1_000));
    return `${error.message} Try again in about ${seconds} second${seconds === 1 ? "" : "s"}.`;
  }
  return error.message;
}

function RoomButton({
  active,
  archived,
  label,
  detail,
  onSelect,
}: {
  active: boolean;
  archived: boolean;
  label: string;
  detail?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={`${styles.roomButton} ${active ? styles.roomButtonActive : ""}`}
    >
      <span className={styles.roomButtonText}>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {active || archived ? (
        <span className={styles.roomBadges}>
          {active ? <span className={styles.currentBadge}>Current</span> : null}
          {archived ? <span className={styles.archivedBadge}>Archived</span> : null}
        </span>
      ) : null}
    </button>
  );
}

function EmptyRoomGroup({ children }: { children: React.ReactNode }) {
  return <p className={styles.roomGroupEmpty}>{children}</p>;
}

export function ChatWorkspace({ initialBootstrap }: { initialBootstrap: ChatWorkspaceBootstrap }) {
  const router = useRouter();
  const initialHistory = initialBootstrap.history;
  const [directory, setDirectory] = useState(initialBootstrap.directory);
  const [activeRoomSlug, setActiveRoomSlug] = useState(initialBootstrap.selectedRoomSlug);
  const [messages, setMessages] = useState(initialHistory?.messages ?? []);
  const [hasOlder, setHasOlder] = useState(initialHistory?.hasOlder ?? false);
  const [olderCursor, setOlderCursor] = useState(initialHistory?.olderCursor ?? null);
  const [roomLoadState, setRoomLoadState] = useState<RoomLoadState>(
    initialBootstrap.selectedRoomSlug ? "ready" : "empty",
  );
  const [roomError, setRoomError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [moderationReason, setModerationReason] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [directPanelOpen, setDirectPanelOpen] = useState(false);
  const [directSearch, setDirectSearch] = useState("");
  const [directResults, setDirectResults] = useState<DirectMessageUserSearchResult[] | null>(null);
  const [directSearching, setDirectSearching] = useState(false);
  const [directOpeningUserId, setDirectOpeningUserId] = useState<string | null>(null);
  const [directError, setDirectError] = useState<string | null>(null);
  const [terminalDestination, setTerminalDestination] = useState<"/login" | "/access" | null>(null);

  const activeRoomSlugRef = useRef(activeRoomSlug);
  const loadSequenceRef = useRef(0);
  const activeLoadTokenRef = useRef<ChatRoomLoadToken>({
    roomSlug: activeRoomSlug ?? "",
    sequence: 0,
  });
  const historyViewportRef = useRef<HTMLDivElement>(null);
  const conversationHeadingRef = useRef<HTMLHeadingElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const directSearchRef = useRef<HTMLInputElement>(null);
  const directTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sendingRef = useRef(false);
  const draftRef = useRef("");
  const submissionIdentityRef = useRef<ChatSubmissionIdentity | null>(null);

  const activeRoom = useMemo(
    () => findChatDirectoryRoom(directory, activeRoomSlug),
    [directory, activeRoomSlug],
  );
  const roomMetadata = activeRoom ? getChatRoomMetadata(activeRoom) : null;

  useEffect(() => {
    const viewport = historyViewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, []);

  function scrollToNewest() {
    requestAnimationFrame(() => {
      const viewport = historyViewportRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
  }

  function readerIsNearNewest(): boolean {
    const viewport = historyViewportRef.current;
    return !viewport || isChatViewportNearNewest(viewport);
  }

  function clearChatStateForTerminalAuthorization(destination: "/login" | "/access") {
    const sequence = ++loadSequenceRef.current;
    activeRoomSlugRef.current = null;
    activeLoadTokenRef.current = { roomSlug: "", sequence };
    sendingRef.current = false;
    draftRef.current = "";
    submissionIdentityRef.current = null;
    setDirectory({ globalRooms: [], campaignRooms: [], directConversations: [] });
    setActiveRoomSlug(null);
    setMessages([]);
    setHasOlder(false);
    setOlderCursor(null);
    setRoomLoadState("empty");
    setRoomError(null);
    setWorkspaceNotice(null);
    setRefreshing(false);
    setLoadingOlder(false);
    setDraft("");
    setSubmitting(false);
    setComposerError(null);
    setConfirmDeleteId(null);
    setModerationReason("");
    setDeletingMessageId(null);
    setMessageError(null);
    setDirectPanelOpen(false);
    setDirectSearch("");
    setDirectResults(null);
    setDirectSearching(false);
    setDirectOpeningUserId(null);
    setDirectError(null);
    setTerminalDestination(destination);
    router.replace(destination);
    router.refresh();
  }

  function handleTerminalAuthorizationError(error: ChatActionError): boolean {
    const destination = terminalChatDestination(error.code);
    if (!destination) return false;
    clearChatStateForTerminalAuthorization(destination);
    return true;
  }

  function updateRoomUrl(roomSlug: string) {
    router.replace(`/chat?room=${encodeURIComponent(roomSlug)}`, { scroll: false });
  }

  async function openRoom(roomSlug: string, focusComposer = false) {
    const authorizedRoom = findChatDirectoryRoom(directory, roomSlug);
    if (!authorizedRoom) return;
    const token = { roomSlug, sequence: ++loadSequenceRef.current };
    activeLoadTokenRef.current = token;
    activeRoomSlugRef.current = roomSlug;
    setActiveRoomSlug(roomSlug);
    setMessages([]);
    setHasOlder(false);
    setOlderCursor(null);
    setRoomError(null);
    setWorkspaceNotice(null);
    setRefreshing(false);
    setLoadingOlder(false);
    setDeletingMessageId(null);
    setMessageError(null);
    setComposerError(null);
    setConfirmDeleteId(null);
    setModerationReason("");
    setRoomLoadState("loading");
    updateRoomUrl(roomSlug);

    const result = await loadChatHistoryAction({ roomSlug });
    if (!result.ok && handleTerminalAuthorizationError(result.error)) return;
    if (!isCurrentChatRoomLoad(activeRoomSlugRef.current, activeLoadTokenRef.current, token)) return;
    if (!result.ok) {
      setRoomLoadState("error");
      setRoomError(actionErrorMessage(result.error));
      if (result.error.code === "ROOM_UNAVAILABLE") void refreshDirectoryAfterRoomChange(roomSlug);
      return;
    }
    setMessages(result.data.messages);
    setDirectory((current) => reconcileChatRoomArchiveState(
      current,
      roomSlug,
      result.data.room.archived,
    ));
    setHasOlder(result.data.hasOlder);
    setOlderCursor(result.data.olderCursor);
    setRoomLoadState("ready");
    scrollToNewest();
    requestAnimationFrame(() => {
      if (focusComposer && !result.data.room.archived) composerRef.current?.focus();
      else conversationHeadingRef.current?.focus();
    });
  }

  async function refreshDirectoryAfterRoomChange(previousRoomSlug: string) {
    const result = await listAccessibleChatRoomsAction();
    if (!result.ok && handleTerminalAuthorizationError(result.error)) return;
    if (!result.ok || activeRoomSlugRef.current !== previousRoomSlug) return;
    setDirectory(result.data);
    const nextRoomSlug = preserveChatRoomSelection(result.data, previousRoomSlug);
    if (nextRoomSlug && nextRoomSlug !== previousRoomSlug) {
      await openAuthorizedRoomFromDirectory(nextRoomSlug, result.data);
      setWorkspaceNotice("That conversation is no longer available. Another authorized room has been selected.");
    } else if (!nextRoomSlug) {
      activeRoomSlugRef.current = null;
      setActiveRoomSlug(null);
      setMessages([]);
      setRoomLoadState("empty");
      setWorkspaceNotice("That conversation is no longer available, and no other Chat room is currently accessible.");
      router.replace("/chat", { scroll: false });
    }
  }

  async function reconcileNewestHistoryFromLive(roomSlug: string) {
    if (activeRoomSlugRef.current !== roomSlug) return;
    const result = await loadChatHistoryAction({ roomSlug });
    if (!result.ok && handleTerminalAuthorizationError(result.error)) return;
    if (activeRoomSlugRef.current !== roomSlug) return;
    if (!result.ok) {
      if (result.error.code === "ROOM_UNAVAILABLE") {
        await refreshDirectoryAfterRoomChange(roomSlug);
      }
      return;
    }
    const followNewest = readerIsNearNewest();
    setMessages((current) => mergeChatMessages(current, result.data.messages));
    setDirectory((current) => reconcileChatRoomArchiveState(
      current,
      roomSlug,
      result.data.room.archived,
    ));
    if (followNewest) scrollToNewest();
  }

  async function reconcileExactMessageFromLive(roomSlug: string, messageId: number) {
    if (activeRoomSlugRef.current !== roomSlug) return;
    const result = await loadChatMessageAction({ roomSlug, messageId });
    if (!result.ok && handleTerminalAuthorizationError(result.error)) return;
    if (activeRoomSlugRef.current !== roomSlug) return;
    if (!result.ok) {
      if (result.error.code === "ROOM_UNAVAILABLE") {
        await refreshDirectoryAfterRoomChange(roomSlug);
      }
      return;
    }
    if (result.data.room.slug !== roomSlug) return;
    const followNewest = readerIsNearNewest();
    if (result.data.id === confirmDeleteId && (result.data.deleted || !result.data.canDelete)) {
      setConfirmDeleteId(null);
      setModerationReason("");
    }
    setMessages((current) => reconcileLiveChatMessage(current, result.data));
    if (followNewest) scrollToNewest();
  }

  async function openAuthorizedRoomFromDirectory(
    roomSlug: string,
    currentDirectory: ChatRoomDirectory,
    focusComposer = false,
  ) {
    const authorizedRoom = findChatDirectoryRoom(currentDirectory, roomSlug);
    if (!authorizedRoom) return;
    setDirectory(currentDirectory);
    const token = { roomSlug, sequence: ++loadSequenceRef.current };
    activeLoadTokenRef.current = token;
    activeRoomSlugRef.current = roomSlug;
    setActiveRoomSlug(roomSlug);
    setMessages([]);
    setHasOlder(false);
    setOlderCursor(null);
    setRoomError(null);
    setRefreshing(false);
    setLoadingOlder(false);
    setDeletingMessageId(null);
    setMessageError(null);
    setComposerError(null);
    setConfirmDeleteId(null);
    setModerationReason("");
    setRoomLoadState("loading");
    updateRoomUrl(roomSlug);
    const result = await loadChatHistoryAction({ roomSlug });
    if (!result.ok && handleTerminalAuthorizationError(result.error)) return;
    if (!isCurrentChatRoomLoad(activeRoomSlugRef.current, activeLoadTokenRef.current, token)) return;
    if (!result.ok) {
      setRoomLoadState("error");
      setRoomError(actionErrorMessage(result.error));
      return;
    }
    setMessages(result.data.messages);
    setDirectory((current) => reconcileChatRoomArchiveState(
      current,
      roomSlug,
      result.data.room.archived,
    ));
    setHasOlder(result.data.hasOlder);
    setOlderCursor(result.data.olderCursor);
    setRoomLoadState("ready");
    scrollToNewest();
    requestAnimationFrame(() => {
      if (focusComposer && !result.data.room.archived) composerRef.current?.focus();
      else conversationHeadingRef.current?.focus();
    });
  }

  async function refreshMessages() {
    const roomSlug = activeRoomSlugRef.current;
    if (!roomSlug || refreshing) return;
    const token = { roomSlug, sequence: ++loadSequenceRef.current };
    activeLoadTokenRef.current = token;
    setRefreshing(true);
    setRoomError(null);
    const result = await loadChatHistoryAction({ roomSlug });
    if (!result.ok && handleTerminalAuthorizationError(result.error)) return;
    if (!isCurrentChatRoomLoad(activeRoomSlugRef.current, activeLoadTokenRef.current, token)) return;
    setRefreshing(false);
    if (!result.ok) {
      setRoomError(actionErrorMessage(result.error));
      if (result.error.code === "ROOM_UNAVAILABLE") void refreshDirectoryAfterRoomChange(roomSlug);
      return;
    }
    setMessages((current) => mergeChatMessages(current, result.data.messages));
    setDirectory((current) => reconcileChatRoomArchiveState(
      current,
      roomSlug,
      result.data.room.archived,
    ));
    if (messages.length === 0) {
      setHasOlder(result.data.hasOlder);
      setOlderCursor(result.data.olderCursor);
    }
  }

  async function loadOlderMessages() {
    const roomSlug = activeRoomSlugRef.current;
    if (!roomSlug || !olderCursor || loadingOlder) return;
    const viewport = historyViewportRef.current;
    const anchor = messages[0];
    const anchorElement = anchor
      ? viewport?.querySelector<HTMLElement>(`[data-message-id="${anchor.id}"]`)
      : null;
    const anchorViewportOffset = anchorElement && viewport
      ? anchorElement.getBoundingClientRect().top - viewport.getBoundingClientRect().top
      : null;
    setLoadingOlder(true);
    setRoomError(null);
    const result = await loadOlderChatMessagesAction({ roomSlug, cursor: olderCursor });
    if (!result.ok && handleTerminalAuthorizationError(result.error)) return;
    if (activeRoomSlugRef.current !== roomSlug) return;
    setLoadingOlder(false);
    if (!result.ok) {
      setRoomError(actionErrorMessage(result.error));
      return;
    }
    setMessages((current) => prependOlderChatMessages(current, result.data));
    setDirectory((current) => reconcileChatRoomArchiveState(
      current,
      roomSlug,
      result.data.room.archived,
    ));
    setHasOlder(result.data.hasOlder);
    setOlderCursor(result.data.olderCursor);
    requestAnimationFrame(() => {
      if (!viewport || !anchor || anchorViewportOffset === null) return;
      const repositioned = viewport.querySelector<HTMLElement>(`[data-message-id="${anchor.id}"]`);
      if (repositioned) {
        viewport.scrollTop += repositioned.getBoundingClientRect().top
          - viewport.getBoundingClientRect().top
          - anchorViewportOffset;
      }
    });
  }

  function changeDraft(event: ChangeEvent<HTMLTextAreaElement>) {
    const content = event.target.value;
    draftRef.current = content;
    submissionIdentityRef.current = retainChatSubmissionIdentityAfterDraftChange(
      submissionIdentityRef.current,
      content,
    );
    setDraft(content);
    setComposerError(null);
  }

  async function sendMessage() {
    if (sendingRef.current) return;
    const roomSlug = activeRoomSlugRef.current;
    const content = draftRef.current;
    if (!roomSlug || !activeRoom || activeRoom.archived) return;
    if (!/\S/u.test(content)) {
      setComposerError("Enter a message before sending.");
      return;
    }
    if (content.length > CHAT_CONTENT_MAX_LENGTH) {
      setComposerError(`Messages cannot exceed ${CHAT_CONTENT_MAX_LENGTH} characters.`);
      return;
    }
    sendingRef.current = true;
    setSubmitting(true);
    setComposerError(null);
    const identity = getChatSubmissionIdentity(
      submissionIdentityRef.current,
      content,
      () => window.crypto.randomUUID(),
    );
    submissionIdentityRef.current = identity;
    const result = await postChatMessageAction({
      roomSlug,
      content,
      clientRequestId: identity.clientRequestId,
    });
    sendingRef.current = false;
    setSubmitting(false);
    if (!result.ok && handleTerminalAuthorizationError(result.error)) return;
    if (activeRoomSlugRef.current !== roomSlug) return;
    if (!result.ok) {
      setComposerError(actionErrorMessage(result.error));
      if (result.error.code === "ROOM_UNAVAILABLE" || result.error.code === "ROOM_ARCHIVED") {
        void refreshDirectoryAfterRoomChange(roomSlug);
      }
      return;
    }
    setMessages((current) => reconcilePostedChatMessage(current, result.data.message));
    submissionIdentityRef.current = null;
    draftRef.current = "";
    setDraft("");
    scrollToNewest();
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function submitComposer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function composerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function beginDeleteConfirmation(messageId: number) {
    setConfirmDeleteId(messageId);
    setModerationReason("");
    setMessageError(null);
  }

  function cancelDeleteConfirmation() {
    setConfirmDeleteId(null);
    setModerationReason("");
  }

  async function deleteMessage(message: ChatMessageDto) {
    const roomSlug = activeRoomSlugRef.current;
    if (!roomSlug || deletingMessageId !== null) return;
    setDeletingMessageId(message.id);
    setMessageError(null);
    const result = await deleteChatMessageAction({
      roomSlug,
      messageId: message.id,
      reason: message.isOwn ? undefined : moderationReason,
    });
    if (!result.ok && handleTerminalAuthorizationError(result.error)) return;
    if (activeRoomSlugRef.current !== roomSlug) return;
    setDeletingMessageId(null);
    if (!result.ok) {
      setMessageError(actionErrorMessage(result.error));
      return;
    }
    setMessages((current) => reconcileDeletedChatMessage(current, result.data));
    setConfirmDeleteId(null);
    setModerationReason("");
  }

  function openDirectPanel(event: MouseEvent<HTMLButtonElement>) {
    directTriggerRef.current = event.currentTarget;
    setDirectPanelOpen(true);
    setDirectError(null);
    requestAnimationFrame(() => directSearchRef.current?.focus());
  }

  function closeDirectPanel() {
    if (directSearching || directOpeningUserId) return;
    setDirectPanelOpen(false);
    setDirectError(null);
    requestAnimationFrame(() => directTriggerRef.current?.focus());
  }

  async function searchDirectUsers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = directSearch.trim();
    if (search.length < 2) {
      setDirectResults(null);
      setDirectError("Enter at least two characters to search.");
      return;
    }
    setDirectSearching(true);
    setDirectError(null);
    const result = await searchDirectMessageUsersAction({ search });
    setDirectSearching(false);
    if (!result.ok && handleTerminalAuthorizationError(result.error)) return;
    if (!result.ok) {
      setDirectResults(null);
      setDirectError(actionErrorMessage(result.error));
      return;
    }
    setDirectResults(result.data);
  }

  async function openDirectConversation(resultUser: DirectMessageUserSearchResult) {
    if (directOpeningUserId) return;
    setDirectOpeningUserId(resultUser.userId);
    setDirectError(null);
    const conversation = await getOrCreateDirectConversationAction({ targetUserId: resultUser.userId });
    if (!conversation.ok && handleTerminalAuthorizationError(conversation.error)) return;
    if (!conversation.ok) {
      setDirectOpeningUserId(null);
      setDirectError(actionErrorMessage(conversation.error));
      return;
    }
    const refreshed = await listAccessibleChatRoomsAction();
    setDirectOpeningUserId(null);
    if (!refreshed.ok && handleTerminalAuthorizationError(refreshed.error)) return;
    if (!refreshed.ok) {
      setDirectError(actionErrorMessage(refreshed.error));
      return;
    }
    const selected = findChatDirectoryRoom(refreshed.data, conversation.data.slug);
    if (!selected) {
      setDirectError("The conversation could not be opened. Please try again.");
      return;
    }
    setDirectPanelOpen(false);
    setDirectResults(null);
    setDirectSearch("");
    setWorkspaceNotice(null);
    await openAuthorizedRoomFromDirectory(conversation.data.slug, refreshed.data, true);
  }

  if (terminalDestination) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.authorizationLoss} role="alert" aria-live="assertive">
            <p className={styles.eyebrow}>Crossroads access changed</p>
            <h1>{terminalDestination === "/login" ? "Sign-in required" : "Access no longer available"}</h1>
            <p>
              {terminalDestination === "/login"
                ? "Your session is no longer active. Redirecting to sign in."
                : "Your current role no longer permits Chat access. Redirecting to the access page."}
            </p>
          </section>
        </div>
      </main>
    );
  }

  const roomGroups = (
    <>
      <section className={styles.roomGroup} aria-labelledby="chat-global-rooms">
        <h2 id="chat-global-rooms">Crossroads</h2>
        {directory.globalRooms.length ? directory.globalRooms.map((room) => (
          <RoomButton
            key={room.slug}
            active={activeRoomSlug === room.slug}
            archived={room.archived}
            label={room.name}
            onSelect={() => void openRoom(room.slug)}
          />
        )) : <EmptyRoomGroup>No global rooms are available.</EmptyRoomGroup>}
      </section>

      <section className={styles.roomGroup} aria-labelledby="chat-campaign-rooms">
        <h2 id="chat-campaign-rooms">Campaigns</h2>
        {directory.campaignRooms.length ? directory.campaignRooms.map((room) => (
          <RoomButton
            key={room.slug}
            active={activeRoomSlug === room.slug}
            archived={room.archived}
            label={room.campaignName}
            detail={room.name}
            onSelect={() => void openRoom(room.slug)}
          />
        )) : <EmptyRoomGroup>No Campaign Chats are available.</EmptyRoomGroup>}
      </section>

      <section className={styles.roomGroup} aria-labelledby="chat-direct-rooms">
        <div className={styles.roomGroupHeading}>
          <h2 id="chat-direct-rooms">Direct Messages</h2>
          <button type="button" className={styles.smallAction} onClick={openDirectPanel}>New Message</button>
        </div>
        {directory.directConversations.length ? directory.directConversations.map((room) => (
          <RoomButton
            key={room.slug}
            active={activeRoomSlug === room.slug}
            archived={room.archived}
            label={room.partnerName}
            detail="Private conversation"
            onSelect={() => void openRoom(room.slug)}
          />
        )) : <EmptyRoomGroup>No direct conversations yet.</EmptyRoomGroup>}
      </section>
    </>
  );

  return (
    <main className={styles.page} data-chat-workspace>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.brandBlock}>
            <span className={`${styles.brand} font-evanescent`}>SERRIAN TIDE</span>
            <span className={styles.eyebrow}>Communication Center</span>
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Where paths converge</p>
            <h1>The Crossroads</h1>
            <p>Community, Campaign, and private conversations in one gathering place.</p>
          </div>
          <div className={styles.accountBlock}>
            <span className={styles.identityBlock}>
              <span>Signed in as</span>
              <strong title={initialBootstrap.displayName}>{initialBootstrap.displayName}</strong>
            </span>
            <Link href="/access">Return to Paths</Link>
          </div>
        </header>

        <div className={styles.mobileRoomPicker}>
          <label htmlFor="chat-room-select">Conversation</label>
          <div className={styles.mobileRoomControls}>
            <select
              id="chat-room-select"
              value={activeRoomSlug ?? ""}
              onChange={(event) => event.target.value && void openRoom(event.target.value)}
            >
              {!activeRoomSlug ? <option value="">No room available</option> : null}
              <optgroup label="Crossroads">
                {directory.globalRooms.map((room) => <option key={room.slug} value={room.slug}>{room.name}{room.archived ? " (Archived)" : ""}</option>)}
              </optgroup>
              <optgroup label="Campaigns">
                {directory.campaignRooms.map((room) => <option key={room.slug} value={room.slug}>{room.campaignName}{room.archived ? " (Archived)" : ""}</option>)}
              </optgroup>
              <optgroup label="Direct Messages">
                {directory.directConversations.map((room) => <option key={room.slug} value={room.slug}>{room.partnerName}{room.archived ? " (Archived)" : ""}</option>)}
              </optgroup>
            </select>
            <button type="button" onClick={openDirectPanel}>New Message</button>
          </div>
          {directory.campaignRooms.length === 0 || directory.directConversations.length === 0 ? (
            <p className={styles.mobileEmptyHints}>
              {directory.campaignRooms.length === 0 ? <span>No Campaign Chats available.</span> : null}
              {directory.directConversations.length === 0 ? <span>No direct conversations yet.</span> : null}
            </p>
          ) : null}
        </div>

        {workspaceNotice ? <p className={styles.workspaceNotice} role="status">{workspaceNotice}</p> : null}

        <div className={styles.workspace}>
          <aside className={styles.sidebar} aria-label="Chat rooms">{roomGroups}</aside>

          <section className={styles.conversation} aria-label="Selected conversation">
            {activeRoom && roomMetadata ? (
              <>
                <header className={styles.conversationHeader}>
                  <div>
                    <div className={styles.scopeLine}>
                      <span>{roomMetadata.scopeLabel}</span>
                      {activeRoom.archived ? <span className={styles.archivedBadge}>Archived · Read only</span> : null}
                    </div>
                    <h2 ref={conversationHeadingRef} tabIndex={-1}>{roomMetadata.title}</h2>
                    <p>{roomMetadata.contextLabel}</p>
                  </div>
                  <div className={styles.conversationControls}>
                    <ChatLiveConnection
                      key={activeRoom.slug}
                      roomSlug={activeRoom.slug}
                      onReady={reconcileNewestHistoryFromLive}
                      onMessage={reconcileExactMessageFromLive}
                      onDirectory={refreshDirectoryAfterRoomChange}
                      className={styles.liveStatus}
                    />
                    <button type="button" onClick={() => void refreshMessages()} disabled={refreshing || roomLoadState === "loading"}>
                      {refreshing ? "Refreshing…" : "Refresh Messages"}
                    </button>
                  </div>
                </header>

                {roomError ? <p className={styles.errorNotice} role="alert">{roomError}</p> : null}

                <div ref={historyViewportRef} className={styles.history} aria-live="polite" aria-busy={roomLoadState === "loading"}>
                  {roomLoadState === "loading" ? (
                    <div className={styles.centerState}><span className={styles.loadingMark} aria-hidden="true" />Loading conversation…</div>
                  ) : roomLoadState === "error" ? (
                    <div className={styles.centerState}>This conversation could not be loaded. Use Refresh Messages to try again.</div>
                  ) : messages.length === 0 ? (
                    <div className={styles.centerState}>
                      <strong>No messages yet</strong>
                      <span>Begin the conversation when you are ready.</span>
                    </div>
                  ) : (
                    <>
                      {hasOlder ? (
                        <div className={styles.olderControl}>
                          <button type="button" onClick={() => void loadOlderMessages()} disabled={loadingOlder || !olderCursor}>
                            {loadingOlder ? "Loading older messages…" : "Load Older Messages"}
                          </button>
                        </div>
                      ) : null}
                      <ol className={styles.messageList}>
                        {messages.map((message) => (
                          <li
                            key={message.id}
                            data-message-id={message.id}
                            className={`${styles.message} ${message.isOwn ? styles.ownMessage : ""} ${message.deleted ? styles.deletedMessage : ""} ${confirmDeleteId === message.id ? styles.messageConfirming : ""}`}
                            aria-label={message.isOwn ? "Your message" : `Message from ${message.authorName}`}
                          >
                            <div className={styles.messageMeta}>
                              <strong>{message.isOwn ? `${message.authorName} · You` : message.authorName}</strong>
                              <LocalChatTime isoValue={message.createdAt} />
                            </div>
                            {message.deleted ? (
                              <p className={styles.removedText}>Message removed</p>
                            ) : (
                              <p className={styles.messageContent}>{message.content}</p>
                            )}
                            {message.canDelete && !message.deleted ? (
                              <div className={styles.messageActions}>
                                {confirmDeleteId === message.id ? (
                                  <div className={styles.deleteConfirm}>
                                    <strong>{message.isOwn ? "Delete your message?" : "Remove this message as moderator?"}</strong>
                                    {!message.isOwn ? (
                                      <label className={styles.moderationReason}>
                                        <span>Reason for removal</span>
                                        <input
                                          type="text"
                                          value={moderationReason}
                                          onChange={(event) => setModerationReason(event.target.value)}
                                          maxLength={CHAT_DELETION_REASON_MAX_LENGTH}
                                          disabled={deletingMessageId !== null}
                                          aria-describedby={`moderation-reason-${message.id}`}
                                          autoFocus
                                        />
                                        <small id={`moderation-reason-${message.id}`}>
                                          Required · {moderationReason.length} / {CHAT_DELETION_REASON_MAX_LENGTH}
                                        </small>
                                      </label>
                                    ) : null}
                                    <span className={styles.deleteConfirmButtons}>
                                      <button
                                        type="button"
                                        onClick={() => void deleteMessage(message)}
                                        disabled={deletingMessageId !== null || (!message.isOwn && !moderationReason.trim())}
                                      >
                                        {deletingMessageId === message.id ? "Removing…" : "Confirm"}
                                      </button>
                                      <button type="button" onClick={cancelDeleteConfirmation} disabled={deletingMessageId !== null}>Cancel</button>
                                    </span>
                                  </div>
                                ) : (
                                  <button type="button" onClick={() => beginDeleteConfirmation(message.id)}>
                                    {message.isOwn ? "Delete" : "Remove"}
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </div>

                {messageError ? <p className={styles.errorNotice} role="alert">{messageError}</p> : null}
                {activeRoom.archived ? (
                  <div className={styles.archivedComposerNotice} role="status">
                    <strong>Archived conversation</strong>
                    <span>History remains available, but this room no longer accepts new messages.</span>
                  </div>
                ) : roomLoadState !== "empty" ? (
                  <form className={styles.composer} onSubmit={submitComposer}>
                    <label htmlFor="chat-message">Message {roomMetadata.title}</label>
                    <div className={styles.composerInputRow}>
                      <textarea
                        ref={composerRef}
                        id="chat-message"
                        value={draft}
                        onChange={changeDraft}
                        onKeyDown={composerKeyDown}
                        maxLength={CHAT_CONTENT_MAX_LENGTH}
                        rows={3}
                        disabled={submitting || roomLoadState === "loading"}
                        aria-describedby="chat-message-guidance chat-message-count chat-composer-error"
                        placeholder="Write a message…"
                      />
                      <button type="submit" disabled={submitting || roomLoadState !== "ready" || !/\S/u.test(draft)}>
                        {submitting ? "Sending…" : "Send"}
                      </button>
                    </div>
                    <div className={styles.composerFooter}>
                      <span id="chat-message-guidance">Enter sends · Shift+Enter adds a new line</span>
                      <span id="chat-message-count" className={draft.length === CHAT_CONTENT_MAX_LENGTH ? styles.counterLimit : ""}>{draft.length} / {CHAT_CONTENT_MAX_LENGTH}</span>
                    </div>
                    <p id="chat-composer-error" className={styles.inlineError} role={composerError ? "alert" : undefined}>{composerError ?? ""}</p>
                  </form>
                ) : null}
              </>
            ) : (
              <div className={styles.noRoomState}>
                <p className={styles.eyebrow}>No conversation selected</p>
                <h2>The paths are quiet</h2>
                <p>No Chat rooms are currently available for this account.</p>
                <Link href="/access">Return to Paths</Link>
              </div>
            )}
          </section>
        </div>
      </div>

      {directPanelOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDirectPanel()}>
          <section
            className={styles.directPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-direct-title"
            onKeyDown={(event) => event.key === "Escape" && closeDirectPanel()}
          >
            <div className={styles.directPanelHeader}>
              <div>
                <p className={styles.eyebrow}>Direct Messages</p>
                <h2 id="new-direct-title">Start a Conversation</h2>
              </div>
              <button type="button" onClick={closeDirectPanel} aria-label="Close new message panel">Close</button>
            </div>
            <p className={styles.directIntro}>Find a Serrian Tide User by their visible display name and open a private conversation.</p>
            <form onSubmit={searchDirectUsers} className={styles.directSearchForm}>
              <label htmlFor="direct-user-search">Search visible username</label>
              <div>
                <input
                  ref={directSearchRef}
                  id="direct-user-search"
                  value={directSearch}
                  onChange={(event) => {
                    setDirectSearch(event.target.value);
                    setDirectError(null);
                  }}
                  maxLength={100}
                  autoComplete="off"
                  placeholder="Enter at least two characters"
                  disabled={directSearching || directOpeningUserId !== null}
                />
                <button type="submit" disabled={directSearching || directOpeningUserId !== null || directSearch.trim().length < 2}>
                  {directSearching ? "Searching…" : "Search"}
                </button>
              </div>
              <p>Search requires at least two characters. Only visible display names are shown.</p>
            </form>
            {directError ? <p className={styles.errorNotice} role="alert">{directError}</p> : null}
            <div className={styles.directResults} aria-live="polite" aria-busy={directSearching}>
              {directSearching ? (
                <p>Searching for a Serrian Tide user…</p>
              ) : directResults === null ? (
                <p>Search by visible username to begin.</p>
              ) : directResults.length === 0 ? (
                <p>No users matched that search.</p>
              ) : (
                <ul>
                  {directResults.map((resultUser) => (
                    <li key={resultUser.userId}>
                      <button
                        type="button"
                        onClick={() => void openDirectConversation(resultUser)}
                        disabled={directOpeningUserId !== null}
                      >
                        <span>{resultUser.displayName}</span>
                        <span>{directOpeningUserId === resultUser.userId ? "Opening…" : "Open conversation"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
