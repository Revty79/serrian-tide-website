import { redirect } from "next/navigation";

import { listCampaignsForGod } from "@/app/heavens/campaigns/actions";
import { requireGod } from "@/lib/server-access";

import "./npcs.css";
import { NpcWorkspace } from "./npc-workspace";

export default async function NpcsPage() {
  await requireGod().catch(() => redirect("/access"));
  const campaigns = await listCampaignsForGod();
  return <NpcWorkspace campaigns={campaigns} />;
}
