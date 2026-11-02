import {worldRequest} from "@/features/worlds/http";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {readTerrainRequest} from "@/features/worlds/terrain-http";
import {getUnderground,changeUnderground,navigateUnderground} from "@/features/worlds/underground-service";
import {undergroundMapSchema} from "@/features/worlds/underground";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams,worldId=(await context.params).worldId,review=q.get("review")==="1",ordinary=ordinaryKnowledge(q);if(q.has("navigate"))return navigateUnderground(userId,worldId,q.get("navigate")!,q.get("reverse")==="1",review,ordinary);return getUnderground(userId,worldId,{levelId:q.get("level")??undefined,map:q.has("map")?undergroundMapSchema.parse(JSON.parse(q.get("map")!)):undefined,review,ordinary});});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>changeUnderground(userId,(await context.params).worldId,await readTerrainRequest(request)));}
