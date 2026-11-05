import {worldRequest} from "@/features/worlds/http";
import {ordinaryKnowledge,readOnlyPreview} from "@/features/worlds/knowledge-preview";
import {getAdvancedTerrainContext} from "@/features/worlds/terrain-advanced-service";
import {z} from "zod";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){
  return worldRequest(request,false,async userId=>{
    const q=new URL(request.url).searchParams,mapId=z.uuid().parse(q.get("terrainMap"));
    return getAdvancedTerrainContext(userId,(await context.params).worldId,mapId,q.get("source")??undefined,{ordinary:ordinaryKnowledge(q),review:readOnlyPreview(q)});
  });
}
