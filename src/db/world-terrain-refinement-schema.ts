import {sql} from "drizzle-orm";
import {check,doublePrecision,foreignKey,index,integer,jsonb,pgTable,primaryKey,text,timestamp,unique} from "drizzle-orm/pg-core";
import {worldTerrain,worldTerrainVersion} from "./world-terrain-schema";
import {user} from "./auth-schema";
import type {TerrainSource} from "@/features/worlds/terrain-source";

/** Sparse numerical coverage, independent of semantic Regions and map identities. */
export const worldTerrainRefinement=pgTable("world_terrain_refinement",{
 id:text("id").primaryKey(),worldId:text("world_id").notNull(),terrainId:text("terrain_id").notNull(),parentId:text("parent_id"),parentRevision:integer("parent_revision").notNull(),level:integer("detail_level").notNull(),name:text("name").notNull(),
 x:doublePrecision("x_metres").notNull(),y:doublePrecision("y_metres").notNull(),width:doublePrecision("width_metres").notNull(),height:doublePrecision("height_metres").notNull(),gridWidth:integer("grid_width").notNull(),gridHeight:integer("grid_height").notNull(),
 revision:integer("revision").notNull().default(1),creationHash:text("creation_hash").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),updatedAt:timestamp("updated_at").notNull().defaultNow(),
},t=>[
 unique("world_terrain_refinement_identity_uq").on(t.id,t.terrainId,t.worldId),index("world_terrain_refinement_parent_idx").on(t.terrainId,t.parentId),
 foreignKey({name:"world_terrain_refinement_root_fk",columns:[t.terrainId,t.worldId],foreignColumns:[worldTerrain.id,worldTerrain.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_terrain_refinement_parent_fk",columns:[t.parentId,t.terrainId,t.worldId],foreignColumns:[t.id,t.terrainId,t.worldId]}).onDelete("restrict"),
 check("world_terrain_refinement_valid",sql`${t.level} BETWEEN 1 AND 8 AND ${t.parentRevision}>0 AND ${t.revision}>0 AND length(${t.name}) BETWEEN 1 AND 160 AND ${t.x}>=0 AND ${t.x}<1000000000 AND ${t.y}>=0 AND ${t.y}<1000000000 AND ${t.width} BETWEEN 100 AND 1000000000 AND ${t.height} BETWEEN 100 AND 1000000000 AND ${t.gridWidth} IN (32,64,128,256,512,1024) AND ${t.gridHeight} IN (32,64,128,256,512,1024) AND ${t.creationHash} ~ '^[a-f0-9]{64}$'`),
]);

export const worldTerrainRefinementVersion=pgTable("world_terrain_refinement_version",{
 refinementId:text("refinement_id").notNull(),terrainId:text("terrain_id").notNull(),worldId:text("world_id").notNull(),revision:integer("revision").notNull(),previousRevision:integer("previous_revision"),parentRevision:integer("parent_revision").notNull(),rootRevision:integer("root_revision").notNull(),restoredFromRevision:integer("restored_from_revision"),
 requestId:text("request_id").notNull().unique(),contentHash:text("content_hash").notNull(),source:jsonb("source").$type<TerrainSource>().notNull(),authorId:text("author_id").notNull().references(()=>user.id,{onDelete:"restrict"}),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[
 primaryKey({columns:[t.refinementId,t.revision]}),unique("world_terrain_refinement_version_identity_uq").on(t.refinementId,t.terrainId,t.worldId,t.revision),
 foreignKey({name:"world_terrain_refinement_version_root_fk",columns:[t.terrainId,t.worldId,t.rootRevision],foreignColumns:[worldTerrainVersion.terrainId,worldTerrainVersion.worldId,worldTerrainVersion.revision]}).onDelete("restrict"),
 foreignKey({name:"world_terrain_refinement_version_surface_fk",columns:[t.refinementId,t.terrainId,t.worldId],foreignColumns:[worldTerrainRefinement.id,worldTerrainRefinement.terrainId,worldTerrainRefinement.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_terrain_refinement_version_previous_fk",columns:[t.refinementId,t.previousRevision],foreignColumns:[t.refinementId,t.revision]}).onDelete("restrict"),
 foreignKey({name:"world_terrain_refinement_version_restored_fk",columns:[t.refinementId,t.restoredFromRevision],foreignColumns:[t.refinementId,t.revision]}).onDelete("restrict"),
 check("world_terrain_refinement_version_valid",sql`${t.revision}>0 AND ${t.parentRevision}>0 AND ((${t.revision}=1 AND ${t.previousRevision} IS NULL) OR (${t.revision}>1 AND ${t.previousRevision} IS NOT NULL AND ${t.previousRevision}=${t.revision}-1)) AND ${t.contentHash} ~ '^[a-f0-9]{64}$' AND jsonb_typeof(${t.source})='object' AND coalesce(${t.source}->>'kind' IN ('manual','regenerated'),false)`),
]);

export const worldTerrainRefinementTile=pgTable("world_terrain_refinement_tile",{
 refinementId:text("refinement_id").notNull(),terrainId:text("terrain_id").notNull(),worldId:text("world_id").notNull(),revision:integer("revision").notNull(),lod:integer("lod").notNull().default(0),x:integer("tile_x").notNull(),y:integer("tile_y").notNull(),sha256:text("sha256").notNull(),bytes:integer("bytes").notNull(),encoding:text("encoding").notNull().default("i16le-v1"),manualProtection:text("manual_protection").notNull(),
},t=>[
 primaryKey({name:"world_terrain_refinement_tile_pk",columns:[t.refinementId,t.lod,t.x,t.y,t.revision]}),
 foreignKey({name:"world_terrain_refinement_tile_version_fk",columns:[t.refinementId,t.terrainId,t.worldId,t.revision],foreignColumns:[worldTerrainRefinementVersion.refinementId,worldTerrainRefinementVersion.terrainId,worldTerrainRefinementVersion.worldId,worldTerrainRefinementVersion.revision]}).onDelete("restrict"),
 check("world_terrain_refinement_tile_valid",sql`${t.lod} BETWEEN 0 AND 5 AND ${t.x} BETWEEN 0 AND 31 AND ${t.y} BETWEEN 0 AND 31 AND ${t.sha256} ~ '^[a-f0-9]{64}$' AND ${t.bytes}=2048 AND ${t.encoding}='i16le-v1' AND ${t.manualProtection} ~ '^[a-f0-9]+$' AND length(${t.manualProtection})=256`),
]);
