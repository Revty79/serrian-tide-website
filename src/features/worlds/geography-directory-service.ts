import "server-only";
import {and,asc,eq,gt,ilike,inArray,isNull,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldGeography} from "@/db/world-atlas-schema";
import {WorldError,worldReadAccess} from "./world-service";
import {worldContentEditor,worldOrdinaryContent} from "./world-access-service";
import {geographicPrivatePlaces} from "./geographic-privacy";
import {GEOGRAPHY_PAGE_SIZE,REGIONAL_GEOGRAPHY_CONTEXTS,geographyDirectoryQuery,geographySearchPattern,type GeographyDirectory} from "./geography-directory";
import type {GeographyRecord} from "./atlas";

const dto=(g:typeof worldGeography.$inferSelect):GeographyRecord=>({id:g.id,parentId:g.parentId,name:g.name,description:g.description,kind:g.kind as GeographyRecord["kind"],context:g.context as GeographyRecord["context"],revision:g.revision,archived:!!g.archivedAt});
/** Read one sibling page and its actual ancestry, without loading a World's tree. */
export async function geographyDirectory(userId:string,worldId:string,input:unknown,options:{review?:boolean;ordinary?:boolean}={}):Promise<GeographyDirectory>{
 const access=await worldReadAccess(userId,worldId,!!options.review,"atlas"),q=geographyDirectoryQuery.parse(input),ordinary=worldOrdinaryContent(worldId,!!options.ordinary);
 return db.transaction(async tx=>{
  const readable=and(eq(worldGeography.worldId,worldId),isNull(worldGeography.archivedAt),inArray(worldGeography.context,[...REGIONAL_GEOGRAPHY_CONTEXTS]),ordinary?sql`${worldGeography.id} not in (${geographicPrivatePlaces(worldId)})`:undefined);
  const ancestors:GeographyRecord[]=[],seen=new Set<string>();let id=q.parentId;
  while(id){
   if(seen.has(id)||seen.size>=64)throw new WorldError("This geographic ancestry needs repair before it can be browsed.",409);seen.add(id);
   const [row]=await tx.select().from(worldGeography).where(and(readable,eq(worldGeography.id,id)));
   if(!row)throw new WorldError("This geography is unavailable in this viewing context.",404);
   ancestors.unshift(dto(row));id=row.parentId;
  }
  const rows=q.headersOnly?[]:await tx.select({record:worldGeography,hasChildren:sql<boolean>`exists(select 1 from world_geography child where child.world_id=${worldId} and child.parent_id=${worldGeography.id} and child.archived_at is null and child.context in ('place','region','local area') ${ordinary?sql`and child.id not in (${geographicPrivatePlaces(worldId)})`:sql``})`}).from(worldGeography).where(and(readable,q.search?ilike(worldGeography.name,geographySearchPattern(q.search)):q.parentId?eq(worldGeography.parentId,q.parentId):isNull(worldGeography.parentId),q.after?gt(worldGeography.id,q.after):undefined)).orderBy(asc(worldGeography.id)).limit(GEOGRAPHY_PAGE_SIZE+1);
  return {canEdit:access.permission.role==="owner"&&worldContentEditor(access,userId)&&!access.archivedAt&&!options.review&&!ordinary,parent:ancestors.at(-1)??null,ancestors,records:rows.slice(0,GEOGRAPHY_PAGE_SIZE).map(r=>({...dto(r.record),hasChildren:r.hasChildren})),nextAfter:rows.length>GEOGRAPHY_PAGE_SIZE?rows[GEOGRAPHY_PAGE_SIZE-1].record.id:null};
 },{isolationLevel:"repeatable read",accessMode:"read only"});
}
