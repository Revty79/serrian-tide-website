import { z } from "zod";
import { worldRequest } from "@/features/worlds/http";
import { WorldError } from "@/features/worlds/world-service";
import { ordinaryKnowledge, readOnlyPreview } from "@/features/worlds/knowledge-preview";
import { getWorldLinks, changeWorldLink } from "@/features/worlds/linking-service";
export const dynamic = "force-dynamic";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}) {
  return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;return getWorldLinks(userId,(await context.params).worldId,z.string().uuid().parse(q.get("timeline")),q.get("review")==="1",ordinaryKnowledge(q));});
}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}) {return worldRequest(request,true,async userId=>{if(readOnlyPreview(new URL(request.url).searchParams))throw new WorldError("This preview is read-only.",403);return {id:await changeWorldLink(userId,(await context.params).worldId,await request.json())};});}
