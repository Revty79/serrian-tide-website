import { z } from "zod";
import { worldRequest } from "@/features/worlds/http";
import { celestialChronicle } from "@/features/worlds/astronomy-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ worldId: string }> }) {
  return worldRequest(request, false, async userId => {
    const q = new URL(request.url).searchParams, input: Record<string, unknown> = {};
    for (const key of ["scale", "start", "end", "displayVersionId", "cycleId", "bodyId", "eraId", "calendarId", "q", "classification", "accuracy", "kind"]) if (q.has(key)) input[key] = q.get(key);
    for (const key of ["offset", "observationOffset", "resultOffset"]) if (q.has(key)) input[key] = Number(q.get(key));
    for (const key of ["calendarStart", "calendarEnd"]) if (q.has(key)) { try { input[key] = JSON.parse(q.get(key)!); } catch { throw new z.ZodError([{ code: "custom", path: [key], message: "Use a supported structured calendar date." }]); } }
    return celestialChronicle(userId, (await context.params).worldId, z.string().uuid().parse(q.get("timeline")), input, q.get("review") === "1", q.get("ordinary") === "1");
  });
}
