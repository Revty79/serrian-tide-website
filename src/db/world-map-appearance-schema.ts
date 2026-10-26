import {sql} from "drizzle-orm";
import {pgTable,text,integer,jsonb,timestamp,foreignKey,check,unique} from "drizzle-orm/pg-core";
import {worldMapCanvas} from "./world-terrain-schema";
import {user} from "./auth-schema";
import type {MapAppearance} from "@/features/worlds/terrain-appearance";

/** A map's default presentation is independent of numerical terrain revisions. */
export const worldMapAppearance=pgTable("world_map_appearance",{
 mapId:text("map_id").primaryKey(),worldId:text("world_id").notNull(),revision:integer("revision").notNull(),
 spec:jsonb("spec").$type<MapAppearance>().notNull(),requestId:text("request_id").notNull(),
 updatedBy:text("updated_by_user_id").notNull(),updatedAt:timestamp("updated_at").defaultNow().notNull(),
},t=>[
 unique("world_map_appearance_request_uq").on(t.requestId),
 foreignKey({name:"world_map_appearance_map_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldMapCanvas.mapId,worldMapCanvas.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_map_appearance_editor_fk",columns:[t.updatedBy],foreignColumns:[user.id]}).onDelete("restrict"),
 check("world_map_appearance_valid",sql`${t.revision}>0 AND jsonb_typeof(${t.spec})='object' AND ${t.spec}->>'version'='1' AND ${t.spec}->>'style' IN ('classic-elevation','physical-relief','topographic','illustrated-fantasy')`),
]);
