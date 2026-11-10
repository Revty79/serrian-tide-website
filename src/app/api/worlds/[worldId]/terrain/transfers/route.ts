import {worldRequest} from "@/features/worlds/http";
import {readTerrainRequest} from "@/features/worlds/terrain-http";
import {changeTerrainTransfer} from "@/features/worlds/terrain-transfer-service";
import {nativeHistoryScopeSchema} from "@/features/worlds/native-map-history";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>{const value=new URL(request.url).searchParams.get("historicalAtlas"),scope=value?nativeHistoryScopeSchema.parse(JSON.parse(value)):undefined;return changeTerrainTransfer(userId,(await context.params).worldId,await readTerrainRequest(request),scope);});}
