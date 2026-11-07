import { adminWorldRegistry } from "@/features/worlds/world-admin-registry-service";
import { worldRequest } from "@/features/worlds/http";
import { sharedWorldPage } from "@/features/worlds/world-shared-registry-service";
import { createWorld, listWorlds, worldReferences } from "@/features/worlds/world-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return worldRequest(request, false, async (userId) => { const query = new URL(request.url).searchParams.get("scope");if(query==="shared")return {...await sharedWorldPage(userId,Object.fromEntries(new URL(request.url).searchParams)),tags:[]};if(query==="review"){const page=await adminWorldRegistry(userId,Object.fromEntries(new URL(request.url).searchParams));return {...page,worlds:page.rows,tags:[]};}const scope=query==="review"?"review":"mine"; const [worlds, tags] = await Promise.all([listWorlds(userId, scope), worldReferences(userId, scope)]); return { worlds, tags }; }); }
export async function POST(request: Request) { return worldRequest(request, true, async (userId) => ({ id: await createWorld(userId, await request.json()) })); }
