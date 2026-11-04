import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {and,asc,desc,eq,sql} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db";
import {worldBuildingInterior as buildings,worldBuildingInteriorSource as sources,worldBuildingFloor as floors,worldBuildingFloorVersion as versions,worldBuildingFloorOperation as operations} from "@/db/world-building-floor-schema";
import {worldTownMap} from "@/db/world-town-map-schema";
import {worldTownPlace} from "@/db/world-town-commerce-schema";
import {worldGeography,worldAtlasMap} from "@/db/world-atlas-schema";
import {townObjectName} from "./town-map-presets";
import {WorldError,worldReadAccess,worldWriteTransaction} from "./world-service";
import {boundedRegionalLayer} from "./terrain-regional-authoring-service";
import {FLOOR_LIMITS,floorCommandSchema,floorFootprint,floorLayer,validateFloor,type FloorDesign,type FloorBundle,type InteriorBuilding} from "./building-floor";
type Tx=Parameters<Parameters<typeof worldWriteTransaction>[2]>[0];
type Building=typeof buildings.$inferSelect;type Floor=typeof floors.$inferSelect;
const unavailable=()=>new WorldError("This building or floor is unavailable in this World.",404);
const conflict=()=>new WorldError("This floor changed in another tab. Your draft and original save are retained. Export the draft or load the saved floor to compare.",409);
export async function buildingFloorsAvailable(tx:Pick<typeof db,"execute">){return !!(await tx.execute<{ok:boolean}>(sql`select to_regclass('public.world_building_floor') is not null and to_regclass('public.world_building_floor_operation') is not null ok`)).rows[0].ok;}
async function source(tx:Tx,worldId:string,townMapId:string,featureId:string){
 const [map]=await tx.select().from(worldTownMap).where(and(eq(worldTownMap.id,townMapId),eq(worldTownMap.worldId,worldId)));if(!map)throw unavailable();const feature=map.design.features.find(f=>f.id===featureId&&f.kind==="building");if(!feature)throw unavailable();
 const [binding]=await tx.select().from(sources).where(and(eq(sources.worldId,worldId),eq(sources.townMapId,townMapId),eq(sources.featureId,featureId)));
 const [bound]=binding?await tx.select().from(buildings).where(and(eq(buildings.id,binding.buildingId),eq(buildings.worldId,worldId))):[];
 const [permanent]=feature.placeId?await tx.select().from(buildings).where(and(eq(buildings.worldId,worldId),eq(buildings.placeId,feature.placeId))):[];
 if(bound&&permanent&&bound.id!==permanent.id)throw new WorldError("This drawing and permanent Place already have separate saved interiors. Their work is retained. Restore the original Place link before opening this drawing's interior.",409);
 return {map,feature,binding,building:bound??permanent};
}
async function editReason(tx:Tx,b:Building){
 const [town]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,b.townId),eq(worldGeography.worldId,b.worldId)));if(!town||town.archivedAt)return "Restore this Town before editing its interiors.";
 if(b.placeId){const [place]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,b.placeId),eq(worldGeography.worldId,b.worldId)));if(!place||place.archivedAt)return "Restore the permanent building Place before editing its interior.";}
 const active=(await tx.execute<{ok:boolean}>(sql`select exists(select 1 from world_building_interior_source s join world_town_map m on m.id=s.town_map_id and m.world_id=s.world_id join world_atlas_map a on a.id=m.source_map_id and a.world_id=s.world_id where s.building_id=${b.id} and s.world_id=${b.worldId} and not m.archived and a.archived_at is null and exists(select 1 from jsonb_array_elements(m.design->'features') f where f->>'id'=s.feature_id and f->>'kind'='building' and f->>'archived'='false')) ok`)).rows[0].ok;
 return active?"":"Restore a saved exterior building and its Town/source map before editing this interior. Saved floors remain available.";
}
export async function getBuildingFloors(userId:string,worldId:string,options:{townMapId:string;featureId:string;floorId?:string;review?:boolean;ordinary?:boolean}):Promise<FloorBundle>{
 const world=await worldReadAccess(userId,worldId,!!options.review);if(options.ordinary)throw unavailable();z.uuid().parse(options.townMapId);z.uuid().parse(options.featureId);if(options.floorId)z.uuid().parse(options.floorId);
 return db.transaction(async tx=>{
  if(!await buildingFloorsAvailable(tx))return {available:false,canEdit:false,reason:"Migration 0152 is required for building interiors. Existing Town Maps and drafts are retained.",building:null,floors:[],document:null};
  const s=await source(tx,worldId,options.townMapId,options.featureId);if(!s.building)return {available:true,canEdit:world.ownerId===userId&&!world.archivedAt&&!options.review&&!s.map.archived&&!s.feature.archived,reason:"",building:null,floors:[],document:null};
  const reason=options.review?"Administrator review is read-only.":world.archivedAt?"Restore this World before editing its interiors.":await editReason(tx,s.building),canEdit=world.ownerId===userId&&!reason;
  const rows=await tx.select({id:floors.id,buildingId:floors.buildingId,name:floors.name,order:floors.order,elevation:floors.elevation,revision:floors.revision,archived:floors.archived}).from(floors).where(and(eq(floors.worldId,worldId),eq(floors.buildingId,s.building.id))).orderBy(asc(floors.order),asc(floors.id));
  const selection=options.floorId?rows.find(f=>f.id===options.floorId):rows.find(f=>f.order===0&&!f.archived)??rows.find(f=>!f.archived)??rows[0];if(options.floorId&&!selection)throw unavailable();const [selected]=selection?await tx.select().from(floors).where(and(eq(floors.id,selection.id),eq(floors.worldId,worldId))):[];
  const history=selected?await tx.select({revision:versions.revision,requestId:versions.requestId}).from(versions).where(and(eq(versions.worldId,worldId),eq(versions.floorId,selected.id))).orderBy(desc(versions.revision)).limit(30):[];
  return {available:true,canEdit,reason,bound:!!s.binding&&(!s.feature.placeId||s.building.placeId===s.feature.placeId),building:s.building as InteriorBuilding,floors:rows.map(({id,buildingId,name,order,elevation,revision,archived})=>({id,buildingId,name,order,elevation,revision,archived})),document:selected?{id:selected.id,buildingId:selected.buildingId,worldId,name:selected.name,order:selected.order,elevation:selected.elevation,revision:selected.revision,archived:selected.archived,design:selected.design,history}:null};
 },{isolationLevel:"repeatable read",accessMode:"read only"});
}
async function destinations(tx:Tx,b:Building,design:FloorDesign,floorId:string){
 const rows=await tx.select({id:floors.id,archived:floors.archived}).from(floors).where(and(eq(floors.buildingId,b.id),eq(floors.worldId,b.worldId))),seen=new Set<string>();
 for(const f of design.features){if(f.variant!=="object"||f.kind!=="transition"||!f.destination||f.archived)continue;const dest=rows.find(r=>r.id===f.destination!.floorId&&!r.archived);if(!dest||dest.id===floorId)throw new WorldError("Choose another active floor in this same building for the stairs.",400);const p=f.destination.point;if(p.x>b.frame.width||p.y>b.frame.height)throw new WorldError("Keep the stair arrival position inside the destination floor.",400);const key=dest.id+":"+p.x+":"+p.y;if(seen.has(key))throw new WorldError("Two transitions use the same arrival. Choose a separate position or keep one connection.",400);seen.add(key);}
}
export async function changeBuildingFloor(userId:string,worldId:string,raw:unknown){
 const c=floorCommandSchema.parse(raw),inputHash=createHash("sha256").update(JSON.stringify(c)).digest("hex");
 return worldWriteTransaction(userId,worldId,async tx=>{
  if(!await buildingFloorsAvailable(tx))throw new WorldError("Migration 0152 is required for building interiors. Your draft is retained.",409);
  const [retry]=await tx.select().from(operations).where(eq(operations.requestId,c.requestId));if(retry){if(retry.worldId!==worldId||retry.authorId!==userId||retry.inputHash!==inputHash)throw conflict();return retry.result;}
  let building:Building;const changed:Floor[]=[];let result:{buildingId:string;floorId:string|null;revision:number|null};
  if(c.action==="enter"){
   const s=await source(tx,worldId,c.townMapId,c.featureId);if(s.map.archived||s.feature.archived)throw new WorldError("Restore this Town Map and building before creating or opening an editable interior.",409);
   const [town]=await tx.select().from(worldGeography).where(and(eq(worldGeography.worldId,worldId),eq(worldGeography.id,s.map.townId)));const [atlas]=await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.worldId,worldId),eq(worldAtlasMap.id,s.map.sourceMapId)));if(!town||town.archivedAt||!atlas||atlas.archivedAt)throw new WorldError("Restore the Town and source map before editing interiors.",409);
   if(s.feature.placeId){const [p]=await tx.select({p:worldTownPlace,g:worldGeography}).from(worldTownPlace).innerJoin(worldGeography,eq(worldGeography.id,worldTownPlace.geographyId)).where(and(eq(worldTownPlace.worldId,worldId),eq(worldTownPlace.townId,s.map.townId),eq(worldTownPlace.geographyId,s.feature.placeId)));if(!p||p.g.archivedAt)throw new WorldError("Restore or choose a permanent Place in this same Town.",400);}
   if(s.building){building=s.building;if(building.placeId&&s.feature.placeId&&building.placeId!==s.feature.placeId)throw new WorldError("This interior retains its original permanent Place. Restore that Place link before continuing.",409);if(!building.placeId&&s.feature.placeId){[building]=await tx.update(buildings).set({placeId:s.feature.placeId}).where(eq(buildings.id,building.id)).returning();}}
   else{const count=(await tx.execute<{n:number}>(sql`select count(*)::int n from world_building_interior where world_id=${worldId}`)).rows[0].n;if(count>=FLOOR_LIMITS.buildings)throw new WorldError("This World has reached its 20,000 retained interior limit.",400);const shape=floorFootprint(s.feature);[building]=await tx.insert(buildings).values({id:c.requestId,worldId,townId:s.map.townId,placeId:s.feature.placeId,name:townObjectName(s.feature),frame:shape.frame,footprint:shape.points,townFrame:s.map.frame}).returning();}
   if(!s.binding)await tx.insert(sources).values({id:randomUUID(),worldId,buildingId:building.id,townMapId:c.townMapId,featureId:c.featureId});const reason=await editReason(tx,building);if(reason)throw new WorldError(reason,409);
   const list=await tx.select({id:floors.id,revision:floors.revision,archived:floors.archived,order:floors.order}).from(floors).where(and(eq(floors.worldId,worldId),eq(floors.buildingId,building.id))).orderBy(asc(floors.order),asc(floors.id));const first=list.find(f=>f.order===0&&!f.archived)??list.find(f=>!f.archived)??list[0];result={buildingId:building.id,floorId:first?.id??null,revision:first?.revision??null};
  }else{
   const [previous]=c.action==="create"?[]:await tx.select().from(floors).where(and(eq(floors.id,c.floorId),eq(floors.worldId,worldId)));if(c.action!=="create"&&(!previous||previous.revision!==c.revision))throw previous?conflict():unavailable();
   const [b]=await tx.select().from(buildings).where(and(eq(buildings.id,c.action==="create"?c.buildingId:previous!.buildingId),eq(buildings.worldId,worldId)));if(!b)throw unavailable();building=b;const reason=await editReason(tx,building);if(reason)throw new WorldError(reason,409);
   if(c.action==="create"){
    const count=(await tx.execute<{n:number}>(sql`select count(*)::int n from world_building_floor where building_id=${b.id}`)).rows[0].n;if(count>=FLOOR_LIMITS.floors)throw new WorldError("A building supports 64 retained floors. Restore an existing floor instead.",400);
    if(c.copyFloorId){const [source]=await tx.select().from(floors).where(and(eq(floors.id,c.copyFloorId),eq(floors.buildingId,b.id),eq(floors.worldId,worldId)));if(!source||source.archived||source.revision!==c.copyRevision)throw conflict();const ids=new Set(source.design.features.map(f=>f.id));if(c.design.features.some(f=>ids.has(f.id)||f.variant==="object"&&f.destination))throw new WorldError("Copied floors need independent object identities and unconnected stairs.",400);}else if(c.copyRevision!==null)throw conflict();
    boundedRegionalLayer(()=>validateFloor(c.design,b.frame));await destinations(tx,b,c.design,c.requestId);const [row]=await tx.insert(floors).values({id:c.requestId,worldId,buildingId:b.id,name:c.name,order:c.order,elevation:c.elevation,revision:1,archived:false,design:c.design}).returning();changed.push(row);
   }else if(c.action==="lifecycle"){
    if(c.archived){const incoming=(await tx.select().from(floors).where(and(eq(floors.buildingId,b.id),eq(floors.worldId,worldId)))).some(f=>!f.archived&&f.id!==previous!.id&&f.design.features.some(s=>!s.archived&&s.variant==="object"&&s.destination?.floorId===previous!.id));if(incoming)throw new WorldError("Stairs on another floor lead here. Disconnect those stairs before archiving this floor; no work has been removed.",409);}
    changed.push({...previous!,revision:previous!.revision+1,archived:c.archived,updatedAt:new Date()});
   }else if(c.action==="save"){
    if(previous!.archived)throw new WorldError("Restore this floor before editing. Your draft is retained.",409);boundedRegionalLayer(()=>validateFloor(c.design,b.frame));if(previous!.design.layers.ground.locked&&c.design.layers.ground.locked&&previous!.design.flooring!==c.design.flooring)throw new WorldError("Unlock Ground before changing its appearance.",400);const incoming=new Map(c.design.features.map(f=>[f.id,f]));for(const f of previous!.design.features){const next=incoming.get(f.id);if(!next||next.kind!==f.kind||next.variant!==f.variant||next.entityId!==f.entityId)throw new WorldError("Retain saved object identities; archive unwanted shapes instead.",400);const l=floorLayer(f);if(previous!.design.layers[l].locked&&c.design.layers[l].locked&&JSON.stringify(f)!==JSON.stringify(next))throw new WorldError("Unlock the layer explicitly before changing its objects.",400);}
    for(const next of c.design.features){const l=floorLayer(next);if(!previous!.design.features.some(f=>f.id===next.id)&&previous!.design.layers[l].locked&&c.design.layers[l].locked)throw new WorldError("Unlock this layer before adding objects.",400);}await destinations(tx,b,c.design,previous!.id);changed.push({...previous!,name:c.name,order:c.order,elevation:c.elevation,design:c.design,revision:previous!.revision+1,updatedAt:new Date()});
   }else{
    if(previous!.archived)throw new WorldError("Restore this floor before connecting stairs.",409);const selected=previous!.design.features.find(f=>f.id===c.featureId&&!f.archived&&f.kind==="transition"&&f.variant==="object");if(!selected||selected.variant!=="object")throw new WorldError("Select saved stairs, a ladder, lift or hatch first.",400);if(previous!.design.layers.transitions.locked)throw new WorldError("Unlock transitions before connecting stairs.",400);
    const [target]=await tx.select().from(floors).where(and(eq(floors.id,c.destinationFloorId),eq(floors.worldId,worldId),eq(floors.buildingId,b.id)));if(!target||target.archived||target.id===previous!.id)throw unavailable();if(target.revision!==c.destinationRevision)throw conflict();
    const design={...previous!.design,features:previous!.design.features.map(f=>f.id===selected.id?{...selected,destination:{floorId:target.id,point:c.point}}:f)};boundedRegionalLayer(()=>validateFloor(design,b.frame));await destinations(tx,b,design,previous!.id);changed.push({...previous!,design,revision:previous!.revision+1,updatedAt:new Date()});
    if(c.reciprocal){
     if(target.design.layers.transitions.locked)throw new WorldError("Unlock transitions on the arrival floor before making a two-way connection.",400);
     const candidates=target.design.features.filter(f=>f.variant==="object"&&f.kind==="transition"&&!f.archived&&Math.hypot(f.point.x-c.point.x,f.point.y-c.point.y)<.2);
     if(candidates.length>1)throw new WorldError("Several arrival transitions overlap here. Move them apart or choose another arrival position; their work is retained.",409);
     const existing=candidates[0];
     if(existing?.variant==="object"&&(existing.symbol!==selected.symbol||existing.destination&&(existing.destination.floorId!==previous!.id||Math.hypot(existing.destination.point.x-selected.point.x,existing.destination.point.y-selected.point.y)>=.2)))throw new WorldError("Those arrival stairs are incompatible or already connected elsewhere. Choose matching stairs at another arrival position; the existing object is retained.",409);
     const arrivalId=existing?.id??randomUUID(),arrival=existing?.variant==="object"?{...existing,destination:{floorId:previous!.id,point:selected.point}}:{...selected,id:arrivalId,entityId:arrivalId,point:c.point,destination:{floorId:previous!.id,point:selected.point}},targetDesign={...target.design,features:existing?target.design.features.map(f=>f.id===existing.id?arrival:f):[...target.design.features,arrival]};
     if(existing?.variant==="object")design.features=design.features.map(f=>f.id===selected.id?{...selected,destination:{floorId:target.id,point:existing.point}}:f);
     boundedRegionalLayer(()=>validateFloor(targetDesign,b.frame));await destinations(tx,b,targetDesign,target.id);changed.push({...target,design:targetDesign,revision:target.revision+1,updatedAt:new Date()});
    }
   }
   const row=changed[0];result={buildingId:building.id,floorId:row.id,revision:row.revision};
  }
  await tx.insert(operations).values({requestId:c.requestId,worldId,buildingId:building.id,authorId:userId,inputHash,result});
  for(const row of changed){const ids=row.design.features.map(f=>f.id);if(ids.length&&(await tx.execute(sql`select 1 from world_building_floor f cross join lateral jsonb_array_elements(f.design->'features') s where f.building_id=${building.id} and f.id<>${row.id} and s->>'id' in (select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)) limit 1`)).rows.length)throw new WorldError("Objects on different floors need independent identities. Copy the floor using Duplicate Floor.",400);if(!(c.action==="create"&&row.id===c.requestId))await tx.update(floors).set({name:row.name,order:row.order,elevation:row.elevation,revision:row.revision,archived:row.archived,design:row.design,updatedAt:row.updatedAt}).where(and(eq(floors.id,row.id),eq(floors.worldId,worldId)));await tx.insert(versions).values({id:randomUUID(),floorId:row.id,worldId,revision:row.revision,requestId:c.requestId,name:row.name,order:row.order,elevation:row.elevation,archived:row.archived,design:row.design});}
  return result;
 });
}

// Image compositions share the existing transaction-authoritative parent guards.
export {editReason as buildingFloorEditReason};
