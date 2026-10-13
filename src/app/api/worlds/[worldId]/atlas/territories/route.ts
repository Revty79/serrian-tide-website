import { and,eq } from "drizzle-orm";
import { db } from "@/db";
import { worldHistoryVersion } from "@/db/world-timeline-schema";
import { worldRequest } from "@/features/worlds/http";
import { getMapStates } from "@/features/worlds/map-state-service";
import { territoryReferences } from "@/features/worlds/territory-service";
import { territoryPoliticalReading } from "@/features/worlds/peoples-service";
import { ordinaryKnowledge } from "@/features/worlds/knowledge-preview";
import { WorldError } from "@/features/worlds/world-service";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{worldId:string}>}) {
  return worldRequest(request,false,async userId=>{
    const worldId=(await context.params).worldId,p=new URL(request.url).searchParams,mapId=p.get("map")??"",timelineId=p.get("timeline")??"",review=p.get("review")==="1",ordinary=ordinaryKnowledge(p);
    if(p.has("relationship"))return territoryPoliticalReading(userId,worldId,timelineId,mapId,p.get("state")??"",p.get("version")??"",p.get("territory")??"",p.get("relationship")??"",review,ordinary);
    const state=await getMapStates(userId,worldId,mapId,timelineId,{review,ordinary,stateId:p.get("state")??undefined,versionId:p.get("version")??undefined});
    if(p.has("history")){
      const pin=state.bundle.maps.find(m=>m.id===mapId)?.territories?.find(t=>t.id===p.get("territory"))?.history.find(h=>h.versionId===p.get("history"));
      if(!pin)throw new WorldError("This retained territorial History source is unavailable.",404);
      const [source]=await db.select({payload:worldHistoryVersion.payload}).from(worldHistoryVersion).where(and(eq(worldHistoryVersion.id,pin.versionId),eq(worldHistoryVersion.worldId,worldId),eq(worldHistoryVersion.entityId,pin.entityId)));
      if(!source)throw new WorldError("This retained territorial History source is unavailable.",404);
      return ordinary?{...source.payload,...("notes"in source.payload?{notes:""}:{})}:source.payload;
    }
    if(ordinary||!state.canEdit)return {entities:[],history:[]};
    return db.transaction(tx=>territoryReferences(tx,worldId,timelineId),{isolationLevel:"repeatable read",accessMode:"read only"});
  });
}
