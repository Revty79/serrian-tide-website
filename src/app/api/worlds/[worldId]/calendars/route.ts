import { worldRequest } from "@/features/worlds/http";
import { getCalendars, changeCalendar } from "@/features/worlds/calendar-service";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>getCalendars(userId,(await context.params).worldId,new URL(request.url).searchParams.get("review")==="1"));}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>({id:await changeCalendar(userId,(await context.params).worldId,await request.json())}));}
