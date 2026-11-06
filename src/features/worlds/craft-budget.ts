import "server-only";
import {sql} from "drizzle-orm";
import {db} from "@/db";
import {CRAFT_LIMITS} from "./craft";
import {WorldError} from "./world-service";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function assertCraftBudget(tx:Pick<Tx,"execute">,worldId:string,additional=0){
 const n=(await tx.execute<{bytes:string}>(sql`select (coalesce((select sum(octet_length(result::text)+160) from world_craft_operation where world_id=${worldId}),0)+coalesce((select sum(octet_length(draft::text)) from world_craft_version where world_id=${worldId}),0)+coalesce((select sum(octet_length(draft::text)) from world_craft_deck_version where world_id=${worldId}),0)+coalesce((select sum(octet_length(snapshot::text)) from world_craft_connection_version v join world_craft_connection c on c.id=v.connection_id where c.world_id=${worldId}),0)+coalesce((select sum(octet_length(layer::text)) from atlas_composition_version where world_id=${worldId} and kind in ('craft','craft-deck')),0))::text bytes`)).rows[0];
 const available=(await tx.execute<{ok:boolean}>(sql`select to_regclass('public.world_map_state_component') is not null ok`)).rows[0].ok;
 const native=available?(await tx.execute<{bytes:string}>(sql`with craft_versions as (
   select id,payload from world_map_state_version where world_id=${worldId} and payload->'nativeAtlas'->'target'->>'kind' in('craft','deck')
 ), components as (
   select distinct c.id,octet_length(c.payload::text) bytes from world_map_state_component_ref r join world_map_state_component c on c.id=r.component_id and c.world_id=r.world_id where r.world_id=${worldId} and (r.version_id in(select id from craft_versions) or r.key='craft-positions')
 ) select (coalesce((select sum(bytes) from components),0)+coalesce((select sum(octet_length(payload::text)) from craft_versions),0)+coalesce((select sum(octet_length(result::text)+256) from world_map_state_native_request where world_id=${worldId} and (target_key like 'craft:%' or target_key like 'deck:%')),0))::text bytes`)).rows[0].bytes:0;
 if(Number(n.bytes)+Number(native)+additional>CRAFT_LIMITS.worldBytes)throw new WorldError("This World's retained craft history has reached 128 MiB. Existing craft and decks remain safe; export your draft before requesting a retention-policy change.",413);
}
