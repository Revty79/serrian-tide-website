import "server-only";
import { worldCanonStateSql } from "./world-canon-state";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { worldActor } from "./world-access-service";
import { WorldError } from "./world-errors";
import { worldAdminQuerySchema, type WorldAdminPage, type WorldAdminRow } from "./world-admin-registry";

const prefix=(value:string)=>value.replace(/[\\%_]/g,letter=>"\\"+letter).toLowerCase()+"%";
export async function adminWorldRegistry(userId:string,input:unknown):Promise<WorldAdminPage>{
  if(!(await worldActor(userId)).admin)throw new WorldError("Administrator World management requires administrator access.",403);
  const query=worldAdminQuerySchema.parse(input),pageSize=40;
  const sort={name:sql`lower(w.name)`,owner:sql`lower(u.name)`,created:sql`w.created_at`,activity:sql`w.updated_at`}[query.sort];
  const direction=query.direction==="asc"?sql`asc`:sql`desc`;
  const canon=sql<boolean>`(${worldCanonStateSql(sql`w.id`)}->>'isCanon')::boolean`;
  const rows=(await db.execute<WorldAdminRow>(sql`select w.id,w.name,w.owner_id "ownerId",u.name "ownerName",u.username "ownerUsername",w.created_at "createdAt",w.updated_at "updatedAt",w.archived_at is not null archived,
    (select count(*)::integer from world_access_participant p where p.world_id=w.id and p.state='active') participants,
    (select count(*)::integer from world_access_invitation i where i.world_id=w.id and i.state='pending' and i.expires_at>clock_timestamp()) "pendingInvitations",
    (${canon} or exists(select 1 from world_access_participant p where p.world_id=w.id and p.state='active')) shared,
    ${canon} canon,
    coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'group',t.tag_group) order by t.tag_group,t.name,t.id) from world_classification_tag wt join item_tags_catalog t on t.id=wt.tag_id where wt.world_id=w.id),'[]'::jsonb) classifications
    from world w join "user" u on u.id=w.owner_id
    where (${!query.q} or lower(w.name) like ${prefix(query.q)} escape chr(92) or lower(u.name) like ${prefix(query.q)} escape chr(92) or lower(u.username) like ${prefix(query.q)} escape chr(92) or u.id=${query.q})
      and (${query.status==="all"} or (w.archived_at is not null)=${query.status==="archived"})
      and (${query.sharing==="all"} or (${canon} or exists(select 1 from world_access_participant p where p.world_id=w.id and p.state='active'))=${query.sharing==="shared"})
      and (${!query.classification} or exists(select 1 from world_classification_tag wt join item_tags_catalog t on t.id=wt.tag_id where wt.world_id=w.id and lower(t.name) like ${prefix(query.classification)} escape chr(92)))
    order by ${sort} ${direction},w.id ${direction} limit ${pageSize+1} offset ${query.page*pageSize}`)).rows;
  if(!(await worldActor(userId)).admin)throw new WorldError("Administrator World management requires administrator access.",403);
  return {query,rows:rows.slice(0,pageSize).map(row=>({...row,createdAt:new Date(row.createdAt).toISOString(),updatedAt:new Date(row.updatedAt).toISOString()})),hasMore:rows.length>pageSize,pageSize};
}
