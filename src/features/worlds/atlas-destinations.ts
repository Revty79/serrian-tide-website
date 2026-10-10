import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { worldAtlasMap, worldGeography, worldAtlasFeature, worldAtlasDrawing, worldAtlasSettlementShape, worldAtlasInteriorShape, worldAtlasDungeonShape } from "@/db/world-atlas-schema";
import { activeMapFloor } from "./interior-service";
import { activeMapDungeon } from "./dungeon-service";
import { WorldError } from "./world-service";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function validateArrival(tx:Tx,worldId:string,sourceId:string,destinationId:string,arrivalId:string|null){
 const unavailable=()=>new WorldError("This destination or arrival place is unavailable.",404);
 const [m]=await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.worldId,worldId),eq(worldAtlasMap.id,destinationId)));if(!m||m.archivedAt||m.id===sourceId)throw unavailable();await activeMapFloor(tx,worldId,m.geographyId);await activeMapDungeon(tx,worldId,m.geographyId);
 if(!arrivalId)return;const [g]=await tx.select().from(worldGeography).where(and(eq(worldGeography.worldId,worldId),eq(worldGeography.id,arrivalId)));if(!g||g.archivedAt)throw unavailable();if(g.id===m.geographyId)return;
 const features=await tx.select().from(worldAtlasFeature).where(and(eq(worldAtlasFeature.mapId,m.id),eq(worldAtlasFeature.geographyId,g.id))),drawings=await tx.select().from(worldAtlasDrawing).where(and(eq(worldAtlasDrawing.mapId,m.id),eq(worldAtlasDrawing.geographyId,g.id)));
 const settlement=await tx.select().from(worldAtlasSettlementShape).where(and(eq(worldAtlasSettlementShape.mapId,m.id),eq(worldAtlasSettlementShape.geographyId,g.id))),interior=await tx.select().from(worldAtlasInteriorShape).where(and(eq(worldAtlasInteriorShape.mapId,m.id),eq(worldAtlasInteriorShape.entityId,g.id))),dungeon=await tx.select().from(worldAtlasDungeonShape).where(and(eq(worldAtlasDungeonShape.mapId,m.id),eq(worldAtlasDungeonShape.entityId,g.id)));
 if(!features.some(f=>!f.archivedAt)&&!drawings.some(f=>!f.archivedAt)&&![...settlement,...interior,...dungeon].some(s=>!s.content.archived))throw new WorldError("Choose an active arrival place represented on the destination map.",400);
}
