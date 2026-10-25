import {worldRequest} from "@/features/worlds/http";
import {getWorldTowns,changeWorldTown} from "@/features/worlds/world-town-service";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {WorldError} from "@/features/worlds/world-service";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;return getWorldTowns(userId,(await context.params).worldId,{review:q.get("review")==="1",ordinary:ordinaryKnowledge(q),townId:q.get("town")??undefined,mapId:q.get("mapId")??undefined});});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>{
  const reader=request.body?.getReader();if(!reader)throw new WorldError("Enter the settlement or placement details.",400);const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>200000){await reader.cancel();throw new WorldError("This settlement request is too large. Your draft is retained.",413);}chunks.push(part.value);}}finally{reader.releaseLock();}
  return changeWorldTown(userId,(await context.params).worldId,JSON.parse(Buffer.concat(chunks).toString("utf8")));
});}
