import "server-only";
import {z} from "zod";
import { and, desc, eq, isNull,inArray,sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { world } from "@/db/world-schema";
import { worldParticipant } from "@/db/world-collaboration-schema";
import { collaborationAvailable, worldActor } from "./world-access-service";
import type { WorldRecord } from "./history";
export type SharedWorldRecord=WorldRecord&{sharedRole:"viewer"|"editor"};
/** Only accepted current grants; no content/counts from unshared sections. */
export async function sharedWorldPage(userId:string,query:Record<string,unknown>={}){
  const {offset,search}=z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0),search:z.string().trim().max(160).default("")}).parse(query);
  await worldActor(userId);if(!await collaborationAvailable())return {worlds:[] as SharedWorldRecord[],hasMore:false};
  const rows=await db.select({record:{id:world.id,ownerId:world.ownerId,name:world.name,description:world.description,tone:world.tone,revision:world.revision,archivedAt:world.archivedAt,updatedAt:world.updatedAt},ownerName:user.name,grantRevision:worldParticipant.revision,role:worldParticipant.role,scopes:worldParticipant.scopes}).from(worldParticipant).innerJoin(world,eq(world.id,worldParticipant.worldId)).innerJoin(user,eq(user.id,world.ownerId)).where(and(eq(worldParticipant.userId,userId),eq(worldParticipant.state,"active"),isNull(world.archivedAt),search?sql`${world.name} ilike ${search.replace(/[\\%_]/g,"\\$&")+"%"} escape chr(92)`:undefined)).orderBy(desc(world.updatedAt),desc(world.id)).limit(51).offset(offset);
  // A slow registry response cannot deliver an old grant or an archived World.
  // One bounded recheck covers the page without a per-World query loop.
  const current=rows.length?await db.select({worldId:worldParticipant.worldId,revision:worldParticipant.revision}).from(worldParticipant).innerJoin(world,eq(world.id,worldParticipant.worldId)).where(and(eq(worldParticipant.userId,userId),eq(worldParticipant.state,"active"),isNull(world.archivedAt),inArray(worldParticipant.worldId,rows.map(row=>row.record.id)))):[];await worldActor(userId);
  const worlds:SharedWorldRecord[]=rows.slice(0,50).filter(row=>current.some(grant=>grant.worldId===row.record.id&&grant.revision===row.grantRevision)).map(({record,ownerName,role,scopes})=>({id:record.id,ownerId:record.ownerId,ownerName,name:record.name,description:scopes.includes("overview")?record.description:"",introduction:"",historicalOverview:"",tone:record.tone as WorldRecord["tone"],revision:record.revision,archived:false,updatedAt:record.updatedAt.toISOString(),tagIds:[],eraCount:0,entryCount:0,sharedRole:role as "viewer"|"editor"}));
  return {worlds,hasMore:rows.length>50};
}

export async function listSharedWorlds(userId:string):Promise<SharedWorldRecord[]>{return (await sharedWorldPage(userId)).worlds;}
