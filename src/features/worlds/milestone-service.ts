import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { worldGeography } from "@/db/world-atlas-schema";
import { worldHistoryHead, worldHistoryVersion } from "@/db/world-timeline-schema";
import { worldHistoryVersionEntity as links, worldLoreHead, worldLoreVersion } from "@/db/world-peoples-schema";
import { worldReadAccess, worldWriteTransaction, changeHistoryInTransaction, WorldError } from "./world-service";
import { peoplesReferencesInTransaction, milestoneDraft, entityMilestones } from "./peoples-service";
import { selectedTimeline } from "./history-version-service";
import type { EntryRecord } from "./history";
const id=z.string().uuid();
const linkSchema=z.object({timelineId:id,entryId:id,revision:z.number().int().positive(),targetId:id,kind:z.enum(["lore","geography"]),eventType:z.string().trim().min(1).max(160)}).strict();
export type MilestoneLinks={links:{id:string;name:string;kind:"lore"|"geography";eventType:string;timelineId:string}[];choices:{id:string;name:string;kind:"lore"|"geography"}[]};
export async function milestoneLinks(userId:string,worldId:string,timelineId:string,entryId:string,review=false,ordinary=false):Promise<MilestoneLinks> {
  await worldReadAccess(userId,worldId,review);
  return db.transaction(async tx=>{const refs=await peoplesReferencesInTransaction(tx,worldId,timelineId,ordinary);const [h]=await tx.select({h:worldHistoryHead,v:worldHistoryVersion}).from(worldHistoryHead).innerJoin(worldHistoryVersion,eq(worldHistoryVersion.id,worldHistoryHead.versionId)).where(and(eq(worldHistoryHead.worldId,worldId),eq(worldHistoryHead.timelineId,timelineId),eq(worldHistoryHead.entityId,entryId)));if(!h?.v.entryId||(ordinary&&(h.v.payload as EntryRecord).visibility==="protected"))throw new WorldError("This event is unavailable.",404);
    const places=await tx.select({id:worldGeography.id,name:worldGeography.name,archivedAt:worldGeography.archivedAt}).from(worldGeography).where(and(eq(worldGeography.worldId,worldId),ordinary?sql`not exists (select 1 from world_dungeon_entity d where d.world_id=${worldId} and d.visibility<>'ordinary' and (d.id=${worldGeography.id} or d.geography_id=${worldGeography.id}))`:undefined)).limit(2000);
    const choices=[...refs.entities.filter(e=>!e.archived).map(e=>({id:e.id,name:e.name,kind:"lore" as const})),...places.filter(p=>!p.archivedAt).map(p=>({id:p.id,name:p.name,kind:"geography" as const}))];const names=new Map([...refs.entities,...places].map(e=>[e.id,e.name]));
    const current=await tx.select().from(links).where(eq(links.versionId,h.h.versionId)).limit(101);if(current.length>100)throw new WorldError("This event exceeds its supported 100 participating entities.",400);
    const missingPlaces=current.filter(l=>l.geographyId&&!names.has(l.targetId)).map(l=>l.targetId);
    if(missingPlaces.length){const retainedPlaces=await tx.select({id:worldGeography.id,name:worldGeography.name}).from(worldGeography).where(and(eq(worldGeography.worldId,worldId),inArray(worldGeography.id,missingPlaces),ordinary?sql`not exists (select 1 from world_dungeon_entity d where d.world_id=${worldId} and d.visibility<>'ordinary' and (d.id=${worldGeography.id} or d.geography_id=${worldGeography.id}))`:undefined));for(const p of retainedPlaces)names.set(p.id,p.name);}
    const missing=current.filter(l=>l.loreId&&!names.has(l.targetId)).map(l=>l.targetId);
    const retained=!ordinary&&missing.length?(await tx.execute<{id:string;name:string;timeline_id:string}>(sql`
      select i.id,coalesce(s.name,p.name,o.name,r.name) name,coalesce(ch.timeline_id,oh.timeline_id) timeline_id
      from world_lore_identity i
      left join world_lore_head ch on ch.entity_id=i.id and ch.timeline_id=${timelineId} and ch.world_id=i.world_id
      left join world_lore_head oh on oh.entity_id=i.id and oh.timeline_id=i.origin_timeline_id and oh.world_id=i.world_id
      join world_lore_version v on v.id=coalesce(ch.version_id,oh.version_id)
      left join world_species_version s on s.version_id=v.id left join world_people_version p on p.version_id=v.id
      left join world_origin_version o on o.version_id=v.id left join world_relationship_version r on r.version_id=v.id
      where i.world_id=${worldId} and i.id in (${sql.join(missing.map(id=>sql`${id}`),sql`,` )})
    `)).rows:[];
    const retainedById=new Map(retained.map(r=>[r.id,r]));return {choices,links:current.filter(l=>!ordinary||names.has(l.targetId)).map(l=>({id:l.targetId,name:names.get(l.targetId)??retainedById.get(l.targetId)?.name??"Retained unavailable entity",timelineId:retainedById.get(l.targetId)?.timeline_id??timelineId,kind:l.loreId?"lore":"geography",eventType:l.eventType}))};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
export async function linkMilestone(userId:string,worldId:string,input:unknown) {
  const command=linkSchema.parse(input);
  return worldWriteTransaction(userId,worldId,async tx=>{const timeline=await selectedTimeline(tx,worldId,command.timelineId);if(timeline.archivedAt)throw new WorldError("Restore this timeline before editing.",400);
    const [current]=await tx.select({h:worldHistoryHead,v:worldHistoryVersion}).from(worldHistoryHead).innerJoin(worldHistoryVersion,eq(worldHistoryVersion.id,worldHistoryHead.versionId)).where(and(eq(worldHistoryHead.worldId,worldId),eq(worldHistoryHead.timelineId,timeline.id),eq(worldHistoryHead.entityId,command.entryId),inArray(worldHistoryHead.mode,["authored","inherited","interpretation"])));if(!current?.v.entryId)throw new WorldError("This event is unavailable.",404);if(current.h.revision!==command.revision)throw new WorldError("A newer event was saved. Reload before linking; your draft is retained.",409);
    const members=await tx.select({targetId:links.targetId}).from(links).where(eq(links.versionId,current.h.versionId)).limit(101);if(members.length>=100&&!members.some(m=>m.targetId===command.targetId))throw new WorldError("An event supports 100 participating entities. Keep the existing references or choose a separate authored account.",400);
    let entityCategory:string;
    if(command.kind==="geography"){const [place]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,command.targetId),eq(worldGeography.worldId,worldId)));if(!place||place.archivedAt)throw new WorldError("Choose an active place in this World.",400);entityCategory=place.context==="place"?place.kind:place.context;}else{const [target]=await tx.select({h:worldLoreHead,v:worldLoreVersion}).from(worldLoreHead).innerJoin(worldLoreVersion,eq(worldLoreVersion.id,worldLoreHead.versionId)).where(and(eq(worldLoreHead.timelineId,timeline.id),eq(worldLoreHead.worldId,worldId),eq(worldLoreHead.entityId,command.targetId)));if(!target||target.v.archived||["pending","excluded"].includes(target.h.mode))throw new WorldError("Choose an available entity in this timeline.",400);entityCategory=target.v.family;const retained=await entityMilestones(tx,worldId,timeline.id,command.targetId);if(retained.length>=40&&!retained.some(m=>m.id===command.entryId))throw new WorldError("This entity supports 40 retained milestones, including archived accounts.",400);}
    await changeHistoryInTransaction(tx,userId,worldId,{entity:"entry",action:"save",timelineId:timeline.id,id:command.entryId,revision:command.revision,draft:milestoneDraft(current.v.payload as EntryRecord)});
    const [next]=await tx.select().from(worldHistoryHead).where(and(eq(worldHistoryHead.timelineId,timeline.id),eq(worldHistoryHead.entityId,command.entryId)));
    await tx.insert(links).values({versionId:next.versionId,worldId,entryId:command.entryId,targetId:command.targetId,entityCategory,loreId:command.kind==="lore"?command.targetId:null,geographyId:command.kind==="geography"?command.targetId:null,eventType:command.eventType}).onConflictDoUpdate({target:[links.versionId,links.targetId],set:{eventType:command.eventType}});
    return command.entryId;
  });
}
