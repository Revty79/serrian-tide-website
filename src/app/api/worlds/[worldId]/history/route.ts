import { worldRequest } from "@/features/worlds/http";
import { changeHistory } from "@/features/worlds/world-service";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ worldId: string }> }) { return worldRequest(request, true, async (userId) => ({ id: await changeHistory(userId, (await context.params).worldId, await request.json()) })); }
