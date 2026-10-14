import "server-only";
import { createHash,randomUUID } from "node:crypto";
import { and,asc,desc,eq,sql } from "drizzle-orm";
import { db } from "@/db";
import { worldAtlasMap,worldGeography } from "@/db/world-atlas-schema";
import { worldGeoDataset as dataset,worldGeoFeature as feature,worldGeoHead as head,worldGeoPart as part,worldGeoSurface as surface,worldGeoVersion as version,worldGeoView as view } from "@/db/world-geographic-schema";
import { selectedTimeline } from "./history-version-service";
import { geographicPrivateMaps,geographicPrivatePlaces } from "./geographic-privacy";
import { geographicCommandSchema,geographicDisplaySchema,geographicSemanticSchema,geographicThemeSchema,geoId,geometryParts,sourceImportSchema,splitExtent,surfaceBounds,validateReference,validateViewport,type GeographicBounds,type GeographicCatalog,type GeographicLayer,type GeographicProvenance,type GeographicReading,type GeographicViewport,type SourceGeometry,type SpatialReference,type Surface } from "./geographic";
import { geometryBounds,partBounds,simplifySource,validateSourceGeometry } from "./geographic-geometry";
import { projectedSourceLabel,type ProjectionKind } from "./geographic-projection";
import { boundedSourceDisplay } from "./geographic-display";
import { sourceBoundaryParts } from "./geographic-boundaries";
import { WorldError,worldReadAccess,worldWriteTransaction } from "./world-service";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Options={review?:boolean;ordinary?:boolean};
const unavailable=()=>new WorldError("This geographic source is unavailable in this viewing context.",404);
const conflict=()=>new WorldError("A newer geographic source was saved. Your draft is retained. Read the latest source before choosing a revision.",409);
export function canonicalSource(value:unknown):string {if(Array.isArray(value))return `[${value.map(canonicalSource).join(',')}]`;if(value&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonicalSource(v)}`).join(',')}}`;return JSON.stringify(value);}
const digest=(value:unknown)=>createHash("sha256").update(canonicalSource(value)).digest("hex");
function sourceFileIdentity(provenance:GeographicProvenance){return canonicalSource(Object.fromEntries(Object.entries(provenance).filter(([key])=>key!=="parameters"&&key!=="display")));}
const dto=(row:typeof surface.$inferSelect):Surface=>({id:row.id,name:row.name,reference:row.reference,realmId:row.realmId,protected:row.protected});
function checked<T>(run:()=>T){try{return run();}catch(error){if(error instanceof WorldError)throw error;throw new WorldError((error as Error).message,400);}}
export async function layerAccess(tx:Tx,worldId:string,mapId:string,timelineId:string,options:Options,userId:string):Promise<GeographicLayer>{
  const [row]=await tx.select({map:worldAtlasMap,surface}).from(view).innerJoin(surface,and(eq(surface.id,view.surfaceId),eq(surface.worldId,view.worldId))).innerJoin(worldAtlasMap,and(eq(worldAtlasMap.id,view.mapId),eq(worldAtlasMap.worldId,view.worldId))).where(and(eq(view.mapId,mapId),eq(view.worldId,worldId)));if(!row||row.map.archivedAt||options.ordinary&&(row.surface.protected||row.surface.realmId))throw unavailable();
  if(options.ordinary&&row.map.geographyId){const hidden=(await tx.execute(sql`select id from (${geographicPrivatePlaces(worldId)}) private_place(id) where id=${row.map.geographyId}`)).rows;if(hidden.length)throw unavailable();}
  if(row.surface.realmId){const {getPeople}=await import("./peoples-service");if((await getPeople(userId,worldId,timelineId,row.surface.realmId,!!options.review,false)).family!=="realm")throw unavailable();}
  return {mapId:row.map.id,mapName:row.map.name,surface:dto(row.surface)};
}
export async function geographicCatalog(userId:string,worldId:string,timelineId:string,options:Options={},offset=0):Promise<GeographicCatalog>{
  const parent=await worldReadAccess(userId,worldId,!!options.review);if(!Number.isInteger(offset)||offset<0||offset>10000)throw new WorldError("Choose a valid source page.",400);
  return db.transaction(async tx=>{await selectedTimeline(tx,worldId,timelineId);
    const rows=await tx.select({map:worldAtlasMap,surface}).from(view).innerJoin(worldAtlasMap,and(eq(view.mapId,worldAtlasMap.id),eq(view.worldId,worldAtlasMap.worldId))).innerJoin(surface,and(eq(surface.id,view.surfaceId),eq(surface.worldId,view.worldId))).where(and(eq(view.worldId,worldId),sql`${worldAtlasMap.archivedAt} is null`,options.ordinary?sql`not ${surface.protected} and ${surface.realmId} is null and (${worldAtlasMap.geographyId} is null or ${worldAtlasMap.geographyId} not in (${geographicPrivatePlaces(worldId)})) and ${view.mapId} not in (${geographicPrivateMaps(worldId)})`:undefined)).orderBy(asc(view.mapId)).limit(21).offset(offset);
    const surfaces=await tx.select().from(surface).where(and(eq(surface.worldId,worldId),options.ordinary?sql`not ${surface.protected} and ${surface.realmId} is null`:undefined)).orderBy(asc(surface.createdAt),asc(surface.id)).limit(100);
    const maps=await tx.select({id:worldAtlasMap.id,name:worldAtlasMap.name}).from(worldAtlasMap).where(and(eq(worldAtlasMap.worldId,worldId),eq(worldAtlasMap.mapKind,"generic"),sql`${worldAtlasMap.archivedAt} is null`,options.ordinary?sql`false`:undefined)).orderBy(desc(worldAtlasMap.createdAt)).limit(100);
    const {listPeoples}=await import("./peoples-service"),realms=options.ordinary?[]:(await listPeoples(userId,worldId,timelineId,!!options.review,false,"",0,"realm")).records.filter(r=>!r.archived).map(r=>({id:r.id,name:r.name}));
    const allowedSurfaces:typeof surfaces=[];for(const s of surfaces){if(s.realmId){try{const {getPeople}=await import("./peoples-service");if((await getPeople(userId,worldId,timelineId,s.realmId,!!options.review,false)).family!=="realm")continue;}catch(error){if(error instanceof WorldError&&error.status===404)continue;throw error;}}allowedSurfaces.push(s);}
    const layers:GeographicLayer[]=[];for(const row of rows.slice(0,20)){try{layers.push(await layerAccess(tx,worldId,row.map.id,timelineId,options,userId));}catch(error){if(!(error instanceof WorldError&&error.status===404))throw error;}}
    return {canEdit:parent.ownerId===userId&&!parent.archivedAt&&!options.review&&!options.ordinary,layers,surfaces:allowedSurfaces.map(dto),maps,realms,nextOffset:rows.length>20?offset+20:null};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
export async function geographicViewport(userId:string,worldId:string,timelineId:string,mapId:string,bounds?:GeographicBounds,projection?:ProjectionKind,lod:"overview"|"regional"|"detail"="overview",options:Options={},cursor="",semantics?:string[],themes?:string[]):Promise<GeographicViewport>{
  geoId.parse(mapId);const parent=await worldReadAccess(userId,worldId,!!options.review);
  return db.transaction(async tx=>{await selectedTimeline(tx,worldId,timelineId);const layer=await layerAccess(tx,worldId,mapId,timelineId,options,userId),extent=bounds??surfaceBounds(layer.surface.reference),kind=projection??(layer.surface.reference.kind==="plane"?"planar":"equirectangular");checked(()=>validateViewport(extent,layer.surface.reference));
    if(!["overview","regional","detail"].includes(lod))throw new WorldError("Choose a supported detail level.",400);
    const kinds=semantics===undefined?undefined:checked(()=>semantics.map(kind=>geographicSemanticSchema.parse(kind)));
    const selectedThemes=themes===undefined?undefined:checked(()=>themes.map(theme=>geographicThemeSchema.parse(theme))),themeSql=sql`coalesce(gd.provenance->'display'->>'theme',case gf.semantic when 'administrative-boundary' then 'administrative' when 'physical-geography' then 'land' else 'authored' end)`;
    let after=sql`true`;if(cursor){const match=/^([a-f0-9-]{36}):(\d{1,4})$/.exec(cursor);if(!match||!geoId.safeParse(match[1]).success)throw new WorldError("Choose a valid spatial page.",400);after=sql`(gf.id,gp.part)>(${match[1]},${Number(match[2])})`;}
    // A full validated domain already contains every part on this surface.
    // Avoid repeating an unselective global GiST bitmap for each feature;
    // bounded regional extents retain the spatial index predicate.
    const domain=surfaceBounds(layer.surface.reference),whole=extent.every((n,i)=>n===domain[i]);
    const overlaps=whole?sql`true`:sql.join(splitExtent(extent).map(b=>sql`box(point(gp.west,gp.south),point(gp.east,gp.north)) && box(point(${b[0]},${b[1]}),point(${b[2]},${b[3]}))`),sql` or `);
    // Select one matching bounding part; antimeridian parts may have two boxes.
    const band=sql`(not (gd.provenance ? 'display') or (gd.provenance->'display'->'lods') ? ${lod})`;
    // Representations share a place deliberately; a readable finer source wins
    // only in its declared band. Exact readers retain every original/head.
    const rows=(await tx.execute<{context:string;id:string;version_id:string;geography_id:string;name:string;semantic:string;revision:number;part:number;style:string|null;theme:string;labels:boolean;label_rank:number;credit:{label:string;license:string;url:string};geometry:SourceGeometry;west:number;south:number;east:number;north:number}>(sql`with eligible as materialized (
      select gf.id,gf.world_id,gf.geography_id,g.name,gf.semantic,gv.id version_id,gh.revision,gd.provenance->'display'->>'style' style,${themeSql} theme,coalesce((gd.provenance->'display'->>'labels')::boolean,false) labels,coalesce((gd.provenance->'display'->>'labelRank')::int,100) label_rank,coalesce((gd.provenance->'display'->>'priority')::int,0) priority,jsonb_build_object('label',gd.provenance->>'attribution','license',gd.provenance->>'license','url',gd.provenance->>'licenseUrl') credit
      from world_geo_feature gf join world_geo_head gh on gh.feature_id=gf.id and gh.world_id=gf.world_id join world_geo_version gv on gv.id=gh.version_id join world_geo_dataset gd on gd.id=gv.dataset_id and gd.world_id=gv.world_id join world_geography g on g.id=gf.geography_id and g.world_id=gf.world_id
      where gf.world_id=${worldId} and gf.surface_id=${layer.surface.id} and not gv.archived and g.archived_at is null and ${band}
      ${kinds===undefined?sql``:kinds.length?sql`and gf.semantic in (${sql.join(kinds.map(kind=>sql`${kind}`),sql`,`)})`:sql`and false`}
      ${selectedThemes===undefined?sql``:selectedThemes.length?sql`and ${themeSql} in (${sql.join(selectedThemes.map(theme=>sql`${theme}`),sql`,`)})`:sql`and false`}
      ${options.ordinary?sql`and not gv.protected and g.id not in (${geographicPrivatePlaces(worldId)})`:sql``}
    ), preferred as (select *,dense_rank() over(partition by geography_id,semantic order by priority desc) preference from eligible), stamp as materialized (
      select md5(coalesce(string_agg(id::text||version_id::text||name,'|' order by id),'empty')) context from eligible
    )
    select distinct on(gf.id,gp.part) stamp.context,gf.id,gf.version_id,gf.geography_id,gf.name,gf.semantic,gf.revision,gp.part,gf.style,gf.theme,gf.labels,gf.label_rank,gp.${sql.raw(lod)} geometry,gf.credit,gp.west,gp.south,gp.east,gp.north
    from world_geo_part gp join preferred gf on gf.version_id=gp.version_id and gf.world_id=gp.world_id cross join stamp
    where gp.world_id=${worldId} and gp.algorithm_version in (1,2,3) and gf.preference=1 and (${overlaps}) and ${after}
    order by gf.id,gp.part,gp.algorithm_version desc,gp.box limit 65`)).rows;
    const shapes:GeographicViewport["shapes"]=[];const credits=new Map<string,GeographicViewport["attributions"][number]>();let bytes=0,last="",more=rows.length>64;
    for(const row of rows.slice(0,64)){const display=checked(()=>boundedSourceDisplay(row.geometry,layer.surface.reference,extent,kind,row.style==="city"?2.4:row.style==="peak"?3:4)),path=display.path;if(bytes+path.length>500_000&&shapes.length){more=true;break;}bytes+=path.length;credits.set(JSON.stringify(row.credit),row.credit);last=`${row.id}:${row.part}`;const style=geographicDisplaySchema.shape.style.safeParse(row.style),theme=geographicThemeSchema.parse(row.theme),label=row.labels?projectedSourceLabel(row.geometry,layer.surface.reference,extent,kind):undefined;shapes.push({id:row.id,versionId:row.version_id,geographyId:row.geography_id,name:row.name,semantic:row.semantic,revision:row.revision,part:row.part,geometryType:row.geometry.type,path,displayTolerance:display.tolerance,theme,...label?{label:{...label,rank:row.label_rank}}:{},sourceBounds:[row.west,row.south,row.east,row.north],...style.success?{style:style.data}:{}});}
    return {layer,canEdit:parent.ownerId===userId&&!parent.archivedAt&&!options.ordinary&&!options.review,context:rows[0]?.context??"empty",bounds:extent,projection:kind,lod,shapes,attributions:[...credits.values()],nextCursor:more?last:null};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
export async function geographicReading(userId:string,worldId:string,timelineId:string,mapId:string,featureId:string,versionId?:string,options:Options={}):Promise<GeographicReading>{
  const parent=await worldReadAccess(userId,worldId,!!options.review);
  return db.transaction(async tx=>{await selectedTimeline(tx,worldId,timelineId);const layer=await layerAccess(tx,worldId,mapId,timelineId,options,userId);
    const [current]=await tx.select({f:feature,h:head,v:version,g:worldGeography}).from(feature).innerJoin(head,and(eq(head.featureId,feature.id),eq(head.worldId,feature.worldId))).innerJoin(version,eq(version.id,head.versionId)).innerJoin(worldGeography,and(eq(worldGeography.id,feature.geographyId),eq(worldGeography.worldId,feature.worldId))).where(and(eq(feature.id,featureId),eq(feature.worldId,worldId),eq(feature.surfaceId,layer.surface.id)));
    if(!current||options.ordinary&&(current.v.protected||current.v.archived||current.g.archivedAt))throw unavailable();
    if(options.ordinary&&(await tx.execute(sql`select id from (${geographicPrivatePlaces(worldId)}) private_place(id) where id=${current.g.id}`)).rows.length)throw unavailable();
    const [chosen]=versionId?await tx.select().from(version).where(and(eq(version.id,versionId),eq(version.featureId,featureId),eq(version.worldId,worldId))):[current.v];if(!chosen||options.ordinary&&(chosen.protected||chosen.archived))throw unavailable();
    const [source]=await tx.select().from(dataset).where(and(eq(dataset.id,chosen.datasetId),eq(dataset.worldId,worldId)));
    const versions=await tx.select({id:version.id,revision:version.revision,createdAt:version.createdAt,archived:version.archived}).from(version).where(and(eq(version.featureId,featureId),eq(version.worldId,worldId),options.ordinary?sql`not ${version.protected} and not ${version.archived}`:undefined)).orderBy(desc(version.revision)).limit(100);
    const original=await tx.select({id:version.id,revision:version.revision,createdAt:version.createdAt,archived:version.archived}).from(version).where(and(eq(version.featureId,featureId),eq(version.worldId,worldId),eq(version.revision,1),options.ordinary?sql`not ${version.protected} and not ${version.archived}`:undefined));for(const v of original)if(!versions.some(r=>r.id===v.id))versions.push(v);if(!versions.some(v=>v.id===chosen.id))versions.push({id:chosen.id,revision:chosen.revision,createdAt:chosen.createdAt,archived:chosen.archived});
    return {id:featureId,geographyId:current.g.id,name:current.g.name,semantic:current.f.semantic,revision:chosen.revision,versionId:chosen.id,geometry:chosen.geometry,bounds:geometryBounds(chosen.geometry,layer.surface.reference),protected:chosen.protected,archived:chosen.archived,note:chosen.note,createdAt:chosen.createdAt.toISOString(),source:options.ordinary?null:source.provenance,importedAt:options.ordinary?"":source.importedAt.toISOString(),contentSha256:options.ordinary?"":source.contentSha256,properties:options.ordinary?{}:chosen.properties,versions:versions.map(v=>({...v,createdAt:v.createdAt.toISOString()})),canEdit:parent.ownerId===userId&&!parent.archivedAt&&!options.ordinary&&!options.review&&chosen.id===current.v.id};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
async function saveParts(tx:Tx,row:typeof version.$inferInsert,reference:SpatialReference,display?:GeographicProvenance["display"]){const originals=geometryParts(row.geometry),outlines=display?.style==="outline"||display?.style==="disputed"?sourceBoundaryParts(row.geometry,reference):originals,rows:(typeof part.$inferInsert)[]=[];for(const [partIndex,source] of originals.entries()){const geometry=outlines[partIndex],overview=display?.exact?geometry:simplifySource(geometry,reference,"overview"),regional=display?.exact?geometry:simplifySource(geometry,reference,"regional");for(const [boxIndex,b] of partBounds(source,reference).entries())rows.push({versionId:row.id,worldId:row.worldId,featureId:row.featureId,algorithmVersion:3,part:partIndex,box:boxIndex,west:b[0],south:b[1],east:b[2],north:b[3],overview,regional,detail:geometry});}
  // Keep query parameters and serialized work bounded, including archipelagos.
  for(let i=0;i<rows.length;i+=32)await tx.insert(part).values(rows.slice(i,i+32));
}
/** Explicit owner maintenance of derived display rows; authoritative rows stay intact. */
export async function rebuildGeographicDisplays(userId:string,worldId:string,mapId:string){return worldWriteTransaction(userId,worldId,async tx=>{
  const [frame]=await tx.select({surface}).from(view).innerJoin(surface,and(eq(surface.id,view.surfaceId),eq(surface.worldId,view.worldId))).where(and(eq(view.mapId,mapId),eq(view.worldId,worldId)));if(!frame)throw unavailable();
  const rows=await tx.select({v:version,d:dataset}).from(feature).innerJoin(head,and(eq(head.featureId,feature.id),eq(head.worldId,feature.worldId))).innerJoin(version,eq(version.id,head.versionId)).innerJoin(dataset,eq(dataset.id,version.datasetId)).where(and(eq(feature.worldId,worldId),eq(feature.surfaceId,frame.surface.id),sql`${dataset.provenance} ? 'display'`));
  let rebuilt=0;for(const row of rows){if((await tx.select({id:part.versionId}).from(part).where(and(eq(part.versionId,row.v.id),eq(part.algorithmVersion,3))).limit(1)).length)continue;await saveParts(tx,row.v,frame.surface.reference,row.d.provenance.display);rebuilt++;}return {rebuilt};
});}
export async function changeGeography(userId:string,worldId:string,input:unknown,options:Options={}){
  if(options.review||options.ordinary)throw new WorldError("This preview is read-only.",403);
  const body=geographicCommandSchema.parse(input);
  return worldWriteTransaction(userId,worldId,async tx=>{
    if(body.action==="surface"){
      checked(()=>validateReference(body.reference));await selectedTimeline(tx,worldId,body.timelineId);
      if(body.realmId){const {getPeople}=await import("./peoples-service");const realm=await getPeople(userId,worldId,body.timelineId,body.realmId);if(realm.family!=="realm"||realm.archived)throw unavailable();}
      const [retained]=await tx.select().from(surface).where(and(eq(surface.worldId,worldId),eq(surface.requestId,body.requestId)));if(retained){if(retained.name!==body.name||retained.realmId!==body.realmId||retained.protected!==body.protected||canonicalSource(retained.reference)!==canonicalSource(body.reference))throw conflict();return {id:retained.id,reused:true};}
      const id=randomUUID();await tx.insert(surface).values({id,worldId,creatorId:userId,requestId:body.requestId,name:body.name,reference:body.reference,realmId:body.realmId,protected:body.protected});return {id,reused:false};
    }
    if(body.action==="import"){
      await selectedTimeline(tx,worldId,body.timelineId);const [frame]=await tx.select().from(surface).where(and(eq(surface.id,body.surfaceId),eq(surface.worldId,worldId)));if(!frame)throw unavailable();
      if(frame.realmId){const {getPeople}=await import("./peoples-service");if((await getPeople(userId,worldId,body.timelineId,frame.realmId)).family!=="realm")throw unavailable();}
      const [map]=await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.id,body.mapId),eq(worldAtlasMap.worldId,worldId)));if(!map||map.archivedAt||map.mapKind!=="generic")throw new WorldError("Choose an active generic Atlas map from this World. Its existing artwork is retained.",400);
      const [existingView]=await tx.select().from(view).where(eq(view.mapId,map.id));if(existingView&&existingView.surfaceId!==frame.id)throw new WorldError("This map already presents a different surface. Choose another saved map.",409);
      const source=sourceImportSchema.parse(body.source);if(source.provenance.originalCrs!==frame.reference.crs)throw new WorldError("The source reference must match this surface. Reprojection must be explicit before importing.",400);
      if(new Set(source.records.map(r=>r.externalId)).size!==source.records.length)throw new WorldError("Source identifiers must be unique within an import.",400);
      const existingPlaceIds=source.records.flatMap(r=>r.geographyId?[r.geographyId]:[]);if(new Set(existingPlaceIds).size!==existingPlaceIds.length)throw new WorldError("Use one source record per selected place in this import.",400);
      for(const record of source.records){if(record.parentId){const [parent]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,record.parentId),eq(worldGeography.worldId,worldId)));if(!parent||parent.archivedAt)throw unavailable();}}
      for(const record of source.records)checked(()=>validateSourceGeometry(record.geometry,frame.reference,source.provenance.validation));
      const contentSha256=digest(source),namespace=digest({provider:source.provenance.provider,dataset:source.provenance.dataset});let [imported]=await tx.select().from(dataset).where(and(eq(dataset.worldId,worldId),eq(dataset.surfaceId,frame.id),eq(dataset.contentSha256,contentSha256)));
      if(!imported){[imported]=await tx.insert(dataset).values({id:randomUUID(),worldId,surfaceId:frame.id,importerId:userId,namespace,contentSha256,provenance:source.provenance}).returning();}
      const identities:string[]=[];let created=0;
      for(const record of source.records){
        const [retained]=await tx.select().from(feature).where(and(eq(feature.worldId,worldId),eq(feature.surfaceId,frame.id),eq(feature.namespace,namespace),eq(feature.externalId,record.externalId)));
        if(retained){const [origin]=await tx.select().from(version).where(and(eq(version.featureId,retained.id),eq(version.revision,1))),[originalImport]=await tx.select().from(dataset).where(eq(dataset.id,origin.datasetId));if(sourceFileIdentity(originalImport.provenance)!==sourceFileIdentity(source.provenance)||canonicalSource(origin.geometry)!==canonicalSource(record.geometry)||canonicalSource(origin.properties)!==canonicalSource(record.properties)||retained.semantic!==record.semantic||origin.protected!==record.protected||record.geographyId&&record.geographyId!==retained.geographyId)throw new WorldError("This source identity already has another import. Create a deliberate source revision; no existing head was replaced.",409);identities.push(retained.id);continue;}
        const geographyId=record.geographyId??randomUUID();if(record.geographyId){const [place]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,geographyId),eq(worldGeography.worldId,worldId)));if(!place||place.archivedAt)throw unavailable();}else{if(record.parentId){const [parent]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,record.parentId),eq(worldGeography.worldId,worldId)));if(!parent||parent.archivedAt)throw unavailable();}await tx.insert(worldGeography).values({id:geographyId,worldId,parentId:record.parentId??null,name:record.name,description:`${record.semantic} source from ${source.provenance.provider}. Geographic representation; historical accounts are separate.`,kind:"location",context:record.context??"region"});}
        const id=randomUUID(),versionId=randomUUID();await tx.insert(feature).values({id,worldId,surfaceId:frame.id,geographyId,namespace,externalId:record.externalId,semantic:record.semantic});
        const row={id:versionId,worldId,surfaceId:frame.id,featureId:id,authorId:userId,datasetId:imported.id,previousId:null,requestId:randomUUID(),revision:1,geometry:record.geometry,properties:record.properties,note:"Original imported source; display transformations are separate.",protected:record.protected,archived:false};await tx.insert(version).values(row);await saveParts(tx,row,frame.reference,source.provenance.display);await tx.insert(head).values({worldId,featureId:id,versionId,revision:1});identities.push(id);created++;
      }
      if(!existingView)await tx.insert(view).values({worldId,mapId:map.id,surfaceId:frame.id});return {id:imported.id,identities,created,reused:created===0};
    }
    const [record]=await tx.select({f:feature,h:head,v:version,s:surface}).from(feature).innerJoin(head,and(eq(head.featureId,feature.id),eq(head.worldId,feature.worldId))).innerJoin(version,eq(version.id,head.versionId)).innerJoin(surface,and(eq(surface.id,feature.surfaceId),eq(surface.worldId,feature.worldId))).where(and(eq(feature.id,body.featureId),eq(feature.worldId,worldId)));if(!record)throw unavailable();
    const [retry]=await tx.select().from(version).where(and(eq(version.worldId,worldId),eq(version.requestId,body.requestId)));if(retry){const geometry=body.action==="revise"?body.geometry:record.v.geometry;if(retry.featureId!==body.featureId||body.action==="revise"&&(canonicalSource(retry.geometry)!==canonicalSource(geometry)||retry.note!==body.note||retry.protected!==body.protected)||body.action!=="revise"&&retry.archived!==(body.action==="archive"))throw conflict();return {id:retry.id,reused:true};}
    if(record.h.revision!==body.revision)throw conflict();if(body.action==="revise"&&record.v.archived)throw new WorldError("Restore this source before revising it.",400);
    const [source]=await tx.select().from(dataset).where(eq(dataset.id,record.v.datasetId));
    const geometry=body.action==="revise"?body.geometry:record.v.geometry;checked(()=>validateSourceGeometry(geometry,record.s.reference,source.provenance.validation));
    const id=randomUUID(),revision=record.h.revision+1,row={id,worldId,surfaceId:record.f.surfaceId,featureId:record.f.id,authorId:userId,datasetId:record.v.datasetId,previousId:record.v.id,requestId:body.requestId,revision,geometry,properties:record.v.properties,note:body.action==="revise"?body.note:body.action==="archive"?"Source archived; original geometry and earlier versions retained.":"Source restored with retained geometry.",protected:body.action==="revise"?body.protected:record.v.protected,archived:body.action==="archive"};
    await tx.insert(version).values(row);await saveParts(tx,row,record.s.reference,source.provenance.display);await tx.update(head).set({versionId:id,revision}).where(and(eq(head.featureId,record.f.id),eq(head.worldId,worldId)));return {id,reused:false};
  });
}
