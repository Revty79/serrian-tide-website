import { NextRequest } from "next/server";
import { worldRequest } from "@/features/worlds/http";
import { WorldError } from "@/features/worlds/world-service";
import { compareHistoricalMaps } from "@/features/worlds/map-comparison-service";
import { ordinaryKnowledge } from "@/features/worlds/knowledge-preview";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{worldId:string}>}){
  const {worldId}=await params,p=request.nextUrl.searchParams;
  return worldRequest(request,false,userId=>{let sources:unknown;try{const text=p.get("sources")??"null";if(text.length>2000)throw new Error();sources=JSON.parse(text);}catch{throw new WorldError("Choose two valid saved sources or World years.",400);}return compareHistoricalMaps(userId,worldId,sources,{review:p.get("review")==="1",ordinary:ordinaryKnowledge(p)});});
}
