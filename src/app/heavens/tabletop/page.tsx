import { redirect } from "next/navigation";

import { requireGod } from "@/lib/server-access";
import { buildInitiativeTrackerReadModel } from "@/features/tabletop-operations/initiative-tracker";

import { getSessionPrepWorkspace, getTabletopWorkspace } from "./actions";
import { getSceneEncounterWorkspace } from "./encounter-actions";
import { getEncounterCombatAid } from "./combat-aid-actions";
import { getEncounterCloseout } from "./closeout-actions";
import { getGodRollWorkspace } from "./roll-actions";
import { getSessionCloseout } from "./session-closeout-actions";
import {
  getEncounterInitiativeCapacityOptions,
  getEncounterInitiativeRuntime,
} from "./initiative-actions";
import { getSessionSceneWorkspace } from "./scene-actions";
import "./tabletop.css";
import { TabletopWorkspace } from "./tabletop-workspace";

export default async function TabletopOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; session?: string; scene?: string; encounter?: string }>;
}) {
  await requireGod().catch(() => redirect("/access"));
  const query = await searchParams;
  const requestedCampaignId = Number(query.campaign);
  const requestedSessionId = Number(query.session);
  const requestedSceneId = Number(query.scene);
  const requestedEncounterId = Number(query.encounter);
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
  const encounterWorkspace = sceneWorkspace?.selectedSceneId
    ? await getSceneEncounterWorkspace(
        sceneWorkspace.selectedSceneId,
        Number.isInteger(requestedEncounterId) && requestedEncounterId > 0 ? requestedEncounterId : null,
      )
    : null;
  const initiativeTracker = encounterWorkspace?.selectedEncounter
    ? await Promise.all([
        getEncounterInitiativeRuntime(encounterWorkspace.selectedEncounter.id),
        getEncounterInitiativeCapacityOptions(encounterWorkspace.selectedEncounter.id),
      ]).then(([runtime, capacities]) => buildInitiativeTrackerReadModel({
        encounter: {
          id: encounterWorkspace.selectedEncounter!.id,
          title: encounterWorkspace.selectedEncounter!.title,
          status: encounterWorkspace.selectedEncounter!.status,
        },
        sessionStatus: encounterWorkspace.sessionStatus,
        sceneStatus: encounterWorkspace.sceneStatus,
        identities: encounterWorkspace.selectedEncounter!.participants,
        capacities,
        runtime,
      }))
    : null;
  const combatAid = encounterWorkspace?.selectedEncounter
    ? await getEncounterCombatAid(encounterWorkspace.selectedEncounter.id)
    : null;
  const closeout = encounterWorkspace?.selectedEncounter
    ? await getEncounterCloseout(encounterWorkspace.selectedEncounter.id)
    : null;
  const rollWorkspace = selectedSessionId === null
    ? null
    : await getGodRollWorkspace(
        selectedSessionId,
        sceneWorkspace?.selectedSceneId ?? null,
        encounterWorkspace?.selectedEncounterId ?? null,
      );
  const sessionCloseout = selectedSessionId === null
    ? null
    : await getSessionCloseout(selectedSessionId);
  return (
    <TabletopWorkspace
      key={`${workspace.selectedCampaignId ?? "none"}:${selectedSessionId ?? "none"}`}
      initialData={workspace}
      initialPrepData={prepWorkspace}
      initialSceneData={sceneWorkspace}
      initialEncounterData={encounterWorkspace}
      initialInitiativeTracker={initiativeTracker}
      initialCombatAid={combatAid}
      initialCloseout={closeout}
      initialRollWorkspace={rollWorkspace}
      initialSessionCloseout={sessionCloseout}
      requestedSessionId={selectedSessionId}
    />
  );
}
