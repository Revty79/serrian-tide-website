import {z} from "zod";
import {worldRequest} from "@/features/worlds/http";
import {WorldError} from "@/features/worlds/world-errors";
import {readTerrainRequest} from "@/features/worlds/terrain-http";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {sharedReliefCommandSchema} from "@/features/worlds/terrain-shared-relief-spec";
import {previewSharedRelief,changeSharedRelief,getSharedReliefHistory} from "@/features/worlds/terrain-shared-relief-service";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){
 return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;if(ordinaryKnowledge(q))throw new WorldError("This native authoring history is private.",404);return getSharedReliefHistory(userId,(await context.params).worldId,z.uuid().parse(q.get("terrainMap")));});
}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){
 return worldRequest(request,true,async userId=>{
  if(ordinaryKnowledge(new URL(request.url).searchParams))throw new WorldError("This native authoring context is private.",404);
  const command=sharedReliefCommandSchema.parse(await readTerrainRequest(request)),worldId=(await context.params).worldId;
  if(command.action!=="preview")return changeSharedRelief(userId,worldId,command);
  const bytes=await previewSharedRelief(userId,worldId,command,request.signal);
  return new Response(bytes,{headers:{"Content-Type":"application/vnd.serrian.atlas-relief-preview"}});
 });
}
