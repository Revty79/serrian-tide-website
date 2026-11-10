import {sql} from "drizzle-orm";
import {check,foreignKey,index,integer,jsonb,pgTable,primaryKey,text,timestamp} from "drizzle-orm/pg-core";
import {world} from "./world-schema";
import {user} from "./auth-schema";
import type {TerrainTransferHeader,TerrainTransferTile,TerrainTransferResult} from "@/features/worlds/terrain-transfer";
/** Durable preparation only. Native terrain versions remain the acceptance authority. */
export const worldTerrainTransfer=pgTable("world_terrain_transfer",{
 requestId:text("request_id").primaryKey(),worldId:text("world_id").notNull().references(()=>world.id,{onDelete:"restrict"}),actorId:text("actor_id").notNull().references(()=>user.id,{onDelete:"restrict"}),refinementId:text("refinement_id"),inputHash:text("input_hash").notNull(),command:jsonb("command").$type<TerrainTransferHeader>().notNull(),tiles:jsonb("tiles").$type<TerrainTransferTile[]>().notNull(),tileCount:integer("tile_count").notNull(),state:text("state").$type<"receiving"|"retained"|"accepted">().notNull().default("receiving"),result:jsonb("result").$type<TerrainTransferResult["result"]>(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("world_terrain_transfer_actor_idx").on(t.actorId,t.state),check("world_terrain_transfer_valid",sql`${t.inputHash} ~ '^[a-f0-9]{64}$' AND ${t.tileCount} BETWEEN 1 AND 16384 AND ${t.state} IN ('receiving','retained','accepted') AND jsonb_typeof(${t.command})='object' AND jsonb_typeof(${t.tiles})='array' AND jsonb_array_length(${t.tiles})=${t.tileCount} AND ((${t.state} IN ('receiving','retained') AND ${t.result} IS NULL) OR (${t.state}='accepted' AND jsonb_typeof(${t.result})='object'))`)]);
export const worldTerrainTransferTile=pgTable("world_terrain_transfer_tile",{
 requestId:text("request_id").notNull(),x:integer("tile_x").notNull(),y:integer("tile_y").notNull(),sha256:text("sha256").notNull(),bytes:integer("bytes").notNull(),encoding:text("encoding").notNull(),
},t=>[primaryKey({columns:[t.requestId,t.x,t.y]}),foreignKey({columns:[t.requestId],foreignColumns:[worldTerrainTransfer.requestId]}).onDelete("restrict"),check("world_terrain_transfer_tile_valid",sql`${t.x} BETWEEN 0 AND 127 AND ${t.y} BETWEEN 0 AND 127 AND ${t.sha256} ~ '^[a-f0-9]{64}$' AND ${t.bytes}=2048 AND ${t.encoding}='i16le-v1'`)]);
