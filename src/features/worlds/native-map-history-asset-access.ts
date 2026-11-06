import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { worldMapStateAssetPin, worldMapStateComponentRef } from "@/db/world-native-map-state-schema";
import type { NativeHistoryTx } from "./native-map-history-store";

/** Administrator review is limited to exact private versions actually retained
 * by this World's immutable native sources, including archived appearances. */
export async function nativeArtworkPins(connection: Pick<NativeHistoryTx, "selectDistinct" | "execute">, worldId: string, assetId?: string, assetVersion?: number) {
  const available = !!(await connection.execute<{ ok: boolean }>(sql`select to_regclass('public.world_map_state_asset_pin') is not null ok`)).rows[0].ok;
  if (!available) return [];
  return connection.selectDistinct({ assetId: worldMapStateAssetPin.assetId, assetVersion: worldMapStateAssetPin.assetVersion }).from(worldMapStateAssetPin)
    .innerJoin(worldMapStateComponentRef, and(eq(worldMapStateComponentRef.componentId, worldMapStateAssetPin.componentId), eq(worldMapStateComponentRef.worldId, worldId)))
    .where(and(eq(worldMapStateAssetPin.worldId, worldId), assetId ? eq(worldMapStateAssetPin.assetId, assetId) : undefined, assetVersion !== undefined ? eq(worldMapStateAssetPin.assetVersion, assetVersion) : undefined));
}
