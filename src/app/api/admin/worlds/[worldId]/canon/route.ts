import { worldRequest } from "@/features/worlds/http";
import { changeWorldCanon } from "@/features/worlds/world-canon-service";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ worldId: string }> }) {
  return worldRequest(request, true, async userId => changeWorldCanon(userId, (await context.params).worldId, await request.json()));
}
