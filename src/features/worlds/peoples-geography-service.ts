import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { worldGeography } from "@/db/world-atlas-schema";
import { worldLoreGeography, worldLoreHead, worldLoreVersion } from "@/db/world-peoples-schema";
import type { HistoryTx } from "./history-version-service";
import { ordinaryLoreSource } from "./ordinary-knowledge";

export function ordinaryPlace() {
  return sql`not exists (select 1 from world_dungeon_entity d where d.world_id=${worldGeography.worldId} and d.visibility<>'ordinary' and (d.id=${worldGeography.id} or d.geography_id=${worldGeography.id}))`;
}
export async function lorePlaces(tx:HistoryTx, worldId:string, ordinary=false, ids?:string[]) {
  if(ids&&!ids.length)return [];
  return tx.select({id:worldGeography.id,name:worldGeography.name,archived:sql<boolean>`${worldGeography.archivedAt} is not null`})
    .from(worldGeography).where(and(eq(worldGeography.worldId,worldId),ids?inArray(worldGeography.id,ids):undefined,ordinary?ordinaryPlace():undefined)).orderBy(asc(worldGeography.name),asc(worldGeography.id)).limit(ids?200:2000);
}
export async function entityGeographies(tx:HistoryTx,worldId:string,versionId:string,ordinary=false) {
  const rows=await tx.select().from(worldLoreGeography).where(and(eq(worldLoreGeography.worldId,worldId),eq(worldLoreGeography.versionId,versionId),ordinary?eq(worldLoreGeography.protected,false):undefined)).orderBy(asc(worldLoreGeography.position)).limit(100);
  const places=await lorePlaces(tx,worldId,ordinary,[...new Set(rows.flatMap(g=>[g.geographyId,...g.destinationId?[g.destinationId]:[]]))]);
  const names=new Map(places.map(p=>[p.id,p]));
  return rows.filter(g=>!ordinary||(names.has(g.geographyId)&&(!g.destinationId||names.has(g.destinationId)))).map(({id,geographyId,destinationId,relationshipType,account,time,protected:secret})=>({id,geographyId,destinationId,relationshipType,account,time,protected:secret,name:names.get(geographyId)?.name??"Retained unavailable place",destinationName:destinationId?names.get(destinationId)?.name??"Retained unavailable place":null,unavailable:!!names.get(geographyId)?.archived||!!(destinationId&&names.get(destinationId)?.archived)}));
}
export async function entitiesAtPlace(tx:HistoryTx,worldId:string,timelineId:string,placeId:string,ordinary=false) {
  const rows=await tx.selectDistinct({id:worldLoreHead.entityId}).from(worldLoreGeography)
    .innerJoin(worldLoreHead,and(eq(worldLoreHead.versionId,worldLoreGeography.versionId),eq(worldLoreHead.timelineId,timelineId)))
    .innerJoin(worldLoreVersion,eq(worldLoreVersion.id,worldLoreHead.versionId))
    .where(and(eq(worldLoreGeography.worldId,worldId),sql`(${worldLoreGeography.geographyId}=${placeId} or ${worldLoreGeography.destinationId}=${placeId})`,inArray(worldLoreHead.mode,["authored","inherited","interpretation"]),ordinary?ordinaryLoreSource(worldId,timelineId,sql`${worldLoreVersion.id}`):undefined,ordinary?eq(worldLoreGeography.protected,false):undefined,ordinary?sql`not exists (select 1 from world_dungeon_entity d where d.world_id=${worldId} and d.visibility<>'ordinary' and (d.geography_id=${worldLoreGeography.geographyId} or d.id=${worldLoreGeography.geographyId} or d.geography_id=${worldLoreGeography.destinationId} or d.id=${worldLoreGeography.destinationId}))`:undefined)).limit(2000);
  return new Set(rows.map(r=>r.id));
}

// A branch must not silently accept a later, spanning or unknown place account inside an earlier entity source.
export async function geographicSourceReview(tx:HistoryTx,versionIds:string[],divergence:number){
  if(!versionIds.length)return new Set<string>();
  const g=worldLoreGeography;
  const rows=await tx.selectDistinct({id:g.versionId}).from(g).where(and(inArray(g.versionId,versionIds),sql`not coalesce(case when ${g.time}->>'kind'='known' then (${g.time}->>'year')::numeric<${divergence} when ${g.time}->>'kind' in ('window','duration') then (${g.time}->>'endYear')::numeric<${divergence} else false end,false)`));
  return new Set(rows.map(r=>r.id));
}
