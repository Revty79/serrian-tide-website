import { worldRequest } from "@/features/worlds/http";
import { changeCampaignAssociation, worldCampaignAssociations } from "@/features/worlds/campaign-association-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  return worldRequest(request, false, userId => worldCampaignAssociations(userId, worldId, new URL(request.url).searchParams.get("review") === "1"));
}
export async function POST(request: Request, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  return worldRequest(request, true, async userId => ({ id: await changeCampaignAssociation(userId, worldId, await request.json()) }));
}
