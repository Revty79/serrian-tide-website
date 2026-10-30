import {assertTerrainRequestMap} from "@/features/worlds/terrain-http";
import {worldRequest} from "@/features/worlds/http";
import {getMapStyles,saveMapStyle} from "@/features/worlds/terrain-style-service";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {WorldError} from "@/features/worlds/world-service";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;return getMapStyles(userId,(await context.params).worldId,q.get("terrainMap")??"",{review:q.get("review")==="1",ordinary:ordinaryKnowledge(q)});});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>{
 const reader=request.body?.getReader();if(!reader)throw new WorldError("Choose a named style.",400);const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>8192){await reader.cancel();throw new WorldError("The style request is too large.",413);}chunks.push(next.value);}}finally{reader.releaseLock();}
 return saveMapStyle(userId,(await context.params).worldId,assertTerrainRequestMap(request,JSON.parse(Buffer.concat(chunks).toString("utf8"))));
});}
