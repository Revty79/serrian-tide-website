import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { worldAtlasConnection, worldAtlasFeature, worldAtlasDrawing, worldAtlasSettlementShape, worldAtlasInteriorShape, worldAtlasMap, worldGeography, worldInteriorEntity, worldInteriorFloor, worldSettlementEntity } from "@/db/world-atlas-schema";
import { WorldError } from "./world-service";
import { floorDraftSchema, geographicInterior, validateInterior, type InteriorEntity } from "./interior";
import type { MapDraft } from "./atlas";
import type { z } from "zod";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const unavailable=()=>new WorldError("This building, floor or interior destination is unavailable.",404);
const conflict=()=>new WorldError("Interior information changed in another map or tab. Your draft is retained; reload to compare.",409);
export async function interiorSource(tx:Tx,worldId:string,mapId:string){
 const shapes=await tx.select().from(worldAtlasInteriorShape).where(and(eq(worldAtlasInteriorShape.worldId,worldId),eq(worldAtlasInteriorShape.mapId,mapId))).orderBy(asc(worldAtlasInteriorShape.sortOrder));
 const ids=[...new Set(shapes.map(s=>s.entityId))];
 const entities=ids.length?await tx.select().from(worldInteriorEntity).where(and(eq(worldInteriorEntity.worldId,worldId),inArray(worldInteriorEntity.id,ids))):[];
 const connections=await tx.select().from(worldAtlasConnection).where(and(eq(worldAtlasConnection.worldId,worldId),eq(worldAtlasConnection.sourceMapId,mapId)));
 const geos=entities.flatMap(e=>e.geographyId?[e.geographyId]:[]),places=geos.length?await tx.select().from(worldGeography).where(inArray(worldGeography.id,geos)):[];
 return {interiorShapes:shapes.map(s=>s.content),interiorEntities:entities.map(e=>({id:e.id,revision:e.revision,kind:e.kind as InteriorEntity["kind"],name:places.find(g=>g.id===e.geographyId)?.name===`Unnamed ${e.kind}`&&!e.name?"":places.find(g=>g.id===e.geographyId)?.name??e.name,description:places.find(g=>g.id===e.geographyId)?.description??e.description,classification:e.classification,geographyId:e.geographyId})),interiorLinks:entities.filter(e=>e.kind==="transition").map(e=>{const c=connections.find(c=>c.geographyId===e.id);return {entityId:e.id,destinationMapId:c?.destinationMapId??null,destinationGeographyId:c?.destinationGeographyId??null};})};
}
export async function activeFloor(tx:Tx,worldId:string,id:string){
 const [floor]=await tx.select().from(worldInteriorFloor).where(and(eq(worldInteriorFloor.geographyId,id),eq(worldInteriorFloor.worldId,worldId)));
 if(!floor||floor.archivedAt)throw unavailable();return floor;
}
export async function activeMapFloor(tx:Tx,worldId:string,geographyId:string|null){
 if(!geographyId)return;const [floor]=await tx.select().from(worldInteriorFloor).where(and(eq(worldInteriorFloor.worldId,worldId),eq(worldInteriorFloor.geographyId,geographyId)));if(floor?.archivedAt)throw unavailable();
}
export async function createInteriorFloor(tx:Tx,worldId:string,buildingId:string,draft:z.infer<typeof floorDraftSchema>,mapName:string){
 const [building]=await tx.select().from(worldSettlementEntity).where(and(eq(worldSettlementEntity.geographyId,buildingId),eq(worldSettlementEntity.worldId,worldId)));
 const [geo]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,buildingId),eq(worldGeography.worldId,worldId)));
 if(!building||building.kind!=="building"||!geo||geo.archivedAt)throw unavailable();
 const floors=await tx.select({id:worldInteriorFloor.geographyId}).from(worldInteriorFloor).where(eq(worldInteriorFloor.buildingId,buildingId));
 if(floors.length>=512)throw new WorldError("A building supports up to 512 retained floors. This is a source-size safety limit, not a floor-number rule.",400);
 const floorId=randomUUID(),mapId=randomUUID();
 await tx.insert(worldGeography).values({id:floorId,worldId,parentId:buildingId,kind:"location",context:"interior",name:draft.name,description:draft.description});
 await tx.insert(worldInteriorFloor).values({geographyId:floorId,worldId,buildingId,settlementId:building.settlementId,classification:draft.classification,label:draft.label,order:draft.order,elevation:draft.elevation});
 await tx.insert(worldAtlasMap).values({id:mapId,worldId,name:mapName,scope:"local",mapKind:"interior",geographyId:floorId});return mapId;
}
export async function saveInterior(tx:Tx,worldId:string,mapId:string,floorId:string,draft:MapDraft){
 await activeFloor(tx,worldId,floorId);
 const shapes=draft.interiorShapes!,entities=draft.interiorEntities!,links=draft.interiorLinks!;
 try{validateInterior(shapes,entities,links);}catch(error){throw new WorldError((error as Error).message,400);}
 const old=await tx.select().from(worldAtlasInteriorShape).where(eq(worldAtlasInteriorShape.mapId,mapId));
 if(old.some(s=>!shapes.some(n=>n.id===s.id)))throw new WorldError("Keep saved interior representations and archive unwanted artwork. Compare the saved map if this draft is incomplete.",400);
 const ids=shapes.map(s=>s.id),collisions=ids.length?await tx.select().from(worldAtlasInteriorShape).where(inArray(worldAtlasInteriorShape.id,ids)):[];
 if(collisions.some(s=>s.mapId!==mapId||s.worldId!==worldId))throw unavailable();
 const entityIds=entities.map(e=>e.id),existing=entityIds.length?await tx.select().from(worldInteriorEntity).where(inArray(worldInteriorEntity.id,entityIds)):[],byId=new Map(existing.map(e=>[e.id,e]));
 for(const e of entities){const previous=byId.get(e.id);if(previous&&(previous.worldId!==worldId||previous.floorId!==floorId))throw unavailable();if(previous&&(previous.kind!==e.kind||previous.geographyId!==e.geographyId))throw new WorldError("A saved interior entity retains its kind, floor and identity.",400);if(previous?previous.revision!==e.revision:e.revision!==null)throw conflict();
  if(!previous&&!geographicInterior(e.kind)){const [collision]=await tx.select({id:worldGeography.id}).from(worldGeography).where(eq(worldGeography.id,e.id));if(collision)throw unavailable();}
  if(geographicInterior(e.kind)){const [g]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,e.id),eq(worldGeography.worldId,worldId)));if(!g||g.parentId!==floorId||g.kind!=="location"||g.context!=="interior"||g.archivedAt||g.name!==(e.name||`Unnamed ${e.kind}`)||g.description!==e.description)throw new WorldError("Interior places must retain their floor and match their authored information.",400);}
 }
 const previousLinks=await tx.select().from(worldAtlasConnection).where(eq(worldAtlasConnection.sourceMapId,mapId));
 for(const e of entities.filter(e=>e.kind==="transition"))if(!links.some(l=>l.entityId===e.id))throw new WorldError("Retain each transition's destination field, including unconnected transitions.",400);
 for(const link of links){const previous=previousLinks.find(c=>c.geographyId===link.entityId);const unchanged=previous?.destinationMapId===link.destinationMapId&&previous?.destinationGeographyId===link.destinationGeographyId;
  if(link.destinationMapId&&!unchanged){const [destination]=await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.id,link.destinationMapId),eq(worldAtlasMap.worldId,worldId)));if(!destination||destination.archivedAt||destination.id===mapId)throw unavailable();if(destination.mapKind==="interior")await activeFloor(tx,worldId,destination.geographyId!);
   if(link.destinationGeographyId){const [g]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,link.destinationGeographyId),eq(worldGeography.worldId,worldId)));if(!g||g.archivedAt)throw unavailable();const source=destination.mapKind==="interior"?await interiorSource(tx,worldId,destination.id):null;if(g.id!==destination.geographyId){let represented=source?.interiorShapes.some(s=>s.entityId===g.id&&!s.archived)??false;if(!source){const [feature]=await tx.select().from(worldAtlasFeature).where(and(eq(worldAtlasFeature.mapId,destination.id),eq(worldAtlasFeature.geographyId,g.id))).limit(1);const [drawing]=await tx.select().from(worldAtlasDrawing).where(and(eq(worldAtlasDrawing.mapId,destination.id),eq(worldAtlasDrawing.geographyId,g.id))).limit(1);const [settlement]=await tx.select().from(worldAtlasSettlementShape).where(and(eq(worldAtlasSettlementShape.mapId,destination.id),eq(worldAtlasSettlementShape.geographyId,g.id))).limit(1);represented=!!(feature&&!feature.archivedAt||drawing&&!drawing.archivedAt||settlement&&!settlement.content.archived);}if(!represented)throw new WorldError("Choose an active arrival place represented on the destination map.",400);}}
  }
 }
 for(const e of entities){const previous=byId.get(e.id),{id,revision:_,...fields}=e;void _;const changed=!previous||["name","description","classification"].some(k=>previous[k as "name"]!==e[k as "name"]);
  if(!previous)await tx.insert(worldInteriorEntity).values({id,worldId,floorId,...fields});else if(changed)await tx.update(worldInteriorEntity).set({...fields,revision:previous.revision+1}).where(eq(worldInteriorEntity.id,id));
 }
 for(const [sortOrder,s] of shapes.entries()){const previous=old.find(n=>n.id===s.id);if(previous&&(previous.entityId!==s.entityId||previous.content.variant!==s.variant))throw new WorldError("Saved interior artwork retains its entity and geometry type.",400);
  await tx.insert(worldAtlasInteriorShape).values({id:s.id,worldId,mapId,floorId,entityId:s.entityId,content:s,sortOrder}).onConflictDoUpdate({target:worldAtlasInteriorShape.id,set:{content:s,sortOrder}});
 }
 for(const link of links){const previous=previousLinks.find(c=>c.geographyId===link.entityId);if(link.destinationMapId){if(previous?.destinationMapId===link.destinationMapId&&previous.destinationGeographyId===link.destinationGeographyId)continue;await tx.insert(worldAtlasConnection).values({id:randomUUID(),worldId,sourceMapId:mapId,geographyId:link.entityId,destinationMapId:link.destinationMapId,destinationGeographyId:link.destinationGeographyId}).onConflictDoUpdate({target:[worldAtlasConnection.sourceMapId,worldAtlasConnection.geographyId],set:{destinationMapId:link.destinationMapId,destinationGeographyId:link.destinationGeographyId,revision:(previous?.revision??0)+1,updatedAt:new Date()}});}else if(previous)await tx.delete(worldAtlasConnection).where(eq(worldAtlasConnection.id,previous.id));}
}
