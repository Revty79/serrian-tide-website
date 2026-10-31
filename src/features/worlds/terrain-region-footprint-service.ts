import "server-only";
import {and,eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldMapRegionFootprint} from "@/db/world-map-region-footprint-schema";
import {regionFootprintSchema,validateRegionFootprint,type RegionWorld} from "./terrain-region-geometry";
import type {TerrainFrame} from "./terrain-refinement";
import {WorldError} from "./world-service";
type Connection=Pick<typeof db,"select"|"execute">;
export async function regionFootprintsAvailable(tx:Connection){return !!(await tx.execute<{present:boolean}>(sql`select to_regclass('public.world_map_region_footprint') is not null AND EXISTS(select 1 from pg_attribute where attrelid=to_regclass('public.world_map_region') and attname='footprint_kind' and not attisdropped) present`)).rows[0].present;}
export async function acceptedRegionFootprint(tx:Connection,worldId:string,mapId:string,frame:TerrainFrame,world:RegionWorld){
 const marker=(await tx.execute<{kind:string;marked:boolean}>(sql`select coalesce(to_jsonb(r)->>'footprint_kind','rectangle') kind,to_jsonb(r) ? 'footprint_kind' marked from world_map_region r where r.map_id=${mapId} and r.world_id=${worldId}`)).rows[0];
 if(!marker)return undefined;
 if(!marker.marked){const state=(await tx.execute<{partial:boolean}>(sql`select to_regclass('public.world_map_region_footprint') is not null OR to_regprocedure('public.world_region_footprint_required()') is not null partial`)).rows[0];if(state.partial)throw new WorldError("MIGRATION 0149 REQUIRED: regional boundary metadata is incomplete. Keep the outline and finish or restore the verified upgrade; rectangular permissions were not substituted.",409);}
 if(marker.kind==="rectangle")return undefined;
 if(marker.kind!=="polygon")throw new WorldError("The accepted regional boundary kind is unavailable. Keep the draft and restore verified map data.",409);
 if(!await regionFootprintsAvailable(tx))throw new WorldError("MIGRATION 0149 REQUIRED to open this polygon region. Its bounding rectangle does not grant editing permission. Your draft is retained.",409);
 const [row]=await tx.select().from(worldMapRegionFootprint).where(and(eq(worldMapRegionFootprint.mapId,mapId),eq(worldMapRegionFootprint.worldId,worldId)));
 if(!row)throw new WorldError("This region's accepted outline is unavailable. Its bounding rectangle is not editable. Restore its verified paired backup; your draft is retained.",409);
 try{const footprint=regionFootprintSchema.parse(row.footprint);validateRegionFootprint(footprint,world,frame);return footprint;}catch{throw new WorldError("The accepted regional outline failed validation. Keep the draft and restore the verified footprint; rectangular permissions were not substituted.",409);}
}
