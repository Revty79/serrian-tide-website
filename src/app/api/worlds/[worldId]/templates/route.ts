import {z} from "zod";
import {retainTemplateSources} from "@/features/worlds/source-rights-template";
import {worldRequest} from "@/features/worlds/http";
import {WorldError,worldReadAccess} from "@/features/worlds/world-service";
import {changeMapTemplate,getMapTemplates} from "@/features/worlds/map-template-service";
import {TEMPLATE_LIMITS,templateFamilySchema} from "@/features/worlds/map-templates";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,false,async userId=>{
 const q=new URL(request.url).searchParams;if(q.has("ordinary")||q.has("knowledge"))throw new WorldError("Templates are private World creator material.",404);
 return getMapTemplates(userId,(await context.params).worldId,{review:q.get("review")==="1",family:q.has("family")?templateFamilySchema.parse(q.get("family")):undefined,id:q.has("template")?z.string().max(120).regex(/^(?:[0-9a-f-]{36}|atlas-style:[0-9a-f-]{36}|atlas-template:[a-z-]+:[a-z-]+)$/i).parse(q.get("template")):undefined,revision:q.has("revision")?z.coerce.number().int().min(1).max(128).parse(q.get("revision")):undefined,offset:q.has("offset")?z.coerce.number().int().min(0).max(10000).parse(q.get("offset")):undefined,search:q.has("q")?z.string().max(120).parse(q.get("q")):undefined});
});}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}){return worldRequest(request,true,async userId=>{
 const worldId=(await context.params).worldId,q=new URL(request.url).searchParams;if(q.get("review")==="1"||q.has("ordinary")||q.has("knowledge"))throw new WorldError("Template review is read-only.",403);await worldReadAccess(userId,worldId,false,"assets");
 if(!request.headers.get("content-type")?.startsWith("application/json"))throw new WorldError("Submit a supported template drawing request.",415);
 const reader=request.body?.getReader();if(!reader)throw new WorldError("Choose a template to save.",400);const parts:Uint8Array[]=[];let size=0;try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>TEMPLATE_LIMITS.bodyBytes){await reader.cancel();throw new WorldError("This template request exceeds five MiB. Your draft is retained.",413);}parts.push(next.value);}}finally{reader.releaseLock();}
 const input=JSON.parse(Buffer.concat(parts).toString("utf8"));
 if(input?.action==="retain-sources"){const c=z.object({action:z.literal("retain-sources"),templateId:z.string().min(1).max(180),revision:z.number().int().min(1).max(128).optional()}).strict().parse(input);return retainTemplateSources(userId,worldId,c.templateId,c.revision);}
 return changeMapTemplate(userId,worldId,input);
});}
