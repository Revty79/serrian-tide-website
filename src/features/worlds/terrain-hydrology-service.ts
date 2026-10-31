import "server-only";
import {beginRegionalEdit,boundedRegionalLayer,finishRegionalEdit,regionalAuthoringContext,regionalScope,regionalRetryLayer} from "./terrain-regional-authoring-service";
import {regionalHydrology} from "./terrain-regional-layers";
import {regionalEqual} from "./terrain-regional-scope";
import {createHash} from "node:crypto";
import {and,asc,desc,eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldAtlasMap} from "@/db/world-atlas-schema";
import {worldMapCanvas,worldTerrain,worldTerrainVersion} from "@/db/world-terrain-schema";
import {worldTerrainRefinement,worldTerrainRefinementVersion} from "@/db/world-terrain-refinement-schema";
import {worldHydrology,worldHydrologyVersion} from "@/db/world-hydrology-schema";
import {WorldError,worldReadAccess,worldWriteTransaction} from "./world-service";
import {EMPTY_HYDROLOGY,hydroLayerSchema,hydroSaveSchema,makeHydroAnalysis,validateHydroFrame,type HydroLayer,type HydroSources} from "./terrain-hydrology";

type Connection=Pick<typeof db,"select"|"execute">;
const unavailable=()=>new WorldError("This terrain map is unavailable.",404);
export async function sourceIndex(tx:Connection,worldId:string,mapId:string):Promise<HydroSources>{
  const context=await regionalAuthoringContext(tx,worldId,mapId);mapId=context.sourceMapId;
  const [root]=await tx.select({terrain:worldTerrain,hash:worldTerrainVersion.contentHash}).from(worldMapCanvas)
    .innerJoin(worldAtlasMap,and(eq(worldAtlasMap.id,worldMapCanvas.mapId),eq(worldAtlasMap.worldId,worldId)))
    .innerJoin(worldTerrain,eq(worldTerrain.id,worldMapCanvas.terrainId))
    .innerJoin(worldTerrainVersion,and(eq(worldTerrainVersion.terrainId,worldTerrain.id),eq(worldTerrainVersion.revision,worldTerrain.revision)))
    .where(and(eq(worldMapCanvas.mapId,mapId),eq(worldMapCanvas.worldId,worldId),sql`${worldAtlasMap.archivedAt} IS NULL`));
  if(!root)throw unavailable();const t=root.terrain;
  const refinements=await tx.select({source:worldTerrainRefinement,hash:worldTerrainRefinementVersion.contentHash}).from(worldTerrainRefinement)
    .innerJoin(worldTerrainRefinementVersion,and(eq(worldTerrainRefinementVersion.refinementId,worldTerrainRefinement.id),eq(worldTerrainRefinementVersion.revision,worldTerrainRefinement.revision)))
    .where(and(eq(worldTerrainRefinement.terrainId,t.id),eq(worldTerrainRefinement.worldId,worldId))).orderBy(asc(worldTerrainRefinement.level),asc(worldTerrainRefinement.id));
  const sources:HydroSources["sources"]=[{id:t.id,parentId:null,level:0,revision:t.revision,gridWidth:t.gridWidth,gridHeight:t.gridHeight,frame:{x:0,y:0,width:t.widthMetres,height:t.heightMetres},contentHash:root.hash},...refinements.map(({source:s,hash})=>({id:s.id,parentId:s.parentId,level:s.level,revision:s.revision,gridWidth:s.gridWidth,gridHeight:s.gridHeight,frame:{x:s.x,y:s.y,width:s.width,height:s.height},contentHash:hash}))].sort((a,b)=>a.level-b.level||(a.id<b.id?-1:a.id>b.id?1:0));
  const value={rootRevision:t.revision,seaLevel:t.seaLevel,world:{width:t.widthMetres,height:t.heightMetres,wrap:t.wrap},sources};
  return {fingerprint:createHash("sha256").update(JSON.stringify(value)).digest("hex"),...value};
}
async function available(tx:Connection){const result=await tx.execute<{present:boolean}>(sql`select to_regclass('public.world_hydrology') is not null and to_regclass('public.world_hydrology_version') is not null as present`);return result.rows[0].present;}
export async function getHydrologySources(userId:string,worldId:string,mapId:string,options:{review?:boolean;ordinary?:boolean}={}){
  await worldReadAccess(userId,worldId,options.review??false);if(options.ordinary)throw unavailable();
  return db.transaction(async tx=>({sources:await sourceIndex(tx,worldId,mapId)}),{accessMode:"read only",isolationLevel:"repeatable read"});
}
export async function getTerrainHydrology(userId:string,worldId:string,mapId:string,options:{review?:boolean;ordinary?:boolean;revision?:number}={}){
  await worldReadAccess(userId,worldId,options.review??false);if(options.ordinary)throw unavailable();
  return db.transaction(async tx=>{
    const context=await regionalAuthoringContext(tx,worldId,mapId);mapId=context.sourceMapId;
    const sources=await sourceIndex(tx,worldId,mapId);
    if(!await available(tx))return {available:false,revision:0,headRevision:0,layer:EMPTY_HYDROLOGY,history:[],sources};
    const [head]=await tx.select().from(worldHydrology).where(eq(worldHydrology.mapId,mapId));let layer=head?.layer,revision=head?.revision??0;
    if(options.revision!==undefined){const [old]=await tx.select().from(worldHydrologyVersion).where(and(eq(worldHydrologyVersion.mapId,mapId),eq(worldHydrologyVersion.revision,options.revision)));if(!old)throw new WorldError("This water revision is unavailable.",404);layer=old.layer;revision=old.revision;}
    const history=await tx.select({revision:worldHydrologyVersion.revision,createdAt:worldHydrologyVersion.createdAt,restoredFromRevision:worldHydrologyVersion.restoredFromRevision}).from(worldHydrologyVersion).where(eq(worldHydrologyVersion.mapId,mapId)).orderBy(desc(worldHydrologyVersion.revision)).limit(60);
    return {...context.regional?{regional:context.regional}:{},available:true,revision,headRevision:head?.revision??0,layer:hydroLayerSchema.parse(layer??EMPTY_HYDROLOGY),history,sources};
  },{accessMode:"read only",isolationLevel:"repeatable read"});
}
function checkProvenance(layer:HydroLayer,previous:HydroLayer,sources:HydroSources){
  for(const analysis of layer.analyses){
    const original=previous.analyses.find(a=>a.id===analysis.id);if(original&&JSON.stringify(original)===JSON.stringify(analysis))continue;
    const expected=makeHydroAnalysis(sources,analysis.focus,analysis.minimumAreaM2,analysis.method!=="terrain-drainage-v1"?{lakeMinimumAreaM2:analysis.lakeMinimumAreaM2!,lakeMinimumDepthM:analysis.lakeMinimumDepthM!,...analysis.naturalDetail?{naturalDetail:analysis.naturalDetail}:{}}:undefined);
    if(JSON.stringify(expected)!==JSON.stringify(analysis))throw new WorldError("Accepted terrain changed or the analysis provenance is invalid. Keep your draft and suggest rivers again before accepting new routes.",409);
  }
  for(const object of [...layer.edges,...layer.lakes??[],...layer.catchments??[],...layer.features??[]]){const analysis=layer.analyses.find(a=>a.id===object.analysisId);if(object.sourceIds?.some(id=>!analysis?.pins.some(p=>p.id===id)))throw new WorldError("Water source references must belong to this map and its retained analysis.",400);}
  for(const edge of layer.edges)if(edge.flowKind==="derived"){
    const old=previous.edges.find(e=>e.id===edge.id),same=old&&old.flowKind==="derived"&&old.from===edge.from&&old.to===edge.to&&old.analysisId===edge.analysisId&&JSON.stringify(old.points)===JSON.stringify(edge.points);
    if(!same&&layer.analyses.find(a=>a.id===edge.analysisId)?.fingerprint!==sources.fingerprint)throw new WorldError("These new waterways use older terrain. Retain the draft and review a fresh suggestion; existing accepted rivers remain saved.",409);
  }
  for(const lake of [...layer.lakes??[],...layer.features??[]])for(const pin of lake.authoredPins??[]){const source=sources.sources.find(s=>s.id===pin.id);if(!source||pin.revision>source.revision||pin.revision===source.revision&&pin.contentHash!==source.contentHash)throw new WorldError("Authored lake source pins must refer to accepted terrain in this map.",400);}
  for(const lake of layer.lakes??[])if(lake.flowKind==="derived"){
    const old=previous.lakes?.find(l=>l.id===lake.id),same=old&&old.analysisId===lake.analysisId&&old.levelM===lake.levelM&&JSON.stringify(old.rings)===JSON.stringify(lake.rings);
    if(!same&&layer.analyses.find(a=>a.id===lake.analysisId)?.fingerprint!==sources.fingerprint)throw new WorldError("These new lakes use older terrain. Retain the draft and review fresh basin proposals.",409);
  }
  for(const f of layer.features??[])if(f.flowKind==="derived"){const old=previous.features?.find(v=>v.id===f.id),geometry=(v:typeof f)=>v.kind==="wetland"?v.rings:v.point;const same=old&&old.analysisId===f.analysisId&&old.riverId===f.riverId&&JSON.stringify(geometry(old))===JSON.stringify(geometry(f));if(!same&&layer.analyses.find(a=>a.id===f.analysisId)?.fingerprint!==sources.fingerprint)throw new WorldError("These water features use older terrain. Retain the draft and review fresh suggestions.",409);}
  for(const c of layer.catchments??[]){const old=previous.catchments?.find(v=>v.id===c.id);if(JSON.stringify(old)!==JSON.stringify(c)&&layer.analyses.find(a=>a.id===c.analysisId)?.fingerprint!==sources.fingerprint)throw new WorldError("This watershed uses older terrain. Review it again before saving.",409);}
}
export async function saveTerrainHydrology(userId:string,worldId:string,raw:unknown){
  const command=hydroSaveSchema.parse(raw);
  return worldWriteTransaction(userId,worldId,async tx=>{
    const regionalAccess=await beginRegionalEdit(tx,userId,worldId,"water",command);if(regionalAccess.retry)return {revision:regionalAccess.retry.revision,layer:await regionalRetryLayer(tx,"water",regionalAccess.context.sourceMapId,regionalAccess.retry.revision,EMPTY_HYDROLOGY,value=>hydroLayerSchema.parse(value)),regional:command.regional};command.mapId=regionalAccess.context.sourceMapId;
    const sources=await sourceIndex(tx,worldId,command.mapId);if(!await available(tx))throw new WorldError("MIGRATION 0141 REQUIRED before saving waterways. Your draft is retained.",409);
    try{validateHydroFrame(command.layer,sources.world);}catch(e){throw new WorldError((e as Error).message,400);}
    const [original]=await tx.select().from(worldHydrologyVersion).where(eq(worldHydrologyVersion.requestId,command.requestId));
    if(original){if(regionalAccess.context.region)throw new WorldError("This regional request was already used outside its retained scope. Keep the exact original retry.",409);if(original.mapId!==command.mapId||original.worldId!==worldId||original.revision!==command.revision+1||(original.restoredFromRevision??undefined)!==command.restoreRevision||JSON.stringify(hydroLayerSchema.parse(original.layer))!==JSON.stringify(command.layer))throw new WorldError("This water request was already used for different authoring.",409);return {revision:original.revision,layer:hydroLayerSchema.parse(original.layer)};}
    const [head]=await tx.select().from(worldHydrology).where(eq(worldHydrology.mapId,command.mapId)).for("update");
    if((head?.revision??0)!==command.revision)throw new WorldError("Another tab saved newer waterways. Your draft is retained; export it before loading the saved network.",409);
    const acceptedLayer=hydroLayerSchema.parse(head?.layer??EMPTY_HYDROLOGY);if(regionalAccess.context.region){command.layer=boundedRegionalLayer(()=>regionalHydrology(acceptedLayer,command.layer,regionalScope(regionalAccess.context)));if(regionalEqual(acceptedLayer,command.layer)){await finishRegionalEdit(tx,userId,worldId,"water",command,regionalAccess,{revision:command.revision,geographyChanged:false});return {revision:command.revision,layer:command.layer,regional:command.regional};}}
 if(command.restoreRevision!==undefined){const [restored]=await tx.select().from(worldHydrologyVersion).where(and(eq(worldHydrologyVersion.mapId,command.mapId),eq(worldHydrologyVersion.revision,command.restoreRevision)));if(!restored||JSON.stringify(hydroLayerSchema.parse(restored.layer))!==JSON.stringify(command.layer))throw new WorldError("Restore the exact retained water revision before editing it. Your draft is preserved.",400);}
    else {if(((head?.layer as HydroLayer|undefined)?.systemVersion??1)>(command.layer.systemVersion??1))throw new WorldError("This map has connected lake or special-feature authoring. Reload it before editing; an older writer cannot discard its lake relationships.",409);checkProvenance(command.layer,hydroLayerSchema.parse(head?.layer??EMPTY_HYDROLOGY),sources);}
    const revision=command.revision+1;
    await tx.insert(worldHydrology).values({mapId:command.mapId,worldId,revision,layer:command.layer,updatedBy:userId}).onConflictDoUpdate({target:worldHydrology.mapId,set:{revision,layer:command.layer,updatedBy:userId,updatedAt:new Date()}});
    await tx.insert(worldHydrologyVersion).values({mapId:command.mapId,worldId,revision,previousRevision:revision===1?null:revision-1,restoredFromRevision:command.restoreRevision??null,layer:command.layer,requestId:command.requestId,createdBy:userId});
    await finishRegionalEdit(tx,userId,worldId,"water",command,regionalAccess,{revision,geographyChanged:true});return {revision,layer:command.layer,...command.regional?{regional:command.regional}:{}};
  });
}
