import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {and,asc,eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldGeography,worldAtlasMap} from "@/db/world-atlas-schema";
import {worldMapCanvas,worldTerrain} from "@/db/world-terrain-schema";
import {worldMapPlace,worldPlaceOperation,worldSettlementHistory,worldSettlementProfile} from "@/db/world-town-schema";
import {getWorld,worldReadAccess,worldWriteTransaction,WorldError} from "./world-service";
import {peoplesReferencesInTransaction} from "./peoples-service";
import {selectedTimeline} from "./history-version-service";
import {townCommandSchema,normalizePlacePoint,type TownBundle,type TownDraft,type TownRecord,type TownReferences,type TownResult} from "./world-towns";
import {regionalAuthoringContext,requireRegionalAuthoringPin,regionalScope,boundedRegionalLayer} from "./terrain-regional-authoring-service";
import {requireRegionalPath} from "./terrain-regional-scope";
import {regionContainsPoint} from "./terrain-regions";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const missing=()=>new WorldError("This settlement or map appearance is unavailable.",404);
const conflict=()=>new WorldError("A newer town or marker revision was saved. Your draft is retained. Load the saved record before trying again.",409);
async function references(tx:Tx,worldId:string):Promise<TownReferences>{
  const timeline=await selectedTimeline(tx,worldId),r=await peoplesReferencesInTransaction(tx,worldId,timeline.id);
  return {timelineId:timeline.id,cultures:r.entities.filter(e=>e.family==="culture"),governments:r.entities.filter(e=>e.family==="government"),history:r.history.filter(h=>h.kind==="entry").map(h=>({id:h.entityId,name:h.name,archived:h.archived}))};
}
async function townRow(tx:Tx,worldId:string,id:string){const [r]=await tx.select({p:worldSettlementProfile,g:worldGeography}).from(worldSettlementProfile).innerJoin(worldGeography,and(eq(worldGeography.id,worldSettlementProfile.geographyId),eq(worldGeography.worldId,worldSettlementProfile.worldId))).where(and(eq(worldSettlementProfile.worldId,worldId),eq(worldSettlementProfile.geographyId,id)));return r;}
async function townRecord(tx:Tx,worldId:string,id:string):Promise<TownRecord>{
  const r=await townRow(tx,worldId,id);if(!r)throw missing();const history=await tx.select({id:worldSettlementHistory.entryId}).from(worldSettlementHistory).where(and(eq(worldSettlementHistory.worldId,worldId),eq(worldSettlementHistory.geographyId,id)));
  return {id,name:r.g.name,category:r.p.category,revision:r.p.revision,geographyRevision:r.g.revision,archived:!!r.g.archivedAt,archiveReason:r.p.archiveReason,draft:{name:r.g.name,category:r.p.category,description:r.g.description,locationNotes:r.p.locationNotes,background:r.p.background,population:r.p.population,cultureId:r.p.cultureId,governmentId:r.p.governmentId,historyIds:history.map(h=>h.id).sort(),godNotes:r.p.godNotes}};
}
async function mapFrame(tx:Tx,worldId:string,mapId:string){const [r]=await tx.select({t:worldTerrain,m:worldAtlasMap}).from(worldMapCanvas).innerJoin(worldTerrain,eq(worldTerrain.id,worldMapCanvas.terrainId)).innerJoin(worldAtlasMap,eq(worldAtlasMap.id,worldMapCanvas.mapId)).where(and(eq(worldMapCanvas.worldId,worldId),eq(worldMapCanvas.mapId,mapId)));if(!r||r.m.archivedAt)throw missing();return r.t;}
export async function getWorldTowns(userId:string,worldId:string,options:{review?:boolean;ordinary?:boolean;townId?:string;mapId?:string}={}):Promise<TownBundle>{
  const parent=await worldReadAccess(userId,worldId,!!options.review);if(options.ordinary)throw missing();
  // Reuse normal Worlds initialization so a sparse new World also works by API.
  await getWorld(userId,worldId,!!options.review);
  return db.transaction(async tx=>{
    const context=options.mapId?await regionalAuthoringContext(tx,worldId,options.mapId):undefined;
    const sourceMapId=context?.sourceMapId;
    const towns=await tx.select({id:worldGeography.id,name:worldGeography.name,description:worldGeography.description,locationNotes:worldSettlementProfile.locationNotes,category:worldSettlementProfile.category,revision:worldSettlementProfile.revision,geographyRevision:worldGeography.revision,archived:sql<boolean>`${worldGeography.archivedAt} IS NOT NULL`}).from(worldSettlementProfile).innerJoin(worldGeography,eq(worldGeography.id,worldSettlementProfile.geographyId)).where(eq(worldSettlementProfile.worldId,worldId)).orderBy(asc(worldGeography.name),asc(worldGeography.id));
    const placements=await tx.select({id:worldMapPlace.id,mapId:worldMapPlace.mapId,townId:worldMapPlace.geographyId,name:worldGeography.name,category:worldSettlementProfile.category,revision:worldMapPlace.revision,x:worldMapPlace.x,y:worldMapPlace.y,removed:sql<boolean>`${worldMapPlace.removedAt} IS NOT NULL`,archived:sql<boolean>`${worldGeography.archivedAt} IS NOT NULL`,mapName:worldAtlasMap.name}).from(worldMapPlace).innerJoin(worldGeography,eq(worldGeography.id,worldMapPlace.geographyId)).innerJoin(worldSettlementProfile,eq(worldSettlementProfile.geographyId,worldMapPlace.geographyId)).innerJoin(worldAtlasMap,eq(worldAtlasMap.id,worldMapPlace.mapId)).where(and(eq(worldMapPlace.worldId,worldId),sourceMapId?eq(worldMapPlace.mapId,sourceMapId):undefined)).orderBy(asc(worldMapPlace.id));
    const inside=(placement:{x:number;y:number})=>!context?.region||regionContainsPoint(context.region.frame,placement,{displayWidth:context.terrain.widthMetres,displayHeight:context.terrain.heightMetres,wrap:context.terrain.wrap});
    return {...context?.regional?{regional:context.regional}:{},...context?.region?{unavailableTownIds:placements.filter(placement=>!placement.removed&&!inside(placement)).map(placement=>placement.townId)}:{},towns,town:options.townId?await townRecord(tx,worldId,options.townId):null,placements:context?.region?placements.filter(placement=>placement.removed||inside(placement)):placements,references:await references(tx,worldId),canEdit:(!context?.region||!!context.regional)&&parent.ownerId===userId&&!parent.archivedAt&&!options.review};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
async function saveTown(tx:Tx,worldId:string,id:string,draft:TownDraft,current:TownRecord|null){
  const refs=await references(tx,worldId),allowed=(id:string|null,choices:{id:string;archived:boolean}[],retained:string|null)=>!id||id===retained||choices.some(c=>c.id===id&&!c.archived);
  if(!allowed(draft.cultureId,refs.cultures,current?.draft.cultureId??null)||!allowed(draft.governmentId,refs.governments,current?.draft.governmentId??null)||draft.historyIds.some(id=>!allowed(id,refs.history,current?.draft.historyIds.includes(id)?id:null)))throw new WorldError("Choose active culture, government and historical records from this World, or keep an existing association.",400);
  if(!current){const [collision]=await tx.select({id:worldGeography.id}).from(worldGeography).where(eq(worldGeography.id,id));if(collision)throw conflict();const [{count}]= (await tx.execute<{count:number}>(sql`select count(*)::int count from world_settlement_profile where world_id=${worldId}`)).rows;if(count>=2000)throw new WorldError("This World has reached the supported 2,000 retained settlements.",400);
    await tx.insert(worldGeography).values({id,worldId,name:draft.name,description:draft.description,kind:"location",context:"settlement",createdAt:new Date(),updatedAt:new Date()});await tx.insert(worldSettlementProfile).values({geographyId:id,worldId,category:draft.category,locationNotes:draft.locationNotes,background:draft.background,population:draft.population,godNotes:draft.godNotes,cultureId:draft.cultureId,governmentId:draft.governmentId});
  }else{if(current.archived)throw new WorldError("Restore this settlement before editing it.",400);await tx.update(worldGeography).set({name:draft.name,description:draft.description,revision:current.geographyRevision+1,updatedAt:new Date()}).where(eq(worldGeography.id,id));await tx.update(worldSettlementProfile).set({category:draft.category,locationNotes:draft.locationNotes,background:draft.background,population:draft.population,godNotes:draft.godNotes,cultureId:draft.cultureId,governmentId:draft.governmentId,revision:current.revision+1}).where(eq(worldSettlementProfile.geographyId,id));}
  await tx.delete(worldSettlementHistory).where(and(eq(worldSettlementHistory.worldId,worldId),eq(worldSettlementHistory.geographyId,id)));if(draft.historyIds.length)await tx.insert(worldSettlementHistory).values(draft.historyIds.map(entryId=>({geographyId:id,worldId,entryId})));
  return townRecord(tx,worldId,id);
}
export async function changeWorldTown(userId:string,worldId:string,input:unknown):Promise<TownResult>{
  const c=townCommandSchema.parse(input),inputHash=createHash("sha256").update(JSON.stringify(c)).digest("hex");
  await getWorld(userId,worldId);
  return worldWriteTransaction(userId,worldId,async tx=>{
    const context="mapId" in c?await regionalAuthoringContext(tx,worldId,c.mapId):undefined;
    const [retry]=await tx.select().from(worldPlaceOperation).where(eq(worldPlaceOperation.requestId,c.requestId));if(retry){if(retry.worldId!==worldId||retry.authorId!==userId||retry.inputHash!==inputHash)throw conflict();return retry.result;}
    let result:TownResult,appearance:Record<string,unknown>|null=null,mapId:string|null=null,town:TownRecord;
    if(c.action==="save"){
      const current=c.id?await townRecord(tx,worldId,c.id):null;if(current?(current.revision!==c.revision||current.geographyRevision!==c.geographyRevision):(c.revision!==null||c.geographyRevision!==null))throw conflict();
      town=await saveTown(tx,worldId,c.id??c.requestId,c.draft,current);result={townId:town.id,revision:town.revision};
    }else if(c.action==="archive"||c.action==="restore"){
      town=await townRecord(tx,worldId,c.id);if(town.revision!==c.revision||town.geographyRevision!==c.geographyRevision)throw conflict();if(town.archived===(c.action==="archive"))throw new WorldError(`This settlement is already ${town.archived?"archived":"active"}.`,400);
      await tx.update(worldGeography).set({archivedAt:c.action==="archive"?new Date():null,revision:town.geographyRevision+1,updatedAt:new Date()}).where(eq(worldGeography.id,town.id));await tx.update(worldSettlementProfile).set({revision:town.revision+1,archiveReason:c.action==="archive"?c.reason:""}).where(eq(worldSettlementProfile.geographyId,town.id));town=await townRecord(tx,worldId,town.id);result={townId:town.id,revision:town.revision};
    }else{
      requireRegionalAuthoringPin(context!,c.regional);mapId=context!.sourceMapId;const frame=await mapFrame(tx,worldId,mapId);
      town=c.action==="place-new"?await saveTown(tx,worldId,c.requestId,c.draft,null):await townRecord(tx,worldId,c.townId);
      const [old]=await tx.select().from(worldMapPlace).where(and(eq(worldMapPlace.worldId,worldId),eq(worldMapPlace.mapId,mapId),eq(worldMapPlace.geographyId,town.id)));
      if(context?.region&&old&&!old.removedAt)boundedRegionalLayer(()=>requireRegionalPath([old],0,regionalScope(context),"The existing Town marker"));
      if(c.action!=="place-new"&&(old?old.revision!==c.revision:c.revision!==null))throw conflict();
      if(c.action==="remove"){if(!old||old.removedAt)throw missing();const next={revision:old.revision+1,removedAt:new Date(),updatedAt:new Date()};await tx.update(worldMapPlace).set(next).where(eq(worldMapPlace.id,old.id));appearance={...old,...next};result={townId:town.id,placementId:old.id,placementRevision:next.revision};}
      else{if(town.archived)throw new WorldError("Restore the settlement before placing or moving its marker.",400);let point;try{point=normalizePlacePoint(c.x,c.y,frame);if(context?.region)requireRegionalPath([point],0,regionalScope(context),"The Town placement");}catch(error){throw new WorldError((error as Error).message,400);}const id=old?.id??randomUUID(),revision=(old?.revision??0)+1;
        if(!old){const [{count}]=(await tx.execute<{count:number}>(sql`select count(*)::int count from world_map_place where map_id=${mapId}`)).rows;if(count>=1000)throw new WorldError("This map has reached its supported 1,000 retained appearances.",400);}
        appearance={id,worldId,mapId,geographyId:town.id,...point,revision,removedAt:null,updatedAt:new Date()};if(old)await tx.update(worldMapPlace).set({x:point.x,y:point.y,revision,removedAt:null,updatedAt:new Date()}).where(eq(worldMapPlace.id,id));else await tx.insert(worldMapPlace).values({id,worldId,mapId,geographyId:town.id,...point,revision});result={townId:town.id,placementId:id,placementRevision:revision};}
    }
    await tx.insert(worldPlaceOperation).values({requestId:c.requestId,worldId,geographyId:town.id,mapId,authorId:userId,kind:c.action,inputHash,result,snapshot:{version:1,town,appearance}});return result;
  });
}
