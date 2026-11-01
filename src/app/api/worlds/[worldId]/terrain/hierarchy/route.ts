import {worldRequest} from "@/features/worlds/http";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {readTerrainRequest} from "@/features/worlds/terrain-http";
import {getRegionHierarchy,moveRegionHierarchy} from "@/features/worlds/terrain-region-hierarchy-service";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;return getRegionHierarchy(userId,(await context.params).worldId,{review:q.get("review")==="1",ordinary:ordinaryKnowledge(q)});});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>moveRegionHierarchy(userId,(await context.params).worldId,await readTerrainRequest(request)));}
