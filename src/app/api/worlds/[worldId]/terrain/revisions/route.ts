import {worldRequest} from "@/features/worlds/http";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {getTerrainRevisions} from "@/features/worlds/terrain-revisions-service";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const query=new URL(request.url).searchParams;return getTerrainRevisions(userId,(await context.params).worldId,query.get("terrainMap")??"",{review:query.get("review")==="1",ordinary:ordinaryKnowledge(query)});});}
