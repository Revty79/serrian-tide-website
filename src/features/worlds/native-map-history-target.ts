import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { worldAtlasMap } from "@/db/world-atlas-schema";
import { worldMapCanvas, worldTerrain } from "@/db/world-terrain-schema";
import { worldMapRegion } from "@/db/world-map-region-schema";
import { worldMapStateVersion } from "@/db/world-map-state-schema";
import { worldTownMap } from "@/db/world-town-map-schema";
import { worldBuildingFloor, worldBuildingInteriorSource } from "@/db/world-building-floor-schema";
import { worldUndergroundLevel } from "@/db/world-underground-schema";
import { worldCraft, worldCraftDeck, worldCraftPlacement } from "@/db/world-craft-schema";
import { nativeMapTargetSchema, type NativeMapTarget } from "./native-map-history";
import { WorldError } from "./world-service";

export type NativeHistoryRead = Pick<typeof db, "select" | "execute">;
export type NativeTargetInfo = {
  target: NativeMapTarget; anchorMapId: string; name: string; revision: number; archived: boolean;
  baselineAvailable?:boolean;townMapId?: string; featureId?: string; buildingId?: string; craftId?: string; siteId?: string;
};
const missing = () => new WorldError("This historical map target or its established source is unavailable.", 404);
async function nativeOriginAnchor(tx:NativeHistoryRead,worldId:string,versionId:string|null){
  if(!versionId)return;
  const [source]=await tx.select({mapId:worldMapStateVersion.mapId}).from(worldMapStateVersion).where(and(eq(worldMapStateVersion.id,versionId),eq(worldMapStateVersion.worldId,worldId)));
  if(!source)throw missing();return source.mapId;
}
async function storageAnchor(tx: NativeHistoryRead, worldId: string, sourceMapId?: string) {
  if (sourceMapId) {
    const [map] = await tx.select().from(worldMapCanvas).where(and(eq(worldMapCanvas.mapId, sourceMapId), eq(worldMapCanvas.worldId, worldId)));
    if (!map) throw missing();
    if (map.purpose === "world") return map.mapId;
    const [region] = await tx.select({ parentMapId: worldMapRegion.parentMapId }).from(worldMapRegion).where(and(eq(worldMapRegion.mapId, sourceMapId), eq(worldMapRegion.worldId, worldId)));
    if (!region) throw missing(); return region.parentMapId;
  }
  // An unplaced craft/underground plan has no invented geographic placement.
  // This is only the existing map-state FK anchor, never a position or coverage claim.
  const [row] = await tx.select({ id: worldMapCanvas.mapId }).from(worldMapCanvas)
    .innerJoin(worldAtlasMap, and(eq(worldAtlasMap.id, worldMapCanvas.mapId), eq(worldAtlasMap.worldId, worldId)))
    .where(and(eq(worldMapCanvas.worldId, worldId), eq(worldMapCanvas.purpose, "world")))
    .orderBy(asc(worldAtlasMap.createdAt), asc(worldAtlasMap.id)).limit(1);
  if (!row) throw new WorldError("Create an accepted World terrain map before authoring dated Atlas content. Existing plans remain intact.", 409);
  return row.id;
}
export async function nativeTargetInfo(tx: NativeHistoryRead, worldId: string, input: NativeMapTarget): Promise<NativeTargetInfo> {
  const target = nativeMapTargetSchema.parse(input);
  if (target.kind === "terrain") {
    const [row] = await tx.select({ map: worldAtlasMap, terrain: worldTerrain }).from(worldMapCanvas)
      .innerJoin(worldAtlasMap, and(eq(worldAtlasMap.id, worldMapCanvas.mapId), eq(worldAtlasMap.worldId, worldId)))
      .innerJoin(worldTerrain, and(eq(worldTerrain.id, worldMapCanvas.terrainId), eq(worldTerrain.worldId, worldId)))
      .where(and(eq(worldMapCanvas.mapId, target.id), eq(worldMapCanvas.worldId, worldId)));
    if (!row) throw missing();
    return { target, anchorMapId: await storageAnchor(tx, worldId, target.id), name: row.map.name, revision: row.terrain.revision, archived: !!row.map.archivedAt };
  }
  if (target.kind === "town") {
    const [row] = await tx.select().from(worldTownMap).where(and(eq(worldTownMap.id, target.id), eq(worldTownMap.worldId, worldId)));
    if (!row) throw missing();
    return { target,baselineAvailable:!row.nativeOriginVersionId, anchorMapId: row.sourceMapId, name: row.name, revision: row.revision, archived: row.archived, townMapId: row.id };
  }
  if (target.kind === "floor") {
    const [row] = await tx.select({ floor: worldBuildingFloor, binding: worldBuildingInteriorSource, town: worldTownMap })
      .from(worldBuildingFloor).innerJoin(worldBuildingInteriorSource, and(eq(worldBuildingInteriorSource.buildingId, worldBuildingFloor.buildingId), eq(worldBuildingInteriorSource.worldId, worldId)))
      .innerJoin(worldTownMap, and(eq(worldTownMap.id, worldBuildingInteriorSource.townMapId), eq(worldTownMap.worldId, worldId)))
      .where(and(eq(worldBuildingFloor.id, target.id), eq(worldBuildingFloor.worldId, worldId)))
      .orderBy(asc(worldBuildingInteriorSource.id)).limit(1);
    if (!row) throw missing();
    return { target,baselineAvailable:!row.floor.nativeOriginVersionId, anchorMapId: row.town.sourceMapId, name: row.floor.name, revision: row.floor.revision, archived: row.floor.archived, townMapId: row.town.id, featureId: row.binding.featureId, buildingId: row.floor.buildingId };
  }
  if (target.kind === "underground") {
    const [row] = await tx.select().from(worldUndergroundLevel).where(and(eq(worldUndergroundLevel.id, target.id), eq(worldUndergroundLevel.worldId, worldId)));
    if (!row) throw missing();
    return { target,baselineAvailable:!row.nativeOriginVersionId, anchorMapId: await nativeOriginAnchor(tx,worldId,row.nativeOriginVersionId)??await storageAnchor(tx, worldId), name: row.name, revision: row.revision, archived: row.archived, siteId: row.siteId };
  }
  const [deck] = target.kind === "deck" ? await tx.select().from(worldCraftDeck).where(and(eq(worldCraftDeck.id, target.id), eq(worldCraftDeck.worldId, worldId))) : [];
  if (target.kind === "deck" && !deck) throw missing();
  const [craft] = await tx.select().from(worldCraft).where(and(eq(worldCraft.id, deck?.craftId ?? target.id), eq(worldCraft.worldId, worldId)));
  if (!craft) throw missing();
  const [placement] = await tx.select().from(worldCraftPlacement).where(and(eq(worldCraftPlacement.craftId, craft.id), eq(worldCraftPlacement.worldId, worldId)));
  const [retained] = await tx.select({ mapId: worldMapStateVersion.mapId }).from(worldMapStateVersion)
    .where(and(eq(worldMapStateVersion.worldId, worldId), sql`${worldMapStateVersion.payload}->'nativeAtlas'->'target'->>'kind'=${target.kind} and ${worldMapStateVersion.payload}->'nativeAtlas'->'target'->>'id'=${target.id}`))
    .orderBy(asc(worldMapStateVersion.createdAt), asc(worldMapStateVersion.id)).limit(1);
  return { target,baselineAvailable:!(deck?.nativeOriginVersionId??craft.nativeOriginVersionId), anchorMapId: retained?.mapId ?? await nativeOriginAnchor(tx,worldId,deck?.nativeOriginVersionId??craft.nativeOriginVersionId)??await storageAnchor(tx, worldId, placement?.sourceMapId), name: deck?.name ?? craft.name, revision: deck?.revision ?? craft.revision, archived: deck?.archived ?? craft.archived, craftId: craft.id };
}
