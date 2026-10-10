import { worldRequest } from "@/features/worlds/http";
import { changeWorld, getWorld } from "@/features/worlds/world-service";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ worldId: string }> };
export async function GET(request: Request, context: Context) { const query=new URL(request.url).searchParams;return worldRequest(request, false, async (userId) => getWorld(userId, (await context.params).worldId, query.get("review") === "1",query.get("timeline"))); }
export async function PATCH(request: Request, context: Context) { return worldRequest(request, true, async (userId) => { await changeWorld(userId, (await context.params).worldId, await request.json()); return { saved: true }; }); }
