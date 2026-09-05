import { redirect } from "next/navigation";

import { requireGodOrAdminAccessContext } from "@/lib/server-access";

import "./npcs.css";
import { listNpcCampaigns } from "./actions";
import { NpcWorkspace } from "./npc-workspace";

export default async function NpcsPage() {
  await requireGodOrAdminAccessContext().catch(() => redirect("/access"));
  const campaigns = await listNpcCampaigns();
  return <NpcWorkspace campaigns={campaigns} />;
}
