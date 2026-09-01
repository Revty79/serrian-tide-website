import { redirect } from "next/navigation";

import { requireGod } from "@/lib/server-access";

import { getTabletopWorkspace } from "./actions";
import "./tabletop.css";
import { TabletopWorkspace } from "./tabletop-workspace";

export default async function TabletopOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; session?: string }>;
}) {
  await requireGod().catch(() => redirect("/access"));
  const query = await searchParams;
  const requestedCampaignId = Number(query.campaign);
  const requestedSessionId = Number(query.session);
  const workspace = await getTabletopWorkspace(
    Number.isInteger(requestedCampaignId) && requestedCampaignId > 0
      ? requestedCampaignId
      : null,
  );
  const selectedSessionId = workspace.sessions.some(({ id }) => id === requestedSessionId)
    ? requestedSessionId
    : workspace.sessions[0]?.id ?? null;
  return (
    <TabletopWorkspace
      key={`${workspace.selectedCampaignId ?? "none"}:${selectedSessionId ?? "none"}`}
      initialData={workspace}
      requestedSessionId={selectedSessionId}
    />
  );
}
