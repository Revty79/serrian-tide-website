"use client";

import Link from "next/link";
import { useCallback, type ComponentProps } from "react";
import { PlayerCalledCheckPanel } from "@/app/realms/characters/[characterId]/player-called-check-panel";
import { CombatRunnerWorkspace } from "@/components/tabletop/combat-runner-workspace";
import type { CombatRunnerSubmission } from "@/features/tabletop-operations/combat-runner-decision";
import { TabletopLiveRefresh } from "@/features/tabletop-operations/tabletop-live-refresh";
import { getPlayerCombatRunner, submitPlayerCombatDecision } from "./combat-runner-actions";
import { PlayerCombatConsole as CorePlayerCombatConsole } from "./player-combat-console-core";

export { PlayerCombatIntentButton } from "./player-combat-console-core";
type Props = ComponentProps<typeof CorePlayerCombatConsole> & {
  rolls?: readonly { id: number; effectiveResultTotal: number }[];
  calledChecks?: ComponentProps<typeof PlayerCalledCheckPanel>["view"] | null;
};
export function PlayerCombatConsole(props: Props) {
  const characterId = props.characterId;
  const combat = props.combat;
  const encounterId = combat.context.encounterId;
  const read = useCallback(() => getPlayerCombatRunner(encounterId, characterId), [encounterId, characterId]);
  const submit = useCallback((input: CombatRunnerSubmission) => submitPlayerCombatDecision(encounterId, characterId, input), [encounterId, characterId]);
  const combatants = combat.declarations.participants.map((participant) => ({ ...participant,
    health: participant.characterId === characterId ? props.resources.health : undefined,
    movementMode: participant.characterId === characterId ? combat.initiative.movementMode : undefined,
  }));
  return <CombatRunnerWorkspace key={`${encounterId}:${characterId}`} title={props.encounterTitle}
    round={combat.initiative.roundNumber} timeline={combat.initiative.timelineInitiative}
    combatants={combatants} declarations={combat.declarations.declarations} defenses={combat.defenses}
    controlledIds={[characterId]} readSnapshot={read} submitDecision={submit}
    refreshKey={JSON.stringify([combat.initiative, combat.declarations, combat.defenses.reactions, combat.effects.plans])}
    headerActions={<><TabletopLiveRefresh mode="player" characterId={characterId} scope="console" />
      <Link className="st-button is-secondary" href={props.returnHref}>Tabletop reference</Link>
      <Link className="st-button" href={`/realms/characters/${characterId}`}>{props.characterName}</Link></>}
    renderException={() => <p>Waiting for G.O.D. or another combatant. Your own required attack and defense rolls appear in this card when ready.</p>}
    reference={<>
      {props.calledChecks ? <PlayerCalledCheckPanel view={props.calledChecks} /> : null}
      <p>The guided card handles ordinary attacks and defenses. Additional Character controls remain available while their guided paths are completed.</p>
      <CorePlayerCombatConsole {...props} />
    </>}
  />;
}
