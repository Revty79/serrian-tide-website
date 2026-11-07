import "server-only";
import { and,asc,eq } from "drizzle-orm";
import { db } from "@/db";
import { worldBuildingInterior,worldBuildingInteriorSource } from "@/db/world-building-floor-schema";
import { worldReadAccess } from "./world-service";
import { worldScopeAllowed } from "./world-access-service";
import type { WorldMapAccessIndex } from "./world-map-access";
export async function worldMapAccessIndex(userId:string,worldId:string,review=false,offset=0):Promise<WorldMapAccessIndex>{
 await worldReadAccess(userId,worldId,review,"interiors");
 if(!worldScopeAllowed(worldId,"interiors"))return {interiors:[],next:null};
 const rows=await db.selectDistinctOn([worldBuildingInterior.id],{buildingId:worldBuildingInterior.id,name:worldBuildingInterior.name,townMapId:worldBuildingInteriorSource.townMapId,featureId:worldBuildingInteriorSource.featureId}).from(worldBuildingInterior).innerJoin(worldBuildingInteriorSource,and(eq(worldBuildingInteriorSource.buildingId,worldBuildingInterior.id),eq(worldBuildingInteriorSource.worldId,worldId))).where(eq(worldBuildingInterior.worldId,worldId)).orderBy(asc(worldBuildingInterior.id),asc(worldBuildingInteriorSource.id)).limit(101).offset(offset);
 return {interiors:rows.slice(0,100),next:rows.length>100?offset+100:null};
}
