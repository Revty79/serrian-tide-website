import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { worldGeography,worldSettlementEntity,worldSettlementMembership,worldAtlasSettlementShape } from "@/db/world-atlas-schema";
import { WorldError } from "./world-service";
import { validateSettlement, type SettlementEntity } from "./settlement";
import type { MapDraft } from "./atlas";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function settlementSource(tx:Tx,worldId:string,mapId:string,settlementId:string){
 const shapes=await tx.select().from(worldAtlasSettlementShape).where(and(eq(worldAtlasSettlementShape.worldId,worldId),eq(worldAtlasSettlementShape.mapId,mapId))).orderBy(asc(worldAtlasSettlementShape.sortOrder));
 const entities=await tx.select().from(worldSettlementEntity).where(and(eq(worldSettlementEntity.worldId,worldId),eq(worldSettlementEntity.settlementId,settlementId)));
 const memberships=await tx.select().from(worldSettlementMembership).where(and(eq(worldSettlementMembership.worldId,worldId),eq(worldSettlementMembership.settlementId,settlementId)));
 return {settlementShapes:shapes.map(s=>s.content),settlementEntities:entities.map(e=>({geographyId:e.geographyId,revision:e.revision,kind:e.kind as SettlementEntity["kind"],classification:e.classification,districtIds:memberships.filter(m=>m.geographyId===e.geographyId).map(m=>m.districtId)}))};
}
export async function saveSettlement(tx:Tx,worldId:string,mapId:string,settlementId:string,draft:MapDraft){
 const shapes=draft.settlementShapes??[],entities=draft.settlementEntities??[];validateSettlement(shapes,entities);
 const old=await tx.select().from(worldAtlasSettlementShape).where(eq(worldAtlasSettlementShape.mapId,mapId));
 if(old.some(s=>!shapes.some(n=>n.id===s.id)))throw new WorldError("Keep saved settlement shapes and archive unwanted representations. Reload an incomplete draft.",400);
 const ids=shapes.map(s=>s.id),collisions=ids.length?await tx.select().from(worldAtlasSettlementShape).where(inArray(worldAtlasSettlementShape.id,ids)):[];
 if(collisions.some(s=>s.mapId!==mapId||s.worldId!==worldId))throw new WorldError("This settlement representation is unavailable.",404);
 const existing=await tx.select().from(worldSettlementEntity).where(eq(worldSettlementEntity.worldId,worldId)),byId=new Map(existing.map(e=>[e.geographyId,e]));
 const geos=await tx.select().from(worldGeography).where(eq(worldGeography.worldId,worldId)),places=new Map(geos.map(g=>[g.id,g]));
 for(const e of entities){const previous=byId.get(e.geographyId),g=places.get(e.geographyId);
  if(!g||g.kind!=="location"||g.parentId!==settlementId)throw new WorldError("Settlement places must be locations within this settlement.",400);
  if(previous&&(previous.settlementId!==settlementId||previous.kind!==e.kind))throw new WorldError("A saved settlement place retains its kind and settlement.",400);
  if(previous?.revision!==e.revision&&!(e.revision===null&&!previous))throw new WorldError("A settlement place changed in another map or tab. Your draft is retained; reload to compare.",409);
  if(!previous){const [foreign]=await tx.select().from(worldSettlementEntity).where(eq(worldSettlementEntity.geographyId,e.geographyId));if(foreign)throw new WorldError("This settlement place is unavailable.",404);}
 }
 for(const e of entities)for(const id of e.districtIds){const district=entities.find(n=>n.geographyId===id)??byId.get(id);if(!district||district.kind!=="district"||("settlementId" in district&&district.settlementId!==settlementId))throw new WorldError("Choose a district in this settlement. Overlapping memberships are allowed.",400);}
 for(const e of entities){const previous=byId.get(e.geographyId),members=await tx.select().from(worldSettlementMembership).where(eq(worldSettlementMembership.geographyId,e.geographyId));
  const changed=!previous||previous.classification!==e.classification||JSON.stringify(members.map(m=>m.districtId).sort())!==JSON.stringify([...e.districtIds].sort());
  if(!previous)await tx.insert(worldSettlementEntity).values({geographyId:e.geographyId,worldId,settlementId,kind:e.kind,classification:e.classification});
  else if(changed)await tx.update(worldSettlementEntity).set({classification:e.classification,revision:previous.revision+1}).where(eq(worldSettlementEntity.geographyId,e.geographyId));
 }
 for(const e of entities){await tx.delete(worldSettlementMembership).where(eq(worldSettlementMembership.geographyId,e.geographyId));if(e.districtIds.length)await tx.insert(worldSettlementMembership).values(e.districtIds.map(districtId=>({geographyId:e.geographyId,districtId,worldId,settlementId})));}
 for(const [sortOrder,s] of shapes.entries()){const previous=old.find(n=>n.id===s.id);if(previous&&(previous.geographyId!==s.geographyId||previous.content.type!==s.type))throw new WorldError("A saved representation retains its place and geometry type.",400);
  if(places.get(s.geographyId)?.archivedAt&&!previous)throw new WorldError("Restore this place before drawing another representation.",400);
  await tx.insert(worldAtlasSettlementShape).values({id:s.id,worldId,mapId,settlementId,geographyId:s.geographyId,content:s,sortOrder}).onConflictDoUpdate({target:worldAtlasSettlementShape.id,set:{content:s,sortOrder}});
 }
}
