import { worldRequest } from "@/features/worlds/http";
import { getCalendars, changeCalendar } from "@/features/worlds/calendar-service";
import { z } from "zod";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;return getCalendars(userId,(await context.params).worldId,q.get("review")==="1",q.get("ordinary")==="1",q.has("timeline")?z.string().uuid().parse(q.get("timeline")):undefined);});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>({id:await changeCalendar(userId,(await context.params).worldId,await request.json())}));}
