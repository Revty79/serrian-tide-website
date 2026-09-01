import { redirect } from "next/navigation";

import { requireGod } from "@/lib/server-access";

import { getSessionPrepWorkspace, getTabletopWorkspace } from "./actions";
import { getSessionSceneWorkspace } from "./scene-actions";
import "./tabletop.css";
import { TabletopWorkspace } from "./tabletop-workspace";

export default async function TabletopOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; session?: string; scene?: string }>;
}) {
  await requireGod().catch(() => redirect("/access"));
  const query = await searchParams;
  const requestedCampaignId = Number(query.campaign);
  const requestedSessionId = Number(query.session);
  const requestedSceneId = Number(query.scene);
  const workspace = await getTabletopWorkspace(
    Number.isInteger(requestedCampaignId) && requestedCampaignId > 0
      ? requestedCampaignId
      : null,
  );
  const selectedSessionId = workspace.sessions.some(({ id }) => id === requestedSessionId)
    ? requestedSessionId
    : workspace.sessions[0]?.id ?? null;
  const prepWorkspace = selectedSessionId === null
    ? null
    : await getSessionPrepWorkspace(selectedSessionId);
  const sceneWorkspace = selectedSessionId === null
    ? null
    : await getSessionSceneWorkspace(
        selectedSessionId,
        Number.isInteger(requestedSceneId) && requestedSceneId > 0 ? requestedSceneId : null,
      );
  return (
    <TabletopWorkspace
      key={`${workspace.selectedCampaignId ?? "none"}:${selectedSessionId ?? "none"}`}
      initialData={workspace}
      initialPrepData={prepWorkspace}
      initialSceneData={sceneWorkspace}
      requestedSessionId={selectedSessionId}
    />
  );
}
