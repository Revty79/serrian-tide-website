import "server-only";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and,eq,inArray,sql } from "drizzle-orm";
import { db } from "@/db";
import { worldAtlasMap,worldAtlasConnection,worldGeography } from "@/db/world-atlas-schema";
import { worldMapConnectionHistory as identities,worldMapConnectionVersion as versions,worldMapConnectionHead as heads } from "@/db/world-map-connection-schema";
import { worldMapStateHead,worldMapStateVersion } from "@/db/world-map-state-schema";
import { getAtlas } from "./atlas-service";
import { selectedTimeline,type HistoryTx } from "./history-version-service";
import { WorldError,worldReadAccess,worldWriteTransaction } from "./world-service";
import { atlasId,type AtlasConnection } from "./atlas";
import { historicalConnectionCommandSchema,resolveHistoricalConnections,type HistoricalConnection,type HistoricalConnectionDraft,type HistoricalConnectionSource,type HistoricalConnectionBundle,type HistoricalConnectionPolicy,type CoordinationFinding } from "./historical-connections";
import { placeIsPresent } from "./historical-places";
import { ordinaryTerritorySource } from "./territory-service";
import type { MapStateBundle } from "./map-states";
import { yearSchema } from "./world-year";

const missing=()=>new WorldError("This historical connection or its saved source is unavailable in this timeline.",404);
const conflict=()=>new WorldError("A newer historical connection was saved. Your draft is retained. Compare the saved source before trying again.",409);
type Version=typeof versions.$inferSelect;
type Options={review?:boolean;ordinary?:boolean;id?:string;versionId?:string};
function dto(v:Version,h:{revision:number;mode:HistoricalConnection["mode"];timelineId:string},ordinary=false):HistoricalConnection {
  return {id:v.connectionId,mapId:v.mapId,geographyId:v.geographyId,versionId:v.id,revision:h.revision,mode:h.mode,timelineId:h.timelineId,sourceTimelineId:v.timelineId,sourceVersionId:ordinary?null:v.sourceVersionId,previousVersionId:ordinary?null:v.previousVersionId,authorId:v.authorId,authoredAt:v.createdAt.toISOString(),archived:v.archived,
    draft:ordinary?{...v.draft,account:"",accountYear:null,originalNotation:""}:v.draft,source:ordinary?{placeName:v.source.placeName,destinationName:v.source.destinationName,arrivalName:v.source.arrivalName,baseline:null,ordinary:true}:v.source};
}
async function rows(tx:HistoryTx,worldId:string,mapId:string,timelineId:string,ordinary:boolean){
  const found=await tx.select({v:versions,h:heads}).from(heads).innerJoin(versions,eq(heads.versionId,versions.id)).where(and(eq(heads.worldId,worldId),eq(heads.mapId,mapId),eq(heads.timelineId,timelineId),ordinary?sql`world_map_connection_is_ordinary(${versions.id},${worldId})`:undefined)).orderBy(versions.startYear,versions.createdAt,versions.id).limit(129);
  if(found.length>128)throw new WorldError("This map supports 128 historical connection accounts per timeline.",409);
  return found;
}
export async function getHistoricalConnections(userId:string,worldId:string,mapId:string,timelineId:string,options:Options={}):Promise<HistoricalConnectionBundle>{
  if(![mapId,timelineId,options.id,options.versionId].filter(Boolean).every(v=>atlasId.safeParse(v).success))throw missing();
  const access=await worldReadAccess(userId,worldId,!!options.review),atlas=await getAtlas(userId,worldId,!!options.review,mapId,!!options.ordinary);
  if(!atlas.maps.some(m=>m.id===mapId))throw missing();
  return db.transaction(async tx=>{
    const timeline=await selectedTimeline(tx,worldId,timelineId),parent=timeline.parentId?await selectedTimeline(tx,worldId,timeline.parentId):null;
    const current=await rows(tx,worldId,mapId,timelineId,!!options.ordinary),records=current.map(({v,h})=>dto(v,h,!!options.ordinary));
    const parentRecords=parent&&!options.ordinary?(await rows(tx,worldId,mapId,parent.id,false)).map(({v,h})=>dto(v,h)):[];
    let selected=options.id?records.find(r=>r.id===options.id)??null:null;const revisions:HistoricalConnection[]=[];
    if(options.id&&!selected)throw missing();
    if(selected){const selectedHead=current.find(r=>r.v.id===selected!.versionId)!;
      const found=await tx.execute(sql`with recursive sources(id) as (select ${selected.versionId}::text union select n.id from sources s join world_map_connection_version v on v.id=s.id cross join lateral (select v.previous_version_id as id union select v.source_version_id) n where v.world_id=${worldId} and n.id is not null)
        select v.id from sources s join world_map_connection_version v on v.id=s.id where v.world_id=${worldId} and v.map_id=${mapId} and v.connection_id=${selected.id} ${options.ordinary?sql`and world_map_connection_is_ordinary(v.id,${worldId})`:sql``} order by (v.id=${selected.versionId}) desc,v.created_at desc,v.id limit 100`);
      if(found.rows.length){const saved=await tx.select().from(versions).where(inArray(versions.id,found.rows.map(r=>String(r.id)))).orderBy(sql`(${versions.id}=${selected.versionId}) DESC`,sql`${versions.createdAt} DESC`,versions.id);revisions.push(...saved.map(v=>dto(v,selectedHead.h,!!options.ordinary)));}
      if(options.versionId){selected=revisions.find(v=>v.versionId===options.versionId)??null;if(!selected)throw missing();}
    }else if(options.versionId)throw missing();
    const safePlaces=new Set(atlas.geographies.map(g=>g.id)),safeMaps=new Set(atlas.maps.map(m=>m.id));
    const safe=(r:HistoricalConnection)=>!options.ordinary||safePlaces.has(r.geographyId)&&(!r.draft.destinationMapId||safeMaps.has(r.draft.destinationMapId))&&(!r.draft.destinationGeographyId||safePlaces.has(r.draft.destinationGeographyId));
    if(selected&&!safe(selected))throw missing();
    return {records:records.filter(safe),parentRecords,revisions:revisions.filter(safe),selected,canEdit:atlas.canEdit&&access.ownerId===userId&&!timeline.archivedAt&&["generic","settlement"].includes(atlas.maps.find(m=>m.id===mapId)?.mapKind??"generic"),timelineName:timeline.name,parentTimelineName:options.ordinary?null:parent?.name??null,choices:{maps:atlas.maps.map(m=>({...m,features:[],drawings:[],settlementEntities:undefined,settlementShapes:undefined,territories:undefined})),geographies:atlas.geographies,connections:atlas.connections?.filter(c=>c.sourceMapId===mapId)}};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
async function reachableSource(tx:HistoryTx,worldId:string,mapId:string,timelineId:string,id:string){
  const found=await tx.execute(sql`with recursive sources(id) as (select version_id from world_map_connection_head where world_id=${worldId} and map_id=${mapId} and timeline_id=${timelineId} union select n.id from sources s join world_map_connection_version v on v.id=s.id cross join lateral(select v.source_version_id as id union select v.previous_version_id) n where n.id is not null and v.world_id=${worldId}) select id from sources where id=${id}`);
  return found.rows.length>0;
}
async function sourceFor(tx:HistoryTx,worldId:string,mapId:string,geographyId:string,draft:HistoricalConnectionDraft,prior?:Version):Promise<HistoricalConnectionSource>{
  const [place]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,geographyId),eq(worldGeography.worldId,worldId)));if(!place||place.archivedAt&&!prior)throw missing();
  const [destination]=draft.destinationMapId?await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.id,draft.destinationMapId),eq(worldAtlasMap.worldId,worldId))):[];
  if(draft.destinationMapId&&(!destination||destination.id===mapId||destination.archivedAt&&prior?.destinationMapId!==destination.id))throw missing();
  const [arrival]=draft.destinationGeographyId?await tx.select().from(worldGeography).where(and(eq(worldGeography.id,draft.destinationGeographyId),eq(worldGeography.worldId,worldId))):[];
  if(draft.destinationGeographyId&&(!arrival||arrival.archivedAt&&prior?.destinationGeographyId!==arrival.id))throw missing();
  if(arrival){const represented=await tx.execute(sql`select world_map_connection_arrival_valid(${destination!.id},${worldId},${arrival.id}) valid`);if(!represented.rows[0]?.valid)throw new WorldError("Choose an arrival place represented by the destination map or within its saved place.",400);}
  const [baseline]=prior?[]:await tx.select().from(worldAtlasConnection).where(and(eq(worldAtlasConnection.worldId,worldId),eq(worldAtlasConnection.sourceMapId,mapId),eq(worldAtlasConnection.geographyId,geographyId)));
  const captured=prior?.source.baseline??baseline;
  const checks=await tx.execute(sql`select world_map_connection_place_ordinary(${worldId},${geographyId}) and (${draft.destinationMapId}::text is null or world_map_connection_map_ordinary(${worldId},${draft.destinationMapId})) and (${draft.destinationGeographyId}::text is null or world_map_connection_place_ordinary(${worldId},${draft.destinationGeographyId})) and (${captured?.destinationMapId??null}::text is null or world_map_connection_map_ordinary(${worldId},${captured?.destinationMapId??null})) and (${captured?.destinationGeographyId??null}::text is null or world_map_connection_place_ordinary(${worldId},${captured?.destinationGeographyId??null})) ordinary`);
  return {placeName:prior?.source.placeName??place.name,destinationName:destination?.name??null,arrivalName:arrival?.name??null,baseline:prior?.source.baseline??(baseline?{id:baseline.id,revision:baseline.revision,sourceMapId:mapId,geographyId,destinationMapId:baseline.destinationMapId,destinationGeographyId:baseline.destinationGeographyId}:null),ordinary:(prior?.source.ordinary??true)&&checks.rows[0]?.ordinary===true};
}
export async function changeHistoricalConnection(userId:string,worldId:string,input:unknown){
  const c=historicalConnectionCommandSchema.parse(input);
  return worldWriteTransaction(userId,worldId,async tx=>{
    const timeline=await selectedTimeline(tx,worldId,c.timelineId);if(timeline.archivedAt)throw new WorldError("Restore this timeline before changing historical connections.",400);
    const [map]=await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.id,c.mapId),eq(worldAtlasMap.worldId,worldId)));if(!map||map.archivedAt||!["generic","settlement"].includes(map.mapKind))throw missing();
    const current=await rows(tx,worldId,c.mapId,c.timelineId,false),old=c.action==="create"?null:current.find(r=>r.h.connectionId===c.id)??null;
    if(c.action==="retain"){
      if(!timeline.parentId||old)throw new WorldError("Choose an unretained direct-parent source explicitly.",409);
      const source=(await rows(tx,worldId,c.mapId,timeline.parentId,false)).find(r=>r.h.connectionId===c.id&&r.v.id===c.sourceVersionId&&r.h.revision===c.sourceRevision&&!r.v.archived);if(!source)throw conflict();
      if(current.length>=128||current.some(r=>!r.v.archived&&r.v.geographyId===source.v.geographyId&&r.v.startYear<=source.v.endYear&&r.v.endYear>=source.v.startYear))throw new WorldError("This retained period overlaps an existing connection account or exceeds this map's account limit.",409);
      await tx.insert(heads).values({worldId,mapId:c.mapId,geographyId:source.v.geographyId,timelineId:c.timelineId,connectionId:c.id,versionId:source.v.id,revision:1,mode:"retained"});return {id:c.id};
    }
    if(c.action!=="create"&&(!old||old.h.revision!==c.revision))throw old?conflict():missing();
    if(c.action==="save"&&old!.v.archived)throw new WorldError("Restore the connection account before editing it.",400);
    let prior=old?.v,sourceVersionId=prior?(prior.timelineId===c.timelineId?prior.sourceVersionId:prior.id):null;
    if(c.action==="create"&&c.sourceVersionId){if(!await reachableSource(tx,worldId,c.mapId,c.timelineId,c.sourceVersionId))throw missing();const [source]=await tx.select().from(versions).where(eq(versions.id,c.sourceVersionId));if(!source||source.geographyId!==c.geographyId)throw missing();prior=source;sourceVersionId=source.id;}
    const connectionId=c.action==="create"?c.requestId:c.id,geographyId=c.action==="create"?c.geographyId:old!.v.geographyId,draft=c.action==="create"||c.action==="save"?c.draft:old!.v.draft;
    if(c.action==="create"){
      const [duplicate]=await tx.select().from(identities).where(eq(identities.id,connectionId));if(duplicate){const saved=current.find(r=>r.h.connectionId===connectionId);if(!saved||duplicate.worldId!==worldId||duplicate.mapId!==c.mapId||duplicate.geographyId!==geographyId||!isDeepStrictEqual(saved.v.draft,draft))throw new WorldError("This request identity is already used. Reload the acknowledged connection; do not create a duplicate.",409);return {id:connectionId};}
    }
    const source=c.action==="archive"||c.action==="restore"?old!.v.source:await sourceFor(tx,worldId,c.mapId,geographyId,draft,prior),archived=c.action==="archive";
    if(current.length>=128&&c.action==="create")throw new WorldError("This map supports 128 historical connection accounts per timeline.",400);
    if(!archived&&current.some(r=>r.h.connectionId!==connectionId&&r.v.geographyId===geographyId&&!r.v.archived&&r.v.startYear<=draft.endYear&&draft.startYear<=r.v.endYear))throw new WorldError("Connection periods for this place overlap. Choose a free inclusive period or edit the existing account.",409);
    if(c.action==="create")await tx.insert(identities).values({id:connectionId,worldId,mapId:c.mapId,geographyId,originTimelineId:c.timelineId});
    const versionId=randomUUID();await tx.insert(versions).values({id:versionId,connectionId,worldId,mapId:c.mapId,geographyId,timelineId:c.timelineId,sourceVersionId,previousVersionId:old?.v.id??null,destinationMapId:draft.destinationMapId,destinationGeographyId:draft.destinationGeographyId,baselineDestinationMapId:source.baseline?.destinationMapId??null,baselineArrivalId:source.baseline?.destinationGeographyId??null,startYear:draft.startYear,endYear:draft.endYear,draft,source,authorId:userId,archived});
    const next={versionId,revision:(old?.h.revision??0)+1,mode:old?.h.mode==="retained"||old?.h.mode==="interpretation"?"interpretation" as const:"authored" as const};
    if(old)await tx.update(heads).set(next).where(and(eq(heads.timelineId,c.timelineId),eq(heads.connectionId,connectionId)));else await tx.insert(heads).values({...next,worldId,mapId:c.mapId,geographyId,timelineId:c.timelineId,connectionId});
    return {id:connectionId};
  });
}

export async function coordinateHistoricalMap(userId:string,worldId:string,mapId:string,timelineId:string,year:number,state:MapStateBundle,options:{ordinary?:boolean;review?:boolean}):Promise<MapStateBundle>{
  yearSchema.parse(year);const history=await getHistoricalConnections(userId,worldId,mapId,timelineId,options),byPlace=resolveHistoricalConnections(history.records,year),map=state.bundle.maps.find(m=>m.id===mapId)!,policies:HistoricalConnectionPolicy[]=[],findings:CoordinationFinding[]=[];
  const raw=await db.transaction(tx=>rows(tx,worldId,mapId,timelineId,false),{isolationLevel:"repeatable read",accessMode:"read only"}),recorded=new Set(raw.filter(({v})=>!v.archived&&v.startYear<=year&&v.endYear>=year).map(({v})=>v.geographyId));
  const sourceLinks=state.bundle.connections?.filter(c=>c.sourceMapId===mapId)??[],safePlaces=new Set(state.bundle.geographies.map(g=>g.id)),safeMaps=new Map(state.bundle.maps.map(m=>[m.id,m]));
  const placeIds=new Set([...sourceLinks.map(c=>c.geographyId),...recorded]);
  for(const geographyId of placeIds){if(!safePlaces.has(geographyId)||!placeIsPresent(map.historicalPlaces,geographyId)||!placeIsPresent(map.historicalPlaces,map.geographyId))continue;
    const record=byPlace.get(geographyId),baseline=sourceLinks.find(c=>c.geographyId===geographyId);
    if(!record){const connection=recorded.has(geographyId)?null:baseline??null;policies.push({geographyId,status:connection?"reference":"unknown",basis:connection?"baseline-reference":"unknown",connection,message:connection?"Shared connection shown only as a reference; historical connection coverage is unknown.":"Historical connection coverage is unknown in this view."});continue;}
    const destination=record.draft.destinationMapId?safeMaps.get(record.draft.destinationMapId):null;
    const available=record.draft.status==="available"&&destination&&!destination.archived&&!destination.unavailable;
    const connection:AtlasConnection|null=available?{id:record.id,revision:record.revision,sourceMapId:mapId,geographyId,destinationMapId:destination.id,destinationGeographyId:record.draft.destinationGeographyId}:null;
    policies.push({geographyId,status:record.draft.status,basis:record.mode,connection,name:record.draft.name,versionId:record.versionId,message:`${record.draft.name}: ${record.draft.status}${record.draft.status==="available"&&!available?"; destination currently unavailable":""}.`});
    if(record.draft.status==="available"&&!available)findings.push({code:"unavailable-destination",geographyId,message:"This account selects a destination that is currently archived or unavailable. Its source remains retained."});
  }
  const effective=[...(state.bundle.connections??[]).filter(c=>c.sourceMapId!==mapId),...policies.flatMap(p=>p.connection?[p.connection]:[])];
  // Header and relevant place/political summaries only; never load every connected map's full history.
  const destinations=[...new Set(policies.flatMap(p=>p.connection?[p.connection.destinationMapId]:[]))];
  if(destinations.length>32)throw new WorldError("Historical coordination supports 32 distinct destinations from one opened map. Narrow its active connection choices.",409);
  type Summary={geographies:{id:string;name:string;description:string}[];historicalPlaces:{geographyId:string;condition:string}[];territories:{archived:boolean;geographyIds:string[];relationships:{entityId:string;role:string;roleLabel:string;startYear:number;endYear:number}[]}[]};
  const subjects=[...new Set(policies.flatMap(p=>[p.geographyId,p.connection?.destinationGeographyId,safeMaps.get(p.connection?.destinationMapId??"")?.geographyId].filter((id):id is string=>!!id)))];
  const summaries=destinations.length?await db.transaction(async tx=>{
    const rows=await tx.select({mapId:worldMapStateHead.mapId,payload:sql<Summary>`jsonb_build_object(
      'geographies',coalesce((select jsonb_agg(jsonb_build_object('id',g->>'id','name',g->>'name','description',g->>'description')) from jsonb_array_elements(${worldMapStateVersion.payload}->'geographies') g where g->>'id'=any(array[${sql.join(subjects.map(id=>sql`${id}`),sql`, `)}]::text[])),'[]'::jsonb),
      'historicalPlaces',coalesce((select jsonb_agg(jsonb_build_object('geographyId',g->>'geographyId','condition',g->>'condition')) from jsonb_array_elements(coalesce(${worldMapStateVersion.payload}->'historicalPlaces','[]'::jsonb)) g where g->>'geographyId'=any(array[${sql.join(subjects.map(id=>sql`${id}`),sql`, `)}]::text[])),'[]'::jsonb),
      'territories',coalesce((select jsonb_agg(jsonb_build_object('archived',t->'archived','geographyIds',t->'geographyIds','relationships',coalesce((select jsonb_agg(jsonb_build_object('entityId',r->>'entityId','role',r->>'role','roleLabel',r->>'roleLabel','startYear',r->'startYear','endYear',r->'endYear')) from jsonb_array_elements(t->'relationships') r where (r->>'startYear')::bigint<=${year} and (r->>'endYear')::bigint>=${year}),'[]'::jsonb))) from jsonb_array_elements(coalesce(${worldMapStateVersion.payload}->'territories','[]'::jsonb)) t where exists(select 1 from jsonb_array_elements_text(t->'geographyIds') g where g=any(array[${sql.join(subjects.map(id=>sql`${id}`),sql`, `)}]::text[]))),'[]'::jsonb))`}).from(worldMapStateHead).innerJoin(worldMapStateVersion,eq(worldMapStateVersion.id,worldMapStateHead.versionId)).where(and(eq(worldMapStateHead.worldId,worldId),eq(worldMapStateHead.timelineId,timelineId),inArray(worldMapStateHead.mapId,destinations),eq(worldMapStateVersion.archived,false),sql`${worldMapStateVersion.startYear}<=${year} AND ${worldMapStateVersion.endYear}>=${year}`,options.ordinary?sql`world_map_state_is_ordinary(${worldMapStateVersion.id},${worldId}) AND ${ordinaryTerritorySource(worldId,timelineId,sql`${worldMapStateVersion.id}`)}`:undefined));return new Map(rows.map(r=>[r.mapId,r]));
  },{isolationLevel:"repeatable read",accessMode:"read only"}):new Map<string,{mapId:string;payload:Summary}>();
  for(const p of policies){if(!p.connection)continue;const destinationMapId=p.connection.destinationMapId,summary=summaries.get(destinationMapId),subject=p.connection.destinationGeographyId??safeMaps.get(destinationMapId)?.geographyId;
    if(!summary){findings.push({code:"unknown-appearance",geographyId:p.geographyId,destinationMapId,message:"The destination has no readable appearance for this year. Opening it shows a shared baseline reference with unknown historical coverage."});if(state.parentTimelineName&&!options.ordinary)findings.push({code:"branch-coverage",geographyId:p.geographyId,destinationMapId,message:"This branch has not deliberately retained or authored destination coverage for this year."});continue;}
    if(subject&&summary.payload.historicalPlaces.some((g:{geographyId:string;condition:string})=>g.geographyId===subject&&!["present","abandoned","ruined","rebuilt"].includes(g.condition))){findings.push({code:"unavailable-arrival",geographyId:p.geographyId,destinationMapId,message:"The destination source does not establish this arrival place as present for the selected year. Both accounts remain independent."});p.connection=null;effective.splice(effective.findIndex(c=>c.sourceMapId===mapId&&c.geographyId===p.geographyId),1);}
    const local=state.bundle.geographies.find(g=>g.id===p.geographyId),other=summary.payload.geographies.find((g:{id:string})=>g.id===p.geographyId);
    if(local&&other&&(local.name!==other.name||local.description!==other.description))findings.push({code:"different-place",geographyId:p.geographyId,destinationMapId,message:"The two sources use different local names or descriptions for the same saved place. These may be intentional accounts; compare them before deciding."});
    const political=(territories:Summary["territories"])=>territories.filter(t=>!t.archived&&(t.geographyIds as string[]).includes(p.geographyId)).flatMap(t=>(t.relationships as {entityId:string;role:string;roleLabel:string;startYear:number;endYear:number}[]).filter(r=>r.startYear<=year&&r.endYear>=year).map(r=>`${r.entityId}:${r.role}:${r.roleLabel}`)).sort().join("|");
    const sourcePolitics=political(map.territories??[]),targetPolitics=political(summary.payload.territories);if(sourcePolitics&&targetPolitics&&sourcePolitics!==targetPolitics)findings.push({code:"different-politics",geographyId:p.geographyId,destinationMapId,message:"The connected sources record different political relationships for the same place and year. No claim or control has been reconciled automatically."});
  }
  return {...state,bundle:{...state.bundle,connections:effective,historicalConnectionPolicies:policies},coordinationFindings:findings};
}
