import { worldRequest } from "@/features/worlds/http";
import { WorldError } from "@/features/worlds/world-service";
import { getHistoricalConnections,changeHistoricalConnection } from "@/features/worlds/historical-connection-service";
import { ordinaryKnowledge,readOnlyPreview } from "@/features/worlds/knowledge-preview";
export const dynamic="force-dynamic";
type Context={params:Promise<{worldId:string}>};
export async function GET(request:Request,context:Context){return worldRequest(request,false,userId=>{const p=new URL(request.url).searchParams;return context.params.then(({worldId})=>getHistoricalConnections(userId,worldId,p.get("map")??"",p.get("timeline")??"",{review:p.get("review")==="1",ordinary:ordinaryKnowledge(p),id:p.get("record")??undefined,versionId:p.get("version")??undefined}));});}
export async function POST(request:Request,context:Context){return worldRequest(request,true,async userId=>{if(readOnlyPreview(new URL(request.url).searchParams))throw new WorldError("This preview is read-only.",403);const text=await request.text();if(Buffer.byteLength(text,"utf8")>64000)throw new WorldError("Historical connection requests support 64 kilobytes.",413);return changeHistoricalConnection(userId,(await context.params).worldId,JSON.parse(text));});}
