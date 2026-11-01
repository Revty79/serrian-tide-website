import {sql} from "drizzle-orm";
import {boolean,check,doublePrecision,foreignKey,index,integer,jsonb,pgTable,text,timestamp,unique} from "drizzle-orm/pg-core";
import {worldSettlementProfile,worldMapPlace} from "./world-town-schema";
import {worldMapCanvas} from "./world-terrain-schema";
import {user} from "./auth-schema";
import type {TownDesign,TownFrame} from "@/features/worlds/town-map";

export const worldTownMap=pgTable("world_town_map",{
 id:text("id").primaryKey(),worldId:text("world_id").notNull(),townId:text("town_id").notNull(),sourceMapId:text("source_map_id").notNull(),terrainId:text("terrain_id").notNull(),sourcePurpose:text("source_purpose").notNull().default("world"),contextMapId:text("context_map_id").notNull(),placementId:text("placement_id"),placementRevision:integer("placement_revision"),
 anchorX:doublePrecision("anchor_x").notNull(),anchorY:doublePrecision("anchor_y").notNull(),frame:jsonb("frame").$type<TownFrame>().notNull(),name:text("name").notNull(),revision:integer("revision").notNull(),archived:boolean("archived").notNull().default(false),design:jsonb("design").$type<TownDesign>().notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),updatedAt:timestamp("updated_at").notNull().defaultNow(),
},t=>[unique("world_town_map_world_uq").on(t.id,t.worldId),index("world_town_map_inventory_idx").on(t.worldId,t.name,t.id),index("world_town_map_town_idx").on(t.worldId,t.townId),
 foreignKey({name:"world_town_map_town_fk",columns:[t.townId,t.worldId],foreignColumns:[worldSettlementProfile.geographyId,worldSettlementProfile.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_town_map_source_fk",columns:[t.sourceMapId,t.worldId,t.terrainId,t.sourcePurpose],foreignColumns:[worldMapCanvas.mapId,worldMapCanvas.worldId,worldMapCanvas.terrainId,worldMapCanvas.purpose]}).onDelete("restrict"),
 foreignKey({name:"world_town_map_context_fk",columns:[t.contextMapId,t.worldId],foreignColumns:[worldMapCanvas.mapId,worldMapCanvas.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_town_map_placement_fk",columns:[t.placementId],foreignColumns:[worldMapPlace.id]}).onDelete("restrict"),
 check("world_town_map_valid",sql`${t.sourcePurpose}='world' AND ${t.revision}>0 AND length(trim(${t.name})) BETWEEN 1 AND 160 AND ${t.anchorX} BETWEEN 0 AND 1000000000 AND ${t.anchorY} BETWEEN 0 AND 1000000000 AND ((${t.placementId} IS NULL AND ${t.placementRevision} IS NULL) OR (${t.placementId} IS NOT NULL AND ${t.placementRevision}>0)) AND jsonb_typeof(${t.frame})='object' AND jsonb_typeof(${t.design})='object'`),
]);
export const worldTownMapVersion=pgTable("world_town_map_version",{
 requestId:text("request_id").primaryKey(),mapId:text("map_id").notNull(),worldId:text("world_id").notNull(),revision:integer("revision").notNull(),authorId:text("author_id").notNull().references(()=>user.id,{onDelete:"restrict"}),inputHash:text("input_hash").notNull(),name:text("name").notNull(),archived:boolean("archived").notNull(),design:jsonb("design").$type<TownDesign>().notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[unique("world_town_map_version_revision_uq").on(t.mapId,t.revision),foreignKey({name:"world_town_map_version_map_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldTownMap.id,worldTownMap.worldId]}).onDelete("restrict"),check("world_town_map_version_valid",sql`${t.revision}>0 AND ${t.inputHash} ~ '^[a-f0-9]{64}$' AND length(trim(${t.name})) BETWEEN 1 AND 160 AND jsonb_typeof(${t.design})='object'`)]);
