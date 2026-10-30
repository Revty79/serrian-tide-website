import {sql} from "drizzle-orm";
import {check,doublePrecision,foreignKey,index,integer,pgTable,text,timestamp,unique} from "drizzle-orm/pg-core";
import {worldMapCanvas,worldTerrainVersion} from "./world-terrain-schema";
import {user} from "./auth-schema";

/** Immutable creation/coverage; map identity and numerical authority stay separate. */
export const worldMapRegion=pgTable("world_map_region",{
  mapId:text("map_id").primaryKey(),worldId:text("world_id").notNull(),terrainId:text("terrain_id").notNull(),parentMapId:text("parent_map_id").notNull(),
  purpose:text("purpose").notNull().default("regional"),parentPurpose:text("parent_purpose").notNull().default("world"),
  version:integer("version").notNull().default(1),revision:integer("revision").notNull().default(1),
  x:doublePrecision("x_metres").notNull(),y:doublePrecision("y_metres").notNull(),width:doublePrecision("width_metres").notNull(),height:doublePrecision("height_metres").notNull(),
  initialSourceState:text("initial_source_state").notNull(),initialSourceRevision:integer("initial_source_revision").notNull(),initialParentRevision:integer("initial_parent_revision").notNull(),creationHash:text("creation_hash").notNull(),
  createdBy:text("created_by_user_id").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[
  unique("world_map_region_world_uq").on(t.mapId,t.worldId),index("world_map_region_parent_idx").on(t.parentMapId,t.worldId),
  foreignKey({name:"world_map_region_canvas_fk",columns:[t.mapId,t.worldId,t.terrainId,t.purpose],foreignColumns:[worldMapCanvas.mapId,worldMapCanvas.worldId,worldMapCanvas.terrainId,worldMapCanvas.purpose]}).onDelete("restrict"),
  foreignKey({name:"world_map_region_parent_fk",columns:[t.parentMapId,t.worldId,t.terrainId,t.parentPurpose],foreignColumns:[worldMapCanvas.mapId,worldMapCanvas.worldId,worldMapCanvas.terrainId,worldMapCanvas.purpose]}).onDelete("restrict"),
  foreignKey({name:"world_map_region_source_fk",columns:[t.terrainId,t.worldId,t.initialSourceRevision],foreignColumns:[worldTerrainVersion.terrainId,worldTerrainVersion.worldId,worldTerrainVersion.revision]}).onDelete("restrict"),
  foreignKey({name:"world_map_region_author_fk",columns:[t.createdBy],foreignColumns:[user.id]}).onDelete("restrict"),
  check("world_map_region_valid",sql`${t.version}=1 AND ${t.revision}=1 AND ${t.purpose}='regional' AND ${t.parentPurpose}='world' AND ${t.mapId}<>${t.parentMapId} AND ${t.x}>=0 AND ${t.x}<1000000000 AND ${t.y}>=0 AND ${t.y}<1000000000 AND ${t.width} BETWEEN 1 AND 1000000000 AND ${t.height} BETWEEN 1 AND 1000000000 AND ${t.initialSourceRevision}>0 AND ${t.initialParentRevision}>0 AND ${t.creationHash} ~ '^[a-f0-9]{64}$' AND length(${t.initialSourceState}) BETWEEN 2 AND 8192`),
]);
