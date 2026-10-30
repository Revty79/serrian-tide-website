import {worldRequest} from "@/features/worlds/http";
import {readOnlyPreview} from "@/features/worlds/knowledge-preview";
import {readTerrainRequest} from "@/features/worlds/terrain-http";
import {createRegionalMap} from "@/features/worlds/terrain-region-service";
import {WorldError} from "@/features/worlds/world-service";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){
  return worldRequest(request,true,async userId=>{
    if(readOnlyPreview(new URL(request.url).searchParams))throw new WorldError("This preview is read-only.",403);
    return createRegionalMap(userId,(await context.params).worldId,await readTerrainRequest(request));
  });
}
