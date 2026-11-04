import "server-only";
import {sql} from "drizzle-orm";
import {db} from "@/db";
import {CRAFT_LIMITS} from "./craft";
import {WorldError} from "./world-service";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function assertCraftBudget(tx:Pick<Tx,"execute">,worldId:string,additional=0){
 const n=(await tx.execute<{bytes:string}>(sql`select (coalesce((select sum(octet_length(result::text)+160) from world_craft_operation where world_id=${worldId}),0)+coalesce((select sum(octet_length(draft::text)) from world_craft_version where world_id=${worldId}),0)+coalesce((select sum(octet_length(draft::text)) from world_craft_deck_version where world_id=${worldId}),0)+coalesce((select sum(octet_length(snapshot::text)) from world_craft_connection_version v join world_craft_connection c on c.id=v.connection_id where c.world_id=${worldId}),0)+coalesce((select sum(octet_length(layer::text)) from atlas_composition_version where world_id=${worldId} and kind in ('craft','craft-deck')),0))::text bytes`)).rows[0];
 if(Number(n.bytes)+additional>CRAFT_LIMITS.worldBytes)throw new WorldError("This World's retained craft history has reached 128 MiB. Existing craft and decks remain safe; export your draft before requesting a retention-policy change.",413);
}
