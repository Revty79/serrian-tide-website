import "server-only";
import {randomUUID} from "node:crypto";
import {and,asc,eq,sql} from "drizzle-orm";
import {worldBuildingInterior as buildings,worldBuildingInteriorSource as bindings,worldBuildingFloor as floors,worldBuildingFloorOperation as operations,worldBuildingFloorVersion as versions} from "@/db/world-building-floor-schema";
import {worldTownPlace} from "@/db/world-town-commerce-schema";
import {worldGeography} from "@/db/world-atlas-schema";
import {FLOOR_LIMITS,floorCommandSchema,floorFootprint,validateFloor,type FloorBundle,type InteriorBuilding} from "./building-floor";
import type {TownMapBundle} from "./town-map";
import {townObjectName} from "./town-map-presets";
import {nativeResource,nativeRelatedContext,type NativeContentContext} from "./native-map-history-context";
import {nativeFloorIdentities} from "./native-map-history-floor-identities";
import {nativeContentHash,type NativeHistoryTx} from "./native-map-history-store";
import {assertNativeTarget} from "./native-map-history-resources";
import {createNativeMapAppearance,emptyNativeComposition,emptyNativeConnections} from "./native-map-history-create";
import type {NativeWriteResult} from "./native-map-history-write";
import {boundedRegionalLayer} from "./terrain-regional-authoring-service";
import {WorldError} from "./world-service";
import {nativeTargetInfo} from "./native-map-history-target";
import {worldTownMap} from "@/db/world-town-map-schema";
import {worldMapRegion} from "@/db/world-map-region-schema";

export type NativeFloorSourceContext={townMapId:string;featureId:string;worldMapId:string;regionId?:string};
export async function nativeFloorSourceContext(tx:NativeHistoryTx,c:NativeContentContext,floorId:string,townMapId?:string,featureId?:string,returnMapId?:string):Promise<NativeFloorSourceContext>{
  assertNativeTarget(c,floorId,"floor");const info=await nativeTargetInfo(tx,c.worldId,c.scope.target);
  if(!!townMapId!==!!featureId)throw new WorldError("Keep the original Town and building source together.",400);
  const [source]=await tx.select({town:worldTownMap,featureId:bindings.featureId}).from(bindings).innerJoin(worldTownMap,and(eq(worldTownMap.id,bindings.townMapId),eq(worldTownMap.worldId,bindings.worldId))).where(and(eq(bindings.worldId,c.worldId),eq(bindings.buildingId,info.buildingId!),eq(bindings.townMapId,townMapId??info.townMapId!),eq(bindings.featureId,featureId??info.featureId!))).limit(1);
  if(!source)throw new WorldError("This floor's recorded building source is unavailable. Its geometry remains retained.",404);
  let regionId=source.town.contextMapId!==source.town.sourceMapId?source.town.contextMapId:undefined;
  if(returnMapId){if(returnMapId===source.town.sourceMapId)regionId=undefined;else{const [region]=await tx.select({id:worldMapRegion.mapId}).from(worldMapRegion).where(and(eq(worldMapRegion.worldId,c.worldId),eq(worldMapRegion.mapId,returnMapId),eq(worldMapRegion.parentMapId,source.town.sourceMapId)));if(!region)throw new WorldError("The recorded return Region is unavailable for this World source.",404);regionId=returnMapId;}}
  return {townMapId:source.town.id,featureId:source.featureId,worldMapId:source.town.sourceMapId,regionId};
}

async function exterior(tx:NativeHistoryTx,c:NativeContentContext,townMapId:string,featureId:string){
  assertNativeTarget(c,townMapId,"town");await nativeFloorIdentities(tx,c,townMapId,featureId);
  const town=((await nativeResource(tx,c,"town")).payload as unknown as {bundle:TownMapBundle}).bundle.document!,feature=town.design.features.find(feature=>feature.id===featureId)!;
  const [binding]=await tx.select().from(bindings).where(and(eq(bindings.worldId,c.worldId),eq(bindings.townMapId,townMapId),eq(bindings.featureId,featureId)));
  const [bound]=binding?await tx.select().from(buildings).where(and(eq(buildings.id,binding.buildingId),eq(buildings.worldId,c.worldId))):[];
  const [permanent]=feature.placeId?await tx.select().from(buildings).where(and(eq(buildings.placeId,feature.placeId),eq(buildings.worldId,c.worldId))):[];
  if(bound&&permanent&&bound.id!==permanent.id||bound?.placeId&&feature.placeId&&bound.placeId!==feature.placeId)throw new WorldError("This drawing and permanent Place retain separate saved interiors. Restore the intended Place link before continuing.",409);
  return {town,feature,binding,building:bound??permanent};
}
export async function readNativeFloorEntry(tx:NativeHistoryTx,c:NativeContentContext,townMapId:string,featureId:string):Promise<FloorBundle>{
  const source=await exterior(tx,c,townMapId,featureId),identities=await nativeFloorIdentities(tx,c,townMapId,featureId),building=source.building??null;
  const choices=identities.floors.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)),selected=choices.find(floor=>floor.order===0&&floor.historicalCoverage==="established")??choices.find(floor=>floor.historicalCoverage==="established");
  // This is identity navigation, not a read of another map's geometry. The
  // client opens the selected floor under its own timeline/year binding.
  return {available:true,canEdit:c.canEdit,reason:"Each floor has independent dated coverage. New floors establish only the selected canonical year.",bound:!!source.binding,building,floors:choices,document:null,selectedFloorId:selected?.id};
}
export async function enterNativeBuilding(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown):Promise<NativeWriteResult>{
  const command=floorCommandSchema.parse(raw);if(command.action!=="enter")throw new WorldError("Choose a saved dated building.",400);
  const source=await exterior(tx,c,command.townMapId,command.featureId);let building=source.building;
  if(source.feature.placeId){const [place]=await tx.select({archived:worldGeography.archivedAt}).from(worldTownPlace).innerJoin(worldGeography,and(eq(worldGeography.id,worldTownPlace.geographyId),eq(worldGeography.worldId,worldTownPlace.worldId))).where(and(eq(worldTownPlace.worldId,c.worldId),eq(worldTownPlace.townId,source.town.townId),eq(worldTownPlace.geographyId,source.feature.placeId)));if(!place||place.archived)throw new WorldError("Choose an active permanent Place in this same Town.",409);}
  if(!building){
    const count=(await tx.execute<{n:number}>(sql`select count(*)::int n from world_building_interior where world_id=${c.worldId}`)).rows[0].n;if(count>=FLOOR_LIMITS.buildings)throw new WorldError("This World reached its 20,000 retained building interior identities.",413);
    const shape=floorFootprint(source.feature);[building]=await tx.insert(buildings).values({id:command.requestId,worldId:c.worldId,townId:source.town.townId,placeId:source.feature.placeId,name:townObjectName(source.feature),frame:shape.frame,footprint:shape.points,townFrame:source.town.frame}).returning();
  }else if(!building.placeId&&source.feature.placeId){[building]=await tx.update(buildings).set({placeId:source.feature.placeId}).where(eq(buildings.id,building.id)).returning();}
  if(!source.binding)await tx.insert(bindings).values({id:randomUUID(),worldId:c.worldId,buildingId:building.id,townMapId:source.town.id,featureId:source.feature.id});
  const bundle=await readNativeFloorEntry(tx,c,source.town.id,source.feature.id),result={buildingId:building.id,floorId:bundle.document?.id??null,revision:bundle.document?.revision??null};
  await tx.insert(operations).values({requestId:command.requestId,worldId:c.worldId,buildingId:building.id,authorId:c.userId,inputHash:nativeContentHash({scope:c.scope,command}),result});
  return {updates:[],unchangedParent:true,result};
}
export async function createNativeFloor(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown):Promise<NativeWriteResult>{
  const command=floorCommandSchema.parse(raw);if(command.action!=="create")throw new WorldError("Choose a new dated floor.",400);
  let building:InteriorBuilding,sourceDependencies:Parameters<typeof createNativeMapAppearance>[6]=[];
  if(c.scope.target.kind==="town"){
    const town=((await nativeResource(tx,c,"town")).payload as unknown as {bundle:TownMapBundle}).bundle.document!;
    const source=(await tx.select().from(bindings).where(and(eq(bindings.worldId,c.worldId),eq(bindings.buildingId,command.buildingId),eq(bindings.townMapId,town.id))).orderBy(asc(bindings.id)))[0];if(!source)throw new WorldError("Open this saved building from its dated Town Map before creating a floor.",409);
    const known=await exterior(tx,c,town.id,source.featureId);if(!known.building)throw new WorldError("Create the building interior identity before creating its floor.",409);building=known.building;
  }else if(c.scope.target.kind==="floor")building=((await nativeResource(tx,c,"floor")).payload as unknown as {bundle:FloorBundle}).bundle.building!;
  else throw new WorldError("Open the dated building or one of its floors first.",409);
  if(building.id!==command.buildingId)throw new WorldError("Keep the floor with its original building identity.",409);
  const count=(await tx.execute<{n:number}>(sql`select count(*)::int n from world_building_floor where world_id=${c.worldId} and building_id=${building.id}`)).rows[0].n;if(count>=FLOOR_LIMITS.floors)throw new WorldError("This building supports 64 retained floor identities.",413);
  boundedRegionalLayer(()=>validateFloor(command.design,building.frame));
  if(command.design.features.some(feature=>feature.variant==="object"&&feature.destination))throw new WorldError("Save the new floor first, then deliberately connect its stairs to a dated destination.",400);
  if(command.copyFloorId){const source=await nativeRelatedContext(tx,c,{kind:"floor",id:command.copyFloorId}),copy=((await nativeResource(tx,source,"floor")).payload as unknown as {bundle:FloorBundle}).bundle.document!;if(copy.buildingId!==building.id||copy.revision!==command.copyRevision)throw new WorldError("The dated copy source changed or belongs to another building. Retain the original preview and review its exact source.",409);sourceDependencies=[{target:source.scope.target,versionId:source.version.id}];}
  else if(command.copyRevision!==null)throw new WorldError("Choose the exact floor and revision together.",400);
  const id=command.requestId,result={buildingId:building.id,floorId:id,revision:1};
  const [row]=await tx.insert(floors).values({id,worldId:c.worldId,buildingId:building.id,name:command.name,order:command.order,elevation:command.elevation,design:command.design,revision:1,nativeOriginVersionId:c.version.id}).onConflictDoNothing().returning();if(!row)throw new WorldError("This floor identity is already retained. Keep the original creation request.",409);
  await tx.insert(operations).values({requestId:command.requestId,worldId:c.worldId,buildingId:building.id,authorId:c.userId,inputHash:nativeContentHash({scope:c.scope,command}),result});
  await tx.insert(versions).values({id:randomUUID(),floorId:id,worldId:c.worldId,revision:1,requestId:command.requestId,name:row.name,order:row.order,elevation:row.elevation,archived:false,design:row.design});
  const summary={id,buildingId:building.id,name:row.name,order:row.order,elevation:row.elevation,revision:1,archived:false};
  const bundle:FloorBundle={available:true,canEdit:true,reason:"",bound:true,building,floors:[summary],document:{...summary,worldId:c.worldId,design:row.design,history:[{revision:1,requestId:command.requestId}]}};
  const childHistorical=await createNativeMapAppearance(tx,c,{kind:"floor",id},row.name,[{key:"floor",kind:"floor",payload:{bundle}},{key:"connections",kind:"connections",payload:emptyNativeConnections()},{key:"composition",kind:"composition",payload:emptyNativeComposition()},{key:"conditions",kind:"conditions",payload:{revision:0,values:[]}}],command.templateImages,sourceDependencies);
  return {updates:[],unchangedParent:true,result:{...result,childHistorical}};
}
