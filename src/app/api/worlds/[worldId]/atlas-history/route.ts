import { atlasId } from "@/features/worlds/atlas";
import { nativeMapTargetSchema } from "@/features/worlds/native-map-history";
import { changeNativeMapHistory, getNativeMapHistory } from "@/features/worlds/native-map-history-service";
import { ordinaryKnowledge } from "@/features/worlds/knowledge-preview";
import { worldRequest } from "@/features/worlds/http";
import { WorldError } from "@/features/worlds/world-service";
import { yearSchema } from "@/features/worlds/world-year";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ worldId: string }> }) {
  return worldRequest(request, false, async userId => {
    const query = new URL(request.url).searchParams;
    const target = nativeMapTargetSchema.parse({ kind: query.get("kind"), id: query.get("id") });
    const timelineId = atlasId.parse(query.get("timeline"));
    const year = query.get("year");
    if (year !== null && !/^-?\d+$/.test(year)) throw new WorldError("Choose an integer canonical World year.", 400);
    return getNativeMapHistory(userId, (await context.params).worldId, target, timelineId, {
      review: query.get("review") === "1", ordinary: ordinaryKnowledge(query),
      ...(year !== null ? { year: yearSchema.parse(Number(year)) } : {}),
      ...(query.has("state") ? { stateId: atlasId.parse(query.get("state")) } : {}),
      ...(query.has("version") ? { versionId: atlasId.parse(query.get("version")) } : {}),
      ...(query.has("geographyVersion")?{geographyVersionId:atlasId.parse(query.get("geographyVersion"))}:{}),
      prepareBaseline: query.get("prepareBaseline") === "1",
    });
  });
}
export async function POST(request: Request, context: { params: Promise<{ worldId: string }> }) {
  return worldRequest(request, true, async userId => {
    const reader = request.body?.getReader();
    if (!reader) throw new WorldError("Provide a historical appearance request.", 400);
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 256 * 1024) { await reader.cancel(); throw new WorldError("The historical details exceed the 256 KiB request bound. Your draft is retained.", 413); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    return changeNativeMapHistory(userId, (await context.params).worldId, JSON.parse(Buffer.concat(chunks).toString("utf8")));
  });
}
