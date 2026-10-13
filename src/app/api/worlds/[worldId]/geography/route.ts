import { z } from "zod";
import { worldRequest } from "@/features/worlds/http";
import { ordinaryKnowledge } from "@/features/worlds/knowledge-preview";
import { boundsSchema,geoId } from "@/features/worlds/geographic";
import { changeGeography,geographicCatalog,geographicReading,geographicViewport } from "@/features/worlds/geographic-service";
import { WorldError,worldReadAccess } from "@/features/worlds/world-service";
import { geographicSample } from "@/features/worlds/geographic-samples";
export const dynamic="force-dynamic";
type Context={params:Promise<{worldId:string}>};
export async function GET(request:Request,context:Context){return worldRequest(request,false,async userId=>{
  const worldId=(await context.params).worldId,q=new URL(request.url).searchParams,options={review:q.get("review")==="1",ordinary:ordinaryKnowledge(q)};
  if(q.has("sample")){await worldReadAccess(userId,worldId,options.review);if(options.ordinary||options.review)throw new WorldError("Source importing is available in owner author mode.",403);return geographicSample(z.enum(["earth","fictional"]).parse(q.get("sample")));}
  const timelineId=geoId.parse(q.get("timeline"));
  if(!q.has("map"))return geographicCatalog(userId,worldId,timelineId,options,Number(q.get("offset")??0));
  const mapId=geoId.parse(q.get("map"));
  if(q.has("feature"))return geographicReading(userId,worldId,timelineId,mapId,geoId.parse(q.get("feature")),q.has("version")?geoId.parse(q.get("version")):undefined,options);
  const bounds=q.has("bounds")?boundsSchema.parse(JSON.parse(q.get("bounds")!)):undefined,projection=q.has("projection")?z.enum(["equirectangular","mercator","planar"]).parse(q.get("projection")):undefined,lod=z.enum(["overview","regional","detail"]).parse(q.get("lod")??"overview");
  return geographicViewport(userId,worldId,timelineId,mapId,bounds,projection,lod,options,q.get("cursor")??"");
});}
export async function POST(request:Request,context:Context){return worldRequest(request,true,async userId=>{
  if(Number(request.headers.get("content-length"))>8_000_000)throw new WorldError("Geographic imports are limited to eight megabytes per atomic batch.",413);
  const text=await request.text();if(Buffer.byteLength(text,"utf8")>8_000_000)throw new WorldError("Geographic imports are limited to eight megabytes per atomic batch.",413);
  return changeGeography(userId,(await context.params).worldId,JSON.parse(text));
});}
