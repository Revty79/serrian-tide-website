import { worldRequest } from "@/features/worlds/http";
import { changeTerrain, getTerrain } from "@/features/worlds/terrain-service";
import { readOnlyPreview, ordinaryKnowledge } from "@/features/worlds/knowledge-preview";
import { WorldError } from "@/features/worlds/world-service";
import {readTerrainRequest} from "@/features/worlds/terrain-http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ worldId: string }> }) {
  return worldRequest(request, false, async userId => {
    const q = new URL(request.url).searchParams;
    return getTerrain(userId, (await context.params).worldId, { review: q.get("review") === "1", ordinary: ordinaryKnowledge(q), mapId: q.get("terrainMap") ?? undefined });
  });
}
export async function POST(request: Request, context: { params: Promise<{ worldId: string }> }) {
  return worldRequest(request, true, async userId => {
    if (readOnlyPreview(new URL(request.url).searchParams)) throw new WorldError("This preview is read-only.", 403);
    return changeTerrain(userId, (await context.params).worldId, await readTerrainRequest(request));
  });
}
