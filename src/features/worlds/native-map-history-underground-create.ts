import "server-only";
import {randomUUID} from "node:crypto";
import {and,eq,sql} from "drizzle-orm";
import {worldUndergroundSite as sites,worldUndergroundLevel as levels,worldUndergroundOperation as operations,worldUndergroundVersion as versions} from "@/db/world-underground-schema";
import {worldGeography} from "@/db/world-atlas-schema";
import {UNDERGROUND_LIMITS,undergroundCommandSchema,validateUnderground,type UndergroundBundle,type UndergroundSite} from "./underground";
import {nativeResource,nativeRelatedContext,nativeContentContext,type NativeContentContext} from "./native-map-history-context";
import {nativeContentHash,type NativeHistoryTx} from "./native-map-history-store";
import {createNativeMapAppearance,emptyNativeComposition} from "./native-map-history-create";
import {nativeEntranceTarget,resolveNativeEndpoint} from "./native-map-history-connections";
import {saveNativeConnection} from "./native-map-history-connection-write";
import {boundedRegionalLayer} from "./terrain-regional-authoring-service";
import type {NativeWriteResult} from "./native-map-history-write";
import {WorldError} from "./world-service";

/** Metadata navigation includes canonical identities, never a sibling's drawing. */
export async function nativeUndergroundInventory(tx:NativeHistoryTx,c:NativeContentContext){
  const allSites=await tx.select({id:sites.id,worldId:sites.worldId,name:sites.name,placeId:sites.placeId,frame:sites.frame,revision:sites.revision,archived:sites.archived}).from(sites).where(eq(sites.worldId,c.worldId)).limit(UNDERGROUND_LIMITS.sites+1);
  if(allSites.length>UNDERGROUND_LIMITS.sites)throw new WorldError("This World exceeds its retained underground site bound.",413);
  const rows=(await tx.execute<{id:string;worldId:string;siteId:string;name:string;order:number;depth:string;revision:number;archived:boolean;historicalCoverage:"established"|"unknown"}>(sql`
    select l.id,l.world_id "worldId",l.site_id "siteId",coalesce(d.name,l.name) name,coalesce(d.level_order,l.level_order) "order",coalesce(d.depth,l.depth) depth,coalesce(d.revision,l.revision) revision,coalesce(d.archived,false) archived,case when d.name is null then 'unknown' else 'established' end "historicalCoverage"
    from world_underground_level l left join lateral (
      select r.payload#>>'{bundle,document,name}' name,(r.payload#>>'{bundle,document,order}')::int level_order,r.payload#>>'{bundle,document,depth}' depth,(r.payload#>>'{bundle,document,revision}')::int revision,(r.payload#>>'{bundle,document,archived}')::boolean archived
      from world_map_state_head h join world_map_state_version v on v.id=h.version_id and v.world_id=h.world_id
      join world_map_state_component_ref p on p.version_id=v.id and p.world_id=h.world_id and p.key='underground'
      join world_map_state_component r on r.id=p.component_id and r.world_id=h.world_id
      where h.world_id=l.world_id and h.timeline_id=${c.scope.timelineId} and v.payload->'nativeAtlas'->'target'->>'id'=l.id and v.payload->'nativeAtlas'->'target'->>'kind'='underground' and not v.archived and v.start_year<=${c.scope.year} and v.end_year>=${c.scope.year}
    ) d on true where l.world_id=${c.worldId} order by l.site_id,l.level_order,l.id limit 16385`)).rows;
  if(rows.length>UNDERGROUND_LIMITS.sites*UNDERGROUND_LIMITS.levels)throw new WorldError("This World exceeds its retained underground level bound.",413);
  return {sites:allSites,levels:rows};
}

export async function createNativeUnderground(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown):Promise<NativeWriteResult>{
  const command=undergroundCommandSchema.parse(raw);if(command.action!=="create-site"&&command.action!=="create-level")throw new WorldError("Choose a new dated underground site or level.",400);
  let site:UndergroundSite,sourceDependencies:Parameters<typeof createNativeMapAppearance>[6]=[];
  const captures:{kind:"site"|"level";recordId:string;revision:number;snapshot:Record<string,unknown>}[]=[];
  const capture=(kind:"site"|"level",row:{id:string;revision:number})=>captures.push({kind,recordId:row.id,revision:row.revision,snapshot:Object.fromEntries(Object.entries(row).filter(([key])=>!["createdAt","updatedAt","nativeOriginVersionId"].includes(key)))});
  if(command.action==="create-site"){
    const count=(await tx.execute<{n:number}>(sql`select count(*)::int n from world_underground_site where world_id=${c.worldId}`)).rows[0].n;
    if(count>=UNDERGROUND_LIMITS.sites)throw new WorldError("This World supports 256 retained underground site identities.",413);
    if(command.placeId&&command.newPlace)throw new WorldError("Choose an existing Place or explicitly create one.",400);
    for(const id of [command.placeId,command.newPlace?.parentId].filter((id):id is string=>!!id)){
      const [place]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,id),eq(worldGeography.worldId,c.worldId)));
      if(!place||place.archivedAt)throw new WorldError("Choose an active permanent Place in this same World.",404);
    }
    let placeId=command.placeId;
    if(command.newPlace){placeId=randomUUID();await tx.insert(worldGeography).values({id:placeId,worldId:c.worldId,parentId:command.newPlace.parentId,name:command.newPlace.name,kind:"location",context:"dungeon"});}
    if(command.entrance){
      const source=await resolveNativeEndpoint(tx,c,command.entrance);
      if(nativeContentHash(nativeEntranceTarget(command.entrance.map))!==nativeContentHash(c.scope.target)||source.revision!==command.entranceRevision||source.locked||command.entrance.anchor!=="position"&&Math.hypot(source.point.x-command.entrance.point.x,source.point.y-command.entrance.point.y)>.001)throw new WorldError("The dated source entrance changed. Review the original saved entrance before creating this site.",409);
    }else if(command.entranceRevision!==null)throw new WorldError("Keep the source entrance and revision together.",400);
    boundedRegionalLayer(()=>validateUnderground(command.design,command.frame));
    const [row]=await tx.insert(sites).values({id:command.requestId,worldId:c.worldId,name:command.name,placeId,frame:command.frame,revision:1}).returning();capture("site",row);site=row;
  }else{
    if(c.scope.target.kind!=="underground")throw new WorldError("Open a dated level in this site before adding another independent level.",409);
    const bundle=((await nativeResource(tx,c,"underground")).payload as unknown as {bundle:UndergroundBundle}).bundle;
    site=bundle.sites.find(site=>site.id===command.siteId)!;if(!site||bundle.document?.siteId!==site.id||site.archived)throw new WorldError("Open an active dated level of the intended site.",409);
    const count=(await tx.execute<{n:number}>(sql`select count(*)::int n from world_underground_level where world_id=${c.worldId} and site_id=${site.id}`)).rows[0].n;
    if(count>=UNDERGROUND_LIMITS.levels)throw new WorldError("This site supports 64 retained level identities.",413);
    boundedRegionalLayer(()=>validateUnderground(command.design,site.frame));
    if(command.copyLevelId){const source=await nativeRelatedContext(tx,c,{kind:"underground",id:command.copyLevelId}),copy=((await nativeResource(tx,source,"underground")).payload as unknown as {bundle:UndergroundBundle}).bundle.document!;if(copy.siteId!==site.id||copy.revision!==command.copyRevision||copy.archived)throw new WorldError("Choose an active exact dated copy source in this same site.",409);sourceDependencies=[{target:source.scope.target,versionId:source.version.id}];}
    else if(command.copyRevision!==null)throw new WorldError("Keep the exact copy source and revision together.",400);
  }
  if(site.placeId){const [place]=await tx.select({archived:worldGeography.archivedAt}).from(worldGeography).where(and(eq(worldGeography.id,site.placeId),eq(worldGeography.worldId,c.worldId)));if(!place||place.archived)throw new WorldError("Restore the associated Place before adding a level.",409);}
  const ids=command.design.features.map(feature=>feature.id);
  if(ids.length&&(await tx.execute(sql`select 1 from world_underground_level l cross join lateral jsonb_array_elements(l.design->'features') f where l.world_id=${c.worldId} and f->>'id' in(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)) limit 1`)).rows.length)throw new WorldError("New levels require independent drawing identities. Use Duplicate Level for a copy.",400);
  const id=command.action==="create-site"?randomUUID():command.requestId,[row]=await tx.insert(levels).values({id,worldId:c.worldId,siteId:site.id,name:command.name,order:command.order,depth:command.depth,design:command.design,revision:1,nativeOriginVersionId:c.version.id}).returning();capture("level",row);
  const result={siteId:site.id,levelId:id,connectionId:null as string|null,revision:1};
  await tx.insert(operations).values({requestId:command.requestId,worldId:c.worldId,authorId:c.userId,inputHash:nativeContentHash({scope:c.scope,command}),result});
  for(const change of captures)await tx.insert(versions).values({id:randomUUID(),worldId:c.worldId,requestId:command.requestId,...change});
  const summary={id,worldId:c.worldId,siteId:site.id,name:row.name,order:row.order,depth:row.depth,revision:1,archived:false};
  const bundle:UndergroundBundle={available:true,canEdit:true,canRecover:true,ordinary:false,reason:"Each level resolves its own dated coverage.",sites:[site],levels:[summary],document:{...summary,design:row.design,history:[{revision:1,requestId:command.requestId}]},connections:[]};
  const childHistorical=await createNativeMapAppearance(tx,c,{kind:"underground",id},row.name,[{key:"underground",kind:"underground",payload:{bundle}},{key:"composition",kind:"composition",payload:emptyNativeComposition()},{key:"conditions",kind:"conditions",payload:{revision:0,values:[]}}],command.templateImages,sourceDependencies);
  if(command.action==="create-site"&&command.entrance){
    const arrival=row.design.features.find(feature=>feature.kind==="transition"&&feature.variant==="object"&&!feature.archived);
    if(!arrival||arrival.variant!=="object")throw new WorldError("Keep a deliberate arrival entrance on the new dated level.",400);
    // The outer World transaction commits this shared account on both heads.
    // Returning the parent's update leaves the existing drawing byte-exact.
    const linked=await saveNativeConnection(tx,c,{action:"connect",requestId:randomUUID(),name:command.name+" entrance",source:command.entrance,sourceRevision:command.entranceRevision,destination:{map:{kind:"underground",levelId:id},entranceId:arrival.id,point:arrival.point},destinationRevision:1,twoWay:true});
    const childAccount=await nativeContentContext(tx,c.userId,c.worldId,{timelineId:c.scope.timelineId,year:c.scope.year,target:{kind:"underground",id},stateId:childHistorical.stateId,edit:true},{ownerId:c.userId,archived:false,review:false,ordinary:false});
    return {...linked,result:{...result,connectionId:linked.result.connectionId,childHistorical:{...childHistorical,versionId:childAccount.version.id}}};
  }
  return {updates:[],unchangedParent:true,result:{...result,childHistorical}};
}
