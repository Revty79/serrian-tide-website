import "server-only";
import {sql} from "drizzle-orm";
import type {NativeHistoryTx} from "./native-map-history-store";
import type {NativeMapTarget} from "./native-map-history";
import type {CraftSurface} from "./craft";
import {WorldError} from "./world-service";
/** Canonical birth records and every retained native surface participate in the
 * same per-craft object-identity rule. Copies must generate independent IDs. */
export async function assertNativeCraftObjectIdentities(tx:NativeHistoryTx,worldId:string,craftId:string,surface:CraftSurface,own?:NativeMapTarget){
  const ids=surface.plan.features.map(f=>f.id);if(!ids.length)return;
  const conflict=await tx.execute(sql`select 1 from (
    select 'craft' kind,c.id target_id,c.draft->'surface'->'plan'->'features' features from world_craft c where c.world_id=${worldId} and c.id=${craftId}
    union all select 'deck',d.id,d.draft->'surface'->'plan'->'features' from world_craft_deck d where d.world_id=${worldId} and d.craft_id=${craftId}
    union all select v.payload->'nativeAtlas'->'target'->>'kind',v.payload->'nativeAtlas'->'target'->>'id',coalesce(c.payload#>'{bundle,craft,surface,plan,features}',c.payload#>'{deck,surface,plan,features}')
      from world_map_state_component c join world_map_state_component_ref ref on ref.component_id=c.id and ref.world_id=c.world_id join world_map_state_version v on v.id=ref.version_id and v.world_id=ref.world_id
      where c.world_id=${worldId} and ref.key in('craft','deck') and (c.payload#>>'{bundle,craft,id}'=${craftId} or c.payload#>>'{deck,craftId}'=${craftId})
  ) retained cross join lateral jsonb_array_elements(coalesce(retained.features,'[]'::jsonb)) feature
  where not(retained.kind=${own?.kind??""} and retained.target_id=${own?.id??""}) and feature->>'id' in(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)) limit 1`);
  if(conflict.rows.length)throw new WorldError("Each craft surface keeps independent drawing identities, including every retained dated version. Use the copy action to create independent objects.",400);
}
