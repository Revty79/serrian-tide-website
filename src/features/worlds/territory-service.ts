import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { worldMapTerritory as territories,worldMapTerritoryBoundary as boundaries,worldMapTerritoryLore as lorePins,worldMapTerritoryHistory as historyPins } from "@/db/world-map-state-schema";
import { worldLoreHead,worldLoreVersion,worldLoreDisplay } from "@/db/world-peoples-schema";
import { worldHistoryHead,worldHistoryVersion } from "@/db/world-timeline-schema";
import { ordinaryLorePinnedSource,ordinaryHistorySource } from "./ordinary-knowledge";
import { WorldError } from "./world-service";
import { territoryFamilies,validateTerritories,type HistoricalTerritory,type TerritoryReferences } from "./historical-territories";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const missing=()=>new WorldError("This saved territorial source is unavailable. Keep your draft and reload its source choices.",404);
export function ordinaryTerritorySource(worldId:string,timelineId:string,versionId:SQL) {
  return sql`not exists (with recursive sources(id) as (
    select ${versionId}::text union select n.id from sources s join world_map_state_version v on v.id=s.id and v.world_id=${worldId}
    cross join lateral (select v.source_version_id as id union select h.version_id from world_map_state_head h where h.world_id=${worldId} and h.state_id=v.state_id and h.timeline_id=v.timeline_id) n where n.id is not null)
    select 1 from sources s join world_map_state_version v on v.id=s.id where
      exists(select 1 from jsonb_array_elements(coalesce(v.payload->'territories','[]'::jsonb)) t where (t->>'protected')::boolean)
      or exists(select 1 from world_map_territory_lore territory_pin where territory_pin.version_id=v.id and not (${ordinaryLorePinnedSource(worldId,timelineId,sql`territory_pin.lore_version_id`)}))
      or exists(select 1 from world_map_territory_history territory_event where territory_event.version_id=v.id and not (${ordinaryHistorySource(worldId,timelineId,sql`territory_event.history_version_id`)})))`;
}
export async function territoryReferences(tx:Tx,worldId:string,timelineId:string):Promise<TerritoryReferences> {
  const entities=await tx.select({entityId:worldLoreHead.entityId,versionId:worldLoreVersion.id,revision:worldLoreHead.revision,entityName:worldLoreDisplay.name,family:worldLoreVersion.family}).from(worldLoreHead).innerJoin(worldLoreVersion,eq(worldLoreVersion.id,worldLoreHead.versionId)).innerJoin(worldLoreDisplay,eq(worldLoreDisplay.versionId,worldLoreVersion.id)).where(and(eq(worldLoreHead.worldId,worldId),eq(worldLoreHead.timelineId,timelineId),sql`${worldLoreHead.mode} in ('authored','inherited','interpretation')`,eq(worldLoreVersion.archived,false),sql`${worldLoreVersion.family} in ('polity','government','institution','claim','agreement','conflict','realm','civilization')`)).limit(2000);
  const history=await tx.select({entityId:worldHistoryHead.entityId,versionId:worldHistoryVersion.id,name:sql<string>`coalesce(${worldHistoryVersion.payload}->>'title',${worldHistoryVersion.payload}->>'name')`}).from(worldHistoryHead).innerJoin(worldHistoryVersion,eq(worldHistoryVersion.id,worldHistoryHead.versionId)).where(and(eq(worldHistoryHead.worldId,worldId),eq(worldHistoryHead.timelineId,timelineId),sql`${worldHistoryHead.mode} in ('authored','inherited','partial','interpretation')`,sql`not coalesce((${worldHistoryVersion.payload}->>'archived')::boolean,false)`)).limit(5000);
  return {entities:entities.filter((e):e is TerritoryReferences["entities"][number]=>territoryFamilies.some(f=>f===e.family)),history};
}
export async function validateTerritorySources(tx:Tx,worldId:string,mapId:string,timelineId:string,incoming:HistoricalTerritory[],previous:HistoricalTerritory[],period?:{startYear:number;endYear:number}) {
  try{validateTerritories(incoming,period);}catch(e){throw new WorldError((e as Error).message,400);}
  if(previous.some(t=>!incoming.some(n=>n.id===t.id))||previous.some(t=>t.boundaries.some(b=>!incoming.find(n=>n.id===t.id)?.boundaries.some(n=>n.id===b.id))))throw new WorldError("Keep retained territories and boundaries. Archive a representation instead of removing its identity.",400);
  for(const t of incoming){const [old]=await tx.select().from(territories).where(eq(territories.id,t.id));if(old&&(old.worldId!==worldId||old.mapId!==mapId))throw missing();if(old&&!previous.some(p=>p.id===t.id))throw new WorldError("Reuse a territory through its exact saved appearance; do not forge its identity.",400);
    if(!old)await tx.insert(territories).values({id:t.id,worldId,mapId,originTimelineId:timelineId});
    for(const b of t.boundaries){const [saved]=await tx.select().from(boundaries).where(eq(boundaries.id,b.id));if(saved&&(saved.worldId!==worldId||saved.mapId!==mapId||saved.territoryId!==t.id||saved.parentId!==b.parentId))throw missing();if(!saved)await tx.insert(boundaries).values({id:b.id,worldId,mapId,territoryId:t.id,parentId:b.parentId});}
    for(const r of t.relationships){const retained=previous.find(p=>p.id===t.id)?.relationships.find(n=>n.id===r.id&&n.entityId===r.entityId&&n.versionId===r.versionId&&n.revision===r.revision&&n.entityName===r.entityName&&n.family===r.family);
      if(!retained){const [saved]=await tx.select({v:worldLoreVersion,h:worldLoreHead,name:worldLoreDisplay.name}).from(worldLoreHead).innerJoin(worldLoreVersion,eq(worldLoreVersion.id,worldLoreHead.versionId)).innerJoin(worldLoreDisplay,eq(worldLoreDisplay.versionId,worldLoreVersion.id)).where(and(eq(worldLoreHead.worldId,worldId),eq(worldLoreHead.timelineId,timelineId),eq(worldLoreHead.entityId,r.entityId)));
        if(!saved||saved.v.id!==r.versionId||saved.h.revision!==r.revision||saved.v.family!==r.family||saved.name!==r.entityName||saved.v.archived||["pending","excluded"].includes(saved.h.mode))throw missing();}
    }
    for(const h of t.history){if(previous.find(p=>p.id===t.id)?.history.some(n=>n.entityId===h.entityId&&n.versionId===h.versionId&&n.name===h.name))continue;const [saved]=await tx.select({v:worldHistoryVersion,h:worldHistoryHead}).from(worldHistoryHead).innerJoin(worldHistoryVersion,eq(worldHistoryVersion.id,worldHistoryHead.versionId)).where(and(eq(worldHistoryHead.worldId,worldId),eq(worldHistoryHead.timelineId,timelineId),eq(worldHistoryHead.entityId,h.entityId)));if(!saved||saved.v.id!==h.versionId||!["authored","inherited","partial","interpretation"].includes(saved.h.mode)||saved.v.payload.archived||("title"in saved.v.payload?saved.v.payload.title:saved.v.payload.name)!==h.name)throw missing();}
  }
}
export async function appendTerritoryReferences(tx:Tx,worldId:string,mapId:string,versionId:string,incoming:HistoricalTerritory[]) {
  const lore=incoming.flatMap(t=>t.relationships.map(r=>({worldId,mapId,versionId,territoryId:t.id,id:r.id,entityId:r.entityId,loreVersionId:r.versionId})));
  const history=incoming.flatMap(t=>t.history.map(h=>({worldId,mapId,versionId,territoryId:t.id,entityId:h.entityId,historyVersionId:h.versionId})));
  if(lore.length)await tx.insert(lorePins).values(lore);if(history.length)await tx.insert(historyPins).values(history);
}
