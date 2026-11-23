import {worldRequest} from "@/features/worlds/http";
import {ordinaryKnowledge,readOnlyPreview} from "@/features/worlds/knowledge-preview";
import {getSavedTerrainElevations} from "@/features/worlds/terrain-saved-elevations-service";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){
 return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;return getSavedTerrainElevations(userId,(await context.params).worldId,q.get("terrainMap")??"",q.has("revision")?Number(q.get("revision")):undefined,{ordinary:ordinaryKnowledge(q),review:readOnlyPreview(q),...q.has("refinement")?{refinementId:q.get("refinement")!}:{}});});
}
