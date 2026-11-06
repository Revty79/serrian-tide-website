import "server-only";
import {and,eq,inArray,sql} from "drizzle-orm";
import {worldGeography} from "@/db/world-atlas-schema";
import {nativeResource,type NativeContentContext} from "./native-map-history-context";
import {nativeTerrainSource,nativeAllRefinementIndex} from "./native-map-history-terrain-read";
import {nativeContentHash,type NativeHistoryTx} from "./native-map-history-store";
import {nativeTerritorySavedSchema,nativeTerritoryCommandSchema,validateNativeTerritories,type NativeTerritoryBundle,type NativeTerritorySource} from "./native-map-history-territories";
import {territoryReferences,validateTerritorySourceRecords} from "./territory-service";
import {assertNativeRevision} from "./native-map-history-resources";
import type {NativeWriteResult} from "./native-map-history-write";
import {WorldError} from "./world-service";
import {boundedRegionalLayer} from "./terrain-regional-authoring-service";
import {nativeConditions} from "./native-map-history-conditions";
import {nativeObjectPresent} from "./native-map-history";

async function territoryContext(tx:NativeHistoryTx,c:NativeContentContext){
  if(c.scope.target.kind!=="terrain")throw new WorldError("Choose a dated World or Region to review political boundaries.",400);
  const authority=c.authority??c,terrain=await nativeTerrainSource(tx,authority),index=await nativeAllRefinementIndex(tx,authority);
  const source:NativeTerritorySource={mapId:authority.scope.target.id,mapVersionId:authority.version.id,timelineId:c.scope.timelineId,year:c.scope.year,terrainId:terrain.document.terrainId,width:terrain.shape.displayWidth,height:terrain.shape.displayHeight,wrap:terrain.shape.wrap,fingerprint:nativeContentHash({terrainId:terrain.document.terrainId,sourceState:index.sourceState,seaLevel:terrain.document.seaLevel,width:terrain.shape.displayWidth,height:terrain.shape.displayHeight,wrap:terrain.shape.wrap})};
  const resource=authority.manifest.resources.some(resource=>resource.key==="territories")?await nativeResource(tx,authority,"territories"):undefined,saved=resource?nativeTerritorySavedSchema.parse(resource.payload):null;
  return {authority,source,saved};
}
export async function readNativeTerritories(tx:NativeHistoryTx,c:NativeContentContext):Promise<NativeTerritoryBundle>{
  const {source,saved}=await territoryContext(tx,c),legacySourceCount=(await tx.execute<{n:number}>(sql`select count(distinct t->>'id')::int n from world_map_state_head h join world_map_state_version v on v.id=h.version_id and v.world_id=h.world_id cross join lateral jsonb_array_elements(coalesce(v.payload->'territories','[]'::jsonb)) t where h.world_id=${c.worldId} and h.map_id=${source.mapId} and h.timeline_id=${c.scope.timelineId} and not(v.payload ? 'nativeAtlas')`)).rows[0].n;
  return {coverage:saved?"authored-layer":"unknown",canEdit:c.canEdit&&!c.authority,reason:c.authority?"Political boundaries share this Region's dated source World. Open that World to edit them; the Region's footprint remains independent.":c.canEdit?"Only authored boundaries and active dated relationships establish political coverage. Other areas and dates remain unknown.":"Read-only review of the exact retained political sources.",source,sourceChanged:!!saved&&saved.source.fingerprint!==source.fingerprint,saved,references:await territoryReferences(tx,c.worldId,c.scope.timelineId),legacySourceCount:legacySourceCount??0};
}
export async function saveNativeTerritories(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown):Promise<NativeWriteResult>{
  if(c.authority)throw new WorldError("Open the dated source World before editing shared political boundaries. Your regional view and draft remain retained.",409);
  if(!nativeObjectPresent((await nativeConditions(tx,c)).values,c.scope.target.id))throw new WorldError("This World appearance is absent or unknown. Establish its presence before authoring political boundaries; retained geometry stays intact.",409);
  const command=nativeTerritoryCommandSchema.parse(raw),{source,saved,authority}=await territoryContext(tx,c);assertNativeRevision(saved?.revision??0,command.revision);
  if(command.sourceMapVersionId!==source.mapVersionId||command.sourceFingerprint!==source.fingerprint)throw new WorldError("The dated geographic source changed. Retain this original political request and review its exact World source before starting a new save intent.",409);
  boundedRegionalLayer(()=>validateNativeTerritories(command.territories,source,authority.selected));
  await validateTerritorySourceRecords(tx,c.worldId,source.mapId,c.scope.timelineId,command.territories,saved?.territories??[]);
  const geographyIds=[...new Set(command.territories.flatMap(territory=>territory.geographyIds))],oldIds=new Set(saved?.territories.flatMap(territory=>territory.geographyIds));
  if(geographyIds.length){const rows=await tx.select({id:worldGeography.id,archived:worldGeography.archivedAt}).from(worldGeography).where(and(eq(worldGeography.worldId,c.worldId),inArray(worldGeography.id,geographyIds)));if(rows.length!==geographyIds.length||rows.some(row=>row.archived&&!oldIds.has(row.id)))throw new WorldError("Choose established World place identities for new territorial associations. Retained historical associations remain intact.",400);}
  const revision=(saved?.revision??0)+1,payload={version:1 as const,revision,source,territories:command.territories};
  return {updates:[{key:"territories",kind:"places",payload}],result:{revision}};
}
