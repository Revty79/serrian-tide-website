import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { world } from "@/db/world-schema";
import { worldCalendar, worldCalendarVersion, worldCalendarPreference } from "@/db/world-calendar-schema";
import { calendarIdentitySchema, calendarRulesSchema, type CalendarBundle, type CalendarIdentity, type CalendarVersion } from "./calendar";
import { WorldError, worldReadAccess, worldWriteTransaction } from "./world-service";
import { evolutionRows } from "./calendar-evolution-service";
const id=z.string().uuid(),revision=z.number().int().positive(),title=z.string().trim().min(1).max(160);
const command=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),draft:calendarIdentitySchema,title,rules:calendarRulesSchema}).strict(),
  z.object({action:z.literal("identity"),id,revision,draft:calendarIdentitySchema}).strict(),
  z.object({action:z.literal("version"),id,revision,title,rules:calendarRulesSchema}).strict(),
  z.object({action:z.enum(["archive","restore"]),id,revision}).strict(),
  z.object({action:z.enum(["archive-version","restore-version"]),id,revision}).strict(),
  z.object({action:z.literal("default"),revision,versionId:id.nullable()}).strict(),
]);
function calendarDto(row:typeof worldCalendar.$inferSelect):CalendarIdentity{return {id:row.id,worldId:row.worldId,name:row.name,description:row.description,context:row.context,revision:row.revision,archived:!!row.archivedAt};}
function versionDto(row:typeof worldCalendarVersion.$inferSelect):CalendarVersion{return {id:row.id,worldId:row.worldId,calendarId:row.calendarId,title:row.title,rules:row.rules,revision:row.revision,archived:!!row.archivedAt};}
const unavailable=()=>new WorldError("This calendar or version is unavailable.",404);
const conflict=()=>new WorldError("A newer version was saved in another tab. Your draft is retained. Load the latest version before saving again.",409);
export async function getCalendars(userId:string,worldId:string,review=false):Promise<CalendarBundle>{
  await worldReadAccess(userId,worldId,review);
  return db.transaction(async tx=>{
    const [parent]=await tx.select().from(world).where(eq(world.id,worldId));
    const calendars=await tx.select().from(worldCalendar).where(eq(worldCalendar.worldId,worldId)).orderBy(asc(worldCalendar.name),asc(worldCalendar.id));
    const versions=await tx.select().from(worldCalendarVersion).where(eq(worldCalendarVersion.worldId,worldId)).orderBy(asc(worldCalendarVersion.createdAt),asc(worldCalendarVersion.id));
    const [preference]=await tx.select().from(worldCalendarPreference).where(eq(worldCalendarPreference.worldId,worldId));
    return {calendars:calendars.map(calendarDto),versions:versions.map(versionDto),defaultVersionId:preference?.defaultVersionId??null,worldRevision:parent.revision,canEdit:parent.ownerId===userId&&!parent.archivedAt&&!review,evolution:await evolutionRows(tx,worldId)};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
export async function changeCalendar(userId:string,worldId:string,input:unknown){
  return worldWriteTransaction(userId,worldId,async(tx,parent)=>{
    const c=command.parse(input);const stamp={updatedAt:new Date()};
    if(c.action==="create"){
      const calendarId=randomUUID(),versionId=randomUUID();await tx.insert(worldCalendar).values({id:calendarId,worldId,...c.draft});await tx.insert(worldCalendarVersion).values({id:versionId,calendarId,worldId,title:c.title,rules:c.rules});await tx.update(world).set(stamp).where(eq(world.id,worldId));return versionId;
    }
    if(c.action==="default"){
      if(parent.revision!==c.revision)throw conflict();
      if(c.versionId){const [row]=await tx.select({version:worldCalendarVersion,calendar:worldCalendar}).from(worldCalendarVersion).innerJoin(worldCalendar,and(eq(worldCalendar.id,worldCalendarVersion.calendarId),eq(worldCalendar.worldId,worldId))).where(and(eq(worldCalendarVersion.id,c.versionId),eq(worldCalendarVersion.worldId,worldId)));if(!row)throw unavailable();if(row.calendar.archivedAt||row.version.archivedAt)throw new WorldError("Restore this calendar and version before choosing it as default.",400);}
      await tx.insert(worldCalendarPreference).values({worldId,defaultVersionId:c.versionId}).onConflictDoUpdate({target:worldCalendarPreference.worldId,set:{defaultVersionId:c.versionId}});await tx.update(world).set({...stamp,revision:parent.revision+1}).where(eq(world.id,worldId));return c.versionId;
    }
    const versionAction=c.action==="archive-version"||c.action==="restore-version";
    const table=versionAction?worldCalendarVersion:worldCalendar;
    const [current]=await tx.select().from(table).where(and(eq(table.id,c.id),eq(table.worldId,worldId))).for("update");if(!current)throw unavailable();if(current.revision!==c.revision)throw conflict();
    if(c.action==="identity"||c.action==="version"){
      if(current.archivedAt)throw new WorldError("Restore this calendar before editing it.",400);
      if(c.action==="identity")await tx.update(worldCalendar).set({...c.draft,...stamp,revision:current.revision+1}).where(eq(worldCalendar.id,c.id));
      else{const versionId=randomUUID();await tx.insert(worldCalendarVersion).values({id:versionId,worldId,calendarId:c.id,title:c.title,rules:c.rules});await tx.update(worldCalendar).set({...stamp,revision:current.revision+1}).where(eq(worldCalendar.id,c.id));await tx.update(world).set(stamp).where(eq(world.id,worldId));return versionId;}
    }else{
      const archiving=c.action==="archive"||c.action==="archive-version";
      if(archiving){const [preference]=await tx.select({versionId:worldCalendarPreference.defaultVersionId}).from(worldCalendarPreference).where(eq(worldCalendarPreference.worldId,worldId));const versions=versionAction?[c.id]:(await tx.select({id:worldCalendarVersion.id}).from(worldCalendarVersion).where(eq(worldCalendarVersion.calendarId,c.id))).map(({id})=>id);if(preference?.versionId&&versions.includes(preference.versionId))throw new WorldError("Choose another default before archiving this calendar or version.",400);}
      await tx.update(table).set({...stamp,archivedAt:archiving?new Date():null,revision:current.revision+1}).where(eq(table.id,c.id));
    }
    await tx.update(world).set(stamp).where(eq(world.id,worldId));return c.id;
  });
}
