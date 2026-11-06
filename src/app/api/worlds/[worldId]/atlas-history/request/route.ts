import { worldRequest } from "@/features/worlds/http";
import { nativeOriginalRequestScope } from "@/features/worlds/native-map-history-request-service";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){
  return worldRequest(request,false,async userId=>nativeOriginalRequestScope(userId,(await context.params).worldId,new URL(request.url).searchParams.get("request")??""));
}
