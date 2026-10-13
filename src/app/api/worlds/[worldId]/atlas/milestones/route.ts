import { z } from "zod";
import { worldRequest } from "@/features/worlds/http";
import { WorldError } from "@/features/worlds/world-service";
import { ordinaryKnowledge, readOnlyPreview } from "@/features/worlds/knowledge-preview";
import { placeMilestones, savePlaceMilestone } from "@/features/worlds/atlas-milestone-service";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}) {return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;return placeMilestones(userId,(await context.params).worldId,z.string().uuid().parse(q.get("timeline")),z.string().uuid().parse(q.get("place")),q.get("review")==="1",ordinaryKnowledge(q));});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}) {return worldRequest(request,true,async userId=>{if(readOnlyPreview(new URL(request.url).searchParams))throw new WorldError("This preview is read-only.",403);return {id:await savePlaceMilestone(userId,(await context.params).worldId,await request.json())};});}
