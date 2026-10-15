import {worldRequest} from "@/features/worlds/http";
import {authorGeography} from "@/features/worlds/geographic-authoring-service";
import {WorldError} from "@/features/worlds/world-service";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){
 return worldRequest(request,true,async userId=>{const query=new URL(request.url).searchParams;if(query.has("year")||query.has("state"))throw new WorldError("Geographic authoring changes shared baseline sources, not dated map appearances.",403);if(Number(request.headers.get("content-length"))>64000)throw new WorldError("A visual geographic save supports 64,000 request bytes.",413);const text=await request.text();if(new TextEncoder().encode(text).byteLength>64000)throw new WorldError("A visual geographic save supports 64,000 request bytes.",413);return authorGeography(userId,(await context.params).worldId,JSON.parse(text));});
}
