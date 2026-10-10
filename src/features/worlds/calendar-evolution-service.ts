import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { world, worldEntry } from "@/db/world-schema";
import { worldCalendar, worldCalendarVersion } from "@/db/world-calendar-schema";
import { worldDayReference, worldCalendarAnchor, worldCalendarHistory, worldCalendarAdoption, worldCalendarReform, worldCalendarEntryDate } from "@/db/world-calendar-history-schema";
import { calendarPeriodSchema, adoptionSchema, reformSchema, type CalendarEvolution } from "./calendar-evolution";
import { endpointSchema, elapsedDaySchema, toElapsed, endpointNotation, validateCutover, type CalendarEndpoint, type CalendarEntryDraft } from "./calendar-dates";
import { WorldError, worldWriteTransaction } from "./world-service";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const id=z.string().uuid(),revision=z.number().int().positive();
const command=z.discriminatedUnion("action",[
  z.object({action:z.literal("origin"),label:z.string().trim().min(1).max(160),description:z.string().trim().min(1).max(4000)}).strict(),
  z.object({action:z.literal("anchor"),endpoint:endpointSchema,elapsedDay:elapsedDaySchema,sameDayUnit:z.literal(true)}).strict(),
  z.object({action:z.literal("period"),versionId:id,revision:revision.nullable(),period:calendarPeriodSchema}).strict(),
  z.object({action:z.literal("adoption"),draft:adoptionSchema}).strict(),
  z.object({action:z.literal("reform"),draft:reformSchema}).strict(),
  z.object({action:z.enum(["archive","restore"]),entity:z.enum(["adoption","reform"]),id,revision}).strict(),
]);
const conflict=()=>new WorldError("A newer calendar history was saved in another tab. Your draft is retained. Load the latest calendar history before saving again.",409);
async function available(tx:Tx,worldId:string,versionId:string){const [row]=await tx.select({v:worldCalendarVersion,c:worldCalendar}).from(worldCalendarVersion).innerJoin(worldCalendar,eq(worldCalendar.id,worldCalendarVersion.calendarId)).where(and(eq(worldCalendarVersion.id,versionId),eq(worldCalendarVersion.worldId,worldId)));if(!row)throw new WorldError("This calendar version is unavailable.",404);return row;}
function active(row:Awaited<ReturnType<typeof available>>){if(row.v.archivedAt||row.c.archivedAt)throw new WorldError("Restore this calendar and version before creating new historical uses.",400);}
export async function evolutionRows(tx:Tx,worldId:string):Promise<CalendarEvolution>{
  const [reference]=await tx.select().from(worldDayReference).where(eq(worldDayReference.worldId,worldId));
  const anchors=await tx.select().from(worldCalendarAnchor).where(eq(worldCalendarAnchor.worldId,worldId));
  const histories=await tx.select().from(worldCalendarHistory).where(eq(worldCalendarHistory.worldId,worldId));
  const adoptions=await tx.select().from(worldCalendarAdoption).where(eq(worldCalendarAdoption.worldId,worldId)).orderBy(asc(worldCalendarAdoption.createdAt),asc(worldCalendarAdoption.id));
  const reforms=await tx.select().from(worldCalendarReform).where(eq(worldCalendarReform.worldId,worldId)).orderBy(asc(worldCalendarReform.createdAt),asc(worldCalendarReform.id));
  return {reference:reference?{label:reference.label,description:reference.description}:null,anchors:anchors.map(({versionId,date,elapsedDay})=>({versionId,date,elapsedDay})),histories:histories.map(({versionId,period,revision})=>({versionId,period,revision})),adoptions:adoptions.map(({archivedAt,...row})=>({...row,archived:!!archivedAt})),reforms:reforms.map(({archivedAt,...row})=>({...row,archived:!!archivedAt}))};
}
async function endpoint(tx:Tx,worldId:string,input:z.infer<typeof endpointSchema>,retained?:CalendarEndpoint):Promise<CalendarEndpoint>{
  const row=await available(tx,worldId,input.versionId);
  const same=retained?.versionId===input.versionId&&retained.date.year===input.date.year&&retained.date.month===input.date.month&&retained.date.day===input.date.day&&retained.date.intercalaryId===input.date.intercalaryId;
  if(same)return retained!;
  if(row.v.revision!==input.revision)throw conflict();active(row);
  const [anchor]=await tx.select().from(worldCalendarAnchor).where(and(eq(worldCalendarAnchor.versionId,input.versionId),eq(worldCalendarAnchor.worldId,worldId)));
  let elapsedDay:string;try{elapsedDay=toElapsed(row.v.rules,anchor,input.date);}catch(failure){throw new WorldError(failure instanceof Error?failure.message:"Unsupported calendar date.",400);}
  return {versionId:row.v.id,revision:row.v.revision,calendarId:row.c.id,calendarName:row.c.name,versionTitle:row.v.title,date:input.date,elapsedDay,notation:endpointNotation(row.v.rules,input.date)};
}
export async function saveEntryCalendarDate(tx:Tx,worldId:string,entryId:string,draft:CalendarEntryDraft|null|undefined){
  if(draft===undefined)return; // Older clients retain precise context; no inferred day is ever added.
  if(draft===null){await tx.delete(worldCalendarEntryDate).where(eq(worldCalendarEntryDate.entryId,entryId));return;}
  const [previous]=await tx.select().from(worldCalendarEntryDate).where(and(eq(worldCalendarEntryDate.entryId,entryId),eq(worldCalendarEntryDate.worldId,worldId)));
  const start=await endpoint(tx,worldId,draft.start,previous?.source.start),end="end"in draft?await endpoint(tx,worldId,draft.end,previous?.source.end):undefined;
  if(end&&BigInt(end.elapsedDay)<BigInt(start.elapsedDay))throw new WorldError("The ending calendar date must be at or after the starting date on the elapsed-day reference.",400);
  const values={worldId,startVersionId:start.versionId,endVersionId:end?.versionId??null,source:{version:1 as const,kind:draft.kind,start,...(end?{end}:{})}};
  await tx.insert(worldCalendarEntryDate).values({entryId,...values}).onConflictDoUpdate({target:worldCalendarEntryDate.entryId,set:values});
}
export async function changeCalendarEvolution(userId:string,worldId:string,input:unknown){
  return worldWriteTransaction(userId,worldId,async(tx)=>{
    const c=command.parse(input);let result:string|null=null;
    if(c.action==="origin"){
      const [existing]=await tx.select().from(worldDayReference).where(eq(worldDayReference.worldId,worldId));if(existing)throw new WorldError("The shared day origin is already established and immutable.",409);
      await tx.insert(worldDayReference).values({worldId,label:c.label,description:c.description});
    }else if(c.action==="anchor"){
      const row=await available(tx,worldId,c.endpoint.versionId);active(row);if(row.v.revision!==c.endpoint.revision)throw conflict();
      const [origin]=await tx.select().from(worldDayReference).where(eq(worldDayReference.worldId,worldId));if(!origin)throw new WorldError("Describe this World's elapsed-day origin before establishing an anchor.",400);
      const [existing]=await tx.select().from(worldCalendarAnchor).where(eq(worldCalendarAnchor.versionId,row.v.id));if(existing)throw new WorldError("This version's anchor is immutable. Create a distinct rules version for another epoch or occurrence.",409);
      try{endpointNotation(row.v.rules,c.endpoint.date);toElapsed(row.v.rules,{versionId:row.v.id,date:c.endpoint.date,elapsedDay:c.elapsedDay},c.endpoint.date);}catch(failure){throw new WorldError(failure instanceof Error?failure.message:"Invalid anchor date.",400);}
      await tx.insert(worldCalendarAnchor).values({worldId,versionId:row.v.id,date:c.endpoint.date,elapsedDay:c.elapsedDay});result=row.v.id;
    }else if(c.action==="period"){
      active(await available(tx,worldId,c.versionId));const [previous]=await tx.select().from(worldCalendarHistory).where(eq(worldCalendarHistory.versionId,c.versionId));if((previous?.revision??null)!==c.revision)throw conflict();
      await tx.insert(worldCalendarHistory).values({worldId,versionId:c.versionId,period:c.period}).onConflictDoUpdate({target:worldCalendarHistory.versionId,set:{period:c.period,revision:(previous?.revision??0)+1}});result=c.versionId;
    }else if(c.action==="adoption"){
      active(await available(tx,worldId,c.draft.versionId));result=randomUUID();await tx.insert(worldCalendarAdoption).values({id:result,worldId,...c.draft});
    }else if(c.action==="reform"){
      active(await available(tx,worldId,c.draft.predecessorId));active(await available(tx,worldId,c.draft.successorId));
      if(c.draft.entryId){const [entry]=await tx.select().from(worldEntry).where(and(eq(worldEntry.id,c.draft.entryId),eq(worldEntry.worldId,worldId)));if(!entry)throw new WorldError("This historical entry is unavailable.",404);if(entry.archivedAt)throw new WorldError("Restore this historical entry before linking a new reform.",400);}
      let cutover=null;if(c.draft.cutover){if(c.draft.cutover.before.versionId!==c.draft.predecessorId||c.draft.cutover.after.versionId!==c.draft.successorId)throw new WorldError("Cutover dates must use the selected predecessor and successor versions.",400);const before=await endpoint(tx,worldId,c.draft.cutover.before),after=await endpoint(tx,worldId,c.draft.cutover.after);try{validateCutover(before.elapsedDay,after.elapsedDay);}catch(failure){throw new WorldError((failure as Error).message,400);}cutover={before,after};}
      result=randomUUID();await tx.insert(worldCalendarReform).values({id:result,worldId,...c.draft,cutover});
    }else{
      const table=c.entity==="adoption"?worldCalendarAdoption:worldCalendarReform;const [row]=await tx.select().from(table).where(and(eq(table.id,c.id),eq(table.worldId,worldId)));if(!row)throw new WorldError("This calendar history is unavailable.",404);if(row.revision!==c.revision)throw conflict();await tx.update(table).set({archivedAt:c.action==="archive"?new Date():null,revision:row.revision+1}).where(eq(table.id,c.id));result=c.id;
    }
    await tx.update(world).set({updatedAt:new Date()}).where(eq(world.id,worldId));return result;
  });
}
