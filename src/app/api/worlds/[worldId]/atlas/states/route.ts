import {atlasPreviewBundle} from "@/features/worlds/atlas-preview";
import { worldRequest } from "@/features/worlds/http";
import { WorldError } from "@/features/worlds/world-service";
import { changeMapState, getMapStates } from "@/features/worlds/map-state-service";
import { yearSchema } from "@/features/worlds/world-year";
import { ordinaryKnowledge, readOnlyPreview } from "@/features/worlds/knowledge-preview";
export const dynamic="force-dynamic";
type Context={params:Promise<{worldId:string}>};
export async function GET(request:Request,context:Context){return worldRequest(request,false,async userId=>{const p=new URL(request.url).searchParams;const result=await getMapStates(userId,(await context.params).worldId,p.get("map")??"",p.get("timeline")??"",{review:p.get("review")==="1",ordinary:ordinaryKnowledge(p),stateId:p.get("state")??undefined,versionId:p.get("version")??undefined,year:p.has("year")?yearSchema.parse(p.get("year")?.trim()?Number(p.get("year")):NaN):undefined});return p.get("preview")==="1"?{...result,previewReader:userId,bundle:atlasPreviewBundle(result.bundle,p.get("map")??""),states:[],parentStates:[],revisions:[]}:result;});}
export async function POST(request:Request,context:Context){return worldRequest(request,true,async userId=>{const p=new URL(request.url).searchParams;if(readOnlyPreview(p))throw new WorldError("This preview is read-only.",403);if(Number(request.headers.get("content-length"))>12_000_000)throw new WorldError("Historical map requests support twelve megabytes.",413);const text=await request.text();if(Buffer.byteLength(text,"utf8")>12_000_000)throw new WorldError("Historical map requests support twelve megabytes.",413);return changeMapState(userId,(await context.params).worldId,JSON.parse(text));});}
