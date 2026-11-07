import { worldRequest } from "@/features/worlds/http";
import { worldMapAccessIndex } from "@/features/worlds/world-map-access-service";
import { z } from "zod";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const query=new URL(request.url).searchParams;return worldMapAccessIndex(userId,(await context.params).worldId,query.get("review")==="1",z.coerce.number().int().min(0).max(10000).parse(query.get("offset")??0));});}
