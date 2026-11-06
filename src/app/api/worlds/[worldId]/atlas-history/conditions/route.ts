import {worldRequest} from "@/features/worlds/http";
import {WorldError} from "@/features/worlds/world-service";
export const runtime="nodejs";
const unavailable=()=>{throw new WorldError("Choose an explicit dated appearance before editing historical conditions.",400);};
export async function GET(request:Request){return worldRequest(request,false,unavailable);}
export async function POST(request:Request){return worldRequest(request,true,unavailable);}
