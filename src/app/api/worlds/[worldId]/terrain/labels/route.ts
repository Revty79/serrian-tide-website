import {assertTerrainRequestMap} from "@/features/worlds/terrain-http";
import {worldRequest} from "@/features/worlds/http";
import {getTerrainLabels,saveTerrainLabels} from "@/features/worlds/terrain-labels-service";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {WorldError} from "@/features/worlds/world-service";
import {LABEL_LIMITS} from "@/features/worlds/terrain-labels";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams,r=q.get("labelsRevision");if(r!==null&&(!/^\d+$/.test(r)||!Number.isSafeInteger(Number(r))||Number(r)<1))throw new WorldError("Choose a positive labels revision.",400);return getTerrainLabels(userId,(await context.params).worldId,q.get("terrainMap")??"",{review:q.get("review")==="1",ordinary:ordinaryKnowledge(q),suggestions:q.get("suggestions")==="1",...r!==null?{revision:Number(r)}:{}});});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>{const reader=request.body?.getReader();if(!reader)throw new WorldError("Choose labels to save.",400);const chunks:Uint8Array[]=[];let size=0;try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>LABEL_LIMITS.bodyBytes){await reader.cancel();throw new WorldError("Labels exceeds the 512 KiB save limit.",413);}chunks.push(next.value);}}finally{reader.releaseLock();}return saveTerrainLabels(userId,(await context.params).worldId,assertTerrainRequestMap(request,JSON.parse(Buffer.concat(chunks).toString("utf8"))));});}
