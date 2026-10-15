import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {and,eq} from "drizzle-orm";
import {worldAtlasMap,worldGeography} from "@/db/world-atlas-schema";
import {worldGeoSurface as surface,worldGeoView as view,worldGeoDataset as dataset,worldGeoFeature as feature,worldGeoHead as head,worldGeoVersion as version} from "@/db/world-geographic-schema";
import {WorldError,worldWriteTransaction} from "./world-service";
import {selectedTimeline} from "./history-version-service";
import {canonicalSource,layerAccess,saveGeographicParts} from "./geographic-service";
import {authoredProvenanceSchema,isAuthoredProvenance,validateReference,type SourceGeometry} from "./geographic";
import {geographicAuthoringCommand,simpleDraft,simpleGeometry,validateVisualGeometry} from "./geographic-authoring";
const digest=(value:unknown)=>createHash("sha256").update(canonicalSource(value)).digest("hex");
const conflict=()=>new WorldError("A newer geographic source or association exists. Your geographic draft is retained. Compare the latest source before retrying.",409);

/** Bounded visual authoring writes the existing source/version/part system atomically. */
export async function authorGeography(userId:string,worldId:string,input:unknown):Promise<{surfaceId:string;reused:boolean}|{featureId:string;versionId:string;revision:number;reused:boolean}>{
 const body=geographicAuthoringCommand.parse(input);
 return worldWriteTransaction(userId,worldId,async tx=>{
  const timeline=await selectedTimeline(tx,worldId,body.timelineId);if(timeline.archivedAt)throw new WorldError("Restore the selected timeline before authoring shared geography.",400);
  const [map]=await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.id,body.mapId),eq(worldAtlasMap.worldId,worldId)));
  if(!map||map.archivedAt||map.mapKind!=="generic")throw new WorldError("Choose an active generic Atlas map for shared geographic authoring.",404);
  if(body.action==="setup"||body.action==="attach"){
   let selected=body.action==="attach"?(await tx.select().from(surface).where(and(eq(surface.id,body.surfaceId),eq(surface.worldId,worldId))))[0]:(await tx.select().from(surface).where(and(eq(surface.worldId,worldId),eq(surface.requestId,body.requestId))))[0];
   if(body.action==="setup"){
    try{validateReference(body.reference);}catch(error){throw new WorldError((error as Error).message,400);}
    if(body.realmId){const {getPeople}=await import("./peoples-service"),realm=await getPeople(userId,worldId,body.timelineId,body.realmId);if(realm.family!=="realm"||realm.archived)throw new WorldError("Choose a readable active Realm.",404);}
    if(selected&&(selected.creatorId!==userId||selected.name!==body.name||canonicalSource(selected.reference)!==canonicalSource(body.reference)||selected.realmId!==body.realmId||selected.protected!==body.protected))throw conflict();
    if(!selected){[selected]=await tx.insert(surface).values({id:randomUUID(),worldId,creatorId:userId,requestId:body.requestId,name:body.name,reference:body.reference,realmId:body.realmId,protected:body.protected}).returning();}
   }
   if(!selected)throw new WorldError("Choose an existing surface from this World.",404);
   if(selected.realmId){const {getPeople}=await import("./peoples-service"),realm=await getPeople(userId,worldId,body.timelineId,selected.realmId);if(realm.family!=="realm"||realm.archived)throw new WorldError("Choose a readable active Realm.",404);}
   const [existing]=await tx.select().from(view).where(and(eq(view.mapId,map.id),eq(view.worldId,worldId)));if(existing&&existing.surfaceId!==selected.id)throw conflict();
   if(!existing)await tx.insert(view).values({mapId:map.id,worldId,surfaceId:selected.id});
   return {surfaceId:selected.id,reused:!!existing};
  }
  const layer=await layerAccess(tx,worldId,map.id,body.timelineId,{},userId);let geometry:SourceGeometry;
  try{validateVisualGeometry(body.geometry,layer.surface.reference);geometry=simpleGeometry(simpleDraft(body.geometry));}catch(error){throw new WorldError((error as Error).message,400);}
  const [retry]=await tx.select({v:version,f:feature}).from(version).innerJoin(feature,and(eq(feature.id,version.featureId),eq(feature.worldId,version.worldId))).where(and(eq(version.worldId,worldId),eq(version.requestId,body.requestId)));
  if(retry){if(retry.f.surfaceId!==layer.surface.id||retry.v.authorId!==userId||canonicalSource(retry.v.geometry)!==canonicalSource(geometry)||retry.v.note!==body.note||body.action==="revise"&&retry.f.id!==body.featureId||body.action==="create"&&(retry.f.externalId!==body.requestId||retry.v.properties.authoringName!==body.name||retry.v.properties.authoringKind!==body.kind||retry.v.properties.authoringParent!==body.parentId||retry.v.protected!==body.protected))throw conflict();return {featureId:retry.f.id,versionId:retry.v.id,revision:retry.v.revision,reused:true};}
  if(body.action==="create"){
   if((body.kind==="river")!==(geometry.type==="LineString"))throw new WorldError("Choose an open line for a river and a closed polygon for land.",400);
   if(body.parentId){const [parent]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,body.parentId),eq(worldGeography.worldId,worldId)));if(!parent||parent.archivedAt)throw new WorldError("Choose an active parent place in this World.",404);}
   const geographyId=randomUUID(),id=randomUUID(),versionId=randomUUID(),datasetId=randomUUID();
   const provenance=authoredProvenanceSchema.parse({kind:"creator-authored",creatorId:userId,title:body.name,account:body.note,originalCrs:layer.surface.reference.crs,display:{lods:["overview","regional","detail"],priority:80,style:body.kind==="river"?"river":"land",exact:true,theme:"authored",labels:true,labelRank:30}});
   await tx.insert(worldGeography).values({id:geographyId,worldId,parentId:body.parentId,name:body.name,description:body.note,kind:body.kind==="landmass"?"continent":body.kind==="island"?"island":"location",context:body.kind==="river"?"region":"place"});
   await tx.insert(dataset).values({id:datasetId,worldId,surfaceId:layer.surface.id,importerId:userId,namespace:digest(["creator-authored",userId,layer.surface.id]),contentSha256:digest([body.requestId,provenance,geometry]),provenance});
   await tx.insert(feature).values({id,worldId,surfaceId:layer.surface.id,geographyId,namespace:digest(["creator-authored",userId,layer.surface.id]),externalId:body.requestId,semantic:"authored-geography"});
   const row={id:versionId,worldId,surfaceId:layer.surface.id,featureId:id,datasetId,previousId:null,authorId:userId,requestId:body.requestId,revision:1,geometry,properties:{authoringName:body.name,authoringKind:body.kind,authoringParent:body.parentId},note:body.note,protected:body.protected,archived:false};
   await tx.insert(version).values(row);await saveGeographicParts(tx,row,layer.surface.reference,provenance.display);await tx.insert(head).values({featureId:id,worldId,versionId,revision:1});return {featureId:id,versionId,revision:1,reused:false};
  }
  const [current]=await tx.select({f:feature,v:version,h:head,d:dataset}).from(feature).innerJoin(head,and(eq(head.featureId,feature.id),eq(head.worldId,feature.worldId))).innerJoin(version,eq(version.id,head.versionId)).innerJoin(dataset,and(eq(dataset.id,version.datasetId),eq(dataset.worldId,worldId))).where(and(eq(feature.id,body.featureId),eq(feature.worldId,worldId),eq(feature.surfaceId,layer.surface.id)));
  if(!current)throw new WorldError("This geographic source is unavailable in this map.",404);if(current.h.revision!==body.revision)throw conflict();if(current.v.archived)throw new WorldError("Restore this geographic source before editing it.",400);
  try{validateVisualGeometry(current.v.geometry,layer.surface.reference);}catch(error){throw new WorldError((error as Error).message,400);}
  if(current.v.geometry.type!==geometry.type)throw new WorldError("A revision retains the source geometry type.",400);
  if(!isAuthoredProvenance(current.d.provenance)&&!body.acknowledgeImported)throw new WorldError("Explicitly acknowledge a deliberate revision of imported geography. Its original source remains retained.",400);
  const id=randomUUID(),revision=current.h.revision+1,row={...current.v,id,previousId:current.v.id,authorId:userId,requestId:body.requestId,revision,geometry,note:body.note,createdAt:new Date()};
  await tx.insert(version).values(row);await saveGeographicParts(tx,row,layer.surface.reference,current.d.provenance.display);await tx.update(head).set({versionId:id,revision}).where(and(eq(head.featureId,current.f.id),eq(head.worldId,worldId)));
  return {featureId:current.f.id,versionId:id,revision,reused:false};
 });
}
