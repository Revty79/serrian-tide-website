import {sql} from "drizzle-orm";
import {boolean,check,foreignKey,index,integer,jsonb,pgTable,text,timestamp,unique} from "drizzle-orm/pg-core";
import {world} from "./world-schema";
import {user} from "./auth-schema";
import {worldGeography} from "./world-atlas-schema";
import type {FloorFrame} from "@/features/worlds/building-floor";
import type {UndergroundDesign,UndergroundEndpoint} from "@/features/worlds/underground";
const lifecycle=()=>({revision:integer("revision").notNull(),archived:boolean("archived").notNull().default(false),createdAt:timestamp("created_at").notNull().defaultNow(),updatedAt:timestamp("updated_at").notNull().defaultNow()});
export const worldUndergroundSite=pgTable("world_underground_site",{
 id:text("id").primaryKey(),worldId:text("world_id").notNull().references(()=>world.id,{onDelete:"restrict"}),name:text("name").notNull(),placeId:text("place_id"),frame:jsonb("frame").$type<FloorFrame>().notNull(),...lifecycle(),
},t=>[unique("world_underground_site_world_uq").on(t.id,t.worldId),foreignKey({name:"world_underground_site_place_fk",columns:[t.placeId,t.worldId],foreignColumns:[worldGeography.id,worldGeography.worldId]}).onDelete("restrict"),check("world_underground_site_valid",sql`${t.revision}>0 AND length(trim(${t.name})) BETWEEN 1 AND 160 AND jsonb_typeof(${t.frame})='object'`)]);
export const worldUndergroundLevel=pgTable("world_underground_level",{
 id:text("id").primaryKey(),worldId:text("world_id").notNull(),siteId:text("site_id").notNull(),name:text("name").notNull(),order:integer("level_order").notNull(),depth:text("depth").notNull(),design:jsonb("design").$type<UndergroundDesign>().notNull(),...lifecycle(),
},t=>[unique("world_underground_level_world_uq").on(t.id,t.worldId),index("world_underground_level_site_idx").on(t.siteId,t.order,t.id),foreignKey({name:"world_underground_level_site_fk",columns:[t.siteId,t.worldId],foreignColumns:[worldUndergroundSite.id,worldUndergroundSite.worldId]}).onDelete("restrict"),check("world_underground_level_valid",sql`${t.revision}>0 AND length(trim(${t.name})) BETWEEN 1 AND 160 AND ${t.order} BETWEEN -1000 AND 1000 AND length(${t.depth})<=160 AND ${t.design}->>'version'='1' AND jsonb_typeof(${t.design}->'features')='array' AND jsonb_array_length(${t.design}->'features')<=2000 AND octet_length(${t.design}::text)<=5000000`)]);
export const worldUndergroundConnection=pgTable("world_underground_connection",{
 id:text("id").primaryKey(),worldId:text("world_id").notNull().references(()=>world.id,{onDelete:"restrict"}),name:text("name").notNull(),source:jsonb("source").$type<UndergroundEndpoint>().notNull(),destination:jsonb("destination").$type<UndergroundEndpoint>().notNull(),twoWay:boolean("two_way").notNull(),...lifecycle(),
},t=>[index("world_underground_connection_world_idx").on(t.worldId),check("world_underground_connection_valid",sql`${t.revision}>0 AND length(trim(${t.name})) BETWEEN 1 AND 160 AND jsonb_typeof(${t.source})='object' AND jsonb_typeof(${t.destination})='object' AND ${t.source}->'map'<>${t.destination}->'map'`)]);
export const worldUndergroundOperation=pgTable("world_underground_operation",{
 requestId:text("request_id").primaryKey(),worldId:text("world_id").notNull().references(()=>world.id,{onDelete:"restrict"}),authorId:text("author_id").notNull().references(()=>user.id,{onDelete:"restrict"}),inputHash:text("input_hash").notNull(),result:jsonb("result").$type<{siteId:string|null;levelId:string|null;connectionId:string|null;revision:number}>().notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[check("world_underground_operation_valid",sql`${t.inputHash} ~ '^[a-f0-9]{64}$' AND jsonb_typeof(${t.result})='object'`)]);
export const worldUndergroundVersion=pgTable("world_underground_version",{
 id:text("id").primaryKey(),worldId:text("world_id").notNull().references(()=>world.id,{onDelete:"restrict"}),kind:text("kind").notNull(),recordId:text("record_id").notNull(),revision:integer("revision").notNull(),requestId:text("request_id").notNull().references(()=>worldUndergroundOperation.requestId,{onDelete:"restrict"}),snapshot:jsonb("snapshot").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[unique("world_underground_version_revision_uq").on(t.kind,t.recordId,t.revision),check("world_underground_version_valid",sql`${t.revision}>0 AND ${t.kind} IN ('site','level','connection') AND jsonb_typeof(${t.snapshot})='object'`)]);
