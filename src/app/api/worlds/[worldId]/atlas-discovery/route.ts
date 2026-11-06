import { z } from "zod";
import { worldRequest } from "@/features/worlds/http";
import { ordinaryKnowledge } from "@/features/worlds/knowledge-preview";
import { discoverWorldAtlas } from "@/features/worlds/world-atlas-discovery-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ worldId: string }> }) {
  return worldRequest(request, false, async userId => {
    const q = new URL(request.url).searchParams;
    const subject = JSON.parse(z.string().max(4000).parse(q.get("subject")));
    const year = q.has("year") ? z.string().regex(/^-?\d+$/).transform(Number).parse(q.get("year")) : undefined;
    return discoverWorldAtlas(userId, (await context.params).worldId, { timelineId: q.get("timeline"), year, subject }, { review: q.get("review") === "1", ordinary: ordinaryKnowledge(q) });
  });
}
