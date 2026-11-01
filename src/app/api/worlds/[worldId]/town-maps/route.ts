import {worldRequest} from "@/features/worlds/http";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {getTownMaps,changeTownMap,previewTownMap,townBackdrop} from "@/features/worlds/town-map-service";
import {townFrameSchema} from "@/features/worlds/town-map";
import {WorldError} from "@/features/worlds/world-service";
import {readTerrainRequest} from "@/features/worlds/terrain-http";
import {z} from "zod";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams,worldId=(await context.params).worldId,options={review:q.get("review")==="1",ordinary:ordinaryKnowledge(q)};if(q.get("backdrop"))return townBackdrop(userId,worldId,q.get("sourceMap")??"",townFrameSchema.parse(JSON.parse(q.get("frame")??"null")),options);return getTownMaps(userId,worldId,{...options,mapId:q.get("map")??undefined,townId:q.get("town")??undefined,search:q.get("search")??undefined,offset:Number(q.get("offset")??0)});});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>{let raw:unknown;try{raw=await readTerrainRequest(request);}catch(error){if(error instanceof WorldError&&error.status===413)throw new WorldError("This Town Map request exceeds 8,000,000 bytes. Your draft is retained.",413);throw error;}const body=z.object({action:z.string()}).passthrough().parse(raw),worldId=(await context.params).worldId;if(body.action==="preview"){const {action:_,...input}=body;void _;return previewTownMap(userId,worldId,input);}return changeTownMap(userId,worldId,body);});}
