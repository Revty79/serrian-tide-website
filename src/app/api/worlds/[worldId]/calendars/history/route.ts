import { worldRequest } from "@/features/worlds/http";
import { changeCalendarEvolution } from "@/features/worlds/calendar-evolution-service";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>({id:await changeCalendarEvolution(userId,(await context.params).worldId,await request.json())}));}
