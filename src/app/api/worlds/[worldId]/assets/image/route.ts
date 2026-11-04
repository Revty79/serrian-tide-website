import {z} from "zod";
import {worldRequest} from "@/features/worlds/http";
import {getAssetImage} from "@/features/worlds/atlas-asset-service";
import {WorldError} from "@/features/worlds/world-service";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;if(q.has("ordinary")||q.has("knowledge"))throw new WorldError("Artwork is unavailable in this preview.",404);const asset=z.string().uuid().parse(q.get("asset")),version=z.coerce.number().int().min(1).max(512).parse(q.get("version")),size=z.enum(["128","768","1536"]).parse(q.get("size")),bytes=await getAssetImage(userId,(await context.params).worldId,asset,version,size,q.get("review")==="1");return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"image/webp","Content-Length":String(bytes.length),"Content-Disposition":"inline; filename=artwork.webp","Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin"}});});}
