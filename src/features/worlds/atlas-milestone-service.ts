import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { worldGeography } from "@/db/world-atlas-schema";
import { worldHistoryHead, worldHistoryVersion } from "@/db/world-timeline-schema";
import { worldHistoryVersionEntity as links, worldAtlasMilestoneReceipt as receipts } from "@/db/world-peoples-schema";
import { entryDraftSchema, chronologicalEntries, type EntryRecord } from "./history";
import { historyEntryInTransaction } from "./history-index-service";
import { selectedTimeline } from "./history-version-service";
import { worldReadAccess, worldWriteTransaction, changeHistoryInTransaction, WorldError } from "./world-service";
import { ordinaryPlace } from "./peoples-geography-service";
const id=z.string().uuid();
const commandSchema=z.object({timelineId:id,geographyId:id,geographyRevision:z.number().int().positive(),requestId:id,entryId:id.optional(),revision:z.number().int().positive().optional(),eventType:z.string().trim().min(1).max(160),draft:entryDraftSchema}).strict().refine(c=>!!c.entryId===!!c.revision,"Choose an existing event with its revision, or author a new event.");
export type PlaceMilestones={place:{id:string;name:string;revision:number;archived:boolean};timelineName:string;canEdit:boolean;events:(EntryRecord&{eventType:string})[]};
export async function placeMilestones(userId:string,worldId:string,timelineId:string,placeId:string,review=false,ordinary=false):Promise<PlaceMilestones>{
  const parent=await worldReadAccess(userId,worldId,review);
  return db.transaction(async tx=>{
    const timeline=await selectedTimeline(tx,worldId,timelineId);
    const [place]=await tx.select().from(worldGeography).where(and(eq(worldGeography.worldId,worldId),eq(worldGeography.id,placeId),ordinary?ordinaryPlace():undefined));
    if(!place)throw new WorldError("This place is unavailable.",404);
    const rows=await tx.select({id:worldHistoryHead.entityId,eventType:links.eventType}).from(links).innerJoin(worldHistoryHead,and(eq(worldHistoryHead.versionId,links.versionId),eq(worldHistoryHead.timelineId,timelineId))).innerJoin(worldHistoryVersion,eq(worldHistoryVersion.id,links.versionId)).where(and(eq(links.worldId,worldId),eq(links.geographyId,placeId),inArray(worldHistoryHead.mode,["authored","inherited","partial","interpretation"]),ordinary?sql`coalesce(${worldHistoryVersion.payload}->>'visibility','ordinary')='ordinary'`:undefined)).limit(101);
    if(rows.length>100)throw new WorldError("A place supports 100 retained milestones.",400);
    // A single batched source query; no entity graph traversal.
    const sources=rows.length?await tx.select({h:worldHistoryHead,v:worldHistoryVersion}).from(worldHistoryHead).innerJoin(worldHistoryVersion,eq(worldHistoryVersion.id,worldHistoryHead.versionId)).where(and(eq(worldHistoryHead.timelineId,timelineId),eq(worldHistoryHead.worldId,worldId),inArray(worldHistoryHead.entityId,rows.map(r=>r.id)))):[];
    const types=new Map(rows.map(r=>[r.id,r.eventType]));
    const events=sources.map(({h,v})=>({...v.payload as EntryRecord,revision:h.revision,eventType:types.get(h.entityId)!,...ordinary?{notes:""}:{}}));
    return {place:{id:place.id,name:place.name,revision:place.revision,archived:!!place.archivedAt},timelineName:timeline.name,canEdit:!review&&!ordinary&&parent.ownerId===userId&&!parent.archivedAt&&!timeline.archivedAt&&!place.archivedAt,events:chronologicalEntries(events) as PlaceMilestones["events"]};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
export async function savePlaceMilestone(userId:string,worldId:string,input:unknown){
  const c=commandSchema.parse(input);
  return worldWriteTransaction(userId,worldId,async tx=>{
    const timeline=await selectedTimeline(tx,worldId,c.timelineId);
    if(timeline.archivedAt)throw new WorldError("Restore this timeline before authoring history.",400);
    const [place]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,c.geographyId),eq(worldGeography.worldId,worldId)));
    if(!place)throw new WorldError("This place is unavailable.",404);
    const hash=createHash("sha256").update(JSON.stringify(c)).digest("hex");
    if(!c.entryId){const [receipt]=await tx.select().from(receipts).where(and(eq(receipts.worldId,worldId),eq(receipts.timelineId,timeline.id),eq(receipts.requestId,c.requestId)));if(receipt){if(receipt.geographyId!==place.id||receipt.draftHash!==hash)throw new WorldError("This save request was already used for a different account. Your draft is retained.",409);return receipt.entryId;}}
    if(place.revision!==c.geographyRevision)throw new WorldError("This place changed in another tab. Reload its saved record before authoring history; your draft is retained.",409);
    if(place.archivedAt)throw new WorldError("Restore this place before authoring history.",400);
    if(c.entryId){const current=await historyEntryInTransaction(tx,worldId,timeline.id,c.entryId);if(current.revision!==c.revision)throw new WorldError("A newer event was saved. Load the latest account; your draft is retained.",409);const [link]=await tx.select().from(links).where(and(eq(links.versionId,current.historyContext!.versionId),eq(links.geographyId,place.id)));if(!link)throw new WorldError("This event is not linked to this place.",400);}
    else{const [count]=await tx.select({n:sql<number>`count(*)::integer`}).from(links).innerJoin(worldHistoryHead,and(eq(worldHistoryHead.versionId,links.versionId),eq(worldHistoryHead.timelineId,timeline.id))).where(and(eq(links.worldId,worldId),eq(links.geographyId,place.id)));if(count.n>=100)throw new WorldError("A place supports 100 retained milestones, including archived accounts.",400);}
    const entryId=await changeHistoryInTransaction(tx,userId,worldId,{entity:"entry",action:"save",timelineId:timeline.id,...c.entryId?{id:c.entryId,revision:c.revision}:{},draft:{...c.draft,eventType:c.eventType}});
    const [head]=await tx.select().from(worldHistoryHead).where(and(eq(worldHistoryHead.timelineId,timeline.id),eq(worldHistoryHead.entityId,entryId)));
    await tx.insert(links).values({versionId:head.versionId,worldId,entryId,targetId:place.id,geographyId:place.id,loreId:null,entityCategory:place.context==="place"?place.kind:place.context,eventType:c.eventType}).onConflictDoUpdate({target:[links.versionId,links.targetId],set:{eventType:c.eventType}});
    if(!c.entryId)await tx.insert(receipts).values({worldId,timelineId:timeline.id,requestId:c.requestId,geographyId:place.id,entryId,draftHash:hash});
    return entryId;
  });
}
