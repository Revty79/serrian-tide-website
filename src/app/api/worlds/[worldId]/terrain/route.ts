import { worldRequest } from "@/features/worlds/http";
import { changeTerrain, getTerrain } from "@/features/worlds/terrain-service";
import { readOnlyPreview, ordinaryKnowledge } from "@/features/worlds/knowledge-preview";
import { WorldError } from "@/features/worlds/world-service";
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
    // Bound before JSON parsing, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new WorldError("Enter terrain details.", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 8_000_000) { await reader.cancel(); throw new WorldError("This terrain edit exceeds the safe request size. Your draft is retained.", 413); } chunks.push(part.value); } } finally { reader.releaseLock(); }
    return changeTerrain(userId, (await context.params).worldId, JSON.parse(Buffer.concat(chunks).toString("utf8")));
  });
}
