import "server-only";
import {and,eq} from "drizzle-orm";
import {db} from "@/db";
import {worldCanonCopy,worldCanonCopyIdentity} from "@/db/world-canon-copy-schema";
import {authorizeWorldRead,revalidateWorldResponse,worldScopeAllowed} from "./world-access-service";
import {withWorldRequestAuthority,worldRequestAuthority} from "./world-authorization-context";
import {nativeWorldScope} from "./world-permissions";
import {nativeContentContext,nativeRelatedContext,nativeResource,type NativeContentContext} from "./native-map-history-context";
import {nativeContentHash,type NativeHistoryTx} from "./native-map-history-store";
import {nativeConditions} from "./native-map-history-conditions";
import {nativeObjectPresent} from "./native-map-history";
import type {NativeNumericPin} from "./native-map-history-capture";
import {nativeTerrainSource,type NativeRefinementPayload} from "./native-map-history-terrain-read";
import {readTerrainTile} from "./terrain-storage";
import {terrainGeometry} from "./terrain";
import {consumptionFloorDesign,consumptionTownDesign,consumptionUndergroundDesign} from "./atlas-map-consumption-projection";
import {consumptionConnections} from "./atlas-map-consumption-connections";
import {assertConsumptionGeography,unavailableConsumptionPlaces} from "./atlas-map-consumption-privacy";
import {projectWorldPinnedContent} from "./world-pinned-content";
import {nativeArtworkPins} from "./native-map-history-asset-access";
import {ATLAS_CONSUMPTION,consumptionRequestSchema,consumptionPinSchema,consumptionManifestSchema,consumptionResourceSchema,type ConsumptionRequest,type ConsumptionPin,type ConsumptionResource,type ConsumptionGeometry,type ConsumptionManifest} from "./atlas-map-consumption";
import type {TownMapBundle} from "./town-map";
import type {FloorBundle} from "./building-floor";
import type {UndergroundBundle} from "./underground";
import type {CraftBundle} from "./craft";
import {WorldError} from "./world-errors";
import {z} from "zod";

const missing=()=>new WorldError("This exact ordinary Atlas source is unavailable with your current access.",404);
const frame=(f:{width:number;height:number})=>({width:f.width,height:f.height});
const withRotation=(f:{x:number;y:number;width:number;height:number;rotation?:number})=>({...f,rotation:f.rotation??0});
function tileReferences(tiles:{x:number;y:number;lod?:number;sha256:string;bytes:number;encoding:string}[]){return tiles.map(t=>({x:t.x,y:t.y,lod:t.lod??0,sha256:t.sha256,bytes:t.bytes,encoding:t.encoding}));}

/** Always selected by immutable native version. No head/baseline substitution,
 * source construction, publication record, file URL or map write is performed. */
async function ordinaryRead<T>(userId:string,worldId:string,raw:unknown,run:(tx:NativeHistoryTx,c:NativeContentContext)=>Promise<T>){
 const request=consumptionRequestSchema.parse(raw),authority=worldRequestAuthority();
 if(!authority||authority.userId!==userId)throw new WorldError("An authenticated World request is required.",401);
 const result=await db.transaction(async tx=>{
  const access=await authorizeWorldRead(userId,worldId,authority.review,["history","appearances",nativeWorldScope(request.target.kind)],tx);
  const reads=new Map(authority.reads),cached=reads.get(worldId)!;
  reads.set(worldId,{...cached,permission:{...access.permission,protectedContent:false,canEdit:false}});
  return withWorldRequestAuthority({...authority,proof:null,reads},async()=>{
   const context=await nativeContentContext(tx,userId,worldId,{...request,edit:false},{ownerId:access.ownerId,archived:!!access.archivedAt,review:authority.review,ordinary:false});
   await assertConsumptionGeography(tx,context);
   return run(tx,context);
  });
 },{isolationLevel:"repeatable read",accessMode:"read only"});
 // The outer, original permission is checked after all slow serialization/I/O.
 // Narrowing the projection must neither grant access nor mask revocation.
 await revalidateWorldResponse();return result;
}

async function geometry(tx:NativeHistoryTx,c:NativeContentContext):Promise<{value:ConsumptionGeometry;key:string;parent:ConsumptionManifest["coordinates"]["parent"];records:ConsumptionManifest["records"]}>{
 const conditions=(await nativeConditions(tx,c)).values;let parent:ConsumptionManifest["coordinates"]["parent"]=null;
 if(!nativeObjectPresent(conditions,c.scope.target.id))throw missing();
 const records:ConsumptionManifest["records"]=[],kind=c.scope.target.kind;
 const parentFrame=async(target:ConsumptionRequest["target"],f:{x:number;y:number;width:number;height:number;rotation?:number})=>{
  try{const source=await nativeRelatedContext(tx,c,target);parent={target,versionId:source.version.id,mapping:"centre-rotation",frame:withRotation(f)};}catch(error){if(!(error instanceof WorldError))throw error;}
 };
 if(kind==="terrain"){
  const {document:d,value}=await nativeTerrainSource(tx,c),region=d.region;
  if(c.authority&&region)parent={target:c.authority.scope.target,versionId:c.authority.version.id,mapping:"identity",frame:withRotation(region.frame)};
  return {key:"terrain",parent,records,value:{family:region?"regional":"world",settings:d.settings,terrainId:d.terrainId,revision:d.revision,baseElevation:d.baseElevation,seaLevel:d.seaLevel,tiles:tileReferences(value.tileObjects) as Extract<ConsumptionGeometry,{family:"world"|"regional"}>["tiles"],region:region?{parentMapId:region.parentMapId,frame:withRotation(region.frame),footprint:region.footprint??null}:null}};
 }
 if(kind==="town"){
  const b=(await nativeResource(tx,c,"town")).payload as unknown as {bundle:TownMapBundle},d=b.bundle.document;
  if(!d||d.id!==c.scope.target.id||d.worldId!==c.worldId)throw missing();
  await parentFrame({kind:"terrain",id:d.sourceMapId},d.frame);records.push({kind:"town",id:d.townId,identityOnly:true});
  const design=consumptionTownDesign(d.design,conditions),hidden=await unavailableConsumptionPlaces(tx,c,design.features.flatMap(f=>f.placeId?[f.placeId]:[]));design.features=design.features.filter(f=>!f.placeId||!hidden.has(f.placeId));
  return {key:"town",parent,records,value:{family:"town",frame:frame(d.frame),design}};
 }
 if(kind==="floor"){
  const b=(await nativeResource(tx,c,"floor")).payload as unknown as {bundle:FloorBundle},d=b.bundle.document,building=b.bundle.building;
  if(!d||!building||d.id!==c.scope.target.id||d.worldId!==c.worldId)throw missing();
  const town=c.manifest.dependencies.find(v=>v.target.kind==="town");if(town)await parentFrame(town.target,building.frame);
  records.push({kind:"building",id:d.buildingId,identityOnly:true});if(worldScopeAllowed(c.worldId,"settlements")&&building.placeId)records.push({kind:"place",id:building.placeId,identityOnly:true});
  if(worldScopeAllowed(c.worldId,"settlements"))records.push({kind:"town",id:building.townId,identityOnly:true});
  return {key:"floor",parent,records,value:{family:"floor",buildingId:d.buildingId,frame:frame(building.frame),elevation:d.elevation,order:d.order,design:consumptionFloorDesign(d.design,conditions)}};
 }
 if(kind==="underground"){
  const b=(await nativeResource(tx,c,"underground")).payload as unknown as {bundle:UndergroundBundle},d=b.bundle.document,site=b.bundle.sites.find(s=>s.id===d?.siteId);
  if(!d||!site||d.id!==c.scope.target.id||d.worldId!==c.worldId)throw missing();
  if(worldScopeAllowed(c.worldId,"settlements")&&site.placeId)records.push({kind:"place",id:site.placeId,identityOnly:true});
  return {key:"underground",parent,records,value:{family:"underground",siteId:d.siteId,frame:frame(site.frame),depth:d.depth,order:d.order,design:consumptionUndergroundDesign(d.design,conditions)}};
 }
 const deck=kind==="deck",b=(await nativeResource(tx,c,deck?"craft-context":"craft")).payload as unknown as {bundle:CraftBundle};
 const selected=deck?((await nativeResource(tx,c,"deck")).payload as unknown as {deck:CraftBundle["deck"]}).deck:b.bundle.craft;
 if(!selected||selected.id!==c.scope.target.id||selected.worldId!==c.worldId)throw missing();
 const surface=selected.surface,plan=consumptionFloorDesign(surface.plan,conditions),outlineId=plan.features.some(f=>f.id===surface.outlineId)?surface.outlineId:null;records.push({kind:"craft",id:deck?b.bundle.craft!.id:selected.id,identityOnly:true});
 if(deck){await parentFrame({kind:"craft",id:b.bundle.craft!.id},selected.frame);const d=selected as NonNullable<CraftBundle["deck"]>;return {key:"deck",parent,records,value:{family:"deck",craftId:d.craftId,frame:frame(d.frame),height:d.height,order:d.order,outlineId,plan}};}
 return {key:"craft",parent,records,value:{family:"craft",frame:frame(selected.frame),classification:b.bundle.craft!.classification,outlineId,plan}};
}

/** Internal adapter reuse only: caller supplies a checked ordinary native context,
 * checks geographic availability and revalidates the live response after work. */
export async function projectAtlasMapConsumption(tx:NativeHistoryTx,c:NativeContentContext){
 const selected=await geometry(tx,c),resources=new Map<string,{value:ConsumptionResource;componentId:string;sourceSha256:string}>(),omissions=new Set<ConsumptionManifest["omissions"][number]>(["no-publication-approval"]);
 const add=async(key:string,value:unknown,sourceKey=key)=>{
  const component=await nativeResource(tx,c,sourceKey);
  const original=c.authority&&sourceKey==="labels"?await nativeResource(tx,c.authority,sourceKey):component;
  if(nativeContentHash(original.payload)!==original.contentHash)throw new WorldError("The retained source failed its content checksum.",409);
  if(c.authority&&sourceKey==="labels"&&c.manifest.resources.some(r=>r.key==="label-view")){const view=await nativeResource(tx,c,"label-view");if(nativeContentHash(view.payload)!==view.contentHash)throw new WorldError("The regional label view failed its content checksum.",409);}
  const projected=await projectWorldPinnedContent(value,c.worldId,c.scope.timelineId,tx,{ordinary:true}),parsed=consumptionResourceSchema.parse(projected);if(Buffer.byteLength(JSON.stringify(parsed))>ATLAS_CONSUMPTION.resourceBytes)throw new WorldError("This resource exceeds the bounded contract size.",413);
  resources.set(key,{value:parsed,componentId:component.id,sourceSha256:component.contentHash});
 };
 await add("geometry",{kind:"geometry",value:selected.value},selected.key);
 for(const ref of c.manifest.resources){
  if(["materials","hydrology","environment","artwork","labels","appearance","composition"].includes(ref.key)){
   if(ref.key==="composition"&&!worldScopeAllowed(c.worldId,"assets")){omissions.add("private-assets");continue;}
   const payload=(await nativeResource(tx,c,ref.key)).payload;const value=structuredClone(ref.key==="appearance"?payload.spec:payload.layer);
   if(ref.key==="labels"){const labels=value as import("./terrain-labels").LabelsLayer,hidden=await unavailableConsumptionPlaces(tx,c,labels.labels.flatMap(l=>l.source?.kind==="town"?[l.source.id]:[]));labels.labels=labels.labels.filter(l=>l.visible&&!(l.source?.kind==="town"&&hidden.has(l.source.id))).map(l=>({...l,source:null}));}
   if(ref.key==="composition"){
    const composition=value as import("./atlas-assets").AssetComposition;
    const pins=await nativeArtworkPins(tx,c.worldId),allowed=new Set(pins.map(p=>p.assetId+":"+p.assetVersion));
    const ordinary=composition.placements.filter(p=>p.visible&&(!z.uuid().safeParse(p.assetId).success||allowed.has(p.assetId+":"+p.version)));
    if(ordinary.length!==composition.placements.length||ordinary.some(p=>z.uuid().safeParse(p.assetId).success))omissions.add("private-assets");composition.placements=ordinary;
   }
   await add(ref.key,{kind:ref.key,value});
   }else if(ref.key==="advanced"){
    const p=(await nativeResource(tx,c,ref.key)).payload as unknown as import("./terrain-advanced-service").AdvancedContextPacket;
    await add(ref.key,{kind:"landforms",value:p.context.volcanoes.map(v=>({id:v.id,revision:v.revision,sourceId:v.sourceId,operation:v.operation}))});
   }else if(ref.key==="places"&&worldScopeAllowed(c.worldId,"settlements")){
    const p=(await nativeResource(tx,c,ref.key)).payload as unknown as import("./world-towns").TownBundle,conditions=(await nativeConditions(tx,c)).values;
    const hidden=await unavailableConsumptionPlaces(tx,c,p.placements.map(v=>v.townId)),towns=p.placements.filter(v=>!v.removed&&!v.archived&&!hidden.has(v.townId)&&nativeObjectPresent(conditions,v.townId)).map(v=>({id:v.id,townId:v.townId,x:v.x,y:v.y,revision:v.revision}));
    await add(ref.key,{kind:"positions",towns,crafts:[]});
   }else if(ref.key==="craft-positions"&&worldScopeAllowed(c.worldId,"craft")){
    const p=(await nativeResource(tx,c,ref.key)).payload as unknown as CraftBundle&{positions?:import("./craft").CraftPlacement[]},conditions=(await nativeConditions(tx,c)).values;
    const crafts=p.positions?p.positions.filter(v=>!v.removed&&nativeObjectPresent(conditions,v.craftId)).map(v=>({craftId:v.craftId,x:v.x,y:v.y,rotation:v.rotation,revision:v.revision})):p.markers.filter(v=>nativeObjectPresent(conditions,v.id)).map(v=>({craftId:v.id,x:v.x,y:v.y,rotation:v.rotation,revision:v.revision}));
    await add(ref.key,{kind:"positions",towns:[],crafts});
   }else if(ref.key.startsWith("refinement:")){
   const p=(await nativeResource(tx,c,ref.key)).payload as unknown as NativeRefinementPayload,m=p.meta;
    const root=await nativeTerrainSource(tx,c);
    await add(ref.key,{kind:"numerical",terrainId:m.terrainId,sourceId:m.id,parentId:m.parentId??root.document.terrainId,parentRevision:m.parentRevision,revision:m.revision,frame:withRotation(m.frame),gridWidth:m.gridWidth,gridHeight:m.gridHeight,baseElevation:root.document.baseElevation,tiles:tileReferences(p.tileObjects)});
   }else if(ref.key.startsWith("source:")){
    const p=(await nativeResource(tx,c,ref.key)).payload as unknown as NativeNumericPin;
    await add(ref.key,{kind:"numerical",terrainId:(await nativeTerrainSource(tx,c)).document.terrainId,sourceId:p.id,parentId:p.parentId,parentRevision:p.parentRevision,revision:p.revision,frame:withRotation(p.frame),gridWidth:p.shape.width,gridHeight:p.shape.height,baseElevation:p.baseElevation,tiles:tileReferences(p.tileObjects)});
  }
 }
 const links=await consumptionConnections(tx,c,selected.value);if(links.connections.length)await add("connections",{kind:"connections",target:c.scope.target,value:links.connections},selected.key);if(links.unavailable)omissions.add("unavailable-connection");
 if(!selected.parent&&!["world","underground"].includes(selected.value.family))omissions.add("unavailable-parent");
 const [copy]=await tx.select({sourceWorldId:worldCanonCopy.sourceWorldId,requestId:worldCanonCopy.requestId,targetTimelineId:worldCanonCopy.targetTimelineId}).from(worldCanonCopy).where(and(eq(worldCanonCopy.targetWorldId,c.worldId),eq(worldCanonCopy.status,"accepted"))).limit(1);
 const [timeline]=copy?await tx.select({id:worldCanonCopyIdentity.sourceId}).from(worldCanonCopyIdentity).where(and(eq(worldCanonCopyIdentity.requestId,copy.requestId),eq(worldCanonCopyIdentity.targetId,copy.targetTimelineId))).limit(1):[];
 const originalTarget=copy?(await tx.select({id:worldCanonCopyIdentity.sourceId}).from(worldCanonCopyIdentity).where(and(eq(worldCanonCopyIdentity.requestId,copy.requestId),eq(worldCanonCopyIdentity.targetId,c.scope.target.id))).limit(1))[0]:undefined;
 const originalVersion=copy?(await tx.select({id:worldCanonCopyIdentity.sourceId}).from(worldCanonCopyIdentity).where(and(eq(worldCanonCopyIdentity.requestId,copy.requestId),eq(worldCanonCopyIdentity.targetId,c.version.id))).limit(1))[0]:undefined;
 const source={worldId:c.worldId,target:c.scope.target,timelineId:c.scope.timelineId,year:c.scope.year,stateId:c.scope.stateId,versionId:c.version.id};
 const value=selected.value,shape="settings" in value?terrainGeometry(value.settings):value.frame;
 const width="displayWidth" in shape?shape.displayWidth:shape.width,height="displayHeight" in shape?shape.displayHeight:shape.height;
 const body={schema:ATLAS_CONSUMPTION.schema,schemaVersion:1 as const,projectionVersion:1 as const,stage:"accepted-saved" as const,publication:"not-published" as const,readOnly:true as const,source,family:value.family,sourceRevision:(await nativeResource(tx,c,selected.key)).revision,
  history:{originTimelineId:c.version.timelineId,startYear:c.version.startYear!,endYear:c.version.endYear!,coverage:!c.version.archived&&c.version.startYear!<=c.scope.year&&c.version.endYear!>=c.scope.year?"established" as const:"unknown" as const,archived:c.version.archived},
  coordinates:{system:"settings" in value?"world-metres" as const:"local-metres" as const,unit:"metre" as const,elevationUnit:"metre" as const,x:"right" as const,y:"down" as const,width,height,wrapX:"wrap" in shape?shape.wrap:false,sampleOrigin:"grid-node" as const,parent:selected.parent},
  provenance:{kind:copy?"personal-variation" as const:worldRequestAuthority()?.reads.get(c.worldId)?.permission.canon?"canon-source" as const:"authored-world" as const,sourceWorldId:copy?.sourceWorldId??null,sourceTimelineId:timeline?.id??null,sourceTarget:originalTarget?{kind:c.scope.target.kind,id:originalTarget.id}:null,sourceVersionId:originalVersion?.id??null},
  resources:[...resources].map(([key,r])=>({key,kind:r.value.kind,componentId:r.componentId,sourceSha256:r.sourceSha256,sha256:nativeContentHash(r.value),bytes:Buffer.byteLength(JSON.stringify(r.value))})),connections:{count:links.connections.length,resourceKey:links.connections.length?"connections" as const:null},records:[...new Map(selected.records.map(r=>[r.kind+":"+r.id,r])).values()],omissions:[...omissions]};
 const pin={schema:ATLAS_CONSUMPTION.schema,schemaVersion:1 as const,projectionVersion:1 as const,source,sha256:nativeContentHash(body)};
 return {manifest:consumptionManifestSchema.parse({...body,pin}),resources};
}
export async function readAtlasMapContract(userId:string,worldId:string,request:ConsumptionRequest):Promise<ConsumptionManifest>{return ordinaryRead(userId,worldId,request,async(tx,c)=>(await projectAtlasMapConsumption(tx,c)).manifest);}
export function validateAtlasMapManifest(raw:unknown){
 const manifest=consumptionManifestSchema.parse(raw),{pin,...body}=manifest;
 if(nativeContentHash(body)!==pin.sha256)throw new WorldError("The map representation failed its integrity checksum.",400);
 return manifest;
}
export function validateAtlasMapResource(manifest:ConsumptionManifest,key:string,raw:unknown){
 const checked=validateAtlasMapManifest(manifest),descriptor=checked.resources.find(r=>r.key===key),value=consumptionResourceSchema.parse(raw);
 if(!descriptor||descriptor.kind!==value.kind||nativeContentHash(value)!==descriptor.sha256||Buffer.byteLength(JSON.stringify(value))!==descriptor.bytes||value.kind==="geometry"&&value.value.family!==manifest.family)throw new WorldError("The map resource does not match this exact representation.",400);
 if(value.kind==="connections"&&(value.target.kind!==manifest.source.target.kind||value.target.id!==manifest.source.target.id||value.value.length!==manifest.connections.count))throw new WorldError("The connection resource belongs to another exact map representation.",400);
 return value;
}
export async function readAtlasMapResource(userId:string,rawPin:ConsumptionPin,key:string):Promise<ConsumptionResource>{
 const pin=consumptionPinSchema.parse(rawPin),{worldId,...request}=pin.source;return ordinaryRead(userId,worldId,request,async(tx,c)=>{
  const result=await projectAtlasMapConsumption(tx,c);if(result.manifest.pin.sha256!==pin.sha256)throw new WorldError("This exact ordinary representation changed availability. Keep its pin and explicitly select another authorized source.",409);
  const resource=result.resources.get(key);if(!resource)throw missing();return structuredClone(resource.value);
 });
}
export async function readAtlasMapTiles(userId:string,pin:ConsumptionPin,key:string,rawIndexes:number[]){
 const indexes=z.array(z.number().int().nonnegative().max(8191)).min(1).max(ATLAS_CONSUMPTION.tileBatch).refine(v=>new Set(v).size===v.length).parse(rawIndexes);
 const parsed=consumptionPinSchema.parse(pin),{worldId,...request}=parsed.source;
 return ordinaryRead(userId,worldId,request,async(tx,c)=>{
  const result=await projectAtlasMapConsumption(tx,c);if(result.manifest.pin.sha256!==parsed.sha256)throw new WorldError("The retained representation does not match this pin.",409);
  const value=result.resources.get(key)?.value;
  const tiles=value?.kind==="geometry"&&(value.value.family==="world"||value.value.family==="regional")?value.value.tiles:value?.kind==="numerical"?value.tiles:null;
  if(!tiles||indexes.some(i=>!tiles[i]))throw missing();
  const output=[];for(const index of indexes){const tile=tiles[index];try{output.push({...tile,samples:await readTerrainTile(tile)});}catch{throw new WorldError("This exact numerical object is missing or failed verification. Restore its paired source backup.",409);}}return output;
 });
}
