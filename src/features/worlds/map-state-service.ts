import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { worldAtlasMap, worldAtlasDrawing, worldAtlasFeature, worldGeography, worldAtlasSettlementShape, worldSettlementEntity } from "@/db/world-atlas-schema";
import { worldMapState, worldMapStateVersion as versions, worldMapStateHead as heads, worldMapStateObject as objects, worldMapStateGeography as places } from "@/db/world-map-state-schema";
import { atlasId, draftOf, validateMapDraft, validateParents, type AtlasBundle, type AtlasMap, type MapDraft } from "./atlas";
import { getAtlas } from "./atlas-service";
import { selectedTimeline } from "./history-version-service";
import { WorldError, worldReadAccess, worldWriteTransaction } from "./world-service";
import { mapStateCommandSchema, resolveMapState, type MapStateBundle, type MapStateChoice, type MapStateDetails } from "./map-states";
import { projectOrdinarySettlement } from "./historical-settlement-projection";
import { ordinaryTerritorySource, validateTerritorySources, appendTerritoryReferences } from "./territory-service";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Version=typeof versions.$inferSelect;
const missing=()=>new WorldError("This historical map source is unavailable.",404);
const conflict=()=>new WorldError("A newer historical appearance was saved. Your draft is retained. Load the saved map to compare or download your draft.",409);
const metadata={id:heads.stateId,versionId:heads.versionId,revision:heads.revision,mode:heads.mode,name:versions.name,startYear:versions.startYear,endYear:versions.endYear,account:versions.account,protected:versions.protected,archived:versions.archived,authorId:versions.authorId,authoredAt:versions.createdAt,sourceVersionId:versions.sourceVersionId,baselineRevision:versions.baselineRevision};
function choice(row:Omit<MapStateChoice,"startYear"|"endYear"|"authoredAt">&{startYear:number|null;endYear:number|null;authoredAt:Date}):MapStateChoice{return {...row,startYear:row.startYear!,endYear:row.endYear!,authoredAt:row.authoredAt.toISOString()};}
async function choices(tx:Tx,worldId:string,mapId:string,timelineId:string,ordinary:boolean){return (await tx.select(metadata).from(heads).innerJoin(versions,eq(versions.id,heads.versionId)).where(and(eq(heads.worldId,worldId),eq(heads.mapId,mapId),eq(heads.timelineId,timelineId),ordinary?sql`world_map_state_is_ordinary(${versions.id},${worldId}) AND ${ordinaryTerritorySource(worldId,timelineId,sql`${versions.id}`)}`:undefined)).orderBy(versions.startYear,versions.createdAt).limit(129)).map(row=>({...choice(row),...(ordinary?{account:""}:{})}));}
async function getVersion(tx:Tx,worldId:string,mapId:string,id:string){const [v]=await tx.select().from(versions).where(and(eq(versions.id,id),eq(versions.worldId,worldId),eq(versions.mapId,mapId)));if(!v)throw missing();return v;}
async function belongs(tx:Tx,worldId:string,timelineId:string,mapId:string,versionId:string){const rows=await tx.execute(sql`WITH RECURSIVE sources(id) AS (SELECT version_id FROM world_map_state_head WHERE world_id=${worldId} AND timeline_id=${timelineId} AND map_id=${mapId} UNION SELECT n.id FROM sources s JOIN world_map_state_version v ON v.id=s.id CROSS JOIN LATERAL (SELECT v.source_version_id AS id UNION SELECT v.previous_version_id) n WHERE v.world_id=${worldId} AND n.id IS NOT NULL) SELECT id FROM sources WHERE id=${versionId}`);return rows.rows.length>0;}
function project(bundle:AtlasBundle,map:AtlasMap,v:Version,ordinary=false):AtlasBundle {
  const {geographies:localPlaces,...mapPayload}=v.payload;
  if(ordinary&&mapPayload.territories)mapPayload.territories=mapPayload.territories.map(t=>({...t,account:"",accountYear:null,originalNotation:"",relationships:t.relationships.map(r=>({...r,account:""}))}));
  const represented=new Map(localPlaces.map(g=>[g.id,g]));
  const projected:AtlasBundle={...bundle,maps:bundle.maps.map(m=>m.id===map.id?{...m,...mapPayload,revision:1,generation:ordinary?undefined:v.generation}:m),geographies:bundle.geographies.map(g=>({...g,...represented.get(g.id),revision:represented.get(g.id)?.revision??g.revision}))};
  return ordinary&&map.mapKind==="settlement"?projectOrdinarySettlement(projected,map.id):projected;
}
export async function getMapStates(userId:string,worldId:string,mapId:string,timelineId:string,options:{review?:boolean;ordinary?:boolean;stateId?:string;versionId?:string;year?:number;uncoordinated?:boolean}={}):Promise<MapStateBundle> {
  if(![mapId,timelineId,...[options.stateId,options.versionId].filter(Boolean)].every(id=>atlasId.safeParse(id).success))throw missing();
  const access=await worldReadAccess(userId,worldId,!!options.review);
  // getAtlas supplies the established server-side geography projection and existing destinations.
  const baseline=await getAtlas(userId,worldId,!!options.review,mapId,!!options.ordinary);
  const map=baseline.maps.find(m=>m.id===mapId);if(!map)throw missing();
  const result:MapStateBundle=await db.transaction(async tx=>{
    const timeline=await selectedTimeline(tx,worldId,timelineId);
    const parent=timeline.parentId?await selectedTimeline(tx,worldId,timeline.parentId):null;
    const states=await choices(tx,worldId,mapId,timelineId,!!options.ordinary);
    // Parent sources are author choices, not knowledge retained by this timeline.
    const parentStates=parent&&!options.ordinary?await choices(tx,worldId,mapId,parent.id,false):[];
    let selected=options.stateId?states.find(s=>s.id===options.stateId)??null:options.year!==undefined?resolveMapState(states,options.year):null;
    if(options.stateId&&!selected)throw missing();
    let bundle=baseline;const revisions:MapStateChoice[]=[];
    if(selected){
      const current=selected;
      const rows=await tx.execute(sql`WITH RECURSIVE sources(id) AS (SELECT ${current.versionId}::text UNION SELECT n.id FROM sources s JOIN world_map_state_version v ON v.id=s.id CROSS JOIN LATERAL (SELECT v.source_version_id AS id UNION SELECT v.previous_version_id) n WHERE n.id IS NOT NULL AND v.world_id=${worldId}) SELECT v.id FROM sources s JOIN world_map_state_version v ON v.id=s.id WHERE v.state_id=${current.id} AND v.world_id=${worldId} ${options.ordinary?sql`AND world_map_state_is_ordinary(v.id,${worldId}) AND ${ordinaryTerritorySource(worldId,timelineId,sql`v.id`)}`:sql``} ORDER BY (v.id=${current.versionId}) DESC,v.created_at DESC,v.id LIMIT 100`);
      if(rows.rows.length){const historical=await tx.select({id:versions.id,name:versions.name,startYear:versions.startYear,endYear:versions.endYear,account:versions.account,protected:versions.protected,archived:versions.archived,authorId:versions.authorId,createdAt:versions.createdAt,sourceVersionId:versions.sourceVersionId,baselineRevision:versions.baselineRevision}).from(versions).where(inArray(versions.id,rows.rows.map(row=>String(row.id)))).orderBy(sql`(${versions.id}=${current.versionId}) DESC`,sql`${versions.createdAt} DESC`,versions.id);for(const v of historical)revisions.push({...current,versionId:v.id,name:v.name,startYear:v.startYear!,endYear:v.endYear!,account:options.ordinary?"":v.account,protected:v.protected,archived:v.archived,authorId:v.authorId,authoredAt:v.createdAt.toISOString(),sourceVersionId:v.sourceVersionId,baselineRevision:v.baselineRevision});}
      if(options.versionId){selected=revisions.find(r=>r.versionId===options.versionId)??null;if(!selected)throw missing();}
      const v=await getVersion(tx,worldId,mapId,selected.versionId);
      const missingIds=v.payload.geographies.filter(g=>!baseline.geographies.some(n=>n.id===g.id)).map(g=>g.id);
      const added=missingIds.length?await tx.select().from(worldGeography).where(and(eq(worldGeography.worldId,worldId),inArray(worldGeography.id,missingIds))):[];
      bundle=project({...baseline,geographies:[...baseline.geographies,...added.map(g=>({id:g.id,name:g.name,description:g.description,kind:g.kind as MapDraft["geographies"][number]["kind"],context:g.context as MapDraft["geographies"][number]["context"],parentId:g.parentId,revision:g.revision,archived:!!g.archivedAt}))]},map,v,!!options.ordinary);
    }else if(options.versionId)throw missing();
    return {bundle,states,parentStates,revisions,selected,coverage:selected?"established":options.year!==undefined?"unknown":"baseline",canEdit:baseline.canEdit&&access.ownerId===userId&&!timeline.archivedAt&&["generic","settlement"].includes(map.mapKind??"generic")&&!options.ordinary,timelineId,timelineName:timeline.name,parentTimelineName:parent?.name??null};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
  if(options.year!==undefined&&!options.uncoordinated){const {coordinateHistoricalMap}=await import("./historical-connection-service");return coordinateHistoricalMap(userId,worldId,mapId,timelineId,options.year,result,options);}
  return result;
}
async function saveSource(tx:Tx,userId:string,worldId:string,map:typeof worldAtlasMap.$inferSelect,timelineId:string,stateId:string|null,draft:MapDraft,details:MapStateDetails|null,source:Version|null,archived=false){
  if(map.mapKind==="settlement"&&!source)draft={...draft,historicalPlaces:[...new Set([map.geographyId!,...(draft.settlementEntities??[]).map(e=>e.geographyId)])].map(geographyId=>({geographyId,condition:"present" as const}))};
  try{validateMapDraft(draft);}catch(error){throw new WorldError((error as Error).message,400);}
  if((map.mapKind!=="settlement"&&(draft.settlementState||draft.settlementShapes||draft.settlementEntities||draft.historicalPlaces))||draft.interiorState||draft.interiorShapes||draft.interiorEntities||draft.interiorLinks||draft.dungeonState||draft.dungeonShapes||draft.dungeonEntities||draft.dungeonLinks)throw new WorldError("Historical authoring supports generic and settlement map artwork.",400);
  if(source&&(source.payload.features.some(f=>!draft.features.some(n=>n.id===f.id))||source.payload.drawings?.some(d=>!draft.drawings?.some(n=>n.id===d.id))))throw new WorldError("Keep retained shapes and drawings; archive unwanted artwork.",400);
  const existing=await tx.select().from(worldGeography).where(eq(worldGeography.worldId,worldId));
  for(const g of draft.geographies){const old=existing.find(e=>e.id===g.id),retained=source?.payload.geographies.find(n=>n.id===g.id);if(old){if(!source&&g.revision!==old.revision)throw conflict();if(g.kind!==old.kind||g.parentId!==(retained?retained.parentId:old.parentId)||g.context!==undefined&&g.context!==(retained?.context??old.context))throw new WorldError("Historical appearance can rename a place locally; its shared kind and retained parent remain stable.",400);}else{throw new WorldError("Save this place in the shared Atlas geography library before representing it in a historical appearance.",400);}}
  try{validateParents([...existing,...draft.geographies.filter(g=>!existing.some(e=>e.id===g.id))]);}catch(error){throw new WorldError((error as Error).message,400);}
  if(map.mapKind==="settlement"){
    if(!draft.settlementState||!draft.settlementShapes||!draft.settlementEntities||!draft.historicalPlaces)throw new WorldError("This historical settlement source is incomplete. Reload its workshop.",400);
    if(source&&(source.payload.settlementShapes?.some(s=>!draft.settlementShapes!.some(n=>n.id===s.id))||source.payload.settlementEntities?.some(e=>!draft.settlementEntities!.some(n=>n.geographyId===e.geographyId))))throw new WorldError("Keep retained settlement objects and places. Use historical condition or archive the representation.",400);
    const savedEntities=await tx.select().from(worldSettlementEntity).where(and(eq(worldSettlementEntity.worldId,worldId),eq(worldSettlementEntity.settlementId,map.geographyId!)));
    for(const e of draft.settlementEntities){const saved=savedEntities.find(n=>n.geographyId===e.geographyId);if(!saved||saved.kind!==e.kind)throw new WorldError("Reuse a saved place of the same kind in this settlement. Create new identities in the shared settlement workshop first.",400);if(!source&&saved.revision!==e.revision)throw conflict();
      if(!draft.geographies.some(g=>g.id===e.geographyId))throw new WorldError("Retain each settlement place's local information.",400);
      for(const district of e.districtIds)if(!draft.settlementEntities.some(n=>n.geographyId===district&&n.kind==="district"))throw new WorldError("Choose a retained district in this settlement.",400);
    }
    const ids=new Set([map.geographyId!,...draft.settlementEntities.map(e=>e.geographyId)]);
    if(draft.historicalPlaces.length!==ids.size||draft.historicalPlaces.some(p=>!ids.has(p.geographyId))||!draft.geographies.some(g=>g.id===map.geographyId))throw new WorldError("Author one condition for the settlement and every retained place.",400);
  }
  await validateTerritorySources(tx,worldId,map.id,timelineId,draft.territories??[],source?.payload.territories??[],details??undefined);
  for(const t of draft.territories??[])if(t.geographyIds.some(id=>!draft.geographies.some(g=>g.id===id)))throw new WorldError("Retain local information for each territory\'s saved geographic subject.",400);
  const geographies=await tx.select().from(worldGeography).where(eq(worldGeography.worldId,worldId));
  const incoming=[...(draft.settlementShapes??[]).map(s=>({id:s.id,kind:`settlement-${s.type}`,geographyId:s.geographyId})),...draft.features.map(f=>({id:f.id,kind:"feature",geographyId:f.geographyId})),...(draft.drawings??[]).map(d=>({id:d.id,kind:d.type,geographyId:d.geographyId}))];
  if(new Set(incoming.map(o=>o.id)).size!==incoming.length)throw new WorldError("Each historical drawing has a distinct identity.",400);
  const oldObjects=incoming.length?await tx.select().from(objects).where(inArray(objects.id,incoming.map(o=>o.id))):[];
  const oldFeatures=incoming.length?await tx.select().from(worldAtlasFeature).where(inArray(worldAtlasFeature.id,incoming.map(o=>o.id))):[];
  const oldDrawings=incoming.length?await tx.select().from(worldAtlasDrawing).where(inArray(worldAtlasDrawing.id,incoming.map(o=>o.id))):[];
  const oldSettlement=incoming.length?await tx.select().from(worldAtlasSettlementShape).where(inArray(worldAtlasSettlementShape.id,incoming.map(o=>o.id))):[];
  for(const o of incoming){const old=oldObjects.find(n=>n.id===o.id),feature=oldFeatures.find(n=>n.id===o.id),drawing=oldDrawings.find(n=>n.id===o.id),settlement=oldSettlement.find(n=>n.id===o.id);if(settlement&&(settlement.mapId!==map.id||settlement.worldId!==worldId||`settlement-${settlement.content.type}`!==o.kind||settlement.geographyId!==o.geographyId)||old&&(old.mapId!==map.id||old.worldId!==worldId||old.kind!==o.kind||old.geographyId!==o.geographyId)||feature&&(feature.mapId!==map.id||feature.worldId!==worldId||o.kind!=="feature"||feature.geographyId!==o.geographyId)||drawing&&(drawing.mapId!==map.id||drawing.worldId!==worldId||drawing.content.type!==o.kind||drawing.geographyId!==o.geographyId))throw missing();if(o.geographyId&&!geographies.some(g=>g.id===o.geographyId))throw missing();if(!old)await tx.insert(objects).values({...o,mapId:map.id,worldId});}
  for(const f of draft.features){const g=geographies.find(g=>g.id===f.geographyId)!;if((f.geometry.type==="point")!==(g.kind==="location"))throw new WorldError("Locations use markers; land identities use outlines.",400);}
  for(const d of draft.drawings??[]){const g=geographies.find(g=>g.id===d.geographyId);if(d.type==="terrain"&&d.geographyId||d.type==="symbol"&&["village","city","castle","tower","ruin","port"].includes(d.kind)&&g?.kind!=="location")throw new WorldError("Choose a suitable World place for linked artwork.",400);}
  const payload={...draft,drawings:draft.drawings??[],geographies:draft.geographies.map(g=>({...g,revision:geographies.find(n=>n.id===g.id)!.revision}))};
  const id=randomUUID();await tx.insert(versions).values({id,worldId,mapId:map.id,stateId,timelineId,sourceVersionId:source?(source.stateId===stateId&&source.timelineId===timelineId?source.sourceVersionId:source.id):null,previousVersionId:source?.stateId===stateId&&stateId?source.id:null,baselineRevision:source?.baselineRevision??map.revision,name:details?.name??map.name,startYear:details?.startYear??null,endYear:details?.endYear??null,account:details?.account??"Retained shared map source; historical coverage is not asserted.",protected:details?.protected??false,archived,payload,generation:source?.generation??map.generation,authorId:userId});
  await appendTerritoryReferences(tx,worldId,map.id,id,draft.territories??[]);
  const referenced=new Set([...draft.geographies.map(g=>g.id),...draft.geographies.flatMap(g=>g.parentId?[g.parentId]:[]),...incoming.flatMap(o=>o.geographyId?[o.geographyId]:[]),...(map.geographyId?[map.geographyId]:[])]);
  if(referenced.size)await tx.insert(places).values([...referenced].map(geographyId=>({versionId:id,worldId,mapId:map.id,geographyId})));
  return id;
}
export async function changeMapState(userId:string,worldId:string,input:unknown){
  const c=mapStateCommandSchema.parse(input);
  // Authorization/read occur before obtaining a snapshot; revision is rechecked under the World lock.
  const baseline=c.action==="create"&&!c.sourceVersionId?await getAtlas(userId,worldId,false,c.mapId):null;
  return worldWriteTransaction(userId,worldId,async tx=>{
    const timeline=await selectedTimeline(tx,worldId,c.timelineId);if(timeline.archivedAt)throw new WorldError("Restore this timeline before authoring map history.",400);
    const [map]=await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.id,c.mapId),eq(worldAtlasMap.worldId,worldId)));
    if(!map||map.archivedAt)throw missing();if(!["generic","settlement"].includes(map.mapKind))throw new WorldError("Historical appearances support generic and settlement Atlas maps.",400);
    const current=await choices(tx,worldId,map.id,timeline.id,false);
    async function coverage(details:MapStateDetails,id?:string){if(current.some(s=>s.id!==id&&!s.archived&&s.startYear<=details.endYear&&s.endYear>=details.startYear))throw new WorldError("This period overlaps another active appearance. Adjust the years or archive that appearance first.",409);}
    if(c.action==="retain"){
      if(!timeline.parentId)throw missing();const parent=(await choices(tx,worldId,map.id,timeline.parentId,false)).find(s=>s.id===c.id);
      if(!parent||parent.archived)throw missing();if(parent.versionId!==c.sourceVersionId||parent.revision!==c.sourceRevision)throw conflict();if(current.some(s=>s.id===c.id))throw new WorldError("This source is already retained. Its appearance stays pinned; edit it deliberately to write an interpretation.",409);
      if(current.length>=128)throw new WorldError("A map supports 128 retained historical states per timeline.",400);await coverage(parent);
      await tx.insert(heads).values({timelineId:timeline.id,worldId,mapId:map.id,stateId:c.id,versionId:parent.versionId,revision:1,mode:"retained"});return {id:c.id};
    }
    if(c.action==="create"){
      if(current.length>=128)throw new WorldError("A map supports 128 retained historical states per timeline.",400);await coverage(c.details);
      let source:Version;
      if(c.sourceVersionId){if(!await belongs(tx,worldId,timeline.id,map.id,c.sourceVersionId))throw missing();source=await getVersion(tx,worldId,map.id,c.sourceVersionId);}else{
        const b=baseline?.maps.find(m=>m.id===map.id);if(!b||b.revision!==map.revision||map.revision!==c.baselineRevision)throw conflict();
        const id=await saveSource(tx,userId,worldId,map,timeline.id,null,draftOf(b,baseline!.geographies),null,null);source=await getVersion(tx,worldId,map.id,id);
      }
      const id=randomUUID();await tx.insert(worldMapState).values({id,worldId,mapId:map.id,originTimelineId:timeline.id});
      const versionId=await saveSource(tx,userId,worldId,map,timeline.id,id,{...source.payload,...source.payload.territories?{territories:source.payload.territories.map(t=>({...t,relationships:t.relationships.map(r=>({...r,startYear:c.details.startYear,endYear:c.details.endYear}))}))}:{}},c.details,source);
      await tx.insert(heads).values({timelineId:timeline.id,worldId,mapId:map.id,stateId:id,versionId,revision:1,mode:"authored"});return {id};
    }
    const head=current.find(s=>s.id===c.id);if(!head)throw missing();if(head.revision!==c.revision)throw conflict();
    const source=await getVersion(tx,worldId,map.id,head.versionId);
    const details=c.action==="save"?c.details:head;
    const archived=c.action==="archive"?true:c.action==="restore"?false:head.archived;
    if(c.action==="save"&&head.archived)throw new WorldError("Restore this appearance before editing it.",400);
    if(!archived)await coverage(details,c.id);
    const versionId=await saveSource(tx,userId,worldId,map,timeline.id,c.id,c.action==="save"?c.draft:source.payload,details,source,archived);
    await tx.update(heads).set({versionId,revision:head.revision+1,mode:head.mode==="retained"?"interpretation":head.mode}).where(and(eq(heads.timelineId,timeline.id),eq(heads.stateId,c.id)));return {id:c.id};
  });
}
