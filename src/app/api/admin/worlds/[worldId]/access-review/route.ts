import { worldRequest } from "@/features/worlds/http";
import { recordAdministratorWorldReview } from "@/features/worlds/world-collaboration-service";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>recordAdministratorWorldReview(userId,(await context.params).worldId,await request.json()));}
