import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { world } from "./world-schema";
import type { CalendarRules } from "@/features/worlds/calendar";
const lifecycle=()=>({revision:integer("revision").notNull().default(1),createdAt:timestamp("created_at").notNull().defaultNow(),updatedAt:timestamp("updated_at").notNull().defaultNow(),archivedAt:timestamp("archived_at")});
export const worldCalendar=pgTable("world_calendar",{
  id:text("id").primaryKey(),worldId:text("world_id").notNull().references(()=>world.id,{onDelete:"restrict"}),name:text("name").notNull(),description:text("description").notNull().default(""),context:text("context").notNull().default(""),...lifecycle(),
},t=>[unique("world_calendar_id_world_uq").on(t.id,t.worldId),index("world_calendar_world_idx").on(t.worldId),check("world_calendar_valid",sql`length(trim(${t.name})) BETWEEN 1 AND 160 AND ${t.revision}>0`)]);
export const worldCalendarVersion=pgTable("world_calendar_version",{
  id:text("id").primaryKey(),worldId:text("world_id").notNull(),calendarId:text("calendar_id").notNull(),title:text("title").notNull(),rules:jsonb("rules").$type<CalendarRules>().notNull(),...lifecycle(),
},t=>[unique("world_calendar_version_id_world_uq").on(t.id,t.worldId),foreignKey({name:"world_calendar_version_calendar_world_fk",columns:[t.calendarId,t.worldId],foreignColumns:[worldCalendar.id,worldCalendar.worldId]}).onDelete("restrict"),index("world_calendar_version_world_idx").on(t.worldId),check("world_calendar_version_valid",sql`length(trim(${t.title})) BETWEEN 1 AND 160 AND ${t.revision}>0 AND coalesce(jsonb_typeof(${t.rules})='object' AND ${t.rules}->>'version'='1',false)`)]);
export const worldCalendarPreference=pgTable("world_calendar_preference",{
  worldId:text("world_id").primaryKey().references(()=>world.id,{onDelete:"restrict"}),defaultVersionId:text("default_version_id"),
},t=>[foreignKey({name:"world_calendar_default_world_fk",columns:[t.defaultVersionId,t.worldId],foreignColumns:[worldCalendarVersion.id,worldCalendarVersion.worldId]}).onDelete("restrict")]);
