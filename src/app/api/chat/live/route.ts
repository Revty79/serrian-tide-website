import { and, eq } from "drizzle-orm";
import { Client, type Notification } from "pg";

import { db } from "@/db";
import { session as authSession } from "@/db/auth-schema";
import {
  LIVE_SESSION_REVOCATION_CHANNEL,
  liveSessionRevocationMatchesUser,
  parseLiveSessionRevocationPayload,
} from "@/features/authorization/live-session-revocation";
import { ChatError } from "@/features/chat/chat";
import {
  CHAT_LIVE_CHANNEL,
  messageInvalidationForRoom,
  parseChatNotificationPayload,
} from "@/features/chat/chat-live-events";
import { authorizeChatRoomSubscriptionInTransaction } from "@/features/chat/chat-service";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorizationFailure(error: unknown): Response | null {
  if (!(error instanceof ChatError)) return null;
  if (error.code === "AUTH_REQUIRED") {
    return new Response("Unauthorized", { status: 401 });
  }
  if (error.code === "INVALID_INPUT") {
    return new Response("Chat room is invalid.", { status: 400 });
  }
  if (error.code === "ACCESS_DENIED") {
    return new Response("Forbidden", { status: 403 });
  }
  if (error.code === "ROOM_UNAVAILABLE") {
    return new Response("Chat room unavailable.", { status: 404 });
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const requestedRoomSlug = new URL(request.url).searchParams.get("room");
  let roomSlug: string;
  try {
    roomSlug = await db.transaction((tx) => (
      authorizeChatRoomSubscriptionInTransaction(tx, session.user.id, requestedRoomSlug)
    ));
  } catch (error) {
    const response = authorizationFailure(error);
    if (response) return response;
    throw error;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return new Response("Live synchronization is unavailable.", { status: 503 });
  }

  const client = new Client({
    connectionString,
    application_name: process.env.CHAT_LIVE_APPLICATION_NAME?.trim()
      || "serrian-tide-chat-live-sse",
  });
  let revocationObserved = false;
  let closeClient: (() => Promise<void>) | null = null;
  const onRevocationNotification = (notification: Notification) => {
    if (notification.channel !== LIVE_SESSION_REVOCATION_CHANNEL) return;
    const event = parseLiveSessionRevocationPayload(notification.payload);
    if (!event || !liveSessionRevocationMatchesUser(event, session.user.id)) return;
    revocationObserved = true;
    void closeClient?.();
  };
  const closeUnstartedClient = async () => {
    client.off("notification", onRevocationNotification);
    await client.query(`UNLISTEN ${CHAT_LIVE_CHANNEL}`).catch(() => undefined);
    await client.query(`UNLISTEN ${LIVE_SESSION_REVOCATION_CHANNEL}`).catch(() => undefined);
    await client.end().catch(() => undefined);
  };
  client.on("notification", onRevocationNotification);

  let sessionStillActive = false;
  try {
    await client.connect();
    await client.query(`LISTEN ${CHAT_LIVE_CHANNEL}`);
    await client.query(`LISTEN ${LIVE_SESSION_REVOCATION_CHANNEL}`);
    const [activeSession] = await db.select({ id: authSession.id })
      .from(authSession)
      .where(and(
        eq(authSession.id, session.session.id),
        eq(authSession.userId, session.user.id),
      ))
      .limit(1);
    const confirmedRoomSlug = await db.transaction((tx) => (
      authorizeChatRoomSubscriptionInTransaction(tx, session.user.id, roomSlug)
    ));
    sessionStillActive = Boolean(activeSession) && confirmedRoomSlug === roomSlug;
  } catch (error) {
    await closeUnstartedClient();
    const response = authorizationFailure(error);
    if (response) return response;
    return new Response("Live synchronization is unavailable.", { status: 503 });
  }
  if (!sessionStillActive || revocationObserved) {
    await closeUnstartedClient();
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (name: "ready" | "message" | "directory", data: unknown) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
        }
      };
      const onNotification = (notification: Notification) => {
        if (notification.channel !== CHAT_LIVE_CHANNEL) return;
        const event = parseChatNotificationPayload(notification.payload);
        if (!event) return;
        if (event.category === "directory") {
          send("directory", { refresh: true });
          return;
        }
        const message = messageInvalidationForRoom(event, roomSlug);
        if (message) send("message", message);
      };
      const cleanup = async () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        client.off("notification", onRevocationNotification);
        client.off("notification", onNotification);
        client.off("error", onError);
        await client.query(`UNLISTEN ${CHAT_LIVE_CHANNEL}`).catch(() => undefined);
        await client.query(`UNLISTEN ${LIVE_SESSION_REVOCATION_CHANNEL}`).catch(() => undefined);
        await client.end().catch(() => undefined);
        try { controller.close(); } catch { /* stream already closed */ }
      };
      const onError = () => void cleanup();
      closeClient = cleanup;
      client.on("notification", onNotification);
      client.on("error", onError);
      request.signal.addEventListener("abort", () => void cleanup(), { once: true });
      if (request.signal.aborted || revocationObserved) {
        void cleanup();
        return;
      }
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 20_000);
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      send("ready", { connected: true });
    },
    async cancel() {
      await closeClient?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
