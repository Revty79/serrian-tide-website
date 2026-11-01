import {sql} from "drizzle-orm";
import {check,foreignKey,index,integer,pgTable,text,timestamp,unique} from "drizzle-orm/pg-core";
import {worldMapRegion} from "./world-map-region-schema";
import {worldMapCanvas} from "./world-terrain-schema";
import {user} from "./auth-schema";

export const worldRegionHierarchy=pgTable("world_region_hierarchy",{
 mapId:text("map_id").primaryKey(),worldId:text("world_id").notNull(),terrainId:text("terrain_id").notNull(),sourceWorldMapId:text("source_world_map_id").notNull(),sourcePurpose:text("source_purpose").notNull().default("world"),
 organizingParentId:text("organizing_parent_id"),revision:integer("revision").notNull(),updatedBy:text("updated_by_user_id").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),updatedAt:timestamp("updated_at").notNull().defaultNow(),
},t=>[
 index("world_region_hierarchy_source_idx").on(t.worldId,t.sourceWorldMapId),
 foreignKey({name:"world_region_hierarchy_region_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldMapRegion.mapId,worldMapRegion.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_region_hierarchy_parent_fk",columns:[t.organizingParentId,t.worldId],foreignColumns:[worldMapRegion.mapId,worldMapRegion.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_region_hierarchy_source_fk",columns:[t.sourceWorldMapId,t.worldId,t.terrainId,t.sourcePurpose],foreignColumns:[worldMapCanvas.mapId,worldMapCanvas.worldId,worldMapCanvas.terrainId,worldMapCanvas.purpose]}).onDelete("restrict"),
 foreignKey({name:"world_region_hierarchy_editor_fk",columns:[t.updatedBy],foreignColumns:[user.id]}).onDelete("restrict"),
 check("world_region_hierarchy_valid",sql`${t.revision}>0 AND ${t.sourcePurpose}='world' AND ${t.mapId}<>${t.sourceWorldMapId} AND ${t.mapId} IS DISTINCT FROM ${t.organizingParentId}`),
]);
export const worldRegionHierarchyChange=pgTable("world_region_hierarchy_change",{
 requestId:text("request_id").primaryKey(),mapId:text("map_id").notNull(),worldId:text("world_id").notNull(),terrainId:text("terrain_id").notNull(),sourceWorldMapId:text("source_world_map_id").notNull(),revision:integer("revision").notNull(),previousRevision:integer("previous_revision").notNull(),
 previousParentId:text("previous_parent_id"),organizingParentId:text("organizing_parent_id"),action:text("action").notNull(),requestHash:text("request_hash").notNull(),createdBy:text("created_by_user_id").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[
 unique("world_region_hierarchy_change_revision_uq").on(t.mapId,t.revision),index("world_region_hierarchy_change_world_idx").on(t.worldId,t.mapId),
 foreignKey({name:"world_region_hierarchy_change_region_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldMapRegion.mapId,worldMapRegion.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_region_hierarchy_change_parent_fk",columns:[t.organizingParentId,t.worldId],foreignColumns:[worldMapRegion.mapId,worldMapRegion.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_region_hierarchy_change_previous_fk",columns:[t.previousParentId,t.worldId],foreignColumns:[worldMapRegion.mapId,worldMapRegion.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_region_hierarchy_change_author_fk",columns:[t.createdBy],foreignColumns:[user.id]}).onDelete("restrict"),
 check("world_region_hierarchy_change_valid",sql`${t.revision}=${t.previousRevision}+1 AND ${t.previousRevision}>=0 AND ${t.action} IN ('create','move') AND ${t.requestHash} ~ '^[a-f0-9]{64}$'`),
]);
