import {worldRequest} from "@/features/worlds/http";
import {readOnlyPreview} from "@/features/worlds/knowledge-preview";
import {geographicGenerationContext,saveGeographicGeneration} from "@/features/worlds/geographic-generation-service";
import {WorldError} from "@/features/worlds/world-service";
export const dynamic="force-dynamic";
function query(request:Request){const q=new URL(request.url).searchParams;if(readOnlyPreview(q)||q.has("year")||q.has("state"))throw new WorldError("Geographic generation is unavailable in read-only or historical contexts.",403);return q;}
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const q=query(request);return geographicGenerationContext(userId,(await context.params).worldId,{mapId:q.get("map"),timelineId:q.get("timeline")});});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>{query(request);if(Number(request.headers.get("content-length"))>64000)throw new WorldError("A generation request supports 64,000 bytes.",413);const text=await request.text();if(new TextEncoder().encode(text).byteLength>64000)throw new WorldError("A generation request supports 64,000 bytes.",413);return saveGeographicGeneration(userId,(await context.params).worldId,JSON.parse(text));});}
