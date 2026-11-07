import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { WorldConnection } from "./world-access-service";

export type WorldCanonState = { isCanon: boolean; revision: number };
/** Canon decisions use the existing immutable, request-deduplicated access ledger.
 * World row locks serialize decisions with every content write. Revision order
 * avoids relying on timestamps to break ties between successive decisions. */
export function worldCanonStateSql(worldId: SQL | string) {
  return sql<WorldCanonState>`coalesce((select a.after_state from world_access_audit a where a.world_id=${worldId} and a.action='world-canon' and a.outcome='accepted' order by (a.after_state->>'revision')::integer desc limit 1), '{"isCanon":false,"revision":0}'::jsonb)`;
}
export async function readWorldCanon(connection: Pick<WorldConnection, "execute">, worldId: string): Promise<WorldCanonState> {
  const result = await connection.execute<{ state: WorldCanonState }>(sql`select ${worldCanonStateSql(worldId)} state`);
  return result.rows[0].state;
}
