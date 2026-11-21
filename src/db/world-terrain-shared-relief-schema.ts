import {sql} from "drizzle-orm";
import {check,foreignKey,index,integer,jsonb,pgTable,text,timestamp,unique} from "drizzle-orm/pg-core";
import {user} from "./auth-schema";
import {worldMapCanvas,worldTerrain} from "./world-terrain-schema";
import type {SharedReliefOperation} from "@/features/worlds/terrain-shared-relief";
import type {SharedReliefSnapshot,SharedReliefEffect} from "@/features/worlds/terrain-shared-relief-spec";
import type {TerrainFrame} from "@/features/worlds/terrain-refinement";

/** One immutable receipt for an atomically published native relief operation. */
export const worldTerrainReliefGroup=pgTable("world_terrain_relief_group",{
 id:text("id").primaryKey(),worldId:text("world_id").notNull(),terrainId:text("terrain_id").notNull(),mapId:text("map_id").notNull(),
 mapPurpose:text("map_purpose").notNull().default("world"),action:text("action").$type<"apply"|"undo"|"redo">().notNull(),targetId:text("target_id"),
 contentHash:text("content_hash").notNull(),contextPin:text("context_pin").notNull(),previewHash:text("preview_hash").notNull(),seaLevel:integer("sea_level").notNull(),
 operation:jsonb("operation").$type<SharedReliefOperation>().notNull(),workArea:jsonb("work_area").$type<TerrainFrame>().notNull(),
 beforeState:jsonb("before_state").$type<SharedReliefSnapshot[]>().notNull(),afterState:jsonb("after_state").$type<SharedReliefSnapshot[]>().notNull(),
 effects:jsonb("effects").$type<SharedReliefEffect[]>().notNull(),authorId:text("author_id").notNull().references(()=>user.id,{onDelete:"restrict"}),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[
 unique("world_relief_group_world_identity").on(t.id,t.terrainId,t.worldId),index("world_relief_group_history_idx").on(t.terrainId,t.createdAt.desc(),t.id),
 foreignKey({name:"world_relief_group_root_fk",columns:[t.terrainId,t.worldId],foreignColumns:[worldTerrain.id,worldTerrain.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_relief_group_map_fk",columns:[t.mapId,t.worldId,t.terrainId,t.mapPurpose],foreignColumns:[worldMapCanvas.mapId,worldMapCanvas.worldId,worldMapCanvas.terrainId,worldMapCanvas.purpose]}).onDelete("restrict"),
 foreignKey({name:"world_relief_group_target_fk",columns:[t.targetId,t.terrainId,t.worldId],foreignColumns:[t.id,t.terrainId,t.worldId]}).onDelete("restrict"),
 check("world_terrain_relief_group_map_purpose_check",sql`${t.mapPurpose}='world'`),
 check("world_terrain_relief_group_action_check",sql`${t.action} IN ('apply','undo','redo')`),
 check("world_terrain_relief_group_content_hash_check",sql`${t.contentHash} ~ '^[a-f0-9]{64}$'`),
 check("world_terrain_relief_group_context_pin_check",sql`${t.contextPin} ~ '^[a-f0-9]{64}$'`),
 check("world_terrain_relief_group_preview_hash_check",sql`${t.previewHash} ~ '^[a-f0-9]{64}$'`),
 check("world_terrain_relief_group_sea_level_check",sql`${t.seaLevel} BETWEEN -30000 AND 30000`),
 check("world_terrain_relief_group_operation_check",sql`jsonb_typeof(${t.operation})='object' AND coalesce(${t.operation}->>'kind','') IN ('landform-profile','erosion')`),
 check("world_terrain_relief_group_work_area_check",sql`jsonb_typeof(${t.workArea})='object'`),
 check("world_terrain_relief_group_before_state_check",sql`jsonb_typeof(${t.beforeState})='array' AND jsonb_array_length(${t.beforeState}) BETWEEN 1 AND 129`),
 check("world_terrain_relief_group_after_state_check",sql`jsonb_typeof(${t.afterState})='array' AND jsonb_array_length(${t.afterState}) BETWEEN 1 AND 129`),
 check("world_terrain_relief_group_effects_check",sql`jsonb_typeof(${t.effects})='array'`),
 check("world_relief_group_action_target",sql`(${t.action}='apply' AND ${t.targetId} IS NULL) OR (${t.action} IN ('undo','redo') AND ${t.targetId} IS NOT NULL)`),
 check("world_relief_group_metadata_bound",sql`octet_length(${t.operation}::text)+octet_length(${t.workArea}::text)+octet_length(${t.beforeState}::text)+octet_length(${t.afterState}::text)+octet_length(${t.effects}::text)<=250000`),
]);
