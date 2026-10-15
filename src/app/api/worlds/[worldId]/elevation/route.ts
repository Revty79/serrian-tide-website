import {z} from "zod";
import {worldRequest} from "@/features/worlds/http";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {boundsSchema,geoId} from "@/features/worlds/geographic";
import {changeRaster,rasterViewport,rasterSample,rasterTile} from "@/features/worlds/raster-service";
export const dynamic="force-dynamic";
type Context={params:Promise<{worldId:string}>};
export async function GET(request:Request,c:Context){return worldRequest(request,false,async user=>{const world=(await c.params).worldId,q=new URL(request.url).searchParams,timeline=geoId.parse(q.get("timeline")),map=geoId.parse(q.get("map")),options={ordinary:ordinaryKnowledge(q),review:q.get("review")==="1",preview:q.get("preview")==="1"},version=q.has("version")?geoId.parse(q.get("version")):undefined;
  if(q.has("tile")){const bytes=await rasterTile(user,world,timeline,map,geoId.parse(version),q.get("tile")!,z.string().regex(/^[a-f0-9]{64}$/).parse(q.get("stamp")),options);return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"image/webp","Content-Length":String(bytes.length)}});}
  if(q.has("x"))return rasterSample(user,world,timeline,map,geoId.parse(version),z.coerce.number().finite().parse(q.get("x")),z.coerce.number().finite().parse(q.get("y")),options);
  return rasterViewport(user,world,timeline,map,q.has("bounds")?boundsSchema.parse(JSON.parse(q.get("bounds")!)):undefined,options,q.get("style")??undefined,version,q.has("projection")?z.enum(["equirectangular","mercator","planar"]).parse(q.get("projection")):undefined);
});}
export async function POST(request:Request,c:Context){return worldRequest(request,true,async user=>{const text=await request.text();if(Buffer.byteLength(text)>16000)throw new Error("Elevation preferences are too large.");const q=new URL(request.url).searchParams;return changeRaster(user,(await c.params).worldId,JSON.parse(text),{ordinary:ordinaryKnowledge(q),review:q.get("review")==="1"});});}
