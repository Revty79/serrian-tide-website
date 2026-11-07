import {z} from "zod";
import {worldRequest} from "@/features/worlds/http";
import {worldReadAccess,WorldError} from "@/features/worlds/world-service";
import {getCrafts,changeCraft,navigateCraft} from "@/features/worlds/craft-service";
import {CRAFT_LIMITS,surfaceKeySchema} from "@/features/worlds/craft";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{
 const worldId=(await context.params).worldId,q=new URL(request.url).searchParams,review=q.get("review")==="1";if(q.has("ordinary")||q.has("knowledge"))throw new WorldError("Craft maps are private World creator material.",404);
 if(q.has("connection"))return navigateCraft(userId,worldId,z.uuid().parse(q.get("connection")),q.get("reverse")==="1",review);
 return getCrafts(userId,worldId,{review,craftId:q.has("craft")?z.uuid().parse(q.get("craft")):undefined,surface:q.has("surface")?surfaceKeySchema.parse(q.get("surface")):undefined,revision:q.has("revision")?z.coerce.number().int().min(1).max(512).parse(q.get("revision")):undefined,mapId:q.get("map")??undefined,search:q.get("q")??undefined,offset:q.has("offset")?z.coerce.number().int().min(0).max(512).parse(q.get("offset")):undefined});
});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>{
 const worldId=(await context.params).worldId;await worldReadAccess(userId,worldId,false,"craft");if(!request.headers.get("content-type")?.startsWith("application/json"))throw new WorldError("Submit craft details as a supported drawing request.",415);const reader=request.body?.getReader();if(!reader)throw new WorldError("Choose craft work to save.",400);let size=0;const parts:Uint8Array[]=[];try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>CRAFT_LIMITS.bodyBytes){await reader.cancel();throw new WorldError("This craft request exceeds five MiB. The draft is retained.",413);}parts.push(next.value);}}finally{reader.releaseLock();}return changeCraft(userId,worldId,JSON.parse(Buffer.concat(parts).toString("utf8")));
});}
