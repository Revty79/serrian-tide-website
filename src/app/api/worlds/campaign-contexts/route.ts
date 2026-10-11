import { worldRequest } from "@/features/worlds/http";
import { authoringContextSummary, campaignWorldAssociations, eligibleCampaigns } from "@/features/worlds/campaign-association-service";
import { WorldError } from "@/features/worlds/world-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return worldRequest(request, false, userId => {
    if(new URL(request.url).searchParams.get("selection")==="1")return authoringContextSummary(userId);
    const value = new URL(request.url).searchParams.get("campaignId");
    if (value === null) return eligibleCampaigns(userId).then(choices => ({ choices }));
    const campaignId = Number(value);
    if (!Number.isInteger(campaignId) || campaignId <= 0 || campaignId > 2147483647) throw new WorldError("This Campaign is unavailable.", 404);
    return campaignWorldAssociations(userId, campaignId);
  });
}
