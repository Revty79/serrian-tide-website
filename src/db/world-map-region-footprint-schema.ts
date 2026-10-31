import {sql} from "drizzle-orm";
import {check,foreignKey,jsonb,pgTable,text,timestamp} from "drizzle-orm/pg-core";
import {worldMapRegion} from "./world-map-region-schema";
import {user} from "./auth-schema";
import type {RegionFootprint} from "@/features/worlds/terrain-region-geometry";

/** One immutable physical footprint, never another World or terrain layer. */
export const worldMapRegionFootprint=pgTable("world_map_region_footprint",{
 mapId:text("map_id").primaryKey(),worldId:text("world_id").notNull(),footprint:jsonb("footprint").$type<RegionFootprint>().notNull(),
 createdBy:text("created_by_user_id").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[
 foreignKey({name:"world_region_footprint_region_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldMapRegion.mapId,worldMapRegion.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_region_footprint_author_fk",columns:[t.createdBy],foreignColumns:[user.id]}).onDelete("restrict"),
 check("world_region_footprint_valid",sql`jsonb_typeof(${t.footprint})='object' AND ${t.footprint}->>'version'='1' AND ${t.footprint}->>'kind'='polygon' AND jsonb_typeof(${t.footprint}->'parts')='array' AND jsonb_array_length(${t.footprint}->'parts') BETWEEN 1 AND 8 AND octet_length(${t.footprint}::text)<=262144 AND (${t.footprint}-ARRAY['version','kind','parts'])='{}'::jsonb`),
]);
