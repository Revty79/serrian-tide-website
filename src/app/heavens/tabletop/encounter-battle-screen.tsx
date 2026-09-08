"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CombatRunnerWorkspace } from "@/components/tabletop/combat-runner-workspace";
import { CombatOperationStateProvider } from "@/components/tabletop/combat-operation-state";
import type { InitiativeTrackerReadModel } from "@/features/tabletop-operations/initiative-tracker";
import type { CombatAidEncounterView } from "@/features/tabletop-operations/combat-aid-service";
import type { ActionDeclarationWorkspaceView } from "@/features/tabletop-operations/action-declaration-service";
import type { DefenseInterventionWorkspaceView } from "@/features/tabletop-operations/defense-intervention-service";
import type { ActionEffectWorkspaceView } from "@/features/tabletop-operations/action-effect-plan-service";
import type { FirearmWorkspaceView } from "@/features/tabletop-operations/firearm-readiness-service";
import type { FirearmAttackWorkspaceView } from "@/features/tabletop-operations/firearm-attack-service";
import type { PlayerCombatRulingRequestView } from "@/features/tabletop-operations/player-combat-ruling-service";
import type { RollWorkspaceView } from "@/features/tabletop-operations/roll-runtime-service";
import type { CombatRunnerSubmission } from "@/features/tabletop-operations/combat-runner-decision";
import { TabletopLiveRefresh } from "@/features/tabletop-operations/tabletop-live-refresh";
import { getGodCombatRunner, continueGodCombatRunner, submitGodCombatDecision } from "./combat-runner-actions";
import { ForceEndEncounterControl } from "./force-end-encounter-control";
import { InitiativeTracker } from "./initiative-tracker";
import { recoverClosedEncounterInitiative } from "./initiative-actions";
import { ActionDeclarationWorkspace } from "./action-declaration-workspace";
import { DefenseInterventionWorkspace } from "./defense-intervention-workspace";
import { ActionEffectPlanWorkspace } from "./action-effect-plan-workspace";
import { PlayerCombatRulingWorkspace } from "./player-combat-ruling-workspace";
import { FirearmAttackWorkspace } from "./firearm-attack-workspace";
import { FirearmReadinessWorkspace } from "./firearm-readiness-workspace";
import { GodCombatRolls } from "./god-combat-rolls";
import { CombatAidWorkspace } from "./combat-aid-workspace";

type Props = {
  campaignId: number; returnHref: string; initialSelectedCombatantId: number | null;
  initiative: InitiativeTrackerReadModel; combatAid: CombatAidEncounterView | null;
  declarations: ActionDeclarationWorkspaceView | null; defenses: DefenseInterventionWorkspaceView | null;
  effects: ActionEffectWorkspaceView | null; firearmReadiness: FirearmWorkspaceView | null;
  firearmAttacks: FirearmAttackWorkspaceView | null; playerRulings: readonly PlayerCombatRulingRequestView[];
  rollWorkspace: RollWorkspaceView | null;
};

export function EncounterBattleScreen(props: Props) {
  const { initiative, declarations, defenses, effects, combatAid, firearmReadiness, firearmAttacks, rollWorkspace } = props;
  const encounterId = initiative.encounter.id;
  const router = useRouter();
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const read = useCallback(() => getGodCombatRunner(encounterId), [encounterId]);
  const submit = useCallback((input: CombatRunnerSubmission) => submitGodCombatDecision(encounterId, input), [encounterId]);
  const advance = useCallback((input: Parameters<typeof continueGodCombatRunner>[1]) => continueGodCombatRunner(encounterId, input), [encounterId]);
  const end = <ForceEndEncounterControl key={encounterId} encounterId={encounterId} />;
  const runtime = initiative.runtime;
  const live = runtime?.runtime.status === "active";
  const combatants = (declarations?.participants ?? []).map((participant) => {
    const state = combatAid?.participants.find(({ identity }) => identity.characterId === participant.characterId);
    const hp = state?.occurrenceState ?? null;
    const health = hp ? `${hp.remainingHp ?? "?"}/${hp.maximumHp ?? "?"}`
      : state?.health ? `${state.health.total.remainingHp ?? "?"}/${state.health.total.maximumHp ?? "?"}` : undefined;
    return { ...participant, health, movementMode: initiative.participants.find(({ characterId }) => characterId === participant.characterId)?.movementMode };
  });
  async function recover() {
    setRecovering(true); setRecoveryError(null);
    try { await recoverClosedEncounterInitiative(encounterId); router.refresh(); }
    catch (cause) { setRecoveryError(cause instanceof Error ? cause.message : "Combat could not be recovered."); }
    finally { setRecovering(false); }
  }
  if (!runtime || !live || !declarations || !defenses) return <section>
    <h1>{initiative.encounter.title}</h1>{end}<Link className="st-button" href={props.returnHref}>Tabletop reference</Link>
    {!runtime ? <InitiativeTracker data={initiative} /> : <>
      <p>Combat is closed or its details are unavailable. End the encounter, or recover unfinished combat without changing recorded rolls.</p>
      <button type="button" className="st-button" disabled={recovering} onClick={() => void recover()}>Continue unfinished combat</button>
      {recoveryError ? <p role="alert">{recoveryError}</p> : null}
    </>}
  </section>;
  return <CombatOperationStateProvider scope={`guided-god:${encounterId}`}>
    <CombatRunnerWorkspace key={encounterId} title={initiative.encounter.title}
      round={runtime.runtime.roundNumber} timeline={runtime.runtime.timelineInitiative}
      combatants={combatants} declarations={declarations.declarations} defenses={defenses}
      controlledIds={combatants.filter(({ choiceOwner }) => choiceOwner === "god").map(({ characterId }) => characterId)}
      readSnapshot={read} submitDecision={submit} continueCombat={advance}
      refreshKey={JSON.stringify([runtime, declarations.declarations, defenses.reactions, effects?.plans])}
      headerActions={<><TabletopLiveRefresh mode="god" campaignId={props.campaignId} /><Link className="st-button is-secondary" href={props.returnHref}>Tabletop reference</Link>{end}</>}
      renderException={(task) => <>
        {task.kind === "ruling" ? <>
          <ActionDeclarationWorkspace view={{ ...declarations, declarations: declarations.declarations.filter(({ id }) => id === task.declarationId) }} compact />
          <DefenseInterventionWorkspace actions={declarations} defense={defenses} selectedDeclarationId={task.declarationId} compact />
          {effects ? <ActionEffectPlanWorkspace encounterId={encounterId} view={effects} selectedDeclarationId={task.declarationId} compact /> : null}
        </> : task.declarationId !== null ? <GodCombatRolls encounterId={encounterId} selectedCombatantId={task.participantId}
          declarations={declarations} defenses={defenses} firearms={firearmAttacks} workspace={rollWorkspace} runtimeClosed={false} />
          : <p>Check holding combatants and G.O.D. tools below. No decision or roll has been invented.</p>}
      </>}
      reference={<>
        <p>These are exception and source-specific controls. Ordinary attacks and defenses use the guided card above.</p>
        <details><summary>Initiative corrections, Hold and round overrides</summary><InitiativeTracker data={initiative} /></details>
        <details><summary>Other actions, spells and eligibility rulings</summary><ActionDeclarationWorkspace view={declarations} /></details>
        <details><summary>Defense rulings and Skill configuration</summary><DefenseInterventionWorkspace actions={declarations} defense={defenses} /></details>
        {effects ? <details><summary>Review or correct results</summary><ActionEffectPlanWorkspace encounterId={encounterId} view={effects} /></details> : null}
        {firearmReadiness && firearmAttacks ? <details><summary>Firearm preparation and attacks</summary><FirearmReadinessWorkspace view={firearmReadiness} /><FirearmAttackWorkspace readiness={firearmReadiness} attackView={firearmAttacks} /></details> : null}
        {props.playerRulings.length ? <PlayerCombatRulingWorkspace encounterId={encounterId} requests={props.playerRulings} /> : null}
        {combatAid ? <details><summary>Character resources and manual rulings</summary><CombatAidWorkspace data={combatAid} rollWorkspace={rollWorkspace} /></details> : null}
      </>}
    />
  </CombatOperationStateProvider>;
}
