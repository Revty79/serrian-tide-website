import "server-only";
import {createHash} from "node:crypto";
import {and,asc,eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldAtlasMap} from "@/db/world-atlas-schema";
import {worldMapCanvas} from "@/db/world-terrain-schema";
import {worldMapRegion,legacyRegionColumns} from "@/db/world-map-region-schema";
import {worldRegionHierarchy,worldRegionHierarchyChange} from "@/db/world-region-hierarchy-schema";
import {regionsAvailable} from "./terrain-map-context";
import {WorldError,worldReadAccess,worldWriteTransaction} from "./world-service";
import {REGION_HIERARCHY_DEPTH,regionMoveSchema,validateRegionHierarchyMove,type RegionHierarchyNode,type RegionHierarchy} from "./terrain-region-hierarchy";
import type {RegionCreate} from "./terrain-regions";
type Connection=Pick<typeof db,"select"|"execute"|"insert"|"update">;
const migration=()=>new WorldError("MIGRATION 0150 REQUIRED for region organization. Your selected parent and boundary are retained; a subregion was not created as a root region.",409);
export async function regionHierarchyAvailable(tx:Pick<Connection,"execute">){
 return !!(await tx.execute<{present:boolean}>(sql`select to_regclass('public.world_region_hierarchy') is not null and to_regclass('public.world_region_hierarchy_change') is not null and to_regprocedure('public.world_region_hierarchy_validate()') is not null and (select count(*) from pg_trigger where not tgisinternal and tgname in ('world_region_hierarchy_validate','world_region_hierarchy_no_delete','world_region_hierarchy_audit_required','world_region_hierarchy_change_immutable','world_region_hierarchy_change_head_required'))=5 present`)).rows[0].present;
}
export async function regionHierarchyNodes(tx:Connection,worldId:string,available?:boolean):Promise<RegionHierarchyNode[]>{
 available??=await regionHierarchyAvailable(tx);
 const rows=await tx.select({m:worldAtlasMap,c:worldMapCanvas}).from(worldMapCanvas).innerJoin(worldAtlasMap,and(eq(worldAtlasMap.id,worldMapCanvas.mapId),eq(worldAtlasMap.worldId,worldMapCanvas.worldId))).where(eq(worldMapCanvas.worldId,worldId)).orderBy(asc(worldAtlasMap.createdAt),asc(worldAtlasMap.id));
 if(rows.length>64)throw new WorldError("This World's map inventory exceeds the accepted 64-map limit. Restore verified map data before changing organization.",409);
 const links=await regionsAvailable(tx)?await tx.select(legacyRegionColumns).from(worldMapRegion).where(eq(worldMapRegion.worldId,worldId)):[],heads=available?await tx.select().from(worldRegionHierarchy).where(eq(worldRegionHierarchy.worldId,worldId)):[];
 return rows.map(({m,c})=>{const link=links.find(r=>r.mapId===m.id),sourceId=c.purpose==="world"?m.id:link?.parentMapId??"",source=rows.find(r=>r.m.id===sourceId&&r.c.purpose==="world"),head=heads.find(h=>h.mapId===m.id);return {id:m.id,name:m.name,kind:c.purpose==="world"?"world":"region",worldId,terrainId:c.terrainId,sourceWorldMapId:sourceId,organizingParentId:head?.organizingParentId??null,revision:head?.revision??0,archived:!!m.archivedAt,sourceAvailable:!!source&&!source.m.archivedAt&&source.c.terrainId===c.terrainId&&source.m.scope==="world"&&source.m.mapKind==="generic"};});
}
export async function getRegionHierarchy(userId:string,worldId:string,options:{review?:boolean;ordinary?:boolean}={}):Promise<RegionHierarchy>{
 const world=await worldReadAccess(userId,worldId,!!options.review);if(options.ordinary)throw new WorldError("This map browser is unavailable in ordinary knowledge views.",404);
 return db.transaction(async tx=>{const available=await regionHierarchyAvailable(tx);return {available,canEdit:world.ownerId===userId&&!world.archivedAt&&!options.review,nodes:await regionHierarchyNodes(tx,worldId,available),maxDepth:REGION_HIERARCHY_DEPTH};},{isolationLevel:"repeatable read",accessMode:"read only"});
}
function validate(nodes:RegionHierarchyNode[],mapId:string,parentId:string|null){try{validateRegionHierarchyMove(nodes,mapId,parentId);}catch(error){throw new WorldError((error as Error).message,400);}}
/** Called inside the original geographic creation transaction, after immutable map rows exist. */
export async function recordCreatedRegionHierarchy(tx:Connection,userId:string,worldId:string,command:RegionCreate,creationHash:string){
 const available=await regionHierarchyAvailable(tx);if(!available){if(command.organizingParentId!==undefined)throw migration();return;}
 const parentId=command.organizingParentId??null,nodes=await regionHierarchyNodes(tx,worldId,true),node=nodes.find(n=>n.id===command.requestId)!;validate(nodes,node.id,parentId);
 if(parentId&&nodes.find(n=>n.id===parentId)?.revision!==command.organizingParentRevision)throw new WorldError("The organizing parent changed after this preview. Keep the boundary and review its parent before saving again.",409);
 await tx.insert(worldRegionHierarchy).values({mapId:node.id,worldId,terrainId:node.terrainId,sourceWorldMapId:node.sourceWorldMapId,organizingParentId:parentId,revision:1,updatedBy:userId});
 await tx.insert(worldRegionHierarchyChange).values({requestId:command.requestId,mapId:node.id,worldId,terrainId:node.terrainId,sourceWorldMapId:node.sourceWorldMapId,revision:1,previousRevision:0,previousParentId:null,organizingParentId:parentId,action:"create",requestHash:creationHash,createdBy:userId});
}
export async function moveRegionHierarchy(userId:string,worldId:string,raw:unknown){
 const command=regionMoveSchema.parse(raw),requestHash=createHash("sha256").update(JSON.stringify(command)).digest("hex");
 return worldWriteTransaction(userId,worldId,async tx=>{
  if(!await regionHierarchyAvailable(tx))throw migration();const [retry]=await tx.select().from(worldRegionHierarchyChange).where(eq(worldRegionHierarchyChange.requestId,command.requestId));
  if(retry){if(retry.worldId!==worldId||retry.mapId!==command.mapId||retry.createdBy!==userId||retry.requestHash!==requestHash)throw new WorldError("This organizing request already contains different choices. Keep its original retry or review a fresh move.",409);return {id:retry.mapId,revision:retry.revision,organizingParentId:retry.organizingParentId};}
  const nodes=await regionHierarchyNodes(tx,worldId,true),node=nodes.find(n=>n.id===command.mapId);if(!node||node.kind!=="region")throw new WorldError("This region is unavailable.",404);if(node.revision!==command.revision)throw new WorldError("Another tab changed this region's organizing parent. Your selected parent is retained; review the latest hierarchy before retrying.",409);validate(nodes,node.id,command.organizingParentId);
  const revision=node.revision+1,values={mapId:node.id,worldId,terrainId:node.terrainId,sourceWorldMapId:node.sourceWorldMapId,organizingParentId:command.organizingParentId,revision,updatedBy:userId,updatedAt:new Date()};
  if(node.revision)await tx.update(worldRegionHierarchy).set({organizingParentId:values.organizingParentId,revision,updatedBy:userId,updatedAt:values.updatedAt}).where(and(eq(worldRegionHierarchy.mapId,node.id),eq(worldRegionHierarchy.revision,node.revision)));else await tx.insert(worldRegionHierarchy).values(values);
  await tx.insert(worldRegionHierarchyChange).values({requestId:command.requestId,mapId:node.id,worldId,terrainId:node.terrainId,sourceWorldMapId:node.sourceWorldMapId,revision,previousRevision:node.revision,previousParentId:node.organizingParentId,organizingParentId:command.organizingParentId,action:"move",requestHash,createdBy:userId});
  return {id:node.id,revision,organizingParentId:command.organizingParentId};
 });
}
