import { redirect } from "next/navigation";

import { requireGodOrAdminAccessContext } from "@/lib/server-access";

import { listTownCampaigns } from "./actions";
import { TownWorkspace } from "./town-workspace";
import "./towns.css";

export default async function TownsPage() {
  const access = await requireGodOrAdminAccessContext().catch(() => redirect("/access"));
  const campaigns = await listTownCampaigns();
  return <TownWorkspace campaigns={campaigns} isAdmin={access.roles.includes("admin")} />;
}
