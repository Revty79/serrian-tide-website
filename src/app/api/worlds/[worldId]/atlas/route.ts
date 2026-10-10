import { worldRequest } from "@/features/worlds/http";
import { WorldError } from "@/features/worlds/world-service";
import { changeAtlas, getAtlas } from "@/features/worlds/atlas-service";
export const dynamic="force-dynamic";
type Context={params:Promise<{worldId:string}>};
export async function GET(request:Request,context:Context){return worldRequest(request,false,async userId=>getAtlas(userId,(await context.params).worldId,new URL(request.url).searchParams.get("review")==="1",new URL(request.url).searchParams.get("map")??undefined));}
export async function POST(request:Request,context:Context){return worldRequest(request,true,async userId=>{if(Number(request.headers.get("content-length"))>12_000_000)throw new WorldError("This map request exceeds the twelve-megabyte limit.",413);const body=await request.text();if(Buffer.byteLength(body,"utf8")>12_000_000)throw new WorldError("This map request exceeds the twelve-megabyte limit.",413);return {id:await changeAtlas(userId,(await context.params).worldId,JSON.parse(body))};});}
