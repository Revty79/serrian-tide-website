import { nativeWorldScope } from "./world-permissions";
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { worldMapStateNativeRequest } from "@/db/world-native-map-state-schema";
import { nativeHistoryScopeSchema } from "./native-map-history";
import { worldReadAccess } from "./world-service";
import { atlasId } from "./atlas";

/** Only the original authorized author can recover a transport binding.
 * This receipt contains no command body and cannot grant an editing role. */
export async function nativeOriginalRequestScope(userId: string, worldId: string, requestId: string) {
  atlasId.parse(requestId);
  await worldReadAccess(userId, worldId,false,["history","appearances"]);
  const [receipt] = await db.select({ scope: worldMapStateNativeRequest.originalScope }).from(worldMapStateNativeRequest).where(and(eq(worldMapStateNativeRequest.worldId, worldId), eq(worldMapStateNativeRequest.authorId, userId), eq(worldMapStateNativeRequest.requestId, requestId)));
  const scope=receipt?.scope?nativeHistoryScopeSchema.parse(receipt.scope):null;
  if(scope)await worldReadAccess(userId,worldId,false,nativeWorldScope(scope.target.kind));
  return {scope};
}
