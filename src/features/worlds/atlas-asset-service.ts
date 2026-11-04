import "server-only";
import {and,desc,eq,inArray,sql} from "drizzle-orm";
import {db} from "@/db";
import {user} from "@/db/auth-schema";
import {worldMapCanvas,worldTerrain} from "@/db/world-terrain-schema";
import {worldAtlasMap,worldGeography} from "@/db/world-atlas-schema";
import {craftAssetFrame} from "./craft-service";
import {assertCraftBudget} from "./craft-budget";
import {buildingFloorEditReason} from "./building-floor-service";
import {worldMapRegion} from "@/db/world-map-region-schema";
import {worldTownMap} from "@/db/world-town-map-schema";
import {worldBuildingFloor,worldBuildingInterior} from "@/db/world-building-floor-schema";
import {worldUndergroundLevel,worldUndergroundSite} from "@/db/world-underground-schema";
import {atlasAsset,atlasAssetVersion,atlasAssetPreference,atlasAssetOperation,atlasComposition,atlasCompositionVersion,atlasAssetUsage} from "@/db/world-asset-schema";
import {WorldError,worldReadAccess,worldWriteTransaction} from "./world-service";
import {ASSET_LIMITS,assetCommandSchema,compositionSchema,emptyComposition,validateComposition,type AssetLibrary,type CompositionTarget,type AssetFrame,type CompositionSaved} from "./atlas-assets";
import {artworkAsset} from "./terrain-artwork-assets";
import {assetDigest,decodeAsset,readAssetObject,stageAssetObjects} from "./atlas-asset-storage";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const unavailable=()=>new WorldError("This artwork or map is unavailable.",404);
export async function assetsAvailable(tx:Pick<Tx,"execute">=db){return !!(await tx.execute<{ok:boolean}>(sql`select to_regclass('public.atlas_asset') is not null and to_regclass('public.atlas_composition') is not null as ok`)).rows[0].ok;}
async function mapFrame(tx:Tx,worldId:string,t:CompositionTarget,writing=false):Promise<AssetFrame>{
 if(t.kind==="craft"||t.kind==="craft-deck")return craftAssetFrame(tx,worldId,t,writing);
 if(t.kind==="terrain"){
  const [m]=await tx.select({width:worldTerrain.widthMetres,height:worldTerrain.heightMetres,wrap:worldTerrain.wrap,archived:worldAtlasMap.archivedAt}).from(worldMapCanvas).innerJoin(worldAtlasMap,eq(worldAtlasMap.id,worldMapCanvas.mapId)).innerJoin(worldTerrain,eq(worldMapCanvas.terrainId,worldTerrain.id)).where(and(eq(worldMapCanvas.mapId,t.id),eq(worldMapCanvas.worldId,worldId)));
  if(!m||writing&&m.archived)throw unavailable();const [r]=await tx.select().from(worldMapRegion).where(eq(worldMapRegion.mapId,t.id));if(writing&&r){const [parent]=await tx.select({archived:worldAtlasMap.archivedAt}).from(worldAtlasMap).where(and(eq(worldAtlasMap.id,r.parentMapId),eq(worldAtlasMap.worldId,worldId)));if(!parent||parent.archived)throw unavailable();}return r?{x:r.x,y:r.y,width:r.width,height:r.height,wrap:m.wrap}:{x:0,y:0,...m};
 }
 if(t.kind==="town"){const [m]=await tx.select().from(worldTownMap).where(and(eq(worldTownMap.id,t.id),eq(worldTownMap.worldId,worldId)));if(!m||writing&&m.archived)throw unavailable();if(writing){const [town]=await tx.select({archived:worldGeography.archivedAt}).from(worldGeography).where(and(eq(worldGeography.id,m.townId),eq(worldGeography.worldId,worldId))),[source]=await tx.select({archived:worldAtlasMap.archivedAt}).from(worldAtlasMap).where(and(eq(worldAtlasMap.id,m.sourceMapId),eq(worldAtlasMap.worldId,worldId)));if(!town||town.archived||!source||source.archived)throw unavailable();}return {x:0,y:0,width:m.frame.width,height:m.frame.height};}
 if(t.kind==="floor"){const [m]=await tx.select({frame:worldBuildingInterior.frame,archived:worldBuildingFloor.archived}).from(worldBuildingFloor).innerJoin(worldBuildingInterior,eq(worldBuildingFloor.buildingId,worldBuildingInterior.id)).where(and(eq(worldBuildingFloor.id,t.id),eq(worldBuildingFloor.worldId,worldId)));if(!m||writing&&m.archived)throw unavailable();if(writing){const [building]=await tx.select({building:worldBuildingInterior}).from(worldBuildingInterior).innerJoin(worldBuildingFloor,eq(worldBuildingFloor.buildingId,worldBuildingInterior.id)).where(and(eq(worldBuildingFloor.id,t.id),eq(worldBuildingFloor.worldId,worldId)));if(!building||await buildingFloorEditReason(tx,building.building))throw unavailable();}return {...m.frame,x:0,y:0};}
 const [m]=await tx.select({frame:worldUndergroundSite.frame,archived:worldUndergroundLevel.archived,siteArchived:worldUndergroundSite.archived}).from(worldUndergroundLevel).innerJoin(worldUndergroundSite,eq(worldUndergroundLevel.siteId,worldUndergroundSite.id)).where(and(eq(worldUndergroundLevel.id,t.id),eq(worldUndergroundLevel.worldId,worldId)));if(!m||writing&&(m.archived||m.siteArchived))throw unavailable();return {...m.frame,x:0,y:0};
}
const targetWhere=(t:CompositionTarget,worldId:string)=>and(eq(atlasComposition.worldId,worldId),eq(atlasComposition.kind,t.kind),eq(atlasComposition.mapId,t.id));
export async function getAssetLibrary(userId:string,worldId:string,review=false):Promise<AssetLibrary>{
 const w=await worldReadAccess(userId,worldId,review);if(!await assetsAvailable())return {available:false,canEdit:false,assets:[],revision:0,favorites:[],recent:[],usedBytes:0};
 return db.transaction(async tx=>{
  const owner=w.ownerId===userId,owned=await tx.select().from(atlasAsset).where(eq(atlasAsset.ownerId,w.ownerId)).orderBy(desc(atlasAsset.createdAt)),allIds=owned.map(a=>a.id);
  const usage=allIds.length?await tx.selectDistinctOn([atlasAssetUsage.assetId,atlasAssetUsage.assetVersion,atlasAssetUsage.kind,atlasAssetUsage.mapId]).from(atlasAssetUsage).where(and(inArray(atlasAssetUsage.assetId,allIds),eq(atlasAssetUsage.worldId,worldId))).orderBy(atlasAssetUsage.assetId,atlasAssetUsage.assetVersion,atlasAssetUsage.kind,atlasAssetUsage.mapId,desc(atlasAssetUsage.revision)):[];
  // Explicit administrator World review exposes only versions referenced by that World, including retained history.
  const allowed=new Set(usage.map(u=>u.assetId+":"+u.assetVersion)),assets=owner?owned:owned.filter(a=>usage.some(u=>u.assetId===a.id)),ids=assets.map(a=>a.id);
  const versions=(ids.length?await tx.select().from(atlasAssetVersion).where(inArray(atlasAssetVersion.assetId,ids)).orderBy(desc(atlasAssetVersion.version)):[]).filter(v=>owner||allowed.has(v.assetId+":"+v.version));
  const [prefs]=owner?await tx.select().from(atlasAssetPreference).where(eq(atlasAssetPreference.ownerId,w.ownerId)):[];
  return {available:true,canEdit:owner&&!review&&!w.archivedAt,assets:assets.map(a=>{const retained=versions.filter(v=>v.assetId===a.id);return {...a,headVersion:owner?a.headVersion:retained[0].version,versions:retained.map(v=>({...v,createdAt:v.createdAt.toISOString()})),usage:usage.filter(u=>u.assetId===a.id).map(u=>({worldId:u.worldId,kind:u.kind,mapId:u.mapId,revision:u.revision}))};}),revision:prefs?.revision??0,favorites:prefs?.favorites??[],recent:prefs?.recent??[],usedBytes:versions.reduce((n,v)=>n+v.objects.reduce((s,o)=>s+o.bytes,0),0)};
 },{accessMode:"read only",isolationLevel:"repeatable read"});
}
export async function getAssetComposition(userId:string,worldId:string,target:CompositionTarget,review=false,revision?:number):Promise<CompositionSaved>{
 await worldReadAccess(userId,worldId,review);return db.transaction(async tx=>{await mapFrame(tx,worldId,target);if(!await assetsAvailable(tx))return {available:false,revision:0,layer:emptyComposition(),history:[]};const [head]=await tx.select().from(atlasComposition).where(targetWhere(target,worldId)),where=and(eq(atlasCompositionVersion.worldId,worldId),eq(atlasCompositionVersion.kind,target.kind),eq(atlasCompositionVersion.mapId,target.id)),[old]=revision?await tx.select().from(atlasCompositionVersion).where(and(where,eq(atlasCompositionVersion.revision,revision))):[];if(revision&&!old)throw unavailable();return {available:true,revision:head?.revision??0,layer:compositionSchema.parse(old?.layer??head?.layer??emptyComposition()),history:(await tx.select({revision:atlasCompositionVersion.revision,createdAt:atlasCompositionVersion.createdAt}).from(atlasCompositionVersion).where(where).orderBy(desc(atlasCompositionVersion.revision)).limit(60)).map(h=>({...h,createdAt:h.createdAt.toISOString()}))};},{accessMode:"read only",isolationLevel:"repeatable read"});
}
export async function changeAtlasAsset(userId:string,worldId:string,raw:unknown,bytes?:Buffer){
 const c=assetCommandSchema.parse(raw);if(c.action==="import"&&!bytes)throw new WorldError("Choose the original image file again to retry this import.",400);if(c.action!=="import"&&bytes)throw new WorldError("This operation does not accept an image.",400);
 const hash=assetDigest(Buffer.from(JSON.stringify(c)+":"+(bytes?assetDigest(bytes):"")));
 return worldWriteTransaction(userId,worldId,async(tx)=>{
  if(!await assetsAvailable(tx))throw new WorldError("Migration 0154 is required for image libraries. Your work is retained.",409);
  // One creator lock covers quotas, request identities and libraries reused across their Worlds.
  await tx.select({id:user.id}).from(user).where(eq(user.id,userId)).for("update");
  const [used]=await tx.select().from(atlasAssetOperation).where(eq(atlasAssetOperation.requestId,c.requestId));if(used){if(used.ownerId!==userId||used.worldId!==worldId||used.inputHash!==hash)throw new WorldError("This request already belongs to different work. Retry the exact retained request.",409);return used.result;}
  let result:{revision:number;version?:number};
  if(c.action==="compose"){
   if((c.target.kind==="craft"||c.target.kind==="craft-deck")&&c.revision>=512)throw new WorldError("This craft surface has reached 512 retained image revisions. Your draft is retained.",413);const frame=await mapFrame(tx,worldId,c.target,true);try{validateComposition(c.layer,frame);}catch(e){throw new WorldError((e as Error).message,400);}const [head]=await tx.select().from(atlasComposition).where(targetWhere(c.target,worldId));if((head?.revision??0)!==c.revision)throw new WorldError("Another tab saved newer image layers. Export your draft before loading saved artwork.",409);
   for(const p of c.layer.placements){if(artworkAsset(p.assetId))continue;const [a]=await tx.select({ownerId:atlasAsset.ownerId,archived:atlasAsset.archived,version:atlasAssetVersion.version}).from(atlasAsset).innerJoin(atlasAssetVersion,and(eq(atlasAssetVersion.assetId,atlasAsset.id),eq(atlasAssetVersion.version,p.version))).where(eq(atlasAsset.id,p.assetId));if(!a||a.ownerId!==userId)throw unavailable();if(a.archived&&!head?.layer.placements.some(old=>old.assetId===p.assetId&&old.version===p.version))throw new WorldError("Restore this archived asset before placing it in another map.",400);}
   const revision=c.revision+1,values={worldId,kind:c.target.kind,mapId:c.target.id,revision,layer:c.layer};await tx.insert(atlasComposition).values(values).onConflictDoUpdate({target:[atlasComposition.worldId,atlasComposition.kind,atlasComposition.mapId],set:{revision,layer:c.layer}});await tx.insert(atlasCompositionVersion).values(values);
   const refs=[...new Map(c.layer.placements.filter(p=>!artworkAsset(p.assetId)).map(p=>[p.assetId+":"+p.version,p])).values()];if(refs.length)await tx.insert(atlasAssetUsage).values(refs.map(p=>({worldId,kind:c.target.kind,mapId:c.target.id,revision,assetId:p.assetId,assetVersion:p.version})));if(c.target.kind==="craft"||c.target.kind==="craft-deck")await assertCraftBudget(tx,worldId);result={revision};
  }else if(c.action==="preferences"){
   const [old]=await tx.select().from(atlasAssetPreference).where(eq(atlasAssetPreference.ownerId,userId));if((old?.revision??0)!==c.revision)throw new WorldError("Your library choices changed in another tab. Load the library before retrying a new choice.",409);
   const ids=[...new Set([...c.favorites,...c.recent].filter(id=>!artworkAsset(id)))],owned=ids.length?await tx.select({id:atlasAsset.id}).from(atlasAsset).where(and(eq(atlasAsset.ownerId,userId),inArray(atlasAsset.id,ids))):[];if(owned.length!==ids.length)throw unavailable();const revision=c.revision+1;await tx.insert(atlasAssetPreference).values({ownerId:userId,revision,favorites:c.favorites,recent:c.recent}).onConflictDoUpdate({target:atlasAssetPreference.ownerId,set:{revision,favorites:c.favorites,recent:c.recent}});result={revision};
  }else{
   const [a]=await tx.select().from(atlasAsset).where(eq(atlasAsset.id,c.assetId));if(a&&a.ownerId!==userId)throw unavailable();if((a?.revision??0)!==c.revision||!a&&c.action!=="import")throw new WorldError("This asset changed in another tab. Your request is retained; load the library to compare.",409);
   if(c.action==="archive"){await tx.update(atlasAsset).set({archived:c.archived,revision:c.revision+1}).where(eq(atlasAsset.id,c.assetId));result={revision:c.revision+1,version:a.headVersion};}
   else{
    if(a?.archived)throw new WorldError("Restore this asset before revising it.",400);const [counts]=await tx.select({n:sql<number>`count(*)::int`,bytes:sql<number>`coalesce(sum((select sum((o->>'bytes')::bigint) from jsonb_array_elements(${atlasAssetVersion.objects}) o)),0)::bigint`}).from(atlasAssetVersion).innerJoin(atlasAsset,eq(atlasAsset.id,atlasAssetVersion.assetId)).where(eq(atlasAsset.ownerId,userId));if(counts.n>=ASSET_LIMITS.versions)throw new WorldError("The creator library has reached 512 retained versions. Existing maps and archived artwork remain safe.",413);
    let data:Omit<typeof atlasAssetVersion.$inferInsert,"assetId"|"version"|"metadata">;
    if(c.action==="import"){if(Number(counts.bytes)+bytes!.length>ASSET_LIMITS.creatorBytes)throw new WorldError("The private library has reached its 256 MiB allowance.",413);const decoded=await decodeAsset(bytes!,c.mime,c.filename),total=decoded.objects.reduce((n,o)=>n+o.data.length,0);if(Number(counts.bytes)+total>ASSET_LIMITS.creatorBytes)throw new WorldError("The image and its previews exceed your 256 MiB library allowance.",413);data={filename:c.filename,format:decoded.format,width:decoded.width,height:decoded.height,bytes:decoded.bytes,objects:await stageAssetObjects(decoded.objects).catch(()=>{throw new WorldError("Private artwork storage is unavailable. Your original image is retained; retry after storage is restored.",503);})};}
    else{const [old]=await tx.select().from(atlasAssetVersion).where(and(eq(atlasAssetVersion.assetId,c.assetId),eq(atlasAssetVersion.version,a.headVersion)));if(!old)throw unavailable();data={filename:old.filename,format:old.format,width:old.width,height:old.height,bytes:old.bytes,objects:old.objects};if(Number(counts.bytes)+old.objects.reduce((n,o)=>n+o.bytes,0)>ASSET_LIMITS.creatorBytes)throw new WorldError("The retained version would exceed the library allowance.",413);}
    const version=(a?.headVersion??0)+1,revision=c.revision+1;await tx.insert(atlasAsset).values({id:c.assetId,ownerId:userId,headVersion:version,revision}).onConflictDoUpdate({target:atlasAsset.id,set:{headVersion:version,revision}});await tx.insert(atlasAssetVersion).values({...data,assetId:c.assetId,version,metadata:c.metadata});result={revision,version};
   }
  }
  await tx.insert(atlasAssetOperation).values({requestId:c.requestId,worldId,ownerId:userId,inputHash:hash,result});return result;
 });
}
export async function getAssetImage(userId:string,worldId:string,assetId:string,version:number,size:string,review=false){
 const w=await worldReadAccess(userId,worldId,review);if(!await assetsAvailable())throw unavailable();const [a]=await db.select({ownerId:atlasAsset.ownerId,objects:atlasAssetVersion.objects}).from(atlasAsset).innerJoin(atlasAssetVersion,and(eq(atlasAssetVersion.assetId,atlasAsset.id),eq(atlasAssetVersion.version,version))).where(eq(atlasAsset.id,assetId));if(!a||a.ownerId!==w.ownerId)throw unavailable();if(w.ownerId!==userId){const [usage]=await db.select({id:atlasAssetUsage.assetId}).from(atlasAssetUsage).where(and(eq(atlasAssetUsage.worldId,worldId),eq(atlasAssetUsage.assetId,assetId),eq(atlasAssetUsage.assetVersion,version))).limit(1);if(!usage)throw unavailable();}const object=a.objects.find(o=>o.type===size&&o.type!=="original");if(!object)throw unavailable();try{return await readAssetObject(object);}catch(error){if(error instanceof WorldError)throw error;throw new WorldError("The private image is unavailable. Restore its paired artwork backup.",503);}
}
