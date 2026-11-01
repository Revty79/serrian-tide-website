import {worldRequest} from "@/features/worlds/http";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {readTerrainRequest} from "@/features/worlds/terrain-http";
import {getBuildingFloors,changeBuildingFloor} from "@/features/worlds/building-floor-service";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams;return getBuildingFloors(userId,(await context.params).worldId,{townMapId:q.get("townMap")??"",featureId:q.get("building")??"",floorId:q.get("floor")??undefined,review:q.get("review")==="1",ordinary:ordinaryKnowledge(q)});});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>changeBuildingFloor(userId,(await context.params).worldId,await readTerrainRequest(request)));}
