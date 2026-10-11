import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { worldTimeline } from "@/db/world-schema";
import { worldHistoryHead, worldHistoryVersion, worldHistoryVersionEra } from "@/db/world-timeline-schema";
import { worldHistoryVersionEntity } from "@/db/world-peoples-schema";
import { HISTORY_LIMIT, inheritedProjection, type HistoricalSnapshot, type HistoryContext, type InheritanceReview, type WorldTimeline } from "./branching-history";
import type { EntryRecord, EraRecord } from "./history";
import { WorldError } from "./world-service";
export type HistoryTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function timelineDto(row: typeof worldTimeline.$inferSelect): WorldTimeline {
  return { id:row.id,worldId:row.worldId,primary:row.primary,parentId:row.parentId,divergenceYear:row.divergenceYear,name:row.name,description:row.description,explanation:row.explanation,revision:row.revision,archived:!!row.archivedAt };
}
export async function selectedTimeline(tx:HistoryTx,worldId:string,id?:string|null) {
  const [row]=await tx.select().from(worldTimeline).where(and(eq(worldTimeline.worldId,worldId),id?eq(worldTimeline.id,id):eq(worldTimeline.primary,true))).limit(1);
  if(!row)throw new WorldError("This historical timeline is unavailable.",404);
  return row;
}
export async function insertHistoryVersion(tx:HistoryTx,timelineId:string,record:HistoricalSnapshot) {
  const id=randomUUID();
  const payload={...record};delete payload.historyContext;
  const entry="time" in payload?payload:null;
  await tx.insert(worldHistoryVersion).values({id,worldId:record.worldId,entityId:record.id,timelineId,entryId:entry?record.id:null,eraId:entry?null:record.id,payload,datingSystemId:record.datingSystemId??null,startVersionId:entry?.calendarSource?.start.versionId??null,endVersionId:entry?.calendarSource?.end?.versionId??null});
  if(entry?.eraIds.length)await tx.insert(worldHistoryVersionEra).values([...new Set(entry.eraIds)].map(eraId=>({versionId:id,worldId:record.worldId,entryId:record.id,eraId})));
  if(entry){const [previous]=await tx.select().from(worldHistoryHead).where(and(eq(worldHistoryHead.timelineId,timelineId),eq(worldHistoryHead.entityId,record.id)));if(previous){const links=await tx.select().from(worldHistoryVersionEntity).where(eq(worldHistoryVersionEntity.versionId,previous.versionId));if(links.length)await tx.insert(worldHistoryVersionEntity).values(links.map(link=>({...link,versionId:id})));}}
  return id;
}
export async function capturePrimaryVersion(tx:HistoryTx,timelineId:string,record:HistoricalSnapshot) {
  const [head]=await tx.select().from(worldHistoryHead).where(and(eq(worldHistoryHead.timelineId,timelineId),eq(worldHistoryHead.entityId,record.id)));
  if(head?.revision===record.revision)return;
  const versionId=await insertHistoryVersion(tx,timelineId,record);
  if(head)await tx.update(worldHistoryHead).set({versionId,revision:head.revision+1}).where(and(eq(worldHistoryHead.timelineId,timelineId),eq(worldHistoryHead.entityId,record.id)));
  else await tx.insert(worldHistoryHead).values({timelineId,worldId:record.worldId,entityId:record.id,versionId,mode:"authored",revision:record.revision});
}
export async function historyHeads(tx:HistoryTx,worldId:string,timelineId:string) {
  const rows=await tx.select({head:worldHistoryHead,version:worldHistoryVersion}).from(worldHistoryHead).innerJoin(worldHistoryVersion,eq(worldHistoryVersion.id,worldHistoryHead.versionId)).where(and(eq(worldHistoryHead.worldId,worldId),eq(worldHistoryHead.timelineId,timelineId))).orderBy(asc(worldHistoryHead.entityId)).limit(HISTORY_LIMIT+1);
  if(rows.length>HISTORY_LIMIT)throw new WorldError(`This timeline exceeds the supported ${HISTORY_LIMIT.toLocaleString()} retained records. Contact support before adding more.`,400);
  return rows;
}
export async function effectiveHistory(tx:HistoryTx,worldId:string,timeline:typeof worldTimeline.$inferSelect) {
  const rows=await historyHeads(tx,worldId,timeline.id);
  const parentHeads=timeline.parentId?await tx.select().from(worldHistoryHead).where(and(eq(worldHistoryHead.worldId,worldId),eq(worldHistoryHead.timelineId,timeline.parentId))).limit(HISTORY_LIMIT+1):[];
  const parentById=new Map(parentHeads.map(head=>[head.entityId,head]));
  const eras:EraRecord[]=[],entries:EntryRecord[]=[],inheritanceReview:InheritanceReview[]=[];
  for(const {head,version}of rows){
    const parent=parentById.get(head.entityId);
    const context:HistoryContext={mode:head.mode,timelineId:timeline.id,versionId:version.id,sourceTimelineId:head.sourceTimelineId,sourceVersionId:head.sourceVersionId,sourceRevision:head.sourceRevision,newerParent:!!parent&&parent.revision!==head.sourceRevision,parentRevision:parent?.revision??null,parentVersionId:parent?.versionId??null,coveredUntil:head.coveredUntil};
    const record={...version.payload,revision:head.revision};
    const entity=version.entryId?"entry":"era";
    if(head.mode!=="authored")inheritanceReview.push({entity,record,context});
    if(head.mode==="pending"||head.mode==="excluded")continue;
    const projection=inheritedProjection(record,context);
    if(entity==="entry")entries.push(projection as EntryRecord);else eras.push(projection as EraRecord);
  }
  return {eras,entries,inheritanceReview};
}
