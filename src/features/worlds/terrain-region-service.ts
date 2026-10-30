import "server-only";
import {createHash} from "node:crypto";
import {eq,sql} from "drizzle-orm";
import {worldAtlasMap} from "@/db/world-atlas-schema";
import {worldMapCanvas} from "@/db/world-terrain-schema";
import {worldTerrainRefinement} from "@/db/world-terrain-refinement-schema";
import {worldMapRegion} from "@/db/world-map-region-schema";
import {worldWriteTransaction,WorldError} from "./world-service";
import {regionsAvailable,terrainMapContext} from "./terrain-map-context";
import {regionCreateSchema,validateRegionFrame,terrainSourceState} from "./terrain-regions";

export async function createRegionalMap(userId:string,worldId:string,raw:unknown){
  const command=regionCreateSchema.parse(raw),creationHash=createHash("sha256").update(JSON.stringify(command)).digest("hex");
  return worldWriteTransaction(userId,worldId,async tx=>{
    if(!await regionsAvailable(tx))throw new WorldError("MIGRATION 0147 REQUIRED to create linked regional maps. The proposed extent and original request are retained.",409);
    const [retry]=await tx.select().from(worldMapRegion).where(eq(worldMapRegion.mapId,command.requestId));
    if(retry){if(retry.worldId!==worldId||retry.creationHash!==creationHash||retry.createdBy!==userId)throw new WorldError("This regional creation identity already contains different choices. Keep the original retry or review a fresh proposal.",409);return {id:retry.mapId,parentMapId:retry.parentMapId,terrainId:retry.terrainId,revision:retry.revision};}
    const source=await terrainMapContext(tx,worldId,command.parentMapId);
    if(source.region||source.canvas.purpose!=="world"||source.map.scope!=="world"||source.map.mapKind!=="generic")throw new WorldError("Choose an accepted independent World terrain map as this region's parent.",400);
    if(source.terrain.id!==command.terrainId)throw new WorldError("The proposed terrain identity does not belong to this parent World map.",400);
    if(source.terrain.revision!==command.sourceRevision||source.map.revision!==command.parentRevision)throw new WorldError("The parent source changed during this region preview. Your bounds and name are retained; review the current accepted geography before creating it.",409);
    const details=await tx.select({id:worldTerrainRefinement.id,revision:worldTerrainRefinement.revision}).from(worldTerrainRefinement).where(eq(worldTerrainRefinement.terrainId,source.terrain.id));if(command.sourceState!==terrainSourceState(source.terrain.revision,details))throw new WorldError("Accepted numerical detail changed during the regional preview. Retain the bounds and review the accepted sources before creating it.",409);
    try{validateRegionFrame(command.frame,{displayWidth:source.terrain.widthMetres,displayHeight:source.terrain.heightMetres,wrap:source.terrain.wrap});}catch(error){throw new WorldError((error as Error).message,400);}
    const [collision]=await tx.select({id:worldAtlasMap.id}).from(worldAtlasMap).where(eq(worldAtlasMap.id,command.requestId));if(collision)throw new WorldError("That map identity is already in use. Retain the draft and choose a fresh creation request.",409);
    const [{count}]=(await tx.execute<{count:number}>(sql`select count(*)::int count from world_map_canvas where world_id=${worldId}`)).rows;
    if(count>=64)throw new WorldError("This World has reached the existing 64-map Atlas limit. The regional proposal is retained.",400);
    await tx.insert(worldAtlasMap).values({id:command.requestId,worldId,name:command.name,scope:"regional",mapKind:"generic"});
    await tx.insert(worldMapCanvas).values({mapId:command.requestId,worldId,terrainId:source.terrain.id,purpose:"regional"});
    const f=command.frame;await tx.insert(worldMapRegion).values({mapId:command.requestId,worldId,terrainId:source.terrain.id,parentMapId:source.map.id,x:f.x,y:f.y,width:f.width,height:f.height,initialSourceRevision:source.terrain.revision,initialSourceState:command.sourceState,initialParentRevision:source.map.revision,creationHash,createdBy:userId});
    return {id:command.requestId,parentMapId:source.map.id,terrainId:source.terrain.id,revision:1};
  });
}
