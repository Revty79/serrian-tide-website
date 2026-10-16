import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {and,eq,sql} from "drizzle-orm";
import {z} from "zod";
import {worldAtlasMap,worldGeography} from "@/db/world-atlas-schema";
import {worldGeoDataset as dataset,worldGeoFeature as feature,worldGeoHead as head,worldGeoVersion as version} from "@/db/world-geographic-schema";
import {WorldError,worldReadAccess,worldWriteTransaction} from "./world-service";
import {selectedTimeline} from "./history-version-service";
import {canonicalSource,layerAccess,saveGeographicParts} from "./geographic-service";
import {authoredProvenanceSchema,geoId} from "./geographic";
import {generateGeography,generationSaveSchema} from "./geographic-generation";

const digest=(v:unknown)=>createHash("sha256").update(canonicalSource(v)).digest("hex");
const contextSchema=z.object({mapId:geoId,timelineId:geoId}).strict();
export {generationSaveSchema};
type Tx=Parameters<Parameters<typeof worldWriteTransaction>[2]>[0];
export type GenerationSaved={features:{id:string;geographyId:string;versionId:string;name:string}[];reused:boolean};
async function context(tx:Tx,userId:string,worldId:string,body:z.infer<typeof contextSchema>){
 const timeline=await selectedTimeline(tx,worldId,body.timelineId),[map]=await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.id,body.mapId),eq(worldAtlasMap.worldId,worldId)));
 if(timeline.archivedAt||!map||map.archivedAt||map.mapKind!=="generic")throw new WorldError("Choose an active timeline and generic map for shared geographic generation.",404);
 const layer=await layerAccess(tx,worldId,map.id,body.timelineId,{},userId);
 if(!layer.surface.reference.crs.startsWith("AUTHORED:"))throw new WorldError("Generate on a creator-declared fictional surface. Imported Earth references remain unchanged.",400);
 // Heads only: never load worldwide original geometry to check for changes.
 const [stamp]=(await tx.execute<{stamp:string}>(sql`select md5(coalesce(string_agg(h.feature_id||':'||h.version_id,'|' order by h.feature_id),'')) stamp from world_geo_head h join world_geo_feature f on f.id=h.feature_id and f.world_id=h.world_id where f.world_id=${worldId} and f.surface_id=${layer.surface.id}`)).rows;
 return {layer,context:digest([map.id,map.revision,body.timelineId,layer.surface,stamp.stamp])};
}
export async function geographicGenerationContext(userId:string,worldId:string,input:unknown){const body=contextSchema.parse(input);return worldWriteTransaction(userId,worldId,tx=>context(tx,userId,worldId,body));}
/** Additive, all-or-nothing batch. Existing heads/artwork/places are never updated. */
export async function saveGeographicGeneration(userId:string,worldId:string,input:unknown):Promise<GenerationSaved>{
 const body=generationSaveSchema.parse(input),requestHash=digest(body);await worldReadAccess(userId,worldId);
 // Bounded deterministic verification before taking the World writer lock.
 let generated;try{generated=generateGeography(body.recipe);}catch(error){throw new WorldError((error as Error).message,400);}
 if(createHash("sha256").update(JSON.stringify(generated.features)).digest("hex")!==body.outputDigest)throw new WorldError("The geographic preview does not match this algorithm and recipe. Preview again before saving.",409);
 return worldWriteTransaction(userId,worldId,async tx=>{
  const current=await context(tx,userId,worldId,body);
  if(current.layer.surface.id!==body.surfaceId||canonicalSource(current.layer.surface.reference)!==canonicalSource(body.recipe.reference))throw new WorldError("The geographic surface changed. Your preview is retained; choose and preview the current surface.",409);
  const [retry]=await tx.select().from(version).where(and(eq(version.worldId,worldId),eq(version.requestId,body.requestId)));
  if(retry){if(retry.authorId!==userId||retry.properties.generationRequestHash!==requestHash)throw new WorldError("This save identity belongs to a different geographic preview.",409);return {...JSON.parse(String(retry.properties.generationMembers)) as Omit<GenerationSaved,"reused">,reused:true};}
  if(body.expectedContext!==current.context)throw new WorldError("Geography or map information changed after this preview. Review the latest geography before adding these new sources. Your preview is retained.",409);
  const members=generated.features.map((f,i)=>({id:randomUUID(),geographyId:randomUUID(),versionId:randomUUID(),name:`${body.name} ${f.kind==="landmass"?"landmass":"island"} ${i+1}`})),datasetId=randomUUID(),namespace=digest(["creator-generated",userId,body.surfaceId]);
  const provenance=authoredProvenanceSchema.parse({kind:"creator-authored",creatorId:userId,title:body.name,account:body.note,originalCrs:body.recipe.reference.crs,display:{lods:["overview","regional","detail"],priority:80,style:"land",exact:true,theme:"authored",labels:true,labelRank:30}});
  const receipt=JSON.stringify({algorithm:body.recipe.algorithm,baseAlgorithm:"serrian-atlas-v2",baseSpec:generated.baseSpec,recipe:body.recipe,surfaceId:body.surfaceId,mapId:body.mapId,timelineId:body.timelineId,creatorId:userId,requestId:body.requestId,expectedContext:body.expectedContext,outputDigest:body.outputDigest});
  await tx.insert(dataset).values({id:datasetId,worldId,surfaceId:body.surfaceId,importerId:userId,namespace,contentSha256:digest([body.requestId,provenance,generated.features,receipt]),provenance});
  for(const [i,m] of members.entries()){
   const f=generated.features[i];
   await tx.insert(worldGeography).values({id:m.geographyId,worldId,parentId:null,name:m.name,description:body.note,kind:f.kind==="landmass"?"continent":"island",context:"place"});
   await tx.insert(feature).values({id:m.id,worldId,surfaceId:body.surfaceId,geographyId:m.geographyId,namespace,externalId:`${body.requestId}:${i}`,semantic:"authored-geography"});
   const row={id:m.versionId,worldId,surfaceId:body.surfaceId,featureId:m.id,datasetId,previousId:null,authorId:userId,requestId:i===0?body.requestId:randomUUID(),revision:1,geometry:f.geometry,properties:{generationRecipe:receipt,generationMembers:JSON.stringify({features:members}),generationRequestHash:requestHash,generationIndex:i},note:body.note,protected:body.protected,archived:false};
   await tx.insert(version).values(row);await saveGeographicParts(tx,row,body.recipe.reference,provenance.display);await tx.insert(head).values({featureId:m.id,worldId,versionId:m.versionId,revision:1});
  }
  return {features:members,reused:false};
 });
}
