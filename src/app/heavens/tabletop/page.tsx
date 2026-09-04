import { redirect } from "next/navigation";

import { requireGod } from "@/lib/server-access";
import { buildInitiativeTrackerReadModel } from "@/features/tabletop-operations/initiative-tracker";

import { getSessionPrepWorkspace, getTabletopWorkspace } from "./actions";
import { getSceneEncounterWorkspace } from "./encounter-actions";
import { getEncounterCombatAid } from "./combat-aid-actions";
import { getEncounterCloseout } from "./closeout-actions";
import { getGodRollWorkspace } from "./roll-actions";
import { getSessionCloseout } from "./session-closeout-actions";
import { getGodWeaponGovernanceWorkspace } from "./weapon-governance-actions";
import { getActionDeclarationWorkspace } from "./action-declaration-actions";
import { getDefenseInterventionWorkspace } from "./defense-intervention-actions";
import { getActionEffectWorkspace } from "./action-effect-plan-actions";
import { getFirearmReadinessWorkspace } from "./firearm-readiness-actions";
import { getFirearmAttackWorkspace } from "./firearm-attack-actions";
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
  searchParams: Promise<{
    campaign?: string;
    session?: string;
    scene?: string;
    encounter?: string;
    workspace?: string;
    weaponCharacter?: string;
    weaponItem?: string;
    weaponMode?: string;
    firearmCharacter?: string;
    firearmInstance?: string;
  }>;
}) {
  await requireGod().catch(() => redirect("/access"));
  const query = await searchParams;
  const requestedCampaignId = Number(query.campaign);
  const requestedSessionId = Number(query.session);
  const requestedSceneId = Number(query.scene);
  const requestedEncounterId = Number(query.encounter);
  const requestedWeaponCharacterId = Number(query.weaponCharacter);
  const requestedWeaponItemId = Number(query.weaponItem);
  const requestedWeaponModeId = Number(query.weaponMode);
  const requestedFirearmCharacterId = Number(query.firearmCharacter);
  const requestedFirearmInstanceId = Number(query.firearmInstance);
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
  const actionDeclarations = encounterWorkspace?.selectedEncounter
    ? await getActionDeclarationWorkspace(encounterWorkspace.selectedEncounter.id)
    : null;
  const defenseInterventions = encounterWorkspace?.selectedEncounter
    ? await getDefenseInterventionWorkspace(encounterWorkspace.selectedEncounter.id)
    : null;
  const actionEffects = encounterWorkspace?.selectedEncounter
    ? await getActionEffectWorkspace(encounterWorkspace.selectedEncounter.id)
    : null;
  const firearmReadiness = encounterWorkspace?.selectedEncounter
    ? await getFirearmReadinessWorkspace(
        encounterWorkspace.selectedEncounter.id,
        Number.isInteger(requestedFirearmCharacterId) && requestedFirearmCharacterId !== 0 ? requestedFirearmCharacterId : null,
        Number.isInteger(requestedFirearmInstanceId) && requestedFirearmInstanceId > 0 ? requestedFirearmInstanceId : null,
      )
    : null;
  const firearmAttacks = encounterWorkspace?.selectedEncounter
    ? await getFirearmAttackWorkspace(encounterWorkspace.selectedEncounter.id)
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
  const weaponGovernance = workspace.selectedCampaignId === null || query.workspace !== "weapons"
    ? null
    : await getGodWeaponGovernanceWorkspace({
        campaignId: workspace.selectedCampaignId,
        characterId: Number.isInteger(requestedWeaponCharacterId) && requestedWeaponCharacterId > 0
          ? requestedWeaponCharacterId
          : null,
        itemId: Number.isInteger(requestedWeaponItemId) && requestedWeaponItemId > 0
          ? requestedWeaponItemId
          : null,
        firingModeId: Number.isInteger(requestedWeaponModeId) && requestedWeaponModeId > 0
          ? requestedWeaponModeId
          : null,
      });
  return (
    <TabletopWorkspace
      key={`${workspace.selectedCampaignId ?? "none"}:${selectedSessionId ?? "none"}`}
      initialData={workspace}
      initialPrepData={prepWorkspace}
      initialSceneData={sceneWorkspace}
      initialEncounterData={encounterWorkspace}
      initialInitiativeTracker={initiativeTracker}
      initialCombatAid={combatAid}
      initialActionDeclarations={actionDeclarations}
      initialDefenseInterventions={defenseInterventions}
      initialActionEffects={actionEffects}
      initialFirearmReadiness={firearmReadiness}
      initialFirearmAttacks={firearmAttacks}
      initialCloseout={closeout}
      initialRollWorkspace={rollWorkspace}
      initialSessionCloseout={sessionCloseout}
      initialWeaponGovernance={weaponGovernance}
      requestedSessionId={selectedSessionId}
      requestedWorkspace={query.workspace === "weapons" ? "weapons" : null}
    />
  );
}
