import { worldRequest } from "@/features/worlds/http";
import { adminWorldRegistry } from "@/features/worlds/world-admin-registry-service";
export const dynamic="force-dynamic";
export async function GET(request:Request){return worldRequest(request,false,userId=>adminWorldRegistry(userId,Object.fromEntries(new URL(request.url).searchParams)));}
