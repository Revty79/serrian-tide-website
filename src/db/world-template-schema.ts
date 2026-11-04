import {sql} from "drizzle-orm";
import {boolean,check,foreignKey,index,integer,jsonb,pgTable,primaryKey,text,timestamp} from "drizzle-orm/pg-core";
import {user} from "./auth-schema";
import {world} from "./world-schema";
import {atlasAssetVersion} from "./world-asset-schema";
import type {MapTemplate,TemplateFamily,TemplateMetadata} from "@/features/worlds/map-templates";
export const atlasTemplate=pgTable("atlas_template",{
 id:text("id").primaryKey(),ownerId:text("owner_id").notNull().references(()=>user.id,{onDelete:"restrict"}),worldId:text("world_id").notNull().references(()=>world.id,{onDelete:"restrict"}),family:text("family").$type<TemplateFamily>().notNull(),name:text("name").notNull(),revision:integer("revision").notNull(),archived:boolean("archived").notNull().default(false),metadata:jsonb("metadata").$type<TemplateMetadata>().notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[index("atlas_template_owner_idx").on(t.ownerId,t.family),index("atlas_template_world_idx").on(t.worldId),check("atlas_template_valid",sql`${t.revision} BETWEEN 1 AND 128 AND ${t.family} IN ('geography','town','interior','underground','craft','appearance') AND jsonb_typeof(${t.metadata})='object'`)]);
export const atlasTemplateOperation=pgTable("atlas_template_operation",{
 requestId:text("request_id").primaryKey(),ownerId:text("owner_id").notNull().references(()=>user.id,{onDelete:"restrict"}),worldId:text("world_id").notNull().references(()=>world.id,{onDelete:"restrict"}),inputHash:text("input_hash").notNull(),result:jsonb("result").$type<{templateId:string;revision:number}>().notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[index("atlas_template_operation_owner_idx").on(t.ownerId),check("atlas_template_operation_valid",sql`${t.inputHash} ~ '^[a-f0-9]{64}$'`)]);
export const atlasTemplateVersion=pgTable("atlas_template_version",{
 templateId:text("template_id").notNull().references(()=>atlasTemplate.id,{onDelete:"restrict"}),revision:integer("revision").notNull(),snapshot:jsonb("snapshot").$type<MapTemplate>().notNull(),requestId:text("request_id").notNull().references(()=>atlasTemplateOperation.requestId,{onDelete:"restrict"}),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[primaryKey({columns:[t.templateId,t.revision]}),check("atlas_template_version_valid",sql`${t.revision} BETWEEN 1 AND 128 AND jsonb_typeof(${t.snapshot})='object' AND octet_length(${t.snapshot}::text)<=5000000`)]);
export const atlasTemplateAssetUsage=pgTable("atlas_template_asset_usage",{
 templateId:text("template_id").notNull(),templateRevision:integer("template_revision").notNull(),assetId:text("asset_id").notNull(),assetVersion:integer("asset_version").notNull(),
},t=>[primaryKey({columns:[t.templateId,t.templateRevision,t.assetId,t.assetVersion]}),foreignKey({columns:[t.templateId,t.templateRevision],foreignColumns:[atlasTemplateVersion.templateId,atlasTemplateVersion.revision]}).onDelete("restrict"),foreignKey({columns:[t.assetId,t.assetVersion],foreignColumns:[atlasAssetVersion.assetId,atlasAssetVersion.version]}).onDelete("restrict"),index("atlas_template_asset_usage_asset_idx").on(t.assetId,t.assetVersion)]);
