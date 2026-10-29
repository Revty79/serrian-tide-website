import {sql} from "drizzle-orm";
import {check,foreignKey,index,integer,jsonb,pgTable,text,timestamp} from "drizzle-orm/pg-core";
import {worldMapCanvas} from "./world-terrain-schema";
import {user} from "./auth-schema";
import type {MapAppearance} from "@/features/worlds/terrain-appearance";
/** Each named variant is an immutable snapshot, rather than a mutable shared default. */
export const worldMapStyle=pgTable("world_map_style",{
 id:text("id").primaryKey(),worldId:text("world_id").notNull(),version:integer("version").notNull(),name:text("name").notNull(),spec:jsonb("spec").$type<MapAppearance>().notNull(),
 sourceMapId:text("source_map_id").notNull(),sourceAppearanceRevision:integer("source_appearance_revision").notNull(),createdBy:text("created_by_user_id").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[
 index("world_map_style_world_idx").on(t.worldId,t.createdAt),
 foreignKey({name:"world_map_style_source_fk",columns:[t.sourceMapId,t.worldId],foreignColumns:[worldMapCanvas.mapId,worldMapCanvas.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_map_style_author_fk",columns:[t.createdBy],foreignColumns:[user.id]}).onDelete("restrict"),
 check("world_map_style_valid",sql`${t.version}=1 AND length(trim(${t.name})) BETWEEN 1 AND 80 AND ${t.sourceAppearanceRevision}>=0 AND jsonb_typeof(${t.spec})='object' AND ${t.spec}->>'version' IN ('1','2','3') AND ${t.spec}->>'style' IN ('classic-elevation','physical-relief','topographic','illustrated-fantasy','realistic-terrain','engraved-fantasy')`),
]);
