import {sql} from "drizzle-orm";
import {boolean,check,foreignKey,index,integer,jsonb,pgTable,primaryKey,text,timestamp,unique} from "drizzle-orm/pg-core";
import {user} from "./auth-schema";
import {world} from "./world-schema";
import type {AssetComposition,AssetMetadata,AssetObject,CompositionTarget} from "@/features/worlds/atlas-assets";
export const atlasAsset=pgTable("atlas_asset",{
 id:text("id").primaryKey(),ownerId:text("owner_id").notNull().references(()=>user.id,{onDelete:"restrict"}),revision:integer("revision").notNull(),headVersion:integer("head_version").notNull(),archived:boolean("archived").notNull().default(false),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[index("atlas_asset_owner_idx").on(t.ownerId),check("atlas_asset_valid",sql`${t.revision}>0 AND ${t.headVersion}>0`)]);
export const atlasAssetVersion=pgTable("atlas_asset_version",{
 assetId:text("asset_id").notNull().references(()=>atlasAsset.id,{onDelete:"restrict"}),version:integer("version").notNull(),metadata:jsonb("metadata").$type<AssetMetadata>().notNull(),filename:text("filename").notNull(),format:text("format").notNull(),width:integer("width").notNull(),height:integer("height").notNull(),bytes:integer("bytes").notNull(),objects:jsonb("objects").$type<AssetObject[]>().notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[primaryKey({columns:[t.assetId,t.version]}),check("atlas_asset_version_valid",sql`${t.version}>0 AND ${t.width}>0 AND ${t.height}>0 AND ${t.width}<=8192 AND ${t.height}<=8192 AND ${t.width}::bigint*${t.height}<=16777216 AND ${t.bytes} BETWEEN 1 AND 8388608 AND ${t.format} IN ('png','jpeg','webp') AND jsonb_typeof(${t.objects})='array'`)]);
export const atlasAssetPreference=pgTable("atlas_asset_preference",{
 ownerId:text("owner_id").primaryKey().references(()=>user.id,{onDelete:"restrict"}),revision:integer("revision").notNull(),favorites:jsonb("favorites").$type<string[]>().notNull(),recent:jsonb("recent").$type<string[]>().notNull(),
},t=>[check("atlas_asset_preference_valid",sql`${t.revision}>0 AND jsonb_typeof(${t.favorites})='array' AND jsonb_array_length(${t.favorites})<=128 AND jsonb_typeof(${t.recent})='array' AND jsonb_array_length(${t.recent})<=32`)]);
export const atlasComposition=pgTable("atlas_composition",{
 worldId:text("world_id").notNull().references(()=>world.id,{onDelete:"restrict"}),kind:text("kind").$type<CompositionTarget["kind"]>().notNull(),mapId:text("map_id").notNull(),revision:integer("revision").notNull(),layer:jsonb("layer").$type<AssetComposition>().notNull(),
},t=>[primaryKey({columns:[t.worldId,t.kind,t.mapId]}),check("atlas_composition_valid",sql`${t.kind} IN ('terrain','town','floor','underground') AND ${t.revision}>0 AND ${t.layer}->>'version'='1' AND jsonb_typeof(${t.layer}->'placements')='array' AND jsonb_array_length(${t.layer}->'placements')<=256`)]);
export const atlasCompositionVersion=pgTable("atlas_composition_version",{
 worldId:text("world_id").notNull(),kind:text("kind").$type<CompositionTarget["kind"]>().notNull(),mapId:text("map_id").notNull(),revision:integer("revision").notNull(),layer:jsonb("layer").$type<AssetComposition>().notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[primaryKey({columns:[t.worldId,t.kind,t.mapId,t.revision]}),foreignKey({columns:[t.worldId,t.kind,t.mapId],foreignColumns:[atlasComposition.worldId,atlasComposition.kind,atlasComposition.mapId]}).onDelete("restrict"),check("atlas_composition_version_valid",sql`${t.revision}>0 AND ${t.layer}->>'version'='1' AND jsonb_typeof(${t.layer}->'placements')='array' AND jsonb_array_length(${t.layer}->'placements')<=256`)]);
export const atlasAssetUsage=pgTable("atlas_asset_usage",{
 worldId:text("world_id").notNull(),kind:text("kind").$type<CompositionTarget["kind"]>().notNull(),mapId:text("map_id").notNull(),revision:integer("revision").notNull(),assetId:text("asset_id").notNull(),assetVersion:integer("asset_version").notNull(),
},t=>[primaryKey({columns:[t.worldId,t.kind,t.mapId,t.revision,t.assetId,t.assetVersion]}),foreignKey({columns:[t.worldId,t.kind,t.mapId,t.revision],foreignColumns:[atlasCompositionVersion.worldId,atlasCompositionVersion.kind,atlasCompositionVersion.mapId,atlasCompositionVersion.revision]}).onDelete("restrict"),foreignKey({columns:[t.assetId,t.assetVersion],foreignColumns:[atlasAssetVersion.assetId,atlasAssetVersion.version]}).onDelete("restrict"),index("atlas_asset_usage_asset_idx").on(t.assetId,t.assetVersion)]);
export const atlasAssetOperation=pgTable("atlas_asset_operation",{
 requestId:text("request_id").primaryKey(),ownerId:text("owner_id").notNull().references(()=>user.id,{onDelete:"restrict"}),worldId:text("world_id").notNull().references(()=>world.id,{onDelete:"restrict"}),inputHash:text("input_hash").notNull(),result:jsonb("result").$type<{revision:number;version?:number}>().notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[unique("atlas_asset_operation_owner_request_uq").on(t.ownerId,t.requestId),check("atlas_asset_operation_hash_valid",sql`${t.inputHash} ~ '^[a-f0-9]{64}$'`)]);
