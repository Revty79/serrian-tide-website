import { redirect } from "next/navigation";

import { requireGodOrAdminAccessContext } from "@/lib/server-access";

import { listShopCampaigns } from "./actions";
import { ShopWorkspace } from "./shop-workspace";
import "./shops.css";

export default async function ShopsPage() {
  const access = await requireGodOrAdminAccessContext().catch(() => redirect("/access"));
  const campaigns = await listShopCampaigns();
  return <ShopWorkspace campaigns={campaigns} isAdmin={access.roles.includes("admin")} />;
}
