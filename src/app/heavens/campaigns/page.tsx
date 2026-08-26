import { redirect } from "next/navigation";

import { requireGod } from "@/lib/server-access";

import { listCampaignsForGod } from "./actions";
import "./campaigns.css";
import { CampaignWorkspace } from "./campaign-workspace";

export default async function CampaignsPage() {
  await requireGod().catch(() => redirect("/access"));
  const campaigns = await listCampaignsForGod();
  return <CampaignWorkspace initialCampaigns={campaigns} />;
}
