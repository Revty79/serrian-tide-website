import { worldRequest } from "@/features/worlds/http";
import { personalWorldCanonSource } from "@/features/worlds/world-canon-service";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>personalWorldCanonSource(userId,(await context.params).worldId));}
