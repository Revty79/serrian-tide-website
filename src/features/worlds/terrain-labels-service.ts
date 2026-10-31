import "server-only";
import {and,desc,eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldLabels,worldLabelsVersion} from "@/db/world-labels-schema";
import {WorldError,worldReadAccess,worldWriteTransaction} from "./world-service";
import {requireAppearanceMap} from "./terrain-appearance-service";
import {worldMapCanvas,worldTerrain} from "@/db/world-terrain-schema";
import {labelsLayerSchema,labelsSaveSchema,EMPTY_LABELS,validateLabelsFrame,LABEL_LIMITS,labelSourceKey,sourceLabelState,type LabelsLayer} from "./terrain-labels";
import {labelSourceCatalog} from "./terrain-labels-sources";
import {beginRegionalEdit,boundedRegionalLayer,finishRegionalEdit,regionalAuthoringContext,regionalScope,regionalRetryLayer} from "./terrain-regional-authoring-service";
import {regionalLabels} from "./terrain-regional-layers";
import {regionalEqual} from "./terrain-regional-scope";

type Connection=Pick<typeof db,"select"|"execute">;
async function available(tx:Connection){return !!(await tx.execute<{present:boolean}>(sql`select to_regclass('public.world_labels') is not null and to_regclass('public.world_labels_version') is not null as present`)).rows[0].present;}
function localPresentation(shared:LabelsLayer,local:LabelsLayer){return {...shared,visible:local.visible,suggestions:local.suggestions,composition:local.composition};}

export async function getTerrainLabels(userId:string,worldId:string,mapId:string,options:{review?:boolean;ordinary?:boolean;revision?:number;suggestions?:boolean}={}){
 await worldReadAccess(userId,worldId,options.review??false);
 if(options.ordinary)throw new WorldError("This labels map is unavailable.",404);
 return db.transaction(async tx=>{
  const context=await regionalAuthoringContext(tx,worldId,mapId);mapId=context.sourceMapId;
  await requireAppearanceMap(tx,worldId,mapId);
  if(!await available(tx))return {available:false,revision:0,headRevision:0,layer:EMPTY_LABELS,history:[],candidates:[],candidateCount:0,sourceStates:[]};
  const [head]=await tx.select().from(worldLabels).where(eq(worldLabels.mapId,mapId));
  let layer=head?.layer,revision=head?.revision??0;
  if(options.revision!==undefined){
   const [old]=await tx.select().from(worldLabelsVersion).where(and(eq(worldLabelsVersion.mapId,mapId),eq(worldLabelsVersion.revision,options.revision)));
   if(!old)throw new WorldError("This accepted labels revision is unavailable.",404);layer=old.layer;revision=old.revision;
  }
  const history=await tx.select({revision:worldLabelsVersion.revision,createdAt:worldLabelsVersion.createdAt,restoredFromRevision:worldLabelsVersion.restoredFromRevision}).from(worldLabelsVersion).where(eq(worldLabelsVersion.mapId,mapId)).orderBy(desc(worldLabelsVersion.revision)).limit(60);
  let accepted=labelsLayerSchema.parse(layer??EMPTY_LABELS),compositionRevision=0;
  if(context.region){const [local]=await tx.select().from(worldLabels).where(eq(worldLabels.mapId,context.region.mapId));compositionRevision=local?.revision??0;accepted=localPresentation(accepted,labelsLayerSchema.parse(local?.layer??EMPTY_LABELS));}
  const catalog=options.suggestions||accepted.labels.some(label=>label.source)?await labelSourceCatalog(tx,worldId,mapId):new Map();
  return {...context.regional?{regional:{...context.regional,compositionRevision}}:{},available:true,revision,headRevision:head?.revision??0,layer:accepted,history,candidates:options.suggestions?[...catalog.values()].slice(0,LABEL_LIMITS.candidates):[],candidateCount:catalog.size,sourceStates:accepted.labels.map(label=>sourceLabelState(label,catalog)).filter(state=>state!==null)};
 },{accessMode:"read only",isolationLevel:"repeatable read"});
}

export async function saveTerrainLabels(userId:string,worldId:string,raw:unknown){
 const command=labelsSaveSchema.parse(raw);
 return worldWriteTransaction(userId,worldId,async tx=>{
  const access=await beginRegionalEdit(tx,userId,worldId,"labels",command);
  if(access.retry){const shared=await regionalRetryLayer(tx,"labels",access.context.sourceMapId,access.retry.revision,EMPTY_LABELS,value=>labelsLayerSchema.parse(value)),local=await regionalRetryLayer(tx,"labels",access.context.region!.mapId,access.retry.compositionRevision??0,EMPTY_LABELS,value=>labelsLayerSchema.parse(value));return {revision:access.retry.revision,layer:localPresentation(shared,local),regional:{...command.regional!,compositionRevision:access.retry.compositionRevision??0}};}
  const regional=access.context.region;
  command.mapId=access.context.sourceMapId;await requireAppearanceMap(tx,worldId,command.mapId);
  if(!await available(tx))throw new WorldError("MIGRATION 0145 REQUIRED to save labels. Your draft is retained.",409);
  const [used]=await tx.select().from(worldLabelsVersion).where(eq(worldLabelsVersion.requestId,command.requestId));
  if(used){
   if(regional||used.mapId!==command.mapId||used.worldId!==worldId||used.revision!==command.revision+1||(used.restoredFromRevision??undefined)!==command.restoreRevision||!regionalEqual(labelsLayerSchema.parse(used.layer),command.layer))throw new WorldError("This labels request was already used for different work. Keep the original retry.",409);
   return {revision:used.revision,layer:labelsLayerSchema.parse(used.layer)};
  }
  const [head]=await tx.select().from(worldLabels).where(eq(worldLabels.mapId,command.mapId)).for("update");
  if((head?.revision??0)!==command.revision)throw new WorldError("Another tab saved newer labels. Your draft is retained; export it before loading the saved layer.",409);
  const accepted=labelsLayerSchema.parse(head?.layer??EMPTY_LABELS);
  let layer=command.layer,localRevision=0,compositionChanged=false;
  if(regional){
   const [local]=await tx.select().from(worldLabels).where(eq(worldLabels.mapId,regional.mapId)).for("update");localRevision=local?.revision??0;
   if(command.regional?.compositionRevision!==localRevision)throw new WorldError("The regional map layout changed in another tab. Your label and composition draft is retained; review the saved regional layout before accepting it.",409);
   layer=boundedRegionalLayer(()=>regionalLabels(accepted,command.layer,regionalScope(access.context)));
   const presentation:LabelsLayer={...EMPTY_LABELS,visible:command.layer.visible,suggestions:command.layer.suggestions,composition:command.layer.composition};
   compositionChanged=!regionalEqual(labelsLayerSchema.parse(local?.layer??EMPTY_LABELS),presentation);
   if(compositionChanged){
    localRevision++;
    await tx.insert(worldLabels).values({mapId:regional.mapId,worldId,revision:localRevision,layer:presentation,updatedBy:userId}).onConflictDoUpdate({target:worldLabels.mapId,set:{revision:localRevision,layer:presentation,updatedBy:userId,updatedAt:new Date()}});
    // Public requests are UUIDs; this stable internal identity cannot collide with them.
    await tx.insert(worldLabelsVersion).values({mapId:regional.mapId,worldId,revision:localRevision,previousRevision:localRevision===1?null:localRevision-1,restoredFromRevision:null,layer:presentation,requestId:"regional-composition/"+command.requestId,createdBy:userId});
   }
  }
  if(command.restoreRevision!==undefined){
   const [old]=await tx.select().from(worldLabelsVersion).where(and(eq(worldLabelsVersion.mapId,command.mapId),eq(worldLabelsVersion.revision,command.restoreRevision)));
   if(!old||!regionalEqual(labelsLayerSchema.parse(old.layer),layer))throw new WorldError("Restore the exact retained labels before making further edits.",400);
  }else{
   const [map]=await tx.select({width:worldTerrain.widthMetres,height:worldTerrain.heightMetres,wrap:worldTerrain.wrap}).from(worldMapCanvas).innerJoin(worldTerrain,eq(worldTerrain.id,worldMapCanvas.terrainId)).where(eq(worldMapCanvas.mapId,command.mapId));
   boundedRegionalLayer(()=>validateLabelsFrame(layer,map));
  }
  if(command.restoreRevision===undefined&&layer.labels.some(label=>label.source)){
   const catalog=await labelSourceCatalog(tx,worldId,command.mapId),previous=new Map(accepted.labels.map(label=>[label.id,label]));
   for(const label of layer.labels){if(!label.source)continue;const retained=previous.get(label.id)?.source;if(retained&&regionalEqual(retained,label.source))continue;const candidate=catalog.get(labelSourceKey(label.source));if(!candidate||candidate.source.mapId!==command.mapId||!regionalEqual(candidate.source,label.source))throw new WorldError("This named label source changed or is unavailable. Keep the draft and refresh suggestions before accepting that association.",409);}
  }
  const geographyChanged=!regional||!regionalEqual(accepted,layer),revision=command.revision+(geographyChanged?1:0);
  if(geographyChanged){
   await tx.insert(worldLabels).values({mapId:command.mapId,worldId,revision,layer,updatedBy:userId}).onConflictDoUpdate({target:worldLabels.mapId,set:{revision,layer,updatedBy:userId,updatedAt:new Date()}});
   await tx.insert(worldLabelsVersion).values({mapId:command.mapId,worldId,revision,previousRevision:revision===1?null:revision-1,restoredFromRevision:command.restoreRevision??null,layer,requestId:command.requestId,createdBy:userId});
  }
  await finishRegionalEdit(tx,userId,worldId,"labels",command,access,{revision,geographyChanged,...regional?{compositionRevision:localRevision,compositionChanged}:{}});
  return {revision,layer:regional?localPresentation(layer,command.layer):layer,...command.regional?{regional:{...command.regional,compositionRevision:localRevision}}:{}};
 });
}
