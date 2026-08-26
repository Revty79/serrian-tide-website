import { redirect } from "next/navigation";

import { requirePlayer } from "@/lib/server-access";
import { listPlayerCampaigns } from "@/app/characters/actions";

import "./realms.css";
import { RealmsDashboard } from "./realms-dashboard";

export default async function RealmsPage() {
  const session = await requirePlayer().catch(() => redirect("/access"));
  const campaigns = await listPlayerCampaigns();

  return (
    <RealmsDashboard
      initialCampaigns={campaigns}
      username={session.user.username ?? session.user.name ?? "Player"}
    />
  );
}
