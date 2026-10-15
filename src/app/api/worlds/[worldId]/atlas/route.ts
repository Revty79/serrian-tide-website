import {atlasPreviewBundle} from "@/features/worlds/atlas-preview";
import { worldRequest } from "@/features/worlds/http";
import { WorldError } from "@/features/worlds/world-service";
import { changeAtlas, getAtlas } from "@/features/worlds/atlas-service";
import { ordinaryKnowledge, readOnlyPreview } from "@/features/worlds/knowledge-preview";
export const dynamic="force-dynamic";
type Context={params:Promise<{worldId:string}>};
export async function GET(request:Request,context:Context){return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;const bundle=await getAtlas(userId,(await context.params).worldId,q.get("review")==="1",q.get("map")??undefined,ordinaryKnowledge(q));return q.get("preview")==="1"?{...atlasPreviewBundle(bundle,q.get("map")??""),previewReader:userId}:bundle;});}
export async function POST(request:Request,context:Context){return worldRequest(request,true,async userId=>{if(readOnlyPreview(new URL(request.url).searchParams))throw new WorldError("This preview is read-only.",403);if(Number(request.headers.get("content-length"))>12_000_000)throw new WorldError("This map request exceeds the twelve-megabyte limit.",413);const body=await request.text();if(Buffer.byteLength(body,"utf8")>12_000_000)throw new WorldError("This map request exceeds the twelve-megabyte limit.",413);return {id:await changeAtlas(userId,(await context.params).worldId,JSON.parse(body))};});}
