import { worldRequest } from "@/features/worlds/http";
import { changeHistory } from "@/features/worlds/world-service";
import { z } from "zod";
import { historyEntry, searchHistory } from "@/features/worlds/history-index-service";
import { historyFiltersFromParams } from "@/features/worlds/history-index";
export const dynamic = "force-dynamic";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}) {return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams,worldId=(await context.params).worldId,timeline=z.string().uuid().parse(q.get("timeline"));return q.has("record")?historyEntry(userId,worldId,timeline,z.string().uuid().parse(q.get("record")),q.get("review")==="1",q.get("ordinary")==="1"):searchHistory(userId,worldId,timeline,historyFiltersFromParams(q),q.get("review")==="1",q.get("ordinary")==="1");});}
export async function POST(request: Request, context: { params: Promise<{ worldId: string }> }) { return worldRequest(request, true, async (userId) => ({ id: await changeHistory(userId, (await context.params).worldId, await request.json()) })); }
