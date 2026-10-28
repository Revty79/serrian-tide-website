import {sql} from "drizzle-orm";
import {check,foreignKey,integer,jsonb,pgTable,primaryKey,text,timestamp,unique} from "drizzle-orm/pg-core";
import {worldMapCanvas} from "./world-terrain-schema";
import {user} from "./auth-schema";
import type {ArtworkLayer} from "@/features/worlds/terrain-artwork";
export const worldArtwork=pgTable("world_artwork",{
 mapId:text("map_id").primaryKey(),worldId:text("world_id").notNull(),revision:integer("revision").notNull(),layer:jsonb("layer").$type<ArtworkLayer>().notNull(),updatedBy:text("updated_by_user_id").notNull(),updatedAt:timestamp("updated_at").notNull().defaultNow(),
},t=>[
 unique("world_artwork_world_identity_uq").on(t.mapId,t.worldId),
 foreignKey({name:"world_artwork_map_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldMapCanvas.mapId,worldMapCanvas.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_artwork_editor_fk",columns:[t.updatedBy],foreignColumns:[user.id]}).onDelete("restrict"),
 check("world_artwork_layer_valid",sql`${t.revision}>0 AND ${t.layer}->>'version'='1' AND ${t.layer}->>'algorithm'='cartographic-art-1' AND jsonb_typeof(${t.layer}->'placements')='array' AND jsonb_array_length(${t.layer}->'placements')<=1024`),
]);
export const worldArtworkVersion=pgTable("world_artwork_version",{
 mapId:text("map_id").notNull(),worldId:text("world_id").notNull(),revision:integer("revision").notNull(),previousRevision:integer("previous_revision"),restoredFromRevision:integer("restored_from_revision"),layer:jsonb("layer").$type<ArtworkLayer>().notNull(),requestId:text("request_id").notNull(),createdBy:text("created_by_user_id").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[
 primaryKey({name:"world_artwork_version_pk",columns:[t.mapId,t.revision]}),unique("world_artwork_request_uq").on(t.requestId),
 foreignKey({name:"world_artwork_version_map_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldArtwork.mapId,worldArtwork.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_artwork_version_author_fk",columns:[t.createdBy],foreignColumns:[user.id]}).onDelete("restrict"),
 foreignKey({name:"world_artwork_version_parent_fk",columns:[t.mapId,t.previousRevision],foreignColumns:[t.mapId,t.revision]}).onDelete("restrict"),
 foreignKey({name:"world_artwork_version_restore_fk",columns:[t.mapId,t.restoredFromRevision],foreignColumns:[t.mapId,t.revision]}).onDelete("restrict"),
 check("world_artwork_version_valid",sql`${t.revision}>0 AND ((${t.revision}=1 AND ${t.previousRevision} IS NULL) OR (${t.revision}>1 AND ${t.previousRevision}=${t.revision}-1 AND ${t.previousRevision} IS NOT NULL)) AND (${t.restoredFromRevision} IS NULL OR (${t.restoredFromRevision}>0 AND ${t.restoredFromRevision}<${t.revision})) AND ${t.layer}->>'version'='1' AND jsonb_typeof(${t.layer}->'placements')='array'`),
]);
