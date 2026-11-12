import {z} from "zod";
import {worldRequest} from "@/features/worlds/http";
import {WorldError} from "@/features/worlds/world-errors";
import {changeSourceRights,readSourceRights,readSourceReviewHistory} from "@/features/worlds/source-rights-service";
export const runtime="nodejs";
export async function GET(request:Request){return worldRequest(request,false,async userId=>{const q=new URL(request.url).searchParams,worldId=z.string().uuid().parse(q.get("world")),review=q.get("review")==="1";if(q.has("source"))return readSourceReviewHistory(userId,worldId,z.string().uuid().parse(q.get("source")),z.coerce.number().int().min(0).max(10000).parse(q.get("offset")??0),review);return readSourceRights(userId,worldId,review);});}
export async function POST(request:Request){return worldRequest(request,true,async userId=>{
 const reader=request.body?.getReader();if(!reader)throw new WorldError("Enter the source-rights details.",400);
 const chunks:Uint8Array[]=[];let length=0;try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>65536){await reader.cancel();throw new WorldError("Source-rights details exceed 64 KiB.",413);}chunks.push(part.value);}}finally{reader.releaseLock();}
 const body=z.object({worldId:z.string().uuid(),command:z.unknown()}).strict().parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
 return changeSourceRights(userId,body.worldId,body.command);
});}
