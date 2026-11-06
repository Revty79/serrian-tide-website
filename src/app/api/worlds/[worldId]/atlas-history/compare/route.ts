import {worldRequest} from "@/features/worlds/http";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {compareNativeMaps} from "@/features/worlds/native-map-history-comparison-service";
import {WorldError} from "@/features/worlds/world-service";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){
  return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams,raw=q.get("selection");if(!raw||raw.length>12000)throw new WorldError("Choose two bounded explicit map sources.",400);return compareNativeMaps(userId,(await context.params).worldId,JSON.parse(raw),{review:q.get("review")==="1",ordinary:ordinaryKnowledge(q)});});
}
