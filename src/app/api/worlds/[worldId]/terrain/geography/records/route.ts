import {worldRequest} from "@/features/worlds/http";
import {geographyDirectory} from "@/features/worlds/geography-directory-service";
import {saveRegionalGeography} from "@/features/worlds/atlas-service";
import {geographyDraftSchema} from "@/features/worlds/atlas";
import {ordinaryKnowledge} from "@/features/worlds/knowledge-preview";
import {WorldError} from "@/features/worlds/world-service";
export const dynamic="force-dynamic";
type Context={params:Promise<{worldId:string}>};
export async function GET(request:Request,context:Context){return worldRequest(request,false,async userId=>{
 const q=new URL(request.url).searchParams;
 return geographyDirectory(userId,(await context.params).worldId,{parentId:q.get("parent"),...(q.has("after")?{after:q.get("after")}:{}),search:q.get("search")??"",headersOnly:q.get("header")==="1"},{review:q.get("review")==="1",ordinary:ordinaryKnowledge(q)});
});}
/** The native directory permits place metadata only, never legacy map commands. */
export async function POST(request:Request,context:Context){return worldRequest(request,true,async userId=>{
 if(Number(request.headers.get("content-length"))>64000)throw new WorldError("This geography record exceeds the 64 KB limit.",413);
 const text=await request.text();if(Buffer.byteLength(text,"utf8")>64000)throw new WorldError("This geography record exceeds the 64 KB limit.",413);
 const draft=geographyDraftSchema.parse(JSON.parse(text));
 return {id:await saveRegionalGeography(userId,(await context.params).worldId,draft)};
});}
