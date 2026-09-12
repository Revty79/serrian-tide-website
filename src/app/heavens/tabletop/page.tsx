import { redirect } from "next/navigation";

import { requireGodOrAdminAccessContext } from "@/lib/server-access";

import { getSessionPrepWorkspace, getTabletopWorkspace } from "./actions";
import { getGodRollWorkspace } from "./roll-actions";
import { getSessionCloseout } from "./session-closeout-actions";
import { getGodCalledCheckWorkspace } from "./called-check-actions";
import { getSessionSceneWorkspace } from "./scene-actions";
import { getLocationPlacementWorkspace } from "./location-actions";
import { getGodShopVisitWorkspace } from "./shop-visit-actions";
import "./tabletop.css";
import { TabletopWorkspace } from "./tabletop-workspace";
import { CombatRoute } from "@/features/combat-screen/combat-route";
import { EncounterLibrary } from "@/features/combat-screen/encounter-library";
import { getSceneEncounterWorkspace } from "./encounter-actions";

export default async function TabletopOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    campaign?: string;
    session?: string;
    scene?: string;
    workspace?: string;
    combat?: string;
    encounter?: string;
  }>;
}) {
  await requireGodOrAdminAccessContext().catch(() => redirect("/access"));
  const query = await searchParams;
  if (query.combat) return <CombatRoute key={`god:${query.combat}`} scope={{ role: "god", encounterId: Number(query.combat) }} />;
  const requestedCampaignId = Number(query.campaign);
  const requestedSessionId = Number(query.session);
  const requestedSceneId = Number(query.scene);
  const workspace = await getTabletopWorkspace(
    Number.isInteger(requestedCampaignId) && requestedCampaignId > 0
      ? requestedCampaignId
      : null,
  );
  const canOperateTable = workspace.canOperate;
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
  const locationWorkspace = selectedSessionId === null
    ? null
    : await getLocationPlacementWorkspace(selectedSessionId, sceneWorkspace?.selectedSceneId ?? null);
  const shopVisitWorkspace = sceneWorkspace?.selectedSceneId
    ? await getGodShopVisitWorkspace(sceneWorkspace.selectedSceneId)
    : null;
  const rollWorkspace = !canOperateTable || selectedSessionId === null
    ? null
    : await getGodRollWorkspace(
        selectedSessionId,
        sceneWorkspace?.selectedSceneId ?? null,
        null,
      );
  const sessionCloseout = selectedSessionId === null
    ? null
    : await getSessionCloseout(selectedSessionId);
  const calledChecks = !canOperateTable || selectedSessionId === null
    ? null
    : await getGodCalledCheckWorkspace(selectedSessionId);
  const encounters = sceneWorkspace?.selectedSceneId ? await getSceneEncounterWorkspace(sceneWorkspace.selectedSceneId, Number(query.encounter) || null) : null;
  return (
    <TabletopWorkspace
      key={`${workspace.selectedCampaignId ?? "none"}:${selectedSessionId ?? "none"}`}
      initialData={workspace}
      encounterLibrary={encounters ? <EncounterLibrary key="encounter-library" data={encounters} /> : null}
      initialPrepData={prepWorkspace}
      initialSceneData={sceneWorkspace}
      initialLocationData={locationWorkspace}
      initialShopVisitData={shopVisitWorkspace}
      initialRollWorkspace={rollWorkspace}
      initialSessionCloseout={sessionCloseout}
      initialCalledChecks={calledChecks}
      requestedSessionId={selectedSessionId}
      requestedWorkspace={query.workspace === "scenes" ? "scenes" : canOperateTable && query.workspace === "checks" ? "checks" : null}
    />
  );
}
