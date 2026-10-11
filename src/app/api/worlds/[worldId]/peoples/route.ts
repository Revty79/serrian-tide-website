import { z } from "zod";
import { worldRequest } from "@/features/worlds/http";
import { changePeople, getPeople, listPeoples, peoplesReferences, pinnedHistoricalSource, peoplesAtPlace } from "@/features/worlds/peoples-service";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}) {
  return worldRequest(request,false,async userId=>{const {worldId}=await context.params,q=new URL(request.url).searchParams,timelineId=z.string().uuid().parse(q.get("timeline")),review=q.get("review")==="1",ordinary=q.get("ordinary")==="1";
    if(q.has("source"))return pinnedHistoricalSource(userId,worldId,timelineId,z.string().uuid().parse(q.get("record")),z.string().uuid().parse(q.get("source")),review,ordinary);
    if(q.has("place"))return peoplesAtPlace(userId,worldId,timelineId,z.string().uuid().parse(q.get("place")),review,ordinary,z.coerce.number().int().min(0).max(2000).parse(q.get("offset")??0),z.string().max(160).parse(q.get("q")??""),z.enum(["species","people","origin","relationship","culture","civilization","language","population","belief","tradition","individual"]).optional().parse(q.get("family")??undefined),z.string().max(160).parse(q.get("category")??""),z.enum(["","active","archived"]).parse(q.get("lifecycle")??""));
    if(q.get("refs")==="1")return peoplesReferences(userId,worldId,timelineId,review,ordinary);
    if(q.has("record"))return getPeople(userId,worldId,timelineId,z.string().uuid().parse(q.get("record")),review,ordinary);
    return listPeoples(userId,worldId,timelineId,review,ordinary,z.string().max(160).parse(q.get("q")??""),z.coerce.number().int().min(0).max(2000).parse(q.get("offset")??0),z.enum(["species","people","origin","relationship","culture","civilization","language","population","belief","tradition","individual"]).optional().parse(q.get("family")??undefined),z.string().max(160).parse(q.get("category")??""),z.enum(["","active","archived"]).parse(q.get("lifecycle")??""));});
}
export async function POST(request:Request,context:{params:Promise<{worldId:string}>}) {return worldRequest(request,true,async userId=>({id:await changePeople(userId,(await context.params).worldId,await request.json())}));}
