import {assertTerrainRequestMap} from "@/features/worlds/terrain-http";
import {worldRequest} from "@/features/worlds/http";
import {WorldError} from "@/features/worlds/world-service";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {getHydrologySources,getTerrainHydrology,saveTerrainHydrology} from "@/features/worlds/terrain-hydrology-service";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){
  return worldRequest(request,false,async id=>{const q=new URL(request.url).searchParams,revision=q.has("waterRevision")?Number(q.get("waterRevision")):undefined;if(revision!==undefined&&(!Number.isInteger(revision)||revision<1))throw new WorldError("Choose a valid accepted water revision.",400);const worldId=(await context.params).worldId,options={review:q.get("review")==="1",ordinary:ordinaryKnowledge(q)};return q.get("sources")==="1"?getHydrologySources(id,worldId,q.get("terrainMap")??"",options):getTerrainHydrology(id,worldId,q.get("terrainMap")??"",{...options,revision});});
}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){
  return worldRequest(request,true,async id=>{const reader=request.body?.getReader();if(!reader)throw new WorldError("Provide a water network.",400);const chunks:Uint8Array[]=[];let length=0;try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>8*1024*1024){await reader.cancel();throw new WorldError("The water draft exceeds its 8 MiB request budget. Export it before reducing the network.",413);}chunks.push(next.value);}}finally{reader.releaseLock();}return saveTerrainHydrology(id,(await context.params).worldId,assertTerrainRequestMap(request,JSON.parse(Buffer.concat(chunks).toString("utf8"))));});
}
