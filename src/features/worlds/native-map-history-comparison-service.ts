import {worldScopeAllowed,worldProtectedContent} from "./world-access-service";
import {projectWorldContent} from "./world-content-projection";
import {projectWorldPinnedContent} from "./world-pinned-content";
import {redactUnderground,undergroundDesignSchema} from "./underground";
import type {WorldPermission} from "./world-permissions";
import { worldScopes,nativeWorldScope } from "./world-permissions";
import "server-only";
import {eq} from "drizzle-orm";
import {db} from "@/db";
import {world} from "@/db/world-schema";
import {worldReadAccess,WorldError} from "./world-service";
import {selectedTimeline} from "./history-version-service";
import {nativeCompareSchema,type NativeCompareSelection,type NativeComparedSource,type NativeMapComparison} from "./native-map-history-comparison";
import {nativeChoices,loadNativeVersion,nativeContentHash,nativeComponentRevision,type NativeHistoryTx} from "./native-map-history-store";
import {nativeContentContext,nativeResource,type NativeContentContext} from "./native-map-history-context";
import {resolveNativeHistory,nativeObjectPresent,NATIVE_HISTORY_LIMITS,type NativeMapTarget} from "./native-map-history";
import {nativeTargetInfo} from "./native-map-history-target";
import {captureNativeBaseline,type NativeNumericPin} from "./native-map-history-capture";
import {nativeTerrainSource,type NativeTerrainPayload,type NativeRefinementPayload} from "./native-map-history-terrain-read";
import {sampleNativeTerrain,sampleNativeTerrainPack} from "./native-map-history-sampling";
import {terrainGeometry,type TerrainDocument} from "./terrain";
import {frameGeometry,rootFrame} from "./terrain-refinement";
import {regionContainsPoint} from "./terrain-regions";
import type {RefinementIndex} from "./terrain-refinement-client";
import {nativeConditions} from "./native-map-history-conditions";

type Part={info:NativeComparedSource;components:Map<string,{hash:string;revision:number}>;document?:TerrainDocument;sample?:(points:{x:number;y:number}[])=>ReturnType<typeof sampleNativeTerrain>};
export async function compareNativeMaps(userId:string,worldId:string,input:unknown,options:{review?:boolean;ordinary?:boolean}={}):Promise<NativeMapComparison>{
  const command=nativeCompareSchema.parse(input);
  const access=await worldReadAccess(userId,worldId,!!options.review,["history","appearances",nativeWorldScope(command.target.kind)]);if(options.ordinary)throw new WorldError("This historical comparison is unavailable.",404);
  return db.transaction(async tx=>{
    // Baseline capture calls established read services. All map writers take
    // the exclusive World lock, so their independent read transactions observe
    // one accepted source while this read-only operation holds its share lock.
    await tx.select({id:world.id}).from(world).where(eq(world.id,worldId)).for("share");
    const part=(selection:NativeCompareSelection)=>readPart(tx,userId,worldId,command.target,selection,{ownerId:access.ownerId,archived:!!access.archivedAt,review:!!options.review,ordinary:false,permission:access.permission});
    const left=await part(command.left),right=await part(command.right),unknown=left.info.coverage==="unknown"||right.info.coverage==="unknown";
    const keys=[...new Set([...left.components.keys(),...right.components.keys()])].sort((a,b)=>Number(left.components.get(a)?.hash===right.components.get(a)?.hash)-Number(left.components.get(b)?.hash===right.components.get(b)?.hash)||a.localeCompare(b));
    const components=keys.slice(0,NATIVE_HISTORY_LIMITS.comparisonChanges).map(key=>{
      const a=left.components.get(key),b=right.components.get(key);
      return {key,left:a,right:b,status:unknown?"unknown coverage" as const:!a||!b?"not retained on one side" as const:a.hash===b.hash?"same retained component" as const:"different retained component" as const};
    });
    let numeric:NativeMapComparison["numeric"]={points:[],reason:unknown?"One selection has unknown coverage; no baseline or unchanged terrain was inferred.":"This map family has no numerical World terrain samples."};
    if(!unknown&&left.document&&right.document&&left.sample&&right.sample){
      const a=terrainGeometry(left.document.settings),b=terrainGeometry(right.document.settings),width=Math.min(a.displayWidth,b.displayWidth),height=Math.min(a.displayHeight,b.displayHeight);
      const frame=left.document.region?.frame??right.document.region?.frame??{x:0,y:0,width,height};
      const points=Array.from({length:64},(_,i)=>({x:frame.x+(i%8)/7*frame.width,y:frame.y+Math.floor(i/8)/7*frame.height})).filter(point=>point.x>=0&&point.x<=width&&point.y>=0&&point.y<=height&&(!left.document!.region||regionContainsPoint(left.document!.region,point,a))&&(!right.document!.region||regionContainsPoint(right.document!.region,point,b)));
      if(points.length){const l=await left.sample(points),r=await right.sample(points);numeric={points:points.map((point,i)=>({...point,left:l.points[i].elevation,right:r.points[i].elevation,difference:r.points[i].elevation-l.points[i].elevation}))};}
      else numeric={points:[],reason:"The selected geographic outlines have no shared points on this bounded comparison grid."};
    }
    return {left:left.info,right:right.info,components,totalComponents:keys.length,truncated:keys.length>components.length,numeric,readOnly:true};
  });
}
async function readPart(tx:NativeHistoryTx,userId:string,worldId:string,target:NativeMapTarget,selection:NativeCompareSelection,permissions:Parameters<typeof nativeContentContext>[4]&{permission?:WorldPermission}):Promise<Part>{
  const timeline=await selectedTimeline(tx,worldId,selection.timelineId),info=await nativeTargetInfo(tx,worldId,target),components=new Map<string,{hash:string;revision:number}>();
  const href=(year?:number,stateId?:string,versionId?:string,geographyVersionId?:string)=>{
    const query=new URLSearchParams({tab:"atlas",timeline:timeline.id,atlasTimeline:timeline.id,[{terrain:"terrainMap",town:"townMap",floor:"interiorFloor",underground:"undergroundLevel",craft:"craft",deck:"craftDeck"}[target.kind]]:target.id});
    if(target.kind==="deck"&&info.craftId)query.set("craft",info.craftId);if(year!==undefined)query.set("atlasYear",String(year));if(stateId)query.set("atlasState",stateId);if(versionId)query.set("atlasVersion",versionId);if(geographyVersionId)query.set("atlasGeographyVersion",geographyVersionId);if(permissions.review)query.set("review","1");return `/worlds/${worldId}?${query}`;
  };
  if("baseline"in selection){
    if(info.baselineAvailable===false)throw new WorldError("This map was introduced by a dated appearance and has no current baseline. Compare its retained historical sources.",409);
    const captured=await captureNativeBaseline(tx,userId,worldId,info,{review:permissions.review}),resources=new Map(captured.resources.map(resource=>[resource.key,resource]));
    for(const resource of captured.resources){const payload=await comparedPayload(tx,worldId,timeline.id,resource.key,resource.payload,permissions.permission);if(payload)components.set(resource.key,{hash:nativeContentHash(payload),revision:nativeComponentRevision(payload)});}
    const result:Part={info:{label:`Current baseline: ${info.name}`,timelineName:timeline.name,coverage:"current-reference",baselinePin:captured.pin,href:href()},components};
    if(target.kind==="terrain"){
      const source=resources.get("terrain")!.payload as NativeTerrainPayload,document=source.bundle.document,shape=terrainGeometry(document.settings),index=(resources.get("refinements")!.payload as {index:RefinementIndex}).index;
      result.document=document;result.sample=points=>sampleNativeTerrainPack({document,shape},index,async(id,revision)=>{
        const saved=resources.get(`source:${id}:${revision}`);if(saved)return saved.payload as NativeNumericPin;
        if(id===document.terrainId&&revision===document.revision)return {id,revision,parentId:null,parentRevision:null,shape,frame:rootFrame(shape),baseElevation:document.baseElevation,tileObjects:source.tileObjects};
        const refinement=resources.get("refinement:"+id)?.payload as NativeRefinementPayload|undefined;
        if(!refinement||refinement.meta.revision!==revision)throw new WorldError("This baseline comparison is missing an exact numerical parent pack.",409);
        return {id,revision,parentId:refinement.meta.parentId??document.terrainId,parentRevision:refinement.meta.parentRevision,shape:frameGeometry(refinement.meta,shape),frame:refinement.meta.frame,baseElevation:document.baseElevation,tileObjects:refinement.tileObjects.filter(object=>(object.lod??0)===0)};
      },points);
    }
    return result;
  }
  const states=await nativeChoices(tx,worldId,timeline.id,target),state=selection.stateId?states.find(state=>state.id===selection.stateId):resolveNativeHistory(states,target,selection.year!);
  if(!state)return {info:{label:`Year ${selection.year}: unknown`,timelineName:timeline.name,year:selection.year,coverage:"unknown",reason:"No accepted appearance establishes this date in this timeline."},components};
  const saved=selection.versionId?await loadNativeVersion(tx,worldId,selection.versionId,target):undefined,year=selection.year??saved?.startYear??state.startYear;
  let context:NativeContentContext;
  try{context=await nativeContentContext(tx,userId,worldId,{timelineId:timeline.id,target,stateId:state.id,year,edit:false,versionId:selection.versionId},permissions);}
  catch(error){if(error instanceof WorldError&&error.status===409&&error.message.startsWith("Historical World geography is unknown"))return {info:{label:state.name,timelineName:timeline.name,year,coverage:"unknown",reason:error.message},components};throw error;}
  for(const resource of context.manifest.resources){const component=await nativeResource(tx,context,resource.key),payload=await comparedPayload(tx,worldId,timeline.id,resource.key,component.payload,permissions.permission);if(payload)components.set(resource.key,{hash:payload===component.payload?component.contentHash:nativeContentHash(payload),revision:component.revision});}
  const conditions=(await nativeConditions(tx,context)).values,condition=conditions.find(value=>value.id===target.id)?.condition;
  const result:Part={info:{label:state.name,timelineName:timeline.name,year,coverage:condition==="unknown"||context.version.archived||year<context.version.startYear!||year>context.version.endYear!?"unknown":"established",versionId:context.version.id,geographyVersionId:context.authority?.version.id,condition,retainedDesignReference:!nativeObjectPresent(conditions,target.id),href:href(year,state.id,context.version.id,context.authority?.version.id)},components};
  if(target.kind==="terrain"){result.document=(await nativeTerrainSource(tx,context)).document;result.sample=points=>sampleNativeTerrain(tx,context,points);}
  return result;
}

async function comparedPayload(tx:NativeHistoryTx,worldId:string,timelineId:string,key:string,value:Record<string,unknown>,permission?:WorldPermission){
 const scope=key==="places"?"settlements":key==="craft-positions"||key==="craft-context"?"craft":key==="composition"?"assets":key==="territories"?"politics":key==="connections"||key.startsWith("connection:")?"underground":undefined;
 if(scope&&!worldScopeAllowed(worldId,scope))return;
 if(worldProtectedContent(worldId)&&(!permission||worldScopes.every(scope=>permission.scopes.includes(scope))))return value;
 let payload=structuredClone(value);
 if(key==="underground"){const bundle=payload.bundle as {document?:{design:unknown}}|undefined;if(bundle?.document)bundle.document.design=redactUnderground(undergroundDesignSchema.parse(bundle.document.design));}
 payload=await projectWorldPinnedContent(payload,worldId,timelineId,tx);return permission?projectWorldContent(payload,permission):payload;
}
