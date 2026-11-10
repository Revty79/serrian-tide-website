import "server-only";
import {and,eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {world} from "@/db/world-schema";
import {user} from "@/db/auth-schema";
import {atlasAssetVersion} from "@/db/world-asset-schema";
import {worldCanonCopy,worldCanonCopyIdentity} from "@/db/world-canon-copy-schema";
import {authorizeWorldRead,revalidateWorldResponse,worldScopeAllowed} from "./world-access-service";
import {worldRequestAuthority,withWorldRequestAuthority} from "./world-authorization-context";
import {nativeWorldScope} from "./world-permissions";
import {nativeContentContext,nativeResource,type NativeContentContext} from "./native-map-history-context";
import {projectAtlasMapConsumption} from "./atlas-map-consumption-service";
import {assertConsumptionGeography} from "./atlas-map-consumption-privacy";
import {nativeConditions} from "./native-map-history-conditions";
import {nativeContentHash,type NativeHistoryTx} from "./native-map-history-store";
import {currentExportResources,exportUnavailable} from "./atlas-export-current";
import {ATLAS_EXPORT_LIMITS,exportSourceRequestSchema,exportPinSchema,exportResourceSchema,exportManifestSchema,publicExportCredit,type ExportSourceRequest,type ExportPin,type ExportManifest,type ExportResource,type ExportImage} from "./atlas-export";
import {readTerrainTile} from "./terrain-storage";
import sharp from "sharp";
import {readAssetObject} from "./atlas-asset-storage";
import {buildingFloorAlignment} from "./building-floor-alignment";
import {nativeTerritorySavedSchema} from "./native-map-history-territories";
import {projectWorldPinnedContent} from "./world-pinned-content";
import {getAssetImage} from "./atlas-asset-service";
import {WorldError} from "./world-errors";
import {parseConsumptionResource,type ConsumptionGeometry} from "./atlas-map-consumption";
import {regionAreaContainsPath} from "./terrain-region-geometry";
import {terrainGeometry} from "./terrain";
import {z} from "zod";

async function exportCreator(tx:NativeHistoryTx,worldId:string,target:ExportSourceRequest["target"],terrainId?:string){
 const tables={terrain:["world_terrain_version","terrain_id",null],town:["world_town_map_version","map_id",null],floor:["world_building_floor_version","floor_id","world_building_floor_operation"],underground:["world_underground_version","record_id","world_underground_operation"],craft:["world_craft_version","craft_id","world_craft_operation"],deck:["world_craft_deck_version","deck_id","world_craft_operation"]} as const;
 const [table,column,operation]=tables[target.kind],id=target.kind==="terrain"?terrainId:target.id;if(!id)return null;
 const [created]=(await tx.execute<{id:string}>(sql`select ${operation?sql`o.author_id`:sql`v.author_id`} id from ${sql.identifier(table)} v ${operation?sql`join ${sql.identifier(operation)} o on o.request_id=v.request_id`:sql``} where v.world_id=${worldId} and ${sql.identifier("v")}.${sql.identifier(column)}=${id} and v.revision=1 ${target.kind==="underground"?sql`and v.kind='level'`:sql``} limit 1`)).rows;if(!created?.id)return null;
 const [account]=await tx.select({id:user.id,username:user.username,display:user.displayUsername,name:user.name}).from(user).where(eq(user.id,created.id));return account?{id:account.id,name:account.display||account.username||account.name}:null;
}
async function imageReferences(tx:NativeHistoryTx,resources:Map<string,ExportResource>){
 const composition=resources.get("composition"),images:ExportImage[]=[];
 if(composition?.kind!=="composition")return images;
 for(const p of composition.value.placements){if(!z.uuid().safeParse(p.assetId).success||images.some(i=>i.assetId===p.assetId&&i.version===p.version))continue;
  const [row]=await tx.select().from(atlasAssetVersion).where(and(eq(atlasAssetVersion.assetId,p.assetId),eq(atlasAssetVersion.version,p.version)));if(!row)throw exportUnavailable();
  let credits:string[]=[],creditIssue:string|undefined;try{credits=[row.metadata.attribution,row.metadata.source,row.metadata.license].filter(Boolean).map(publicExportCredit);}catch(error){creditIssue=(error as Error).message;}
  images.push({assetId:p.assetId,version:p.version,width:row.width,height:row.height,credits,creditIssue});
 }
 return images;
}
async function snapshot(userId:string,worldId:string,raw:unknown){
 const authority=worldRequestAuthority();if(!authority||authority.userId!==userId)throw new WorldError("Sign in to prepare an Atlas export.",401);
 const request=exportSourceRequestSchema.parse(raw),scopes=request.historical?["history" as const,"appearances" as const,nativeWorldScope(request.target.kind)]:[nativeWorldScope(request.target.kind)],access=await authorizeWorldRead(userId,worldId,authority.review,scopes);
 const reads=new Map(authority.reads),cached=reads.get(worldId)!;reads.set(worldId,{...cached,permission:{...access.permission,protectedContent:false,canEdit:false}});
 const result=await withWorldRequestAuthority({...authority,proof:null,reads},()=>db.transaction(async tx=>{
  let historical:ExportManifest["historical"]=null,resources:Map<string,ExportResource>,geometry:ConsumptionGeometry,title:string,revision:number,extent:ExportManifest["extent"],wrapWidth:number|null,provenance:ExportManifest["provenance"];const dependencies:ExportManifest["dependencies"]=[];
  const [parent]=await tx.select({name:world.name}).from(world).where(eq(world.id,worldId));if(!parent)throw exportUnavailable();
  if(request.historical){
   const context=await nativeContentContext(tx,userId,worldId,{...request.historical,edit:false},{ownerId:access.ownerId,archived:!!access.archivedAt,review:authority.review,ordinary:false});await assertConsumptionGeography(tx,context);
   // An editing UI can request its accepted head without a version ID. Resolve
   // it once, then apply the exact-version rules before projecting anything.
   const pinContext=(c:NativeContentContext)=>{if(c.authority)pinContext(c.authority);c.scope={...c.scope,edit:false,versionId:c.version.id,...c.authority?{geographyVersionId:c.authority.version.id,geographyStateId:c.authority.scope.stateId}:{}};c.canEdit=false;};pinContext(context);request.historical=context.scope;
   const projected=await projectAtlasMapConsumption(tx,context,request.contractVersion??1),m=projected.manifest;resources=new Map([...projected.resources].map(([key,value])=>[key,value.value]));const g=resources.get("geometry");if(g?.kind!=="geometry")throw exportUnavailable();geometry=g.value;revision=m.sourceRevision;
   if(context.authority){const parent=context.authority,version=parent.version;dependencies.push({target:parent.scope.target,versionId:version.id,timelineId:parent.scope.timelineId,originTimelineId:version.timelineId,startYear:version.startYear!,endYear:version.endYear!,coverage:!version.archived&&version.startYear!<=m.source.year&&version.endYear!>=m.source.year?"established":"unknown"});}
   title=context.version.name;historical={...m.history,primaryCoverage:m.history.coverage,coverage:m.history.coverage==="established"&&dependencies.every(d=>d.coverage==="established")?"established":"unknown",timelineId:m.source.timelineId,year:m.source.year,versionId:m.source.versionId};provenance=m.provenance;
   const size="settings" in geometry?terrainGeometry(geometry.settings):null;extent="settings" in geometry?geometry.region?.frame??{x:0,y:0,width:size!.displayWidth,height:size!.displayHeight}:{x:0,y:0,...geometry.frame};wrapWidth=size?.wrap?size.displayWidth:null;
   if(context.manifest.resources.some(r=>r.key==="backdrop")&&worldScopeAllowed(worldId,"atlas")){
    const b=(await nativeResource(tx,context,"backdrop")).payload as unknown as {size:17;spacing:number;heights:number[];wet:boolean[];water?:Extract<ExportResource,{kind:"backdrop"}>["value"]["water"]};resources.set("backdrop",exportResourceSchema.parse({kind:"backdrop",value:{size:b.size,spacing:b.spacing,heights:b.heights,wet:b.wet,water:b.water}}));
   }
   const ruins=(await nativeConditions(tx,context)).values.filter(v=>v.condition==="ruined").map(v=>v.id),places:Extract<ExportResource,{kind:"presentation"}>["places"]=[];
   if(worldScopeAllowed(worldId,"settlements")&&context.manifest.resources.some(r=>r.key==="places")){
    const b=(await nativeResource(tx,context,"places")).payload as unknown as import("./world-towns").TownBundle,allowed=resources.get("places");const ids=new Set(allowed?.kind==="positions"?allowed.towns.map(p=>p.id):[]);for(const p of b.placements)if(ids.has(p.id))places.push({id:p.id,x:p.x,y:p.y,name:p.name,kind:"town"});
   }
   const craftPositions=resources.get("craft-positions"),crafts:import("./craft").CraftMarker[]=[];
   if(craftPositions?.kind==="positions"&&context.manifest.resources.some(r=>r.key==="craft-positions")){
    const raw=(await nativeResource(tx,context,"craft-positions")).payload as unknown as import("./craft").CraftBundle;
    for(const pose of craftPositions.crafts){if("settings"in geometry&&geometry.region&&!regionAreaContainsPath({frame:geometry.region.frame,footprint:geometry.region.footprint??undefined},[pose],{width:size!.displayWidth,height:size!.displayHeight,wrap:size!.wrap}))continue;const marker=raw.markers.find(m=>m.id===pose.craftId);if(!marker)throw new WorldError("An exact retained craft marker is missing. Restore its source before exporting; no current-day representation was substituted.",409);crafts.push({...marker,x:pose.x,y:pose.y,rotation:pose.rotation,revision:pose.revision});}
   }
   resources.set("presentation",exportResourceSchema.parse({kind:"presentation",places,ruins,crafts}));
   if(geometry.family==="floor"){const b=(await nativeResource(tx,context,"floor")).payload as unknown as {bundle:import("./building-floor").FloorBundle};const a=buildingFloorAlignment(b.bundle.building!.footprint,b.bundle.building!.frame);extent={x:0,y:0,width:a.frame.width,height:a.frame.height};resources.set("alignment",{kind:"alignment",value:{angle:a.angle,offset:a.offset,frame:extent}});}
   if(request.target.kind==="terrain"){const authority=context.authority??context;if(authority.manifest.resources.some(r=>r.key==="territories")){const saved=nativeTerritorySavedSchema.parse((await nativeResource(tx,authority,"territories")).payload),ordinary=await projectWorldPinnedContent(saved,worldId,context.scope.timelineId,tx);resources.set("politics",{kind:"politics",year:context.scope.year,territories:ordinary.territories.filter(t=>!t.protected)});}}
  }else{
   const current=await currentExportResources(tx,worldId,request.target);({resources,geometry,title,revision,extent,wrapWidth}=current);
   const [copy]=await tx.select().from(worldCanonCopy).where(and(eq(worldCanonCopy.targetWorldId,worldId),eq(worldCanonCopy.status,"accepted"))).limit(1),[origin]=copy?await tx.select({id:worldCanonCopyIdentity.sourceId}).from(worldCanonCopyIdentity).where(and(eq(worldCanonCopyIdentity.requestId,copy.requestId),eq(worldCanonCopyIdentity.targetId,request.target.id))).limit(1):[];
   provenance={kind:copy?"personal-variation":access.permission.canon?"canon-source":"authored-world",sourceWorldId:copy?.sourceWorldId??null,sourceTimelineId:null,sourceTarget:origin?{...request.target,id:origin.id}:null,sourceVersionId:null};
  }
  for(const value of resources.values())if(value.kind==="geometry"||value.kind==="numerical"){try{parseConsumptionResource(value,request.contractVersion??1);}catch(error){throw new WorldError((error as Error).message,409);}}
  const creator=await exportCreator(tx,worldId,request.target,"terrainId" in geometry?geometry.terrainId:undefined),images=await imageReferences(tx,resources),appearance=resources.get("appearance"),credits:string[]=[],warnings:string[]=[];
  const savedLabels=resources.get("labels");if(savedLabels?.kind==="labels"&&savedLabels.value.composition.notes.attribution){try{credits.push(publicExportCredit(savedLabels.value.composition.notes.attribution));}catch(error){throw new WorldError((error as Error).message,409);}}
  let bytes=0;const descriptors=[...resources].map(([key,value])=>{const size=Buffer.byteLength(JSON.stringify(value));bytes+=size;return{key,kind:value.kind,sha256:nativeContentHash(value),bytes:size};});if(bytes>ATLAS_EXPORT_LIMITS.metadataBytes)throw new WorldError("This source exceeds the 24 MiB export metadata allowance. Export a smaller saved Region or reduce source complexity; no map data or credits were truncated.",413);
  if(historical?.coverage==="unknown")warnings.push("This retained source does not establish active map coverage for the selected year. The export will label that uncertainty.");
  if(images.length)warnings.push("Uploaded artwork is excluded by default. Include it only when you have permission to distribute it; exact authorized sanitized versions are used.");
  const alignment=resources.get("alignment"),coordinateFrame={kind:alignment?.kind==="alignment"?"building-working-metres" as const:"canonical-metres" as const,rotationDegrees:alignment?.kind==="alignment"?-alignment.value.angle:0,offsetMetres:alignment?.kind==="alignment"?alignment.value.offset:{x:0,y:0}};
  const body={schema:"serrian-atlas-export" as const,version:1 as const,worldId,source:request,target:request.target,mode:historical?"historical-saved" as const:"current-saved" as const,family:geometry.family,title,worldName:parent.name,creator,extent:{x:extent.x,y:extent.y,width:extent.width,height:extent.height},coordinateFrame,wrapWidth,revision,historical,dependencies,provenance,resources:descriptors,images,credits,appearance:appearance?.kind==="appearance"?appearance.value:null,warnings};
  const pin={request,sha256:nativeContentHash(body)};return{manifest:exportManifestSchema.parse({...body,pin}) satisfies ExportManifest,resources};
 },{accessMode:"read only",isolationLevel:"repeatable read"}));
 await revalidateWorldResponse();return result;
}
async function checked(userId:string,worldId:string,raw:unknown){const pin=exportPinSchema.parse(raw),value=await snapshot(userId,worldId,pin.request);if(value.manifest.pin.sha256!==pin.sha256)throw new WorldError("This saved export source or its access changed. Prepare it again; your Atlas draft is retained and no newer map was substituted.",409);return value;}
export async function prepareAtlasExport(userId:string,worldId:string,request:ExportSourceRequest){return(await snapshot(userId,worldId,request)).manifest;}
export async function readAtlasExportResource(userId:string,worldId:string,pin:ExportPin,key:string){const value=await checked(userId,worldId,pin),resource=value.resources.get(key);if(!resource)throw exportUnavailable();return resource;}
export async function readAtlasExportTiles(userId:string,worldId:string,pin:ExportPin,key:string,raw:unknown){
 const indexes=z.array(z.number().int().min(0).max(32767)).min(1).max(ATLAS_EXPORT_LIMITS.tileBatch).refine(a=>new Set(a).size===a.length).parse(raw),source=await checked(userId,worldId,pin),value=source.resources.get(key),tiles=value?.kind==="geometry"&&"tiles" in value.value?value.value.tiles:value?.kind==="numerical"?value.tiles:null;if(!tiles||indexes.some(i=>!tiles[i]))throw exportUnavailable();
 const output=[];for(const index of indexes){const tile=tiles[index];try{output.push({...tile,index,samples:await readTerrainTile(tile)});}catch{throw new WorldError("A pinned numerical object is missing or corrupt. Restore its paired backup before exporting; no incomplete image was produced.",409);}}await revalidateWorldResponse();return output;
}
let exportImageDecoding=false;
export async function readAtlasExportImage(userId:string,worldId:string,pin:ExportPin,assetId:string,version:number){const source=await checked(userId,worldId,pin),image=source.manifest.images.find(i=>i.assetId===assetId&&i.version===version);if(!image)throw exportUnavailable();if(image.creditIssue)throw new WorldError(image.creditIssue,409);await getAssetImage(userId,worldId,assetId,version,"1536",worldRequestAuthority()!.review);if(exportImageDecoding)throw new WorldError("Another high-detail export image is being prepared. Retry this export shortly.",429);exportImageDecoding=true;try{const [row]=await db.select({objects:atlasAssetVersion.objects}).from(atlasAssetVersion).where(and(eq(atlasAssetVersion.assetId,assetId),eq(atlasAssetVersion.version,version)));const object=row?.objects.find(o=>o.type==="original");if(!object)throw exportUnavailable();const original=await readAssetObject(object),bytes=await sharp(original,{limitInputPixels:16*1024*1024,limitInputChannels:4,failOn:"warning",sequentialRead:true}).rotate().resize(4096,4096,{fit:"inside",withoutEnlargement:true}).webp({quality:95,effort:2}).timeout({seconds:12}).toBuffer();if(bytes.length>8*1024*1024)throw new WorldError("This high-detail image exceeds 8 MiB. Omit uploaded artwork or prepare a smaller source image.",413);await revalidateWorldResponse();return bytes;}finally{exportImageDecoding=false;}}
export async function authorizeAtlasExportDelivery(userId:string,worldId:string,pin:ExportPin){await checked(userId,worldId,pin);return{authorized:true,sha256:pin.sha256};}
