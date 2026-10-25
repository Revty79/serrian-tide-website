import type {TerrainSource} from "@/features/worlds/terrain-source";
import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { worldAtlasMap } from "./world-atlas-schema";
import { world } from "./world-schema";
import { user } from "./auth-schema";

// Terrain owns numerical geography. Map canvases own its representations.
export const worldTerrain = pgTable("world_terrain", {
  id: text("id").primaryKey(), worldId: text("world_id").notNull().references(() => world.id, { onDelete: "restrict" }), format: integer("format").notNull().default(1),
  gridWidth: integer("grid_width").notNull(), gridHeight: integer("grid_height").notNull(), tileSize: integer("tile_size").notNull().default(32),
  widthMetres: doublePrecision("width_metres").notNull(), heightMetres: doublePrecision("height_metres").notNull(), coordinateReference: text("coordinate_reference").notNull().default("LOCAL:METRES"), wrap: boolean("wrap_east_west").notNull().default(false),
  minElevation: integer("min_elevation").notNull(), maxElevation: integer("max_elevation").notNull(), baseElevation: integer("base_elevation").notNull(), seaLevel: integer("sea_level").notNull().default(0),
  revision: integer("revision").notNull().default(1), creationHash: text("creation_hash").notNull(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => [unique("world_terrain_id_world_uq").on(t.id, t.worldId),
  check("world_terrain_valid", sql`${t.format}=1 AND ${t.gridWidth} BETWEEN 32 AND 1024 AND ${t.gridHeight} BETWEEN 32 AND 1024 AND ${t.gridWidth}%32=0 AND ${t.gridHeight}%32=0 AND ${t.tileSize}=32 AND ${t.widthMetres} BETWEEN 100 AND 1000000000 AND ${t.heightMetres} BETWEEN 100 AND 1000000000 AND ${t.coordinateReference}='LOCAL:METRES' AND ${t.minElevation} BETWEEN -30000 AND -1 AND ${t.maxElevation} BETWEEN 1 AND 30000 AND ${t.baseElevation} BETWEEN ${t.minElevation} AND ${t.maxElevation} AND ${t.seaLevel} BETWEEN ${t.minElevation} AND ${t.maxElevation} AND ${t.revision}>0 AND ${t.creationHash} ~ '^[a-f0-9]{64}$'`)]);

export const worldMapCanvas = pgTable("world_map_canvas", {
  mapId: text("map_id").primaryKey(), worldId: text("world_id").notNull(), terrainId: text("terrain_id").notNull(),
  topology: text("topology").notNull().default("plane"), purpose: text("purpose").notNull().default("world"), rendering: jsonb("rendering").$type<{ version: 1; style: "elevation-relief" }>().notNull().default({ version: 1, style: "elevation-relief" }),
}, t => [unique("world_map_canvas_world_uq").on(t.mapId, t.worldId),
  foreignKey({ name: "world_map_canvas_identity_fk", columns: [t.mapId, t.worldId], foreignColumns: [worldAtlasMap.id, worldAtlasMap.worldId] }).onDelete("restrict"),
  foreignKey({ name: "world_map_canvas_terrain_fk", columns: [t.terrainId, t.worldId], foreignColumns: [worldTerrain.id, worldTerrain.worldId] }).onDelete("restrict"),
  check("world_map_canvas_valid", sql`${t.topology}='plane' AND ${t.purpose}='world' AND ${t.rendering}='{"version":1,"style":"elevation-relief"}'::jsonb`)]);

export const worldTerrainVersion = pgTable("world_terrain_version", {
  terrainId: text("terrain_id").notNull(), worldId: text("world_id").notNull(), revision: integer("revision").notNull(), previousRevision: integer("previous_revision"),
  source:jsonb("source").$type<TerrainSource>().notNull().default({kind:"legacy"}),requestId: text("request_id").notNull().unique(), contentHash: text("content_hash").notNull(), seaLevel: integer("sea_level").notNull(), authorId: text("author_id").notNull().references(() => user.id, { onDelete: "restrict" }), createdAt: timestamp("created_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.terrainId, t.revision] }), unique("world_terrain_version_world_uq").on(t.terrainId, t.worldId, t.revision),
  foreignKey({ name: "world_terrain_version_terrain_fk", columns: [t.terrainId, t.worldId], foreignColumns: [worldTerrain.id, worldTerrain.worldId] }).onDelete("restrict"),
  foreignKey({ name: "world_terrain_version_parent_fk", columns: [t.terrainId, t.worldId, t.previousRevision], foreignColumns: [t.terrainId, t.worldId, t.revision] }).onDelete("restrict"),
  check("world_terrain_version_source_valid",sql`jsonb_typeof(${t.source})='object' AND ${t.source}->>'kind' IN ('legacy','manual','blank','generated','imported','regenerated')`),check("world_terrain_version_valid", sql`${t.revision}>0 AND ((${t.revision}=1 AND ${t.previousRevision} IS NULL) OR (${t.previousRevision} IS NOT NULL AND ${t.previousRevision}=${t.revision}-1)) AND ${t.seaLevel} BETWEEN -30000 AND 30000 AND ${t.contentHash} ~ '^[a-f0-9]{64}$'`)]);

export const worldTerrainTile = pgTable("world_terrain_tile", {
  terrainId: text("terrain_id").notNull(), worldId: text("world_id").notNull(), revision: integer("revision").notNull(), level: integer("detail_level").notNull().default(0), x: integer("tile_x").notNull(), y: integer("tile_y").notNull(),
  manualProtection:text("manual_protection").notNull().default("legacy"),sha256: text("sha256").notNull(), bytes: integer("bytes").notNull(), encoding: text("encoding").notNull().default("i16le-v1"),
}, t => [primaryKey({ columns: [t.terrainId, t.level, t.x, t.y, t.revision] }),
  foreignKey({ name: "world_terrain_tile_version_fk", columns: [t.terrainId, t.worldId, t.revision], foreignColumns: [worldTerrainVersion.terrainId, worldTerrainVersion.worldId, worldTerrainVersion.revision] }).onDelete("restrict"),
  check("world_terrain_tile_protection_valid",sql`${t.manualProtection}='legacy' OR (${t.manualProtection} ~ '^[a-f0-9]+$' AND length(${t.manualProtection})=256)`),
  check("world_terrain_tile_valid", sql`${t.level}=0 AND ${t.x} BETWEEN 0 AND 31 AND ${t.y} BETWEEN 0 AND 31 AND ${t.sha256} ~ '^[a-f0-9]{64}$' AND ${t.bytes}=2048 AND ${t.encoding}='i16le-v1'`)]);
