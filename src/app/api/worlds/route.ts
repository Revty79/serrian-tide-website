import { worldRequest } from "@/features/worlds/http";
import { createWorld, listWorlds, worldReferences } from "@/features/worlds/world-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return worldRequest(request, false, async (userId) => { const scope = new URL(request.url).searchParams.get("scope") === "review" ? "review" : "mine"; const [worlds, tags] = await Promise.all([listWorlds(userId, scope), worldReferences(userId, scope)]); return { worlds, tags }; }); }
export async function POST(request: Request) { return worldRequest(request, true, async (userId) => ({ id: await createWorld(userId, await request.json()) })); }
