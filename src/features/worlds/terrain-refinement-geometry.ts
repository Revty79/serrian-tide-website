import "server-only";
import {LEGACY_TERRAIN_REFINEMENT_LIMIT,TERRAIN_REFINEMENT_LIMIT} from "./terrain-source-limits";
import {and,desc,eq,lte,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldTerrainRefinementGeometry as geometry} from "@/db/world-terrain-refinement-schema";
import {overviewLevels,type RefinementMeta} from "./terrain-refinement";

type Connection=Pick<typeof db,"select"|"execute">;
export async function refinementExpansionAvailable(tx:Connection){return !!(await tx.execute<{available:boolean}>(sql`SELECT to_regclass('public.world_terrain_refinement_geometry') IS NOT NULL AS available`)).rows[0].available;}

export async function refinementCrossingAvailable(tx:Connection){return !!(await tx.execute<{available:boolean}>(sql`SELECT to_regprocedure('public.world_refinement_crossing_schema()') IS NOT NULL AS available`)).rows[0].available;}

/** Code can qualify before the separately approved database addition. */
export async function refinementCapacity(tx:Connection){
 const available=(await tx.execute<{available:boolean}>(sql`SELECT to_regprocedure('public.world_refinement_capacity_schema()') IS NOT NULL AS available`)).rows[0]?.available;
 if(!available)return LEGACY_TERRAIN_REFINEMENT_LIMIT;
 const capacity=(await tx.execute<{capacity:number}>(sql`SELECT public.world_refinement_capacity_schema() AS capacity`)).rows[0]?.capacity;
 if(capacity!==TERRAIN_REFINEMENT_LIMIT)throw Error("The installed terrain-source capacity is unsupported. Existing drafts are retained.");
 return capacity;
}

/** Sources without transitions retain the original immutable-coverage behaviour. */
export async function refinementGeometryAtRevision<T extends Pick<RefinementMeta,"id"|"terrainId"|"worldId"|"revision"|"parentRevision"|"frame"|"gridWidth"|"gridHeight"|"overviewLevels">>(tx:Connection,current:T,revision:number):Promise<T>{
 if(revision===current.revision||!await refinementExpansionAvailable(tx))return {...current,revision};
 const [saved]=await tx.select().from(geometry).where(and(eq(geometry.refinementId,current.id),eq(geometry.terrainId,current.terrainId),eq(geometry.worldId,current.worldId),lte(geometry.fromRevision,revision))).orderBy(desc(geometry.fromRevision)).limit(1);
 return saved?{...current,revision,parentRevision:saved.parentRevision,frame:{x:saved.x,y:saved.y,width:saved.width,height:saved.height},gridWidth:saved.gridWidth,gridHeight:saved.gridHeight,overviewLevels:overviewLevels(saved.gridWidth,saved.gridHeight)}:{...current,revision};
}

export function refinementGeometryRecord(meta:RefinementMeta,fromRevision:number){return {refinementId:meta.id,terrainId:meta.terrainId,worldId:meta.worldId,fromRevision,parentRevision:meta.parentRevision,x:meta.frame.x,y:meta.frame.y,width:meta.frame.width,height:meta.frame.height,gridWidth:meta.gridWidth,gridHeight:meta.gridHeight};}
