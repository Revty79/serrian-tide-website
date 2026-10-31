import "server-only";
import {sql} from "drizzle-orm";
import {db} from "@/db";
import {worldReadAccess,WorldError} from "./world-service";
import {regionalAuthoringContext} from "./terrain-regional-authoring-service";
import {terrainSourceState} from "./terrain-regions";
import {regionFootprintsAvailable} from "./terrain-region-footprint-service";
import type {GeographyRevisions} from "./terrain-geography-notifications";
export async function getTerrainRevisions(userId:string,worldId:string,mapId:string,options:{review?:boolean;ordinary?:boolean}={}):Promise<GeographyRevisions>{
 await worldReadAccess(userId,worldId,!!options.review);if(options.ordinary)throw new WorldError("This terrain map is unavailable.",404);
 return db.transaction(async tx=>{
  const context=await regionalAuthoringContext(tx,worldId,mapId),source=context.sourceMapId;
  const details=(await tx.execute<{id:string;revision:number}>(sql`select id,revision from world_terrain_refinement where world_id=${worldId} and terrain_id=${context.terrain.id}`)).rows;
  const heads=await terrainRevisionHeads(tx,worldId,source,context.region?mapId:"");
  return {worldId,mapId,sourceMapId:source,sourceState:terrainSourceState(context.terrain.revision,details),rootRevision:context.terrain.revision,regionalAvailable:!context.region||!!context.regional,freeformAvailable:await regionFootprintsAvailable(tx),heads};
 },{accessMode:"read only",isolationLevel:"repeatable read"});
}

export async function terrainRevisionHeads(tx:Pick<typeof db,"execute">,worldId:string,source:string,compositionMap=""){
  const tables=["world_terrain_material","world_hydrology","world_environment","world_artwork","world_labels"] as const,available=new Set((await tx.execute<{name:string}>(sql`select name from unnest(ARRAY[${sql.join(tables.map(table=>sql`${table}`),sql`, `)}]::text[]) t(name) where to_regclass('public.'||name) is not null`)).rows.map(row=>row.name));
  const head=(table:typeof tables[number],id:string)=>available.has(table)?sql`coalesce((select revision from ${sql.identifier(table)} where map_id=${id}),0)`:sql`0`;
  const heads=(await tx.execute<GeographyRevisions["heads"]>(sql`select
   ${head("world_terrain_material",source)} materials,
   ${head("world_hydrology",source)} water,
   ${head("world_environment",source)} environment,
   ${head("world_artwork",source)} artwork,
   ${head("world_labels",source)} labels,
   ${head("world_labels",compositionMap)} composition,
   (select md5(coalesce(string_agg(p.id||':'||p.revision::text||':'||g.revision::text,',' order by p.id),'')) from world_map_place p join world_geography g on g.id=p.geography_id where p.map_id=${source} and p.world_id=${worldId}) towns`)).rows[0];
 return heads;
}
