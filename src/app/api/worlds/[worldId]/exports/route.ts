import {z} from "zod";
import {worldRequest} from "@/features/worlds/http";
import {exportSourceRequestSchema,exportPinSchema} from "@/features/worlds/atlas-export";
import {prepareAtlasExport,readAtlasExportResource,readAtlasExportTiles,readAtlasExportImage,authorizeAtlasExportDelivery} from "@/features/worlds/atlas-export-source";
import {WorldError} from "@/features/worlds/world-errors";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{
 const q=new URL(request.url).searchParams,worldId=(await context.params).worldId,op=z.enum(["prepare","resource","tiles","image","check"]).parse(q.get("op"));if(request.url.length>12000)throw new WorldError("This export request is too large. Prepare this map again.",413);
 if(op==="prepare")return Response.json(await prepareAtlasExport(userId,worldId,exportSourceRequestSchema.parse(JSON.parse(q.get("source")??"null"))));
 const pin=exportPinSchema.parse(JSON.parse(q.get("pin")??"null"));
 if(op==="check")return Response.json(await authorizeAtlasExportDelivery(userId,worldId,pin));
 if(op==="image"){const bytes=await readAtlasExportImage(userId,worldId,pin,z.uuid().parse(q.get("asset")),z.coerce.number().int().min(1).max(512).parse(q.get("version")));return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"image/webp","Content-Disposition":"inline; filename=map-artwork.webp","Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin"}});}
 const key=z.string().regex(/^[a-z0-9:-]+$/).max(160).parse(q.get("key"));return Response.json(op==="resource"?await readAtlasExportResource(userId,worldId,pin,key):await readAtlasExportTiles(userId,worldId,pin,key,JSON.parse(q.get("indexes")??"null")));
 });}
