import {z} from "zod";
import {worldRequest} from "@/features/worlds/http";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {boundsSchema,geographicSemanticSchema,geographicThemeSchema,geographicNamespaceSchema,geoId} from "@/features/worlds/geographic";
import {changeGeography,geographicCatalog,geographicReading,geographicViewport,geographicViewportStatus,geographicSourceChoices} from "@/features/worlds/geographic-service";
import {WorldError,worldReadAccess} from "@/features/worlds/world-service";
export const dynamic="force-dynamic";
type Context={params:Promise<{worldId:string}>};
/** Native reference geometry is independent of numerical terrain and dated appearances. */
export async function GET(request:Request,context:Context){return worldRequest(request,false,async userId=>{
 const worldId=(await context.params).worldId,q=new URL(request.url).searchParams,options={review:q.get("review")==="1",ordinary:ordinaryKnowledge(q),...q.has("sourceNamespace")?{sourceNamespace:geographicNamespaceSchema.parse(q.get("sourceNamespace"))}:{}},timelineId=geoId.parse(q.get("timeline"));
 const access=await worldReadAccess(userId,worldId,options.review,"atlas"),owner=access.permission.role==="owner";
 if(!q.has("map")){const value=await geographicCatalog(userId,worldId,timelineId,options,Number(q.get("offset")??0));return {...value,canEdit:value.canEdit&&owner};}
 const mapId=geoId.parse(q.get("map"));
 if(q.get("sourceChoices")==="1")return geographicSourceChoices(userId,worldId,timelineId,mapId,options,q.has("after")?geographicNamespaceSchema.parse(q.get("after")):undefined);
 if(q.has("feature")){const value=await geographicReading(userId,worldId,timelineId,mapId,geoId.parse(q.get("feature")),q.has("version")?geoId.parse(q.get("version")):undefined,options);return {...value,canEdit:value.canEdit&&owner};}
 const bounds=q.has("bounds")?boundsSchema.parse(JSON.parse(q.get("bounds")!)):undefined,projection=q.has("projection")?z.enum(["equirectangular","mercator","planar"]).parse(q.get("projection")):undefined,lod=z.enum(["overview","regional","detail"]).parse(q.get("lod")??"overview"),semantics=q.has("semantics")?z.array(geographicSemanticSchema).max(3).parse(q.get("semantics")?q.get("semantics")!.split(","):[]):undefined,themes=q.has("themes")?z.array(geographicThemeSchema).max(9).parse(q.get("themes")?q.get("themes")!.split(","):[]):undefined;
 if(q.get("check")==="1"){const value=await geographicViewportStatus(userId,worldId,timelineId,mapId,lod,options,semantics,themes);return {...value,canEdit:value.canEdit&&owner};}
 const value=await geographicViewport(userId,worldId,timelineId,mapId,bounds,projection,lod,options,q.get("cursor")??"",semantics,themes);return {...value,canEdit:value.canEdit&&owner};
});}
export async function POST(request:Request,context:Context){return worldRequest(request,true,async userId=>{
 const worldId=(await context.params).worldId;await worldReadAccess(userId,worldId,false,"owner");
 if(Number(request.headers.get("content-length"))>8_000_000)throw new WorldError("Geographic sources are limited to eight megabytes per atomic batch.",413);
 const text=await request.text();if(Buffer.byteLength(text,"utf8")>8_000_000)throw new WorldError("Geographic sources are limited to eight megabytes per atomic batch.",413);
 const q=new URL(request.url).searchParams;
 return changeGeography(userId,worldId,JSON.parse(text),{ordinary:ordinaryKnowledge(q),review:q.get("review")==="1"});
});}
