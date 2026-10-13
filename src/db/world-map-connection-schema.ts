import { sql } from "drizzle-orm";
import { bigint,boolean,check,foreignKey,index,integer,jsonb,pgTable,primaryKey,text,timestamp,unique } from "drizzle-orm/pg-core";
import { worldTimeline } from "./world-schema";
import { worldAtlasMap,worldGeography } from "./world-atlas-schema";
import type { HistoricalConnectionDraft,HistoricalConnectionSource } from "@/features/worlds/historical-connections";

export const worldMapConnectionHistory=pgTable("world_map_connection_history",{
  id:text("id").primaryKey(),worldId:text("world_id").notNull(),mapId:text("map_id").notNull(),geographyId:text("geography_id").notNull(),originTimelineId:text("origin_timeline_id").notNull(),
},t=>[unique("map_connection_identity_uq").on(t.id,t.worldId,t.mapId,t.geographyId),
  foreignKey({name:"map_connection_map_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldAtlasMap.id,worldAtlasMap.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_connection_place_fk",columns:[t.geographyId,t.worldId],foreignColumns:[worldGeography.id,worldGeography.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_connection_origin_fk",columns:[t.originTimelineId,t.worldId],foreignColumns:[worldTimeline.id,worldTimeline.worldId]}).onDelete("restrict")]);
export const worldMapConnectionVersion=pgTable("world_map_connection_version",{
  id:text("id").primaryKey(),worldId:text("world_id").notNull(),mapId:text("map_id").notNull(),geographyId:text("geography_id").notNull(),connectionId:text("connection_id").notNull(),timelineId:text("timeline_id").notNull(),
  sourceVersionId:text("source_version_id"),previousVersionId:text("previous_version_id"),
  destinationMapId:text("destination_map_id"),destinationGeographyId:text("destination_geography_id"),baselineDestinationMapId:text("baseline_destination_map_id"),baselineArrivalId:text("baseline_arrival_id"),
  startYear:bigint("start_year",{mode:"number"}).notNull(),endYear:bigint("end_year",{mode:"number"}).notNull(),archived:boolean("archived").notNull(),
  draft:jsonb("draft").$type<HistoricalConnectionDraft>().notNull(),source:jsonb("source").$type<HistoricalConnectionSource>().notNull(),authorId:text("author_id").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[unique("map_connection_version_subject_uq").on(t.id,t.worldId,t.mapId,t.geographyId),unique("map_connection_version_identity_uq").on(t.id,t.worldId,t.mapId,t.geographyId,t.connectionId),
  foreignKey({name:"map_connection_version_identity_fk",columns:[t.connectionId,t.worldId,t.mapId,t.geographyId],foreignColumns:[worldMapConnectionHistory.id,worldMapConnectionHistory.worldId,worldMapConnectionHistory.mapId,worldMapConnectionHistory.geographyId]}).onDelete("restrict"),
  foreignKey({name:"map_connection_version_timeline_fk",columns:[t.timelineId,t.worldId],foreignColumns:[worldTimeline.id,worldTimeline.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_connection_version_source_fk",columns:[t.sourceVersionId,t.worldId,t.mapId,t.geographyId],foreignColumns:[t.id,t.worldId,t.mapId,t.geographyId]}).onDelete("restrict"),
  foreignKey({name:"map_connection_version_previous_fk",columns:[t.previousVersionId,t.worldId,t.mapId,t.geographyId,t.connectionId],foreignColumns:[t.id,t.worldId,t.mapId,t.geographyId,t.connectionId]}).onDelete("restrict"),
  foreignKey({name:"map_connection_destination_fk",columns:[t.destinationMapId,t.worldId],foreignColumns:[worldAtlasMap.id,worldAtlasMap.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_connection_arrival_fk",columns:[t.destinationGeographyId,t.worldId],foreignColumns:[worldGeography.id,worldGeography.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_connection_baseline_destination_fk",columns:[t.baselineDestinationMapId,t.worldId],foreignColumns:[worldAtlasMap.id,worldAtlasMap.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_connection_baseline_arrival_fk",columns:[t.baselineArrivalId,t.worldId],foreignColumns:[worldGeography.id,worldGeography.worldId]}).onDelete("restrict"),
  index("map_connection_version_source_idx").on(t.worldId,t.mapId,t.connectionId,t.createdAt),
  check("map_connection_version_valid",sql`abs(${t.startYear})<=1000000000000 AND abs(${t.endYear})<=1000000000000 AND ${t.startYear}<=${t.endYear} AND length(${t.authorId})>0 AND (${t.sourceVersionId} IS NULL OR ${t.sourceVersionId}<>${t.id}) AND (${t.previousVersionId} IS NULL OR ${t.previousVersionId}<>${t.id}) AND (${t.destinationMapId} IS NULL OR ${t.destinationMapId}<>${t.mapId}) AND world_map_connection_payload_valid(${t.draft},${t.source}) IS TRUE AND (${t.draft}->>'startYear')::bigint=${t.startYear} AND (${t.draft}->>'endYear')::bigint=${t.endYear} AND (${t.draft}->>'destinationMapId') IS NOT DISTINCT FROM ${t.destinationMapId} AND (${t.draft}->>'destinationGeographyId') IS NOT DISTINCT FROM ${t.destinationGeographyId} AND (${t.source}->'baseline'->>'destinationMapId') IS NOT DISTINCT FROM ${t.baselineDestinationMapId} AND (${t.source}->'baseline'->>'destinationGeographyId') IS NOT DISTINCT FROM ${t.baselineArrivalId}`)]);
export const worldMapConnectionHead=pgTable("world_map_connection_head",{
  timelineId:text("timeline_id").notNull(),worldId:text("world_id").notNull(),mapId:text("map_id").notNull(),geographyId:text("geography_id").notNull(),connectionId:text("connection_id").notNull(),versionId:text("version_id").notNull(),revision:integer("revision").notNull(),mode:text("mode").$type<"authored"|"retained"|"interpretation">().notNull(),
},t=>[primaryKey({columns:[t.timelineId,t.connectionId]}),index("map_connection_head_year_idx").on(t.worldId,t.timelineId,t.mapId,t.geographyId),
  foreignKey({name:"map_connection_head_timeline_fk",columns:[t.timelineId,t.worldId],foreignColumns:[worldTimeline.id,worldTimeline.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_connection_head_version_fk",columns:[t.versionId,t.worldId,t.mapId,t.geographyId,t.connectionId],foreignColumns:[worldMapConnectionVersion.id,worldMapConnectionVersion.worldId,worldMapConnectionVersion.mapId,worldMapConnectionVersion.geographyId,worldMapConnectionVersion.connectionId]}).onDelete("restrict"),
  check("map_connection_head_valid",sql`${t.revision}>0 AND ${t.mode} IN ('authored','retained','interpretation')`)]);
