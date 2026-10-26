import {sql} from "drizzle-orm";
import {pgTable,text,integer,jsonb,timestamp,foreignKey,check,unique,primaryKey} from "drizzle-orm/pg-core";
import {worldMapCanvas} from "./world-terrain-schema";
import {user} from "./auth-schema";
import type {TerrainMaterials} from "@/features/worlds/terrain-materials";
export const worldTerrainMaterial=pgTable("world_terrain_material",{
 mapId:text("map_id").primaryKey(),worldId:text("world_id").notNull(),revision:integer("revision").notNull(),layer:jsonb("layer").$type<TerrainMaterials>().notNull(),updatedBy:text("updated_by_user_id").notNull(),updatedAt:timestamp("updated_at").defaultNow().notNull(),
},t=>[foreignKey({name:"world_terrain_material_map_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldMapCanvas.mapId,worldMapCanvas.worldId]}).onDelete("restrict"),foreignKey({name:"world_terrain_material_editor_fk",columns:[t.updatedBy],foreignColumns:[user.id]}).onDelete("restrict"),check("world_terrain_material_valid",sql`${t.revision}>0 AND ${t.layer}->>'version'='1' AND jsonb_typeof(${t.layer}->'strokes')='array'`)]);
export const worldTerrainMaterialVersion=pgTable("world_terrain_material_version",{
 mapId:text("map_id").notNull(),revision:integer("revision").notNull(),layer:jsonb("layer").$type<TerrainMaterials>().notNull(),requestId:text("request_id").notNull(),createdBy:text("created_by_user_id").notNull(),createdAt:timestamp("created_at").defaultNow().notNull(),
},t=>[primaryKey({name:"world_terrain_material_version_pk",columns:[t.mapId,t.revision]}),unique("world_terrain_material_version_request_uq").on(t.requestId),foreignKey({name:"world_terrain_material_version_map_fk",columns:[t.mapId],foreignColumns:[worldTerrainMaterial.mapId]}).onDelete("restrict"),foreignKey({name:"world_terrain_material_version_author_fk",columns:[t.createdBy],foreignColumns:[user.id]}).onDelete("restrict"),check("world_terrain_material_version_valid",sql`${t.revision}>0 AND ${t.layer}->>'version'='1' AND jsonb_typeof(${t.layer}->'strokes')='array'`)]);
