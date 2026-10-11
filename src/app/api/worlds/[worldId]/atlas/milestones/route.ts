import { z } from "zod";
import { worldRequest } from "@/features/worlds/http";
import { placeMilestones, savePlaceMilestone } from "@/features/worlds/atlas-milestone-service";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}) {return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;return placeMilestones(userId,(await context.params).worldId,z.string().uuid().parse(q.get("timeline")),z.string().uuid().parse(q.get("place")),q.get("review")==="1",q.get("ordinary")==="1");});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}) {return worldRequest(request,true,async userId=>({id:await savePlaceMilestone(userId,(await context.params).worldId,await request.json())}));}
