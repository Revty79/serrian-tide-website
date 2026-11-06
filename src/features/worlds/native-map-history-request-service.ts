import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { worldMapStateNativeRequest } from "@/db/world-native-map-state-schema";
import { nativeHistoryScopeSchema } from "./native-map-history";
import { worldReadAccess, WorldError } from "./world-service";
import { atlasId } from "./atlas";

/** Only the original World owner and author can recover a transport binding.
 * This receipt contains no command body and cannot grant an editing role. */
export async function nativeOriginalRequestScope(userId: string, worldId: string, requestId: string) {
  atlasId.parse(requestId);
  const world = await worldReadAccess(userId, worldId);
  if (world.ownerId !== userId) throw new WorldError("This original map request is unavailable.", 404);
  const [receipt] = await db.select({ scope: worldMapStateNativeRequest.originalScope }).from(worldMapStateNativeRequest).where(and(eq(worldMapStateNativeRequest.worldId, worldId), eq(worldMapStateNativeRequest.authorId, userId), eq(worldMapStateNativeRequest.requestId, requestId)));
  return { scope: receipt?.scope ? nativeHistoryScopeSchema.parse(receipt.scope) : null };
}
