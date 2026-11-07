import "server-only";
import {sql} from "drizzle-orm";
import {z} from "zod";
import type {db} from "@/db";
import {ADVANCED_TERRAIN_LIMITS,volcanoOperationSchema} from "./terrain-advanced-spec";
import type {AuthoredVolcano} from "./terrain-advanced";

type Connection=Pick<typeof db,"execute">;
const feature=z.object({id:z.uuid(),revision:z.number().int().positive(),sourceId:z.uuid().nullable(),operation:volcanoOperationSchema}).strict();

/** Immutable copy provenance belongs to this World. No subsequent source read
 * or source permission is needed to select its inherited authored landforms. */
export async function inheritedCanonVolcanoes(tx:Connection,worldId:string,mapId:string):Promise<AuthoredVolcano[]>{
  const available=(await tx.execute<{ok:boolean}>(sql`select to_regclass('public.world_access_audit') is not null ok`)).rows[0]?.ok;
  if(!available)return [];
  const records=(await tx.execute<{volcanoes:unknown}>(sql`select f.value->'volcanoes' volcanoes
    from world_access_audit a cross join lateral jsonb_array_elements(coalesce(a.after_state->'geographyFeatures','[]'::jsonb)) f(value)
    where a.world_id=${worldId} and a.action='canon-source' and f.value->>'map_id'=${mapId} limit 1`)).rows;
  return records.length?z.array(feature).max(ADVANCED_TERRAIN_LIMITS.volcanoes).parse(records[0].volcanoes):[];
}

/** Read only the bounded authored shape inventory, never the private numerical
 * authoring context (which also contains settlement supports and private pins). */
export async function canonVolcanoes(tx:Connection,worldId:string,mapId:string,terrainId:string):Promise<AuthoredVolcano[]>{
  const records=(await tx.execute<{id:string;revision:number;source_id:string|null;operation:unknown}>(sql`
    select id,revision,source_id,operation from (
      select request_id id,revision,null::text source_id,source#>'{advanced,operation}' operation,created_at from world_terrain_version
        where world_id=${worldId} and terrain_id=${terrainId} and source#>>'{advanced,operation,kind}'='volcano'
      union all
      select request_id id,revision,refinement_id source_id,source#>'{advanced,operation}' operation,created_at from world_terrain_refinement_version
        where world_id=${worldId} and terrain_id=${terrainId} and source#>>'{advanced,operation,kind}'='volcano'
    ) v order by created_at desc,id limit ${ADVANCED_TERRAIN_LIMITS.volcanoes}`)).rows;
  const result=records.map(row=>feature.parse({id:row.id,revision:row.revision,sourceId:row.source_id,operation:row.operation}));
  for(const inherited of await inheritedCanonVolcanoes(tx,worldId,mapId))if(!result.some(own=>own.id===inherited.id)&&result.length<ADVANCED_TERRAIN_LIMITS.volcanoes)result.push(inherited);
  return result;
}
