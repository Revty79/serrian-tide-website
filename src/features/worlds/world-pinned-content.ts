import "server-only";
import {sql} from "drizzle-orm";
import {db} from "@/db";
import {ordinaryLorePinnedSource,ordinaryHistorySource} from "./ordinary-knowledge";
import {worldScopeAllowed,worldProtectedContent} from "./world-access-service";
import {loreWorldScope,worldScopes} from "./world-permissions";

/** Retained map snapshots contain reference labels as well as geometry. Resolve
 * their exact version pins before returning labels captured by another author. */
export async function projectWorldPinnedContent<T>(payload:T,worldId:string,timelineId?:string,connection:Pick<typeof db,"execute">=db,options:{ordinary?:boolean}={}):Promise<T>{
 if(!options.ordinary&&worldProtectedContent(worldId)&&worldScopes.every(scope=>worldScopeAllowed(worldId,scope)))return payload;
 const ids=new Set<string>(),identities=new Set<string>();
 function gather(value:unknown){if(!value||typeof value!=="object"||value instanceof Date||value instanceof Uint8Array)return;if(Array.isArray(value)){for(const child of value)gather(child);return;}const row=value as Record<string,unknown>;if(["name","entityName","title"].some(key=>typeof row[key]==="string"))for(const key of ["id","entityId","targetId"])if(typeof row[key]==="string"&&/^[a-f0-9-]{36}$/i.test(row[key] as string))identities.add(row[key] as string);for(const [key,child]of Object.entries(value)){if((key==="versionId"||key.endsWith("VersionId"))&&typeof child==="string"&&/^[a-f0-9-]{36}$/i.test(child))ids.add(child);else if(child&&typeof child==="object")gather(child);}}
 gather(payload);if(!ids.size&&!identities.size)return payload;
 const blocked=new Set<string>(),protectedContent=!options.ordinary&&worldProtectedContent(worldId),history=worldScopeAllowed(worldId,"history"),timekeeping=worldScopeAllowed(worldId,"timekeeping");
 // Resource and source limits bound each response; chunk binds independently
 // of the size of a terrain grid, without querying unrelated Worlds.
 const values=[...ids];
 for(let offset=0;offset<values.length;offset+=500){const pins=sql.join(values.slice(offset,offset+500).map(id=>sql`${id}`),sql`,`);
  const rows=(await connection.execute<{id:string;family:string;timelineId:string|null;readable:boolean}>(sql`
   select v.id,v.family,v.timeline_id "timelineId",true readable from world_lore_version v where v.world_id=${worldId} and v.id in (${pins})
   union all select v.id,'history',v.timeline_id,true from world_history_version v where v.world_id=${worldId} and v.id in (${pins})
   union all select v.id,'timekeeping',null,${protectedContent?sql`true`:sql`c.visibility='ordinary'`} from world_calendar_version v join world_calendar c on c.id=v.calendar_id and c.world_id=v.world_id where v.world_id=${worldId} and v.id in (${pins})`)).rows;
  for(const row of rows)if(!row.readable||!(row.family==="history"?history:row.family==="timekeeping"?timekeeping:worldScopeAllowed(worldId,loreWorldScope(row.family))))blocked.add(row.id);
  if(!protectedContent)for(const selected of new Set(rows.filter(row=>row.timelineId).map(row=>timelineId??row.timelineId!))){
   const ordinary=(await connection.execute<{id:string}>(sql`select pin_candidate.id from world_lore_version pin_candidate where pin_candidate.world_id=${worldId} and pin_candidate.id in (${pins}) and ${ordinaryLorePinnedSource(worldId,selected,sql`pin_candidate.id`)} union all select pin_candidate.id from world_history_version pin_candidate where pin_candidate.world_id=${worldId} and pin_candidate.id in (${pins}) and ${ordinaryHistorySource(worldId,selected,sql`pin_candidate.id`)}`)).rows;
   const visible=new Set(ordinary.map(row=>row.id));for(const row of rows)if(row.timelineId&&(timelineId??row.timelineId)===selected&&!visible.has(row.id))blocked.add(row.id);
  }
 }
 const blockedIdentities=new Set<string>();
 if(identities.size){const selected=timelineId??(await connection.execute<{id:string}>(sql`select id from world_timeline where world_id=${worldId} and is_primary limit 1`)).rows[0]?.id;
  if(selected){const references=[...identities];for(let offset=0;offset<references.length;offset+=500){const candidates=sql.join(references.slice(offset,offset+500).map(id=>sql`${id}`),sql`,`);
   const rows=(await connection.execute<{id:string;family:string;readable:boolean}>(sql`select i.id,i.family,coalesce(${protectedContent?sql`true`:ordinaryLorePinnedSource(worldId,selected,sql`reference_candidate.id`)},false) readable from world_lore_identity i left join world_lore_head h on h.world_id=i.world_id and h.entity_id=i.id and h.timeline_id=${selected} left join world_lore_version v on v.id=h.version_id left join world_lore_version reference_candidate on reference_candidate.id=v.id where i.world_id=${worldId} and i.id in (${candidates})
    union all select i.id,'history',coalesce(${protectedContent?sql`true`:ordinaryHistorySource(worldId,selected,sql`reference_candidate.id`)},false) from (select id from world_historical_entry where world_id=${worldId} union select id from world_historical_era where world_id=${worldId}) i left join world_history_head h on h.entity_id=i.id and h.world_id=${worldId} and h.timeline_id=${selected} left join world_history_version reference_candidate on reference_candidate.id=h.version_id where i.id in (${candidates})`)).rows;
   for(const row of rows)if(!row.readable||!(row.family==="history"?history:worldScopeAllowed(worldId,loreWorldScope(row.family))))blockedIdentities.add(row.id);
  }}
 }
 if(!blocked.size&&!blockedIdentities.size)return payload;
 function project(value:unknown):unknown{if(Array.isArray(value))return value.map(project).filter(child=>child!==undefined);if(!value||typeof value!=="object"||value instanceof Date||value instanceof Uint8Array)return value;const entries=Object.entries(value);if(entries.some(([key,child])=>["id","entityId","targetId"].includes(key)&&typeof child==="string"&&blockedIdentities.has(child))||entries.some(([key,child])=>(key==="versionId"||key.endsWith("VersionId"))&&typeof child==="string"&&blocked.has(child)))return undefined;return Object.fromEntries(entries.map(([key,child])=>[key,project(child)]).filter(([,child])=>child!==undefined));}
 return project(payload) as T;
}
