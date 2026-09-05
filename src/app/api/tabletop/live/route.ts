import { and, eq, isNull } from "drizzle-orm";
import { Client, type Notification } from "pg";

import { db } from "@/db";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { userRole } from "@/db/authorization-schema";
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

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const roles = await db.select({ role: userRole.role }).from(userRole)
    .where(eq(userRole.userId, session.user.id));
  let accepts: (event: NonNullable<ReturnType<typeof parseTabletopInvalidation>>) => boolean;

  if (mode === "god") {
    if (!roles.some(({ role }) => role === "god")) return new Response("Forbidden", { status: 403 });
    const campaignId = positiveQueryId(url.searchParams.get("campaignId"), "Campaign");
    const [authorized] = await db.select({ id: campaign.id }).from(campaign).where(and(
      eq(campaign.id, campaignId),
      eq(campaign.createdByUserId, session.user.id),
      isNull(campaign.archivedAt),
    )).limit(1);
    if (!authorized) return new Response("Forbidden", { status: 403 });
    accepts = (event) => eventMatchesGodSubscription(event, campaignId);
  } else if (mode === "player") {
    if (!roles.some(({ role }) => role === "player")) return new Response("Forbidden", { status: 403 });
    const characterId = positiveQueryId(url.searchParams.get("characterId"), "Character");
    const consoleScope = url.searchParams.get("scope") === "console";
    const [ownedCharacter] = await db.select({
      campaignId: campaignCharacter.campaignId,
    }).from(campaignCharacter)
      .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
      .innerJoin(campaignPlayer, and(
        eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
        eq(campaignPlayer.userId, campaignCharacter.playerUserId),
      ))
      .where(and(
      eq(campaignCharacter.id, characterId),
      eq(campaignCharacter.playerUserId, session.user.id),
      eq(campaignPlayer.userId, session.user.id),
      eq(campaignCharacter.isNpc, false),
      isNull(campaignCharacter.archivedAt),
      isNull(campaign.archivedAt),
    )).limit(1);
    if (!ownedCharacter) return new Response("Forbidden", { status: 403 });
    const context = consoleScope ? null : await db.transaction((tx) => resolveActivePlayerEncounterInTransaction(
      tx,
      characterId,
      session.user.id,
    ));
    const subscription = {
      campaignId: ownedCharacter.campaignId,
      encounterId: consoleScope ? null : context?.encounterId ?? null,
      characterId,
    };
    accepts = (event) => eventMatchesPlayerSubscription(event, subscription);
  } else {
    return new Response("Live subscription mode is invalid.", { status: 400 });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return new Response("Live synchronization is unavailable.", { status: 503 });
  const client = new Client({ connectionString, application_name: "serrian-tide-live-sse" });
  await client.connect();
  await client.query(`LISTEN ${TABLETOP_LIVE_CHANNEL}`);

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closeClient: (() => Promise<void>) | null = null;
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
        client.off("notification", onNotification);
        await client.query(`UNLISTEN ${TABLETOP_LIVE_CHANNEL}`).catch(() => undefined);
        await client.end().catch(() => undefined);
        try { controller.close(); } catch { /* stream already closed */ }
      };
      closeClient = cleanup;
      client.on("notification", onNotification);
      client.on("error", () => void cleanup());
      request.signal.addEventListener("abort", () => void cleanup(), { once: true });
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
