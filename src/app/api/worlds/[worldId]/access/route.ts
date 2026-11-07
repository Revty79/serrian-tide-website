import { z } from "zod";
import { worldRequest } from "@/features/worlds/http";
import { changeWorldCollaboration, getWorldCollaboration, worldAccessAuditHistory } from "@/features/worlds/world-collaboration-service";
export const dynamic="force-dynamic";
type Context={params:Promise<{worldId:string}>};
export async function GET(request:Request,context:Context){return worldRequest(request,false,async userId=>{const {worldId}=await context.params,q=new URL(request.url).searchParams,review=q.get("review")==="1";return q.has("audit")?worldAccessAuditHistory(userId,worldId,review,z.coerce.number().int().min(0).max(10000).parse(q.get("offset")??0)):getWorldCollaboration(userId,worldId,review,q.get("details")==="1");});}
export async function POST(request:Request,context:Context){return worldRequest(request,true,async userId=>changeWorldCollaboration(userId,(await context.params).worldId,await request.json()));}
