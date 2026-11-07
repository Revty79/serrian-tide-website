import { worldRequest } from "@/features/worlds/http";
import { canonWorldPage, createPersonalCanonWorld } from "@/features/worlds/world-canon-service";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return worldRequest(request, false, userId => canonWorldPage(userId, Object.fromEntries(new URL(request.url).searchParams)));
}
export async function POST(request: Request) {
  return worldRequest(request, true, async userId => { const { worldId, ...command } = z.object({ worldId: z.string().uuid() }).passthrough().parse(await request.json()); return createPersonalCanonWorld(userId, worldId, command, { editableGeography: new URL(request.url).searchParams.get("copy") === "editable-geography-v1" }); });
}
