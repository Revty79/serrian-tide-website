import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { world, worldEra, worldEntry, worldTimeline } from "@/db/world-schema";
import { worldHistoryHead, worldHistoryVersion } from "@/db/world-timeline-schema";
import { branchDraftSchema, HISTORY_LIMIT, inheritanceMode, timelineDraftSchema, TIMELINE_LIMIT, type HistoricalSnapshot, type InheritanceMode } from "./branching-history";
import { capturePrimaryVersion, effectiveHistory, historyHeads, insertHistoryVersion, selectedTimeline, type HistoryTx } from "./history-version-service";
import { primaryHistoryRows, sourceDatingFor, WorldError, worldWriteTransaction } from "./world-service";
import { resolveHistoryCalendarSource } from "./calendar-evolution-service";
import type { EntryDraft, EntryRecord, EraDraft } from "./history";
const id=z.string().uuid(),revision=z.number().int().positive();
const commandSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),parentRevision:revision,draft:branchDraftSchema}).strict(),
  z.object({action:z.literal("save"),id,revision,draft:timelineDraftSchema}).strict(),
  z.object({action:z.enum(["archive","restore"]),id,revision}).strict(),
  z.object({action:z.literal("resolve"),id,entityId:id,revision,decision:z.enum(["include","exclude"])}).strict(),
  z.object({action:z.literal("accept-parent"),id,entityId:id,revision,parentRevision:revision,parentVersionId:id}).strict(),
]);
const unavailable=()=>new WorldError("This timeline or historical source is unavailable.",404);
const conflict=()=>new WorldError("A newer version was saved in another tab. Your draft is retained. Load the latest history before saving again.",409);

export async function changeTimeline(userId:string,worldId:string,input:unknown){
  return worldWriteTransaction(userId,worldId,async tx=>{
    const command=commandSchema.parse(input);
    if(command.action==="create"){
      const parent=await selectedTimeline(tx,worldId,command.draft.parentId);
      if(parent.revision!==command.parentRevision)throw conflict();
      if(parent.archivedAt)throw new WorldError("Restore the parent timeline before branching from it.",400);
      if(parent.divergenceYear!==null&&command.draft.divergenceYear<parent.divergenceYear)throw new WorldError("Choose this parent's divergence year or a later year. For earlier history, branch from an earlier ancestor.",400);
      const [count]=await tx.select({value:sql<number>`count(*)::integer`}).from(worldTimeline).where(eq(worldTimeline.worldId,worldId));
      if(count.value>=TIMELINE_LIMIT)throw new WorldError(`A World supports ${TIMELINE_LIMIT} retained timelines.`,400);
      if(parent.primary){const records=await primaryHistoryRows(tx,worldId,parent.id);for(const record of [...records.eras,...records.entries])await capturePrimaryVersion(tx,parent.id,record);}
      const sources=await historyHeads(tx,worldId,parent.id);
      const timelineId=randomUUID(),{parentId,divergenceYear,...draft}=command.draft;
      await tx.insert(worldTimeline).values({id:timelineId,worldId,parentId,divergenceYear,...draft});
      if(sources.length)await tx.insert(worldHistoryHead).values(sources.map(({head,version})=>{
        const entity=version.entryId?"entry":"era";
        let mode:InheritanceMode=inheritanceMode(entity,version.payload,divergenceYear);
        if(head.mode==="pending"||head.mode==="excluded")mode=head.mode;
        else if(head.mode==="partial"&&mode!=="excluded")mode="partial";
        return {timelineId,worldId,entityId:head.entityId,versionId:head.versionId,mode,revision:1,sourceTimelineId:parent.id,sourceVersionId:head.versionId,sourceRevision:head.revision,coveredUntil:mode==="partial"?Math.min(divergenceYear-1,head.coveredUntil??divergenceYear-1):null};
      }));
      const {inheritPeoples}=await import("./peoples-service");await inheritPeoples(tx,userId,worldId,parent.id,timelineId,divergenceYear);
      await touch(tx,worldId);return timelineId;
    }
    const timeline=await selectedTimeline(tx,worldId,command.id);
    if(command.action==="save"||command.action==="archive"||command.action==="restore"){
      if(timeline.revision!==command.revision)throw conflict();
      if(command.action!=="save"&&timeline.primary)throw new WorldError("Primary History is permanent and cannot be archived or replaced.",400);
      if(command.action==="save"&&timeline.archivedAt)throw new WorldError("Restore this timeline before editing it.",400);
      await tx.update(worldTimeline).set({...command.action==="save"?command.draft:{archivedAt:command.action==="archive"?new Date():null},revision:timeline.revision+1,updatedAt:new Date()}).where(eq(worldTimeline.id,timeline.id));
      await touch(tx,worldId);return timeline.id;
    }
    if(timeline.primary||timeline.archivedAt)throw new WorldError("Choose an active alternate timeline to resolve inherited history.",400);
    if(!("entityId" in command))throw new WorldError("Choose an inherited source.",400);
    const [row]=await tx.select({head:worldHistoryHead,version:worldHistoryVersion}).from(worldHistoryHead).innerJoin(worldHistoryVersion,eq(worldHistoryVersion.id,worldHistoryHead.versionId)).where(and(eq(worldHistoryHead.timelineId,timeline.id),eq(worldHistoryHead.entityId,command.entityId),eq(worldHistoryHead.worldId,worldId)));
    if(!row||!row.head.sourceTimelineId)throw unavailable();
    if(row.head.revision!==command.revision)throw conflict();
    let mode:InheritanceMode,versionId=row.head.versionId,sourceVersionId=row.head.sourceVersionId,sourceRevision=row.head.sourceRevision,coveredUntil=row.head.coveredUntil;
    if(command.action==="resolve"){
      // Including is deliberate adoption of the complete source, including uncertain or later portions.
      mode=command.decision==="include"?(row.version.timelineId===timeline.id?"interpretation":"inherited"):"excluded";coveredUntil=null;
    }else{
      const [parent]=await tx.select({head:worldHistoryHead,version:worldHistoryVersion}).from(worldHistoryHead).innerJoin(worldHistoryVersion,eq(worldHistoryVersion.id,worldHistoryHead.versionId)).where(and(eq(worldHistoryHead.timelineId,row.head.sourceTimelineId),eq(worldHistoryHead.entityId,row.head.entityId),eq(worldHistoryHead.worldId,worldId)));
      if(!parent||parent.head.revision!==command.parentRevision||parent.head.versionId!==command.parentVersionId)throw conflict();
      versionId=sourceVersionId=parent.head.versionId;sourceRevision=parent.head.revision;
      mode=inheritanceMode(parent.version.entryId?"entry":"era",parent.version.payload,timeline.divergenceYear!);
      if(parent.head.mode==="excluded"||parent.head.mode==="pending")mode=parent.head.mode;
      else if(parent.head.mode==="partial"&&mode!=="excluded")mode="partial";
      coveredUntil=mode==="partial"?Math.min(timeline.divergenceYear!-1,parent.head.coveredUntil??timeline.divergenceYear!-1):null;
    }
    await tx.update(worldHistoryHead).set({mode,versionId,sourceVersionId,sourceRevision,coveredUntil,revision:row.head.revision+1}).where(and(eq(worldHistoryHead.timelineId,timeline.id),eq(worldHistoryHead.entityId,row.head.entityId)));
    await touch(tx,worldId);return timeline.id;
  });
}
type HistoryCommand = {entity:"entry";id?:string;revision?:number;action:"save"|"archive"|"restore";draft?:EntryDraft}|{entity:"era";id?:string;revision?:number;action:"save"|"archive"|"restore";draft?:EraDraft};
export async function changeBranchHistory(tx:HistoryTx,worldId:string,timeline:typeof worldTimeline.$inferSelect,command:HistoryCommand,entityId:string){
  const rows=await historyHeads(tx,worldId,timeline.id),row=rows.find(item=>item.head.entityId===entityId);
  if(command.id&&(!row||(!!row.version.entryId)!==(command.entity==="entry")))throw unavailable();
  if(row&&row.head.revision!==command.revision)throw conflict();
  if(!row&&rows.length>=HISTORY_LIMIT)throw new WorldError("This timeline has reached its retained-history limit.",400);
  if(row&&(row.head.mode==="pending"||row.head.mode==="excluded"))throw new WorldError("Resolve this inherited source before editing or archiving it.",400);
  const previous=row?.version.payload;
  const nextRevision=(row?.head.revision??0)+1;
  let record:HistoricalSnapshot;
  if(command.action!=="save"){
    if(!previous)throw new WorldError("Choose a saved historical record.",400);
    record={...previous,revision:nextRevision,archived:command.action==="archive",...("time"in previous?{updatedAt:new Date().toISOString()}:{})};
  }else{
    if(previous?.archived)throw new WorldError("Restore this historical account before editing it.",400);
    if(!command.draft)throw new WorldError("Enter this historical account's details.",400);
    const draft=command.draft;
    const time=command.entity==="entry"?(draft as EntryDraft).time:null;
    const years=command.entity==="era"?[(draft as EraDraft).startYear,(draft as EraDraft).endYear]:time?.kind==="undated"?[]:time&&"year"in time?[time.year]:time&&"startYear"in time?[time.startYear,time.endYear]:[];
    const source=await sourceDatingFor(tx,worldId,draft.datingSystemId,draft.datingSystemRevision,years,previous?{datingSystemId:previous.datingSystemId??null,sourceDating:previous.sourceDating??null}:undefined);
    if(command.entity==="era"){
      const {datingSystemRevision:_,...fields}=draft as EraDraft;void _;
      record={...fields,...source,id:entityId,worldId,revision:nextRevision,archived:false};
      if(!row)await tx.insert(worldEra).values({id:entityId,worldId,timelineId:timeline.id,name:fields.name,description:fields.description,startYear:fields.startYear,endYear:fields.endYear,tone:fields.tone,...source});
    }else{
      const {calendarDate,datingSystemRevision:_,...fields}=draft as EntryDraft;void _;
      const previousEntry=previous as EntryRecord|undefined;
      const effective=await effectiveHistory(tx,worldId,timeline);
      const retained=new Set(previousEntry?.eraIds??[]);
      if(fields.eraIds.some(id=>!effective.eras.some(era=>era.id===id&&(!era.archived||retained.has(id)))&&!retained.has(id)))throw new WorldError("Choose an available era in this timeline. Existing source relationships may be retained.",400);
      record={...fields,...source,id:entityId,worldId,revision:nextRevision,archived:false,updatedAt:new Date().toISOString(),calendarSource:await resolveHistoryCalendarSource(tx,worldId,calendarDate,previousEntry?.calendarSource)};
      if(!row)await tx.insert(worldEntry).values({id:entityId,worldId,timelineId:timeline.id,title:fields.title,account:fields.account,notes:fields.notes,time:fields.time,accuracy:fields.accuracy,narrative:fields.narrative,...source});
    }
  }
  const versionId=await insertHistoryVersion(tx,timeline.id,record);
  if(row)await tx.update(worldHistoryHead).set({versionId,revision:nextRevision,mode:row.head.sourceTimelineId?"interpretation":"authored",coveredUntil:null}).where(and(eq(worldHistoryHead.timelineId,timeline.id),eq(worldHistoryHead.entityId,entityId)));
  else await tx.insert(worldHistoryHead).values({timelineId:timeline.id,worldId,entityId,versionId,mode:"authored",revision:nextRevision});
  await touch(tx,worldId);
}
async function touch(tx:HistoryTx,worldId:string){await tx.update(world).set({updatedAt:new Date()}).where(eq(world.id,worldId));}
