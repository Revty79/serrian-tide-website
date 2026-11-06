import "server-only";
import {and,eq,sql} from "drizzle-orm";
import {z} from "zod";
import {worldTownMap,worldTownMapVersion} from "@/db/world-town-map-schema";
import {worldTownPlace,worldShopLocation} from "@/db/world-town-commerce-schema";
import {worldGeography} from "@/db/world-atlas-schema";
import {townMapCommandSchema,townFrameSchema,townGenerationSchema,townDesignSchema,generateTown,validateTownFrame,validateTownDesign,townToWorld,TOWN_MAP_LIMITS,type TownMapBundle} from "./town-map";
import {nativeTerrainSource} from "./native-map-history-terrain-read";
import {nativeResource,nativeRelatedContext,type NativeContentContext} from "./native-map-history-context";
import {nativeContentHash,type NativeHistoryTx} from "./native-map-history-store";
import {sampleNativeTownBackdrop} from "./native-map-history-backdrop";
import {nativeConditions} from "./native-map-history-conditions";
import {nativeObjectPresent} from "./native-map-history";
import type {TownBundle} from "./world-towns";
import {regionContainsPoint} from "./terrain-regions";
import {boundedRegionalLayer} from "./terrain-regional-authoring-service";
import {createNativeMapAppearance,emptyNativeComposition,emptyNativeConnections} from "./native-map-history-create";
import type {NativeWriteResult} from "./native-map-history-write";
import {WorldError} from "./world-service";

const previewSchema=z.object({action:z.literal("preview"),sourceMapId:z.uuid(),frame:townFrameSchema,settings:townGenerationSchema,existing:townDesignSchema.optional()}).strict();
export async function nativeTownChoices(tx:NativeHistoryTx,c:NativeContentContext,maps:TownMapBundle["maps"]){
  const choices=[];
  for(const map of maps){const rows=await tx.execute<{name:string;revision:number;archived:boolean}>(sql`select r.payload#>>'{bundle,document,name}' name,(r.payload#>>'{bundle,document,revision}')::int revision,(r.payload#>>'{bundle,document,archived}')::boolean archived from world_map_state_head h join world_map_state_version v on v.id=h.version_id and v.world_id=h.world_id join world_map_state_component_ref p on p.version_id=v.id and p.world_id=h.world_id and p.key='town' join world_map_state_component r on r.id=p.component_id and r.world_id=h.world_id where h.world_id=${c.worldId} and h.timeline_id=${c.scope.timelineId} and v.payload->'nativeAtlas'->'target'->>'kind'='town' and v.payload->'nativeAtlas'->'target'->>'id'=${map.id} and not v.archived and v.start_year<=${c.scope.year} and v.end_year>=${c.scope.year}`);if(rows.rows.length>1)throw new WorldError("This Town has overlapping historical appearances. Retained sources remain intact.",409);const metadata=rows.rows[0];choices.push({...map,...metadata,historicalCoverage:metadata?"established" as const:"unknown" as const});}
  return choices;
}
export async function previewNativeTown(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown){
  if(!c.canEdit)throw new WorldError("Choose Edit This Appearance before preparing a new dated Town Map.",403);
  const command=previewSchema.parse(raw);
  let ground=c;
  if(c.scope.target.kind==="town"){
    const town=((await nativeResource(tx,c,"town")).payload as unknown as {bundle:TownMapBundle}).bundle.document;
    if(!town||command.sourceMapId!==town.sourceMapId||(["x","y","width","height","rotation"] as const).some(key=>command.frame[key]!==town.frame[key]))throw new WorldError("Keep this layout preview inside its exact dated Town and World source.",409);
    if(!nativeObjectPresent((await nativeConditions(tx,c)).values,town.id))throw new WorldError("Establish this dated Town's presence before adding a layout.",409);
    ground=await nativeRelatedContext(tx,c,{kind:"terrain",id:town.sourceMapId});
  }
  const source=await nativeTerrainSource(tx,ground),rootId=source.document.region?.parentMapId??ground.scope.target.id;
  if(!nativeObjectPresent((await nativeConditions(tx,ground)).values,rootId))throw new WorldError("Establish the dated World map's presence before preparing Town ground.",409);
  if(command.sourceMapId!==rootId)throw new WorldError("Choose the exact dated World source for this Town preview.",409);
  const backdrop=await sampleNativeTownBackdrop(tx,ground.authority??ground,command.frame),proposal=boundedRegionalLayer(()=>generateTown(command.settings,command.frame,backdrop,command.existing));
  return {...proposal,backdrop,previewToken:nativeContentHash({source:command.sourceMapId,frame:command.frame,design:proposal.design,fingerprint:backdrop.fingerprint})};
}
export async function createNativeTown(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown):Promise<NativeWriteResult>{
  const command=townMapCommandSchema.parse(raw);if(command.action!=="create")throw new WorldError("Choose a new dated Town Map.",400);
  if(c.scope.target.kind!=="terrain"||command.contextMapId!==c.scope.target.id)throw new WorldError("Open the intended dated World or Region before creating this Town Map.",409);
  const source=await nativeTerrainSource(tx,c),rootId=source.document.region?.parentMapId??c.scope.target.id;
  if(command.sourceMapId!==rootId)throw new WorldError("Keep the new Town with its exact dated World source.",409);
  const places=(await nativeResource(tx,c,"places")).payload as unknown as TownBundle,conditions=(await nativeConditions(tx,c)).values;
  if(!nativeObjectPresent(conditions,rootId))throw new WorldError("Establish the dated World map's presence before creating a Town Map from it.",409);
  const marker=places.placements.find(place=>place.id===command.placementId&&place.townId===command.townId&&!place.removed&&!place.archived);
  if(!marker||marker.revision!==command.placementRevision||marker.x!==command.anchor.x||marker.y!==command.anchor.y||!nativeObjectPresent(conditions,marker.townId)||!nativeObjectPresent(conditions,marker.id))throw new WorldError("The dated Town marker changed or is unavailable. Keep the draft and review its original placement.",409);
  const town=places.towns.find(town=>town.id===command.townId);if(!town||town.archived)throw new WorldError("Choose an active permanent Town identity from this dated map.",409);
  const world={width:source.shape.displayWidth,height:source.shape.displayHeight,wrap:source.shape.wrap};
  boundedRegionalLayer(()=>{validateTownFrame(command.frame,world);validateTownDesign(command.design,command.frame);});
  const centre=townToWorld({x:command.frame.width/2,y:command.frame.height/2},command.frame,world),dx=world.wrap?Math.abs(centre.x-command.anchor.x)%world.width:Math.abs(centre.x-command.anchor.x);
  if(Math.min(dx,world.wrap?world.width-dx:dx)>.01||Math.abs(centre.y-command.anchor.y)>.01)throw new WorldError("Centre the Town Map on its selected dated marker.",400);
  if(source.document.region&&!regionContainsPoint(source.document.region,command.anchor,source.shape))throw new WorldError("Choose a Town marker inside this dated Region.",400);
  const counts=(await tx.execute<{total:number;town:number}>(sql`select count(*)::int total,count(*) filter(where town_id=${command.townId})::int town from world_town_map where world_id=${c.worldId}`)).rows[0];
  if(counts.total>=TOWN_MAP_LIMITS.maps||counts.town>=TOWN_MAP_LIMITS.perTown)throw new WorldError("Town Map capacity reached: 10,000 retained maps per World and 32 per Town.",413);
  for(const feature of command.design.features){
    if(feature.placeId){const [place]=await tx.select().from(worldTownPlace).innerJoin(worldGeography,eq(worldGeography.id,worldTownPlace.geographyId)).where(and(eq(worldTownPlace.worldId,c.worldId),eq(worldTownPlace.townId,command.townId),eq(worldTownPlace.geographyId,feature.placeId)));if(!place||place.world_geography.archivedAt)throw new WorldError("Choose an active permanent Place in this same Town.",400);}
    if(feature.shopLocationId){const [shop]=await tx.select().from(worldShopLocation).where(and(eq(worldShopLocation.worldId,c.worldId),eq(worldShopLocation.townId,command.townId),eq(worldShopLocation.id,feature.shopLocationId)));if(!shop||shop.removedAt||shop.placeId&&shop.placeId!==feature.placeId)throw new WorldError("Choose this Town's existing Shop branch and Place identity.",400);}
  }
  const backdrop=await sampleNativeTownBackdrop(tx,c.authority??c,command.frame);
  if(command.design.features.length&&command.design.recipe?.mode!=="blank"&&command.previewToken!==nativeContentHash({source:rootId,frame:command.frame,design:command.design,fingerprint:backdrop.fingerprint}))throw new WorldError("The dated layout preview or its geographic source changed. Review a fresh preview before starting a new save intent.",409);
  const id=command.requestId,[row]=await tx.insert(worldTownMap).values({id,worldId:c.worldId,townId:command.townId,sourceMapId:rootId,terrainId:source.document.terrainId,contextMapId:command.contextMapId,placementId:null,placementRevision:null,anchorX:command.anchor.x,anchorY:command.anchor.y,frame:command.frame,name:command.name,revision:1,design:command.design,nativeOriginVersionId:c.version.id}).onConflictDoNothing().returning();
  if(!row)throw new WorldError("This map identity is already retained. Keep its original request and choose a new creation intent.",409);
  await tx.insert(worldTownMapVersion).values({requestId:command.requestId,mapId:id,worldId:c.worldId,revision:1,authorId:c.userId,inputHash:nativeContentHash({scope:c.scope,command}),name:command.name,archived:false,design:command.design});
  const summary={id,name:row.name,townId:row.townId,townName:town.name,sourceMapId:rootId,contextMapId:row.contextMapId,revision:1,archived:false,townArchived:false,sourceAvailable:true};
  const bundle:TownMapBundle={available:true,canEdit:true,maps:[summary],next:null,document:{...summary,worldId:c.worldId,terrainId:row.terrainId,placementId:marker.id,anchor:command.anchor,frame:row.frame,design:row.design,canEdit:true,history:[{revision:1,requestId:command.requestId}]}};
  const childHistorical=await createNativeMapAppearance(tx,c,{kind:"town",id},command.name,[{key:"town",kind:"town",payload:{bundle}},{key:"connections",kind:"connections",payload:emptyNativeConnections()},{key:"composition",kind:"composition",payload:emptyNativeComposition()},{key:"conditions",kind:"conditions",payload:{revision:0,values:[]}}],command.templateImages);
  return {updates:[],unchangedParent:true,result:{id,revision:1,childHistorical}};
}
