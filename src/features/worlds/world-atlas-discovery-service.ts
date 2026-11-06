import {worldCampaignAssociations} from "./campaign-association-service";
import {nativeTerritoriesForDiscovery,nativeTerritoryFocus} from "./native-map-history-territory-discovery";
import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { worldAtlasMap, worldGeography } from "@/db/world-atlas-schema";
import { worldMapCanvas } from "@/db/world-terrain-schema";
import { worldMapPlace, worldSettlementProfile } from "@/db/world-town-schema";
import { worldTownMap } from "@/db/world-town-map-schema";
import { worldShopLocation, worldTownPlace, worldShop } from "@/db/world-town-commerce-schema";
import { worldLoreDisplay, worldLoreGeography, worldLoreHead, worldLoreVersion, worldHistoryVersionEntity } from "@/db/world-peoples-schema";
import { worldHistoryHead, worldHistoryVersion } from "@/db/world-timeline-schema";
import { WorldError, worldReadAccess } from "./world-service";
import { selectedTimeline, type HistoryTx } from "./history-version-service";
import { getPeople } from "./peoples-service";
import { historyEntry } from "./history-index-service";
import { milestoneLinks } from "./milestone-service";
import { getWorldLinks } from "./linking-service";
import { ordinaryLoreSource, ordinaryHistorySource } from "./ordinary-knowledge";
import { ordinaryPlace } from "./peoples-geography-service";
import { loreWorkspaceTab } from "./peoples";
import { nativeContentContext, nativeResource, type NativeContentContext } from "./native-map-history-context";
import { nativeChoices } from "./native-map-history-store";
import { nativeConditions } from "./native-map-history-conditions";
import { nativeObjectPresent, resolveNativeHistory, type NativeHistoryScope, type NativeMapTarget } from "./native-map-history";
import type { TownBundle } from "./world-towns";
import type { TownMapBundle, TownDesign } from "./town-map";
import type {FloorBundle} from "./building-floor";
import type {UndergroundBundle} from "./underground";
import {worldBuildingFloor,worldBuildingInterior,worldBuildingInteriorSource} from "@/db/world-building-floor-schema";
import {worldUndergroundLevel,worldUndergroundSite} from "@/db/world-underground-schema";
import type { EntryRecord } from "./history";
import { worldContextUrl, type WorldAtlasContext } from "./world-atlas-context";
import { associationAtYear, associationPeriodAtYear, worldAtlasDiscoverySchema, type AssociationCoverage, type AtlasRepresentation, type WorldAtlasDiscovery, type WorldsRecordLink } from "./world-atlas-discovery";

const usable = ["authored", "inherited", "interpretation"] as const;
const missing = () => new WorldError("This World record or saved map relationship is unavailable in the selected timeline.", 404);
const bounded = <T,>(rows: T[], limit: number, label: string) => {
  if (rows.length > limit) throw new WorldError(`This ${label} exceeds its bounded discovery window. Narrow the selection; saved records remain intact.`, 413);
  return rows;
};
type PlaceAccount = { id: string; relationship: string; coverage: AssociationCoverage; branchId?: string; shopId?: string; source?:import("./world-atlas-discovery").WorldAtlasSource };
type NativeMapReading = { context?: NativeContentContext; coverage: AssociationCoverage; name: string };
type Permissions = { ownerId: string; archived: boolean; review: boolean; ordinary: boolean };

async function mapReading(tx: HistoryTx, userId: string, context: WorldAtlasContext, permissions: Permissions, target: NativeMapTarget, name: string, scope?: NativeHistoryScope): Promise<NativeMapReading> {
  if (context.year === undefined) return { coverage: "current-reference", name };
  const choices = await nativeChoices(tx, context.worldId, context.timelineId, target);
  const selected = scope ? choices.find(choice => choice.id === scope.stateId) : resolveNativeHistory(choices, target, context.year);
  if (!selected || ["pending", "excluded"].includes(selected.mode) || !scope?.versionId&&(selected.archived || context.year < selected.startYear || context.year > selected.endYear)) return { coverage: "unknown", name };
  const binding: NativeHistoryScope = scope ?? { timelineId: context.timelineId, year: context.year, target, stateId: selected.id, edit: false };
  if (binding.year !== context.year || binding.timelineId !== context.timelineId || binding.target.kind !== target.kind || binding.target.id !== target.id) throw missing();
  let resolved:NativeContentContext;
  try{resolved=await nativeContentContext(tx, userId, context.worldId, { ...binding, edit: false }, permissions);}
  catch(error){if(error instanceof WorldError&&error.status===409&&error.message.startsWith("Historical World geography is unknown"))return {coverage:"unknown",name:selected.name};throw error;}
  if(resolved.version.archived||context.year<resolved.version.startYear!||context.year>resolved.version.endYear!)return {coverage:"unknown",name:resolved.version.name};
  if (!nativeObjectPresent((await nativeConditions(tx, resolved)).values, target.id)) return { coverage: "unknown", name: selected.name };
  return { context: resolved, coverage: "established", name: selected.name };
}
function representation(context: WorldAtlasContext, target: NativeMapTarget, reading: NativeMapReading, account: PlaceAccount, point?: { x: number; y: number }, objectId?: string,locationName?:string,focusFrame?:{x:number;y:number;width:number;height:number},navigation?:Record<string,string>): AtlasRepresentation {
  const established = reading.coverage === "established" && account.coverage === "established";
  const coverage = context.year === undefined ? "current-reference" : established ? "established" : "unknown";
  // Never borrow a current-day coordinate to focus an unknown historical map.
  const focus = reading.coverage !== "unknown" ? point : undefined;
  const state = reading.context?.version;
  return { id: `${target.kind}:${target.id}:${objectId ?? account.id}:${account.branchId ?? ""}`, target, name: reading.name, relationship: account.relationship, coverage,
    objectId, locationName,stateId: state?.stateId ?? undefined, versionId: state?.id, point: focus,
    href: worldContextUrl(context, { tab: "atlas", [target.kind === "terrain" ? "terrainMap" : target.kind === "floor" ? "interiorFloor" : target.kind === "underground" ? "undergroundLevel" : "townMap"]: target.id,...navigation,
      atlasState: state?.stateId ?? undefined, atlasVersion: state?.id,
      atlasArrival: focus ? JSON.stringify({ point: focus, entranceId: objectId ?? account.id,...focusFrame?{frame:focusFrame}:{} }) : undefined,
      townSelection: target.kind === "town" ? objectId : undefined, worldPlace: account.id,
      worldShopBranch: account.branchId,
      worldSource: account.source?JSON.stringify(account.source):undefined,
    }),
  };
}
async function placeRepresentations(tx: HistoryTx, userId: string, context: WorldAtlasContext, permissions: Permissions, accounts: PlaceAccount[]) {
  const maps: AtlasRepresentation[] = [];
  if (!accounts.length || context.ordinary) return maps;
  const ids = [...new Set(accounts.map(account => account.id))];
  const townPlaces = await tx.select().from(worldTownPlace).where(and(eq(worldTownPlace.worldId, context.worldId), inArray(worldTownPlace.geographyId, ids)));
  const townIds = [...new Set([...ids, ...townPlaces.map(place => place.townId)])];
  // Native terrain maps have the existing 64-map bound. The position itself is
  // read from the selected dated component, never the mutable placement table.
  const terrainMaps = bounded(await tx.select({ id: worldAtlasMap.id, name: worldAtlasMap.name, archived: worldAtlasMap.archivedAt }).from(worldMapCanvas)
    .innerJoin(worldAtlasMap, and(eq(worldAtlasMap.id, worldMapCanvas.mapId), eq(worldAtlasMap.worldId, context.worldId)))
    .where(and(eq(worldMapCanvas.worldId, context.worldId),sql`(
      exists(select 1 from world_map_place p where p.world_id=${context.worldId} and p.map_id=${worldMapCanvas.mapId} and p.geography_id in (${sql.join(townIds.map(id=>sql`${id}`),sql`,`)}))
      or exists(select 1 from world_map_state_head h join world_map_state_version v on v.id=h.version_id join world_map_state_component_ref r on r.version_id=v.id and r.key='places' join world_map_state_component c on c.id=r.component_id
        cross join lateral jsonb_array_elements(coalesce(c.payload->'placements','[]'::jsonb)) p
        where h.world_id=${context.worldId} and h.timeline_id=${context.timelineId} and v.payload->'nativeAtlas'->'target'->>'kind'='terrain' and v.payload->'nativeAtlas'->'target'->>'id'=${worldMapCanvas.mapId}
        and p->>'townId' in (${sql.join(townIds.map(id=>sql`${id}`),sql`,`)}) )
    )`)).orderBy(asc(worldAtlasMap.id)).limit(65), 64, "terrain map inventory");
  for (const map of terrainMaps) {
    const reading = await mapReading(tx, userId, context, permissions, { kind: "terrain", id: map.id }, map.name);
    let places: TownBundle["placements"] = [];
    if (reading.context) places = ((await nativeResource(tx, reading.context, "places")).payload as unknown as TownBundle).placements;
    else if (context.year === undefined && !map.archived) places = (await tx.select().from(worldMapPlace).where(and(eq(worldMapPlace.worldId, context.worldId), eq(worldMapPlace.mapId, map.id), inArray(worldMapPlace.geographyId, townIds), isNull(worldMapPlace.removedAt)))).map(place => ({ id: place.id, townId: place.geographyId, mapId: map.id, name: "", category: "", revision: place.revision, x: place.x, y: place.y, removed: false, archived: false, mapName: map.name }));
    const conditions = reading.context ? (await nativeConditions(tx, reading.context)).values : [];
    for (const account of accounts) for (const place of places.filter(place => place.townId === account.id && !place.removed && nativeObjectPresent(conditions, place.id))) maps.push(representation(context, { kind: "terrain", id: map.id }, reading, account, place, place.id,place.name||undefined));
  }
  const townMaps = bounded(await tx.select().from(worldTownMap).where(and(eq(worldTownMap.worldId, context.worldId), inArray(worldTownMap.townId, townIds))).orderBy(asc(worldTownMap.id)).limit(201), 200, "Town map selection");
  for (const map of townMaps) {
    if(context.year===undefined&&map.nativeOriginVersionId)continue;
    const reading = await mapReading(tx, userId, context, permissions, { kind: "town", id: map.id }, map.name);
    const document = reading.context ? ((await nativeResource(tx, reading.context, "town")).payload as unknown as { bundle: TownMapBundle }).bundle.document : context.year === undefined && !map.archived ? map : undefined;
    const conditions = reading.context ? (await nativeConditions(tx, reading.context)).values : [];
    for (const account of accounts) {
      if (account.id === map.townId && !account.branchId) maps.push(representation(context, { kind: "town", id: map.id }, reading, account));
      if (!document) continue;
      const features = (document.design as TownDesign).features.filter(feature => !feature.archived && nativeObjectPresent(conditions, feature.id) && (account.branchId ? feature.shopLocationId === account.branchId : feature.placeId === account.id));
      for (const feature of features) {
        const point = { x: feature.points.reduce((sum, p) => sum + p.x, 0) / feature.points.length, y: feature.points.reduce((sum, p) => sum + p.y, 0) / feature.points.length };
        maps.push(representation(context, { kind: "town", id: map.id }, reading, account, point, feature.id,feature.name||undefined));
      }
    }
  }
  // Floors and underground levels use their existing saved Place/building
  // bindings. A dated component must establish the relationship itself; an
  // unavailable appearance never borrows a current floor or hidden endpoint.
  const floors=bounded(await tx.select({floor:worldBuildingFloor,building:worldBuildingInterior,binding:worldBuildingInteriorSource,town:worldTownMap}).from(worldBuildingFloor)
    .innerJoin(worldBuildingInterior,and(eq(worldBuildingInterior.id,worldBuildingFloor.buildingId),eq(worldBuildingInterior.worldId,worldBuildingFloor.worldId)))
    .innerJoin(worldBuildingInteriorSource,and(eq(worldBuildingInteriorSource.buildingId,worldBuildingInterior.id),eq(worldBuildingInteriorSource.worldId,worldBuildingInterior.worldId)))
    .innerJoin(worldTownMap,and(eq(worldTownMap.id,worldBuildingInteriorSource.townMapId),eq(worldTownMap.worldId,worldBuildingInteriorSource.worldId)))
    .where(and(eq(worldBuildingFloor.worldId,context.worldId),sql`(${worldBuildingInterior.placeId} in (${sql.join(ids.map(id=>sql`${id}`),sql`,`)}))`)).orderBy(asc(worldBuildingFloor.id),asc(worldTownMap.id)).limit(257),256,"linked interior selection");
  for(const row of floors){
    if(context.year===undefined&&(row.floor.nativeOriginVersionId||row.floor.archived||row.town.archived))continue;
    const target={kind:"floor" as const,id:row.floor.id},reading=await mapReading(tx,userId,context,permissions,target,row.floor.name);
    const bundle=reading.context?((await nativeResource(tx,reading.context,"floor")).payload as unknown as {bundle:FloorBundle}).bundle:undefined,building=bundle?.building??(context.year===undefined?row.building:undefined);
    if(!building||bundle?.document?.archived)continue;
    for(const account of accounts.filter(a=>a.id===building.placeId&&!a.branchId))maps.push(representation(context,target,reading,account,undefined,undefined,building.name,undefined,{townMap:row.town.id,interiorBuilding:row.binding.featureId,terrainMap:row.town.sourceMapId,townReturnMap:row.town.contextMapId}));
  }
  const levels=bounded(await tx.select({level:worldUndergroundLevel,site:worldUndergroundSite}).from(worldUndergroundLevel)
    .innerJoin(worldUndergroundSite,and(eq(worldUndergroundSite.id,worldUndergroundLevel.siteId),eq(worldUndergroundSite.worldId,worldUndergroundLevel.worldId)))
    .where(and(eq(worldUndergroundLevel.worldId,context.worldId),inArray(worldUndergroundSite.placeId,ids))).orderBy(asc(worldUndergroundLevel.id)).limit(129),128,"linked underground selection");
  for(const row of levels){
    if(context.year===undefined&&(row.level.nativeOriginVersionId||row.level.archived||row.site.archived))continue;
    const target={kind:"underground" as const,id:row.level.id},reading=await mapReading(tx,userId,context,permissions,target,row.level.name);
    const bundle=reading.context?((await nativeResource(tx,reading.context,"underground")).payload as unknown as {bundle:UndergroundBundle}).bundle:undefined,site=bundle?.sites.find(s=>s.id===row.site.id)??(context.year===undefined?row.site:undefined);
    if(!site||bundle?.document?.archived)continue;
    for(const account of accounts.filter(a=>a.id===site.placeId&&!a.branchId))maps.push(representation(context,target,reading,account,undefined,undefined,site.name));
  }
  return maps;
}

export async function discoverWorldAtlas(userId: string, worldId: string, input: unknown, options: { review?: boolean; ordinary?: boolean } = {}): Promise<WorldAtlasDiscovery> {
  const parsed = worldAtlasDiscoverySchema.parse(input), access = await worldReadAccess(userId, worldId, !!options.review);
  const context: WorldAtlasContext = { worldId, timelineId: parsed.timelineId, year: parsed.year, review: !!options.review, ordinary: !!options.ordinary };
  const permissions = { ownerId: access.ownerId, archived: !!access.archivedAt, review: context.review, ordinary: context.ordinary };
  const subject = parsed.subject;
  let sourceName = "World context", accounts: PlaceAccount[] = [];
  const records: WorldsRecordLink[] = [], directMaps: { id: string; name: string; account: PlaceAccount }[] = [];
  if (subject.kind === "lore") {
    const record = await getPeople(userId, worldId, context.timelineId, subject.id, context.review, context.ordinary, subject.versionId);
    if (["pending", "excluded"].includes(record.mode)) throw missing();
    sourceName = record.draft.name;
    accounts = record.geographies.flatMap(geography => [geography.geographyId, ...geography.destinationId ? [geography.destinationId] : []].map(id => ({ id, relationship: geography.relationshipType + (geography.account ? `: ${geography.account}` : ""), coverage: associationAtYear(geography.time, context.year),source:{kind:"lore" as const,id:record.id,versionId:record.versionId} })));
    const links = await getWorldLinks(userId, worldId, context.timelineId, context.review, context.ordinary);
    for (const link of links.links.filter(link => !link.archived && link.mode !== "excluded" && link.draft.kind === "realm-map" && link.source.lore.id === subject.id)) {
      directMaps.push({ id: link.source.target.id, name: link.source.target.name, account: { id: subject.id, relationship: link.draft.label, coverage: associationPeriodAtYear(link.draft.beginning, link.draft.ending, context.year),source:{kind:"lore",id:link.source.lore.id,versionId:link.source.lore.versionId} } });
    }
  } else if (subject.kind === "history") {
    const entry = await historyEntry(userId, worldId, context.timelineId, subject.id, context.review, context.ordinary, subject.versionId);
    sourceName = entry.title;
    const links = await milestoneLinks(userId, worldId, context.timelineId, subject.id, context.review, context.ordinary,subject.versionId);
    const coverage = entry.historyContext?.coveredUntil !== null && entry.historyContext?.coveredUntil !== undefined && context.year !== undefined && context.year > entry.historyContext.coveredUntil ? "unknown" : associationAtYear(entry.time, context.year);
    accounts = links.links.filter(link => link.kind === "geography").map(link => ({ id: link.id, relationship: link.eventType, coverage,...entry.historyContext?{source:{kind:"history" as const,id:entry.id,versionId:entry.historyContext.versionId}}:{} }));
    // Event participants do not imply that every current residence was their
    // location during the event. Only explicit event-place links locate it.
  }
  if(subject.kind==="campaign"){
    if(context.ordinary)throw missing();
    const association=(await worldCampaignAssociations(userId,worldId,context.review)).contexts.find(item=>item.id===subject.id&&item.timelineId===context.timelineId&&item.available&&item.ownershipAvailable);
    if(!association)throw missing();sourceName=association.campaignName;
  }
  // A record-to-map journey carries its exact original source. Re-authoring a
  // World head while the map is open must not replace the reader's chosen pin.
  // Resolve the actual saved relationship again; URL IDs alone assert nothing.
  let journeySource:WorldsRecordLink|undefined,journeyPlaces:string[]=[],journeyRealmMaps:string[]=[];
  if(subject.kind==="map"&&subject.source){
    const pin=subject.source;
    let relationship="Original record for this map journey",coverage:AssociationCoverage="unknown",name="",tab="history";
    if(pin.kind==="lore"){
      const record=await getPeople(userId,worldId,context.timelineId,pin.id,context.review,context.ordinary,pin.versionId);
      name=record.draft.name;tab=loreWorkspaceTab(record.family);
      const applicable=record.geographies.filter(g=>associationAtYear(g.time,context.year)!=="outside");
      journeyPlaces=applicable.flatMap(g=>[g.geographyId,...g.destinationId?[g.destinationId]:[]]);
      if(applicable.length){relationship=applicable.map(g=>g.relationshipType).join("; ");coverage=applicable.some(g=>associationAtYear(g.time,context.year)==="established")?"established":context.year===undefined?"current-reference":"unknown";}
      const bridges=await getWorldLinks(userId,worldId,context.timelineId,context.review,context.ordinary);
      const maps=bridges.links.filter(link=>!link.archived&&link.mode!=="excluded"&&link.draft.kind==="realm-map"&&link.source.lore.id===pin.id&&link.source.lore.versionId===pin.versionId&&associationPeriodAtYear(link.draft.beginning,link.draft.ending,context.year)!=="outside");
      journeyRealmMaps=maps.map(link=>link.source.target.id);
      if(maps.length&&!applicable.length){relationship=maps.map(link=>link.draft.label).join("; ");coverage=maps.some(link=>associationPeriodAtYear(link.draft.beginning,link.draft.ending,context.year)==="established")?"established":context.year===undefined?"current-reference":"unknown";}
    }else{
      const entry=await historyEntry(userId,worldId,context.timelineId,pin.id,context.review,context.ordinary,pin.versionId);
      const links=await milestoneLinks(userId,worldId,context.timelineId,pin.id,context.review,context.ordinary,pin.versionId);
      name=entry.title;coverage=associationAtYear(entry.time,context.year);
      if(coverage!=="outside")journeyPlaces=links.links.filter(link=>link.kind==="geography").map(link=>link.id);
    }
    journeySource={...pin,name,relationship,coverage,href:worldContextUrl(context,{tab,[pin.kind==="lore"?"entity":"entry"]:pin.id,[pin.kind==="lore"?"loreVersion":"historyVersion"]:pin.versionId})};
  }
  return db.transaction(async tx => {
    await selectedTimeline(tx, worldId, context.timelineId);
    if (subject.kind === "map") {
      if (context.ordinary) throw missing();
      const found = await relatedToMap(tx, userId, context, permissions, subject.target, subject.scope, subject.objectId);
      sourceName = found.name; records.push(...found.records);
      if(journeySource){
        if(!journeyPlaces.some(id=>found.placeIds.includes(id))&&!journeyRealmMaps.includes(subject.target.id)&&!found.records.some(record=>subject.source?.territory&&record.kind===subject.source.kind&&record.id===subject.source.id&&record.versionId===subject.source.versionId&&record.territoryId===subject.source.territory.id&&record.associationId===subject.source.territory.relationshipId&&record.associationVersionId===subject.source.territory.mapVersionId))throw new WorldError("This exact World source does not establish a relationship with the selected map. Its original source remains retained.",409);
        records.push({...journeySource,coverage:found.coverage==="unknown"?"unknown":journeySource.coverage});
      }
    } else if (["town", "place", "shop"].includes(subject.kind) && "id" in subject) {
      const [place] = await tx.select().from(worldGeography).where(and(eq(worldGeography.id, subject.id), eq(worldGeography.worldId, worldId), context.ordinary ? ordinaryPlace() : undefined));
      if (!place) throw missing(); sourceName = place.name;
      if (subject.kind === "shop") {
        const [shop] = await tx.select().from(worldShop).where(and(eq(worldShop.geographyId, subject.id), eq(worldShop.worldId, worldId))); if (!shop) throw missing();
        const branches = bounded(await tx.select().from(worldShopLocation).where(and(eq(worldShopLocation.worldId, worldId), eq(worldShopLocation.shopId, subject.id), subject.branchId ? eq(worldShopLocation.id, subject.branchId) : undefined, isNull(worldShopLocation.removedAt))).limit(101), 100, "Shop branch selection");
        accounts = branches.map(branch => ({ id: branch.placeId ?? branch.townId, branchId: branch.id, shopId: subject.id, relationship: "Saved Shop branch; its dated map appearance is independent of current commerce settings", coverage: context.year === undefined ? "current-reference" : "established" }));
      } else {
        const table = subject.kind === "town" ? worldSettlementProfile : worldTownPlace;
        const [identity] = await tx.select().from(table).where(and(eq(table.geographyId, subject.id), eq(table.worldId, worldId))); if (!identity) throw missing();
        accounts = [{ id: subject.id, relationship: `Saved ${subject.kind} identity`, coverage: context.year === undefined ? "current-reference" : "established" }];
      }
    } else if (subject.kind === "calendar" || subject.kind === "chronology") {
      // Reuse the existing society-time bridge, including protected source
      // filtering. This is contextual navigation, not a physical calendar pin.
      const links = await getWorldLinks(userId, worldId, context.timelineId, context.review, context.ordinary);
      const choice = subject.kind === "calendar" ? links.choices.calendars.find(choice => choice.id === subject.id) : links.choices.dating.find(choice => choice.id === subject.id);
      if (!choice) throw missing(); sourceName = choice.name;
      for (const link of links.links.filter(link => !link.archived && link.mode !== "excluded" && link.draft.kind === "society-time" && (link.draft.calendarId === subject.id || link.draft.datingSystemId === subject.id))) records.push({ id: link.source.lore.id, kind: "lore", name: link.source.lore.name, relationship: link.draft.label, coverage: associationPeriodAtYear(link.draft.beginning, link.draft.ending, context.year), versionId: link.source.lore.versionId, associationId: link.id, associationVersionId: link.versionId, href: worldContextUrl(context, { tab: loreWorkspaceTab(link.source.lore.family), entity: link.source.lore.id, loreVersion: link.source.lore.versionId }) });
    }
    const maps = context.ordinary ? [] : await placeRepresentations(tx, userId, context, permissions, accounts.filter(account => account.coverage !== "outside"));
    if(subject.kind==="lore"&&context.year!==undefined&&!context.ordinary){
      const candidates=bounded((await tx.execute<{id:string;name:string}>(sql`select canvas.map_id id,m.name from world_map_canvas canvas join world_atlas_map m on m.id=canvas.map_id and m.world_id=canvas.world_id where canvas.world_id=${worldId} and exists(
        select 1 from world_map_state_head head join world_map_state_version v on v.id=head.version_id and v.world_id=head.world_id
        join world_map_state_component_ref ref on ref.version_id=v.id and ref.key='territories' join world_map_state_component component on component.id=ref.component_id and component.world_id=ref.world_id
        cross join lateral jsonb_array_elements(component.payload->'territories') territory cross join lateral jsonb_array_elements(territory->'relationships') relationship
        where head.world_id=${worldId} and head.timeline_id=${context.timelineId} and v.payload->'nativeAtlas'->'target'->>'kind'='terrain' and v.payload->'nativeAtlas'->'target'->>'id'=canvas.map_id and relationship->>'entityId'=${subject.id}
      ) order by canvas.map_id limit 65`)).rows,64,"political map inventory");
      for(const map of candidates){
        const target={kind:"terrain" as const,id:map.id},reading=await mapReading(tx,userId,context,permissions,target,map.name);
        if(!reading.context)continue;
        for(const {territory,relationships,mapVersionId} of await nativeTerritoriesForDiscovery(tx,reading.context))for(const relationship of relationships.filter(r=>r.entityId===subject.id&&(!subject.versionId||r.versionId===subject.versionId))){
          const focus=nativeTerritoryFocus(territory);if(!focus)continue;
          maps.push(representation(context,target,reading,{id:territory.id,relationship:`${territory.name}: ${relationship.roleLabel||relationship.role} (political source revision ${relationship.revision})`,coverage:"established",source:{kind:"lore",id:relationship.entityId,versionId:relationship.versionId,territory:{id:territory.id,relationshipId:relationship.id,mapVersionId}}},focus.point,territory.id,territory.name,focus.frame));
        }
      }
    }
    for (const map of directMaps.filter(map => map.account.coverage !== "outside")) {
      const [native] = await tx.select({ name: worldAtlasMap.name }).from(worldMapCanvas).innerJoin(worldAtlasMap, and(eq(worldAtlasMap.id, worldMapCanvas.mapId), eq(worldAtlasMap.worldId, worldId))).where(and(eq(worldMapCanvas.worldId, worldId), eq(worldMapCanvas.mapId, map.id)));
      if (!native) continue;
      const reading = await mapReading(tx, userId, context, permissions, { kind: "terrain", id: map.id }, native.name);
      maps.push(representation(context, { kind: "terrain", id: map.id }, reading, map.account));
    }
    return { worldId, timelineId: context.timelineId, year: context.year, sourceName, records: [...new Map(records.map(record => [`${record.kind}:${record.id}:${record.associationId ?? ""}:${record.versionId ?? ""}`, record])).values()], maps: [...new Map(maps.map(map => [map.id, map])).values()],
      explanation: context.ordinary ? "Atlas positions are unavailable in ordinary-knowledge views. Only authorized World relationships are shown." : subject.kind === "calendar" || subject.kind === "chronology" ? "This timekeeping record has no physical position. Saved society relationships provide contextual navigation." : subject.kind === "campaign" ? "A Campaign association supplies World, timeline and year context, not a geographic position." : !maps.length && !records.length ? "No geographic relationship or map representation is established here. Saved records remain available; no location has been inferred." : context.year === undefined ? "Current reference. These saved relationships do not assert historical coverage." : `Year ${context.year}. Unknown relationship or map coverage remains unknown; every link opens a separate view to preserve unfinished work.`,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

async function relatedToMap(tx: HistoryTx, userId: string, context: WorldAtlasContext, permissions: Permissions, target: NativeMapTarget, scope?: NativeHistoryScope, objectId?: string) {
  const records: WorldsRecordLink[] = [], placeIds = new Set<string>(), branchIds = new Set<string>();
  let name = "Selected map",mapCoverage:AssociationCoverage=context.year===undefined?"current-reference":"unknown";
  if (target.kind === "terrain") {
    const [map] = await tx.select().from(worldAtlasMap).innerJoin(worldMapCanvas, eq(worldMapCanvas.mapId, worldAtlasMap.id)).where(and(eq(worldAtlasMap.id, target.id), eq(worldAtlasMap.worldId, context.worldId)));
    if (!map) throw missing();
    name = map.world_atlas_map.name;
    if (map.world_atlas_map.geographyId) placeIds.add(map.world_atlas_map.geographyId);
    const reading = await mapReading(tx, userId, context, permissions, target, name, scope);mapCoverage=reading.coverage;
    if (reading.context) {
      name = reading.name;
      for(const {territory,relationships,mapVersionId} of await nativeTerritoriesForDiscovery(tx,reading.context)){
        if(objectId&&objectId!==territory.id&&!territory.boundaries.some(b=>b.id===objectId))continue;
        for(const geographyId of territory.geographyIds)placeIds.add(geographyId);
        for(const relationship of relationships)records.push({id:relationship.entityId,kind:"lore",name:relationship.entityName,relationship:`${territory.name}: ${relationship.roleLabel||relationship.role}`,coverage:"established",versionId:relationship.versionId,territoryId:territory.id,associationId:relationship.id,associationVersionId:mapVersionId,href:worldContextUrl(context,{tab:loreWorkspaceTab(relationship.family),entity:relationship.entityId,loreVersion:relationship.versionId})});
        // A source citation remains a citation; it does not place that event here.
        for(const citation of territory.history)records.push({id:citation.entityId,kind:"history",name:citation.name,relationship:`Territorial source citation for ${territory.name}; event location is not inferred`,coverage:"unknown",versionId:citation.versionId,href:worldContextUrl(context,{tab:"history",entry:citation.entityId,historyVersion:citation.versionId})});
      }
      const values = ((await nativeResource(tx, reading.context, "places")).payload as unknown as TownBundle).placements, conditions = (await nativeConditions(tx, reading.context)).values;
      for (const place of values.filter(place => !place.removed && (!objectId || place.id === objectId) && nativeObjectPresent(conditions, place.id))) placeIds.add(place.townId);
    } else if (context.year === undefined) {
      const values = await tx.select().from(worldMapPlace).where(and(eq(worldMapPlace.worldId, context.worldId), eq(worldMapPlace.mapId, target.id), isNull(worldMapPlace.removedAt), objectId ? eq(worldMapPlace.id, objectId) : undefined));
      for (const place of values) placeIds.add(place.geographyId);
    }
  } else if (target.kind === "town") {
    const [map] = await tx.select().from(worldTownMap).where(and(eq(worldTownMap.id, target.id), eq(worldTownMap.worldId, context.worldId)));
    if (!map) throw missing(); name = map.name;placeIds.add(map.townId);
    const reading = await mapReading(tx, userId, context, permissions, target, name, scope);mapCoverage=reading.coverage;
    const document = reading.context ? ((await nativeResource(tx, reading.context, "town")).payload as unknown as { bundle: TownMapBundle }).bundle.document : context.year === undefined ? map : undefined;
    if (document) {
      placeIds.add(map.townId);
      const conditions = reading.context ? (await nativeConditions(tx, reading.context)).values : [];
      for (const feature of document.design.features.filter(feature => !feature.archived && (!objectId || feature.id === objectId) && nativeObjectPresent(conditions, feature.id))) { if (feature.placeId) placeIds.add(feature.placeId); if (feature.shopLocationId) branchIds.add(feature.shopLocationId); }
    }
  } else if (target.kind==="floor") {
    const [identity]=await tx.select({floor:worldBuildingFloor,building:worldBuildingInterior}).from(worldBuildingFloor).innerJoin(worldBuildingInterior,and(eq(worldBuildingInterior.id,worldBuildingFloor.buildingId),eq(worldBuildingInterior.worldId,worldBuildingFloor.worldId))).where(and(eq(worldBuildingFloor.id,target.id),eq(worldBuildingFloor.worldId,context.worldId)));
    if(!identity)throw missing();name=identity.floor.name;
    const reading=await mapReading(tx,userId,context,permissions,target,name,scope);mapCoverage=reading.coverage;name=reading.name;
    const building=reading.context?((await nativeResource(tx,reading.context,"floor")).payload as unknown as {bundle:FloorBundle}).bundle.building:context.year===undefined&&!identity.floor.nativeOriginVersionId?identity.building:undefined;
    if(building){placeIds.add(building.townId);if(building.placeId)placeIds.add(building.placeId);}
  } else if(target.kind==="underground") {
    const [identity]=await tx.select({level:worldUndergroundLevel,site:worldUndergroundSite}).from(worldUndergroundLevel).innerJoin(worldUndergroundSite,and(eq(worldUndergroundSite.id,worldUndergroundLevel.siteId),eq(worldUndergroundSite.worldId,worldUndergroundLevel.worldId))).where(and(eq(worldUndergroundLevel.id,target.id),eq(worldUndergroundLevel.worldId,context.worldId)));
    if(!identity)throw missing();name=identity.level.name;
    const reading=await mapReading(tx,userId,context,permissions,target,name,scope);mapCoverage=reading.coverage;name=reading.name;
    const site=reading.context?((await nativeResource(tx,reading.context,"underground")).payload as unknown as {bundle:UndergroundBundle}).bundle.sites.find(site=>site.id===identity.site.id):context.year===undefined&&!identity.level.nativeOriginVersionId?identity.site:undefined;
    if(site?.placeId)placeIds.add(site.placeId);
  } else if (scope) {
    const reading = await mapReading(tx, userId, context, permissions, target, name, scope);mapCoverage=reading.coverage; name = reading.name;
    // Connected maps keep their original identities and relationships. Their
    // recorded surface/parent links are handled by the native entrance reader.
  }
  if (branchIds.size) {
    const rows = await tx.select().from(worldShopLocation).where(and(eq(worldShopLocation.worldId, context.worldId), inArray(worldShopLocation.id, [...branchIds])));
    for (const row of rows) { placeIds.add(row.shopId); if (row.placeId) placeIds.add(row.placeId); }
  }
  const places = placeIds.size ? bounded(await tx.select().from(worldGeography).where(and(eq(worldGeography.worldId, context.worldId), inArray(worldGeography.id, [...placeIds]), context.ordinary ? ordinaryPlace() : undefined)).limit(2001), 2000, "mapped place selection") : [];
  for (const place of places) {
    const [town] = await tx.select({ id: worldSettlementProfile.geographyId }).from(worldSettlementProfile).where(and(eq(worldSettlementProfile.worldId, context.worldId), eq(worldSettlementProfile.geographyId, place.id)));
    const [shop] = await tx.select({ id: worldShop.geographyId }).from(worldShop).where(and(eq(worldShop.worldId, context.worldId), eq(worldShop.geographyId, place.id)));
    const kind = town ? "town" : shop ? "shop" : "place";
    records.push({ id: place.id, kind, name: place.name, relationship: "Original saved World identity", coverage: context.year === undefined ? "current-reference" : "established", href: worldContextUrl(context, { tab: "towns", town: town ? place.id : undefined, townSection: shop ? "shops" : town ? "towns" : "places", worldRecord: place.id }) });
  }
  if (places.length) {
    const ids = places.map(place => place.id);
    const loreRows = bounded(await tx.select({ h: worldLoreHead, v: worldLoreVersion, g: worldLoreGeography, name: worldLoreDisplay.name }).from(worldLoreGeography)
      .innerJoin(worldLoreHead, and(eq(worldLoreHead.versionId, worldLoreGeography.versionId), eq(worldLoreHead.timelineId, context.timelineId)))
      .innerJoin(worldLoreVersion, eq(worldLoreVersion.id, worldLoreHead.versionId)).innerJoin(worldLoreDisplay, eq(worldLoreDisplay.versionId, worldLoreVersion.id))
      .where(and(eq(worldLoreGeography.worldId, context.worldId), sql`(${worldLoreGeography.geographyId} in (${sql.join(ids.map(id => sql`${id}`), sql`,`)}) or ${worldLoreGeography.destinationId} in (${sql.join(ids.map(id => sql`${id}`), sql`,`)}))`, inArray(worldLoreHead.mode, usable), context.ordinary ? ordinaryLoreSource(context.worldId, context.timelineId, sql`${worldLoreVersion.id}`) : undefined, context.ordinary ? eq(worldLoreGeography.protected, false) : undefined)).limit(2001), 2000, "World geographic relationships");
    for (const row of loreRows) {
      const coverage = associationAtYear(row.g.time, context.year); if (coverage === "outside") continue;
      records.push({ id: row.h.entityId, kind: "lore", name: row.name, relationship: row.g.relationshipType + (row.g.account ? `: ${row.g.account}` : ""), coverage, versionId: row.v.id, associationId: row.g.id, href: worldContextUrl(context, { tab: loreWorkspaceTab(row.v.family), entity: row.h.entityId, loreVersion: row.v.id }) });
    }
    const events = bounded(await tx.select({ h: worldHistoryHead, v: worldHistoryVersion, type: worldHistoryVersionEntity.eventType }).from(worldHistoryVersionEntity)
      .innerJoin(worldHistoryHead, and(eq(worldHistoryHead.versionId, worldHistoryVersionEntity.versionId), eq(worldHistoryHead.timelineId, context.timelineId)))
      .innerJoin(worldHistoryVersion, eq(worldHistoryVersion.id, worldHistoryHead.versionId))
      .where(and(eq(worldHistoryVersionEntity.worldId, context.worldId), inArray(worldHistoryVersionEntity.geographyId, ids), inArray(worldHistoryHead.mode, [...usable, "partial"]), context.ordinary ? ordinaryHistorySource(context.worldId, context.timelineId, sql`${worldHistoryVersion.id}`) : undefined)).limit(2001), 2000, "place milestones");
    for (const event of events) {
      const entry = event.v.payload as EntryRecord;
      const coverage = context.year !== undefined && event.h.coveredUntil !== null && context.year > event.h.coveredUntil ? "unknown" : associationAtYear(entry.time, context.year); if (coverage === "outside") continue;
      records.push({ id: event.h.entityId, kind: "history", name: entry.title, relationship: event.type, coverage, versionId: event.v.id, href: worldContextUrl(context, { tab: "history", entry: event.h.entityId, historyVersion: event.v.id }) });
    }
  }
  const links = await getWorldLinks(userId, context.worldId, context.timelineId, context.review, context.ordinary);
  for (const link of links.links.filter(link => !link.archived && link.mode !== "excluded" && link.draft.kind === "realm-map" && link.source.target.id === target.id)) {
    const coverage = associationPeriodAtYear(link.draft.beginning, link.draft.ending, context.year); if (coverage === "outside") continue;
    records.push({ id: link.source.lore.id, kind: "lore", name: link.source.lore.name, relationship: link.draft.label, coverage, versionId: link.source.lore.versionId, associationId: link.id, associationVersionId: link.versionId, href: worldContextUrl(context, { tab: "cosmology", entity: link.source.lore.id, loreVersion: link.source.lore.versionId }) });
  }
  const mappedSources=records.filter(record=>record.kind==="lore"&&record.versionId);
  for(const link of links.links.filter(link=>!link.archived&&link.mode!=="excluded"&&!link.unavailable&&link.draft.kind==="society-time"&&mappedSources.some(record=>record.id===link.source.lore.id&&record.versionId===link.source.lore.versionId))){
    const coverage=associationPeriodAtYear(link.draft.beginning,link.draft.ending,context.year);if(coverage==="outside")continue;
    const calendar=link.draft.kind==="society-time"&&link.draft.calendarId,kind=calendar?"calendar" as const:"chronology" as const;
    records.push({id:link.source.target.id,kind,name:link.source.target.name,relationship:`${link.draft.label}; timekeeping for ${link.source.lore.name}, without a physical calendar position`,coverage,associationId:link.id,associationVersionId:link.versionId,href:worldContextUrl(context,calendar?{tab:"calendars",calendar:link.source.target.id,calendarVersion:link.source.target.calendarVersionId}:{tab:"chronology",datingSystem:link.source.target.id})});
  }
  if(!context.ordinary){
    const associations=await worldCampaignAssociations(userId,context.worldId,context.review);
    for(const item of associations.contexts.filter(item=>item.available&&item.ownershipAvailable&&item.timelineId===context.timelineId))records.push({id:item.id,kind:"campaign",name:item.campaignName,relationship:"Campaign context associated with this World and timeline; no map position or historical existence period is inferred",coverage:"current-reference",associationId:item.id,href:worldContextUrl(context,{tab:"campaigns",worldCampaignContext:item.id})});
  }
  return {name,placeIds:[...placeIds],coverage:mapCoverage,records:records.map(record=>mapCoverage==="unknown"?{...record,coverage:"unknown" as const}:record)};
}
