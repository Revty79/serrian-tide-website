import { worldRequest } from "@/features/worlds/http";
import { changeTimeline } from "@/features/worlds/branching-history-service";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){
  return worldRequest(request,true,async userId=>({id:await changeTimeline(userId,(await context.params).worldId,await request.json())}));
}
