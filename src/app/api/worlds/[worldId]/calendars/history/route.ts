import { worldRequest } from "@/features/worlds/http";
import { changeCalendarEvolution } from "@/features/worlds/calendar-evolution-service";
import { calendarHistory } from "@/features/worlds/calendar-history-service";
import { z } from "zod";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;return calendarHistory(userId,(await context.params).worldId,z.string().uuid().parse(q.get("timeline")),{versionId:q.get("version"),offset:q.has("offset")?z.coerce.number().parse(q.get("offset")):0,includeArchived:q.get("archived")==="1"},q.get("review")==="1",q.get("ordinary")==="1");});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>({id:await changeCalendarEvolution(userId,(await context.params).worldId,await request.json())}));}
