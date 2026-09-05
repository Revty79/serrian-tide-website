import { and, eq, isNull } from "drizzle-orm";
import { Client, type Notification } from "pg";

import { db } from "@/db";
import { session as authSession } from "@/db/auth-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { userRole } from "@/db/authorization-schema";
import {
  LIVE_SESSION_REVOCATION_CHANNEL,
  liveSessionRevocationMatchesUser,
  parseLiveSessionRevocationPayload,
} from "@/features/authorization/live-session-revocation";
import { resolveActivePlayerEncounterInTransaction } from "@/features/tabletop-operations/player-encounter-service";
import {
  eventMatchesGodSubscription,
  eventMatchesPlayerSubscription,
  parseTabletopInvalidation,
  TABLETOP_LIVE_CHANNEL,
} from "@/features/tabletop-operations/tabletop-live-events";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveQueryId(value: string | null, label: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`${label} is invalid.`);
  return id;
}

type TabletopLiveEvent = NonNullable<ReturnType<typeof parseTabletopInvalidation>>;

type TabletopSubscriptionRequest =
  | { mode: "god"; campaignId: number }
  | { mode: "player"; characterId: number; consoleScope: boolean };

type TabletopSubscriptionAuthorization =
  | {
      authorized: true;
      accepts: (event: TabletopLiveEvent) => boolean;
    }
  | {
      authorized: false;
      status: 401 | 403;
    };

function parseTabletopSubscriptionRequest(url: URL): TabletopSubscriptionRequest | null {
  const mode = url.searchParams.get("mode");
  if (mode === "god") {
    return {
      mode,
      campaignId: positiveQueryId(url.searchParams.get("campaignId"), "Campaign"),
    };
  }
  if (mode === "player") {
    return {
      mode,
      characterId: positiveQueryId(url.searchParams.get("characterId"), "Character"),
      consoleScope: url.searchParams.get("scope") === "console",
    };
  }
  return null;
}

async function resolveTabletopSubscriptionAuthorization(
  authenticatedUserId: string,
  authenticatedSessionId: string,
  request: TabletopSubscriptionRequest,
): Promise<TabletopSubscriptionAuthorization> {
  return db.transaction(async (tx) => {
    const [activeSession] = await tx.select({ id: authSession.id })
      .from(authSession)
      .where(and(
        eq(authSession.id, authenticatedSessionId),
        eq(authSession.userId, authenticatedUserId),
      ))
      .limit(1);
    if (!activeSession) return { authorized: false, status: 401 };

    const roles = await tx.select({ role: userRole.role }).from(userRole)
      .where(eq(userRole.userId, authenticatedUserId));

    if (request.mode === "god") {
      if (!roles.some(({ role }) => role === "god")) {
        return { authorized: false, status: 403 };
      }
      const [authorizedCampaign] = await tx.select({ id: campaign.id }).from(campaign)
        .where(and(
          eq(campaign.id, request.campaignId),
          eq(campaign.createdByUserId, authenticatedUserId),
          isNull(campaign.archivedAt),
        ))
        .limit(1);
      if (!authorizedCampaign) return { authorized: false, status: 403 };
      return {
        authorized: true,
        accepts: (event) => eventMatchesGodSubscription(event, request.campaignId),
      };
    }

    if (!roles.some(({ role }) => role === "player")) {
      return { authorized: false, status: 403 };
    }
    const [ownedCharacter] = await tx.select({
      campaignId: campaignCharacter.campaignId,
    }).from(campaignCharacter)
      .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
      .innerJoin(campaignPlayer, and(
        eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
        eq(campaignPlayer.userId, campaignCharacter.playerUserId),
      ))
      .where(and(
        eq(campaignCharacter.id, request.characterId),
        eq(campaignCharacter.playerUserId, authenticatedUserId),
        eq(campaignPlayer.userId, authenticatedUserId),
        eq(campaignCharacter.isNpc, false),
        isNull(campaignCharacter.archivedAt),
        isNull(campaign.archivedAt),
      ))
      .limit(1);
    if (!ownedCharacter) return { authorized: false, status: 403 };
    const context = request.consoleScope
      ? null
      : await resolveActivePlayerEncounterInTransaction(
          tx,
          request.characterId,
          authenticatedUserId,
        );
    const subscription = {
      campaignId: ownedCharacter.campaignId,
      encounterId: request.consoleScope ? null : context?.encounterId ?? null,
      characterId: request.characterId,
    };
    return {
      authorized: true,
      accepts: (event) => eventMatchesPlayerSubscription(event, subscription),
    };
  });
}

function authorizationFailureResponse(
  authorization: Extract<TabletopSubscriptionAuthorization, { authorized: false }>,
): Response {
  return new Response(
    authorization.status === 401 ? "Unauthorized" : "Forbidden",
    { status: authorization.status },
  );
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const subscriptionRequest = parseTabletopSubscriptionRequest(url);
  if (!subscriptionRequest) {
    return new Response("Live subscription mode is invalid.", { status: 400 });
  }
  const initialAuthorization = await resolveTabletopSubscriptionAuthorization(
    session.user.id,
    session.session.id,
    subscriptionRequest,
  );
  if (!initialAuthorization.authorized) {
    return authorizationFailureResponse(initialAuthorization);
  }
  let accepts = initialAuthorization.accepts;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return new Response("Live synchronization is unavailable.", { status: 503 });
  const client = new Client({ connectionString, application_name: "serrian-tide-live-sse" });
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
    await client.query(`UNLISTEN ${TABLETOP_LIVE_CHANNEL}`).catch(() => undefined);
    await client.query(`UNLISTEN ${LIVE_SESSION_REVOCATION_CHANNEL}`).catch(() => undefined);
    await client.end().catch(() => undefined);
  };
  client.on("notification", onRevocationNotification);

  let refreshedAuthorization: TabletopSubscriptionAuthorization;
  try {
    await client.connect();
    await client.query(`LISTEN ${TABLETOP_LIVE_CHANNEL}`);
    await client.query(`LISTEN ${LIVE_SESSION_REVOCATION_CHANNEL}`);
    refreshedAuthorization = await resolveTabletopSubscriptionAuthorization(
      session.user.id,
      session.session.id,
      subscriptionRequest,
    );
  } catch {
    await closeUnstartedClient();
    return new Response("Live synchronization is unavailable.", { status: 503 });
  }
  if (!refreshedAuthorization.authorized || revocationObserved) {
    await closeUnstartedClient();
    return refreshedAuthorization.authorized
      ? new Response("Unauthorized", { status: 401 })
      : authorizationFailureResponse(refreshedAuthorization);
  }
  accepts = refreshedAuthorization.accepts;

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (name: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const onNotification = (notification: Notification) => {
        if (notification.channel !== TABLETOP_LIVE_CHANNEL || !notification.payload) return;
        try {
          const event = parseTabletopInvalidation(JSON.parse(notification.payload));
          if (event && accepts(event)) send("invalidation", event);
        } catch {
          // Invalid database notifications are ignored; they are never browser authority.
        }
      };
      const cleanup = async () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        client.off("notification", onRevocationNotification);
        client.off("notification", onNotification);
        client.off("error", onError);
        await client.query(`UNLISTEN ${TABLETOP_LIVE_CHANNEL}`).catch(() => undefined);
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
