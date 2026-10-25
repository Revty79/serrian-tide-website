import {z} from "zod";
import {worldRequest} from "@/features/worlds/http";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {createRefinement,getRefinements,getRefinementTiles,getRefinementHistory,sampleWorldTerrain,restoreRefinement,saveRefinement} from "@/features/worlds/terrain-refinement-service";
import {readTerrainRequest} from "@/features/worlds/terrain-http";
export const runtime="nodejs";
type Context={params:Promise<{worldId:string}>};
export async function GET(request:Request,context:Context){return worldRequest(request,false,async userId=>{
 const q=new URL(request.url).searchParams,worldId=(await context.params).worldId,mapId=z.uuid().parse(q.get("terrainMap")),options={review:q.get("review")==="1",ordinary:ordinaryKnowledge(q)};
 if(q.get("action")==="sample")return sampleWorldTerrain(userId,worldId,mapId,JSON.parse(z.string().max(8192).parse(q.get("points"))),options);
 if(q.get("action")==="history")return getRefinementHistory(userId,worldId,mapId,z.uuid().parse(q.get("refinement")),{...options,...q.has("before")?{before:Number(q.get("before"))}:{}});
 if(!q.has("refinement"))return getRefinements(userId,worldId,mapId,options);
 const keys=z.string().min(1).max(512).parse(q.get("keys"));return getRefinementTiles(userId,worldId,mapId,z.uuid().parse(q.get("refinement")),{lod:Number(q.get("lod")??0),keys:keys.split(",").map(Number),...q.has("revision")?{revision:Number(q.get("revision"))}:{}},options);
});}
export async function POST(request:Request,context:Context){return worldRequest(request,true,async userId=>{
 const worldId=(await context.params).worldId,raw=await readTerrainRequest(request),id=new URL(request.url).searchParams.get("refinement");
 return id?(raw&&typeof raw==="object"&&"action" in raw&&raw.action==="restore"?restoreRefinement(userId,worldId,id,raw):saveRefinement(userId,worldId,id,raw)):createRefinement(userId,worldId,raw);
});}
