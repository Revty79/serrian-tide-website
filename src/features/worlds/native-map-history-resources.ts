import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { worldMapStateComponent } from "@/db/world-native-map-state-schema";
import { nativeResource, type NativeContentContext } from "./native-map-history-context";
import { NATIVE_HISTORY_LIMITS } from "./native-map-history";
import type { NativeHistoryTx } from "./native-map-history-store";
import { WorldError } from "./world-service";

/** Resolve a resource counter only through the selected immutable source graph.
 * Equal counters in another date or branch never establish a source. */
export async function nativeResourceRevisions(tx: NativeHistoryTx, context: NativeContentContext, key: string): Promise<{ componentId: string; revision: number; createdAt: string }[]> {
  if (context.authority && (await import("./native-map-history-geography")).nativeGeographicResource(key)) return nativeResourceRevisions(tx, context.authority, key);
  const rows = (await tx.execute<{ id: string }>(sql`with recursive lineage(id) as (
    select ${context.version.id}::text union
    select p.id from lineage l join world_map_state_version v on v.id=l.id
    cross join lateral (values(v.previous_version_id),(v.source_version_id)) p(id)
    where p.id is not null and v.world_id=${context.worldId}
  ) select id from lineage limit ${NATIVE_HISTORY_LIMITS.sourceNodes + 1}`)).rows;
  if (rows.length > NATIVE_HISTORY_LIMITS.sourceNodes) throw new WorldError("This source graph exceeds the bounded revision lookup. Choose a more recent exact appearance source; no revisions were discarded.", 413);
  return (await tx.execute<{ componentId: string; revision: number; createdAt: string }>(sql`
    select distinct on(c.revision) c.id "componentId",c.revision,v.created_at::text "createdAt"
    from world_map_state_component_ref r join world_map_state_component c on c.id=r.component_id
    join world_map_state_version v on v.id=r.version_id
    where r.version_id in (${sql.join(rows.map(r => sql`${r.id}`), sql`,`)})
      and r.key=${key} and c.world_id=${context.worldId}
    order by c.revision desc,v.created_at desc limit ${NATIVE_HISTORY_LIMITS.revisions}`)).rows;
}
export async function nativeSavedResource<T>(tx: NativeHistoryTx, context: NativeContentContext, key: string, revision?: number): Promise<T> {
  const current = await nativeResource(tx, context, key);
  if (revision === undefined || revision === current.revision) return structuredClone(current.payload) as T;
  if (!Number.isSafeInteger(revision) || revision < 0) throw new WorldError("Choose an accepted numerical revision.", 400);
  const chosen = (await nativeResourceRevisions(tx, context, key)).find(r => r.revision === revision);
  if (!chosen) throw new WorldError("That resource revision is not retained by this historical source. Choose an exact appearance revision; no current-day resource was substituted.", 404);
  const [component] = await tx.select().from(worldMapStateComponent).where(and(eq(worldMapStateComponent.id, chosen.componentId), eq(worldMapStateComponent.worldId, context.worldId)));
  if (!component) throw new WorldError("The retained component is unavailable. Restore the paired historical backup.", 409);
  return structuredClone(component.payload) as T;
}
export function assertNativeRevision(actual: number, expected: number) {
  if (actual !== expected) throw new WorldError("Another tab saved a newer version of this historical layer. Your draft and exact original request remain retained. Load the saved appearance to compare.", 409);
}
export function assertNativeTarget(context: NativeContentContext, id: string, kind = context.scope.target.kind) {
  if (context.scope.target.kind !== kind || context.scope.target.id !== id) throw new WorldError("This request belongs to a different historical map. Keep its original draft and reopen that appearance.", 409);
}
