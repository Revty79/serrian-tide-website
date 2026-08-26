import { redirect } from "next/navigation";

import { requireGod } from "@/lib/server-access";

import { listCampaignsForGod } from "./actions";
import "./campaigns.css";
import { CampaignWorkspace } from "./campaign-workspace";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; player?: string; tab?: string }>;
}) {
  await requireGod().catch(() => redirect("/access"));
  const query = await searchParams;
  const requestedCampaignId = Number(query.campaign);
  const initialCampaignId = Number.isInteger(requestedCampaignId) && requestedCampaignId > 0
    ? requestedCampaignId
    : null;
  const campaigns = await listCampaignsForGod();
  return (
    <CampaignWorkspace
      initialCampaigns={campaigns}
      initialCampaignId={initialCampaignId}
      initialPlayerUserId={query.player ?? null}
      initialTab={query.tab === "players" ? "players" : "rules"}
    />
  );
}
