"use client";

import { CombatRollPanel, type CombatRollInput, type CombatRollRecorded } from "@/components/tabletop/combat-roll-panel";
import { buildCombatRollPrompts, buildFirearmRollPrompts, type CombatRollPrompt } from "@/features/tabletop-operations/combat-roll-prompts";
import type { ActionDeclarationWorkspaceView } from "@/features/tabletop-operations/action-declaration-service";
import type { DefenseInterventionWorkspaceView } from "@/features/tabletop-operations/defense-intervention-service";
import type { FirearmAttackWorkspaceView } from "@/features/tabletop-operations/firearm-attack-service";
import type { RollWorkspaceView } from "@/features/tabletop-operations/roll-runtime-service";

import { recordDeclaredAttackRoll, recordDeclaredResponseRoll } from "./defense-intervention-actions";
import { commitFirearmAttackTrigger, fireFirearmAttack } from "./firearm-attack-actions";
import { ForceEndEncounterControl } from "./force-end-encounter-control";
import { recordGodRoll } from "./roll-actions";

export function GodCombatRolls({
  encounterId, selectedCombatantId, declarations, defenses, firearms, workspace, runtimeClosed,
}: {
  encounterId: number;
  selectedCombatantId: number | null;
  declarations: ActionDeclarationWorkspaceView | null;
  defenses: DefenseInterventionWorkspaceView | null;
  firearms: FirearmAttackWorkspaceView | null;
  workspace: RollWorkspaceView | null;
  runtimeClosed: boolean;
}) {
  const controlledIds = declarations?.participants.filter(({ choiceOwner }) => choiceOwner === "god").map(({ characterId }) => characterId) ?? [];
  const prompts: CombatRollPrompt[] = [
    ...buildCombatRollPrompts({
      declarations: declarations?.declarations ?? [],
      reactions: defenses?.reactions ?? [],
      controlledParticipantIds: controlledIds,
      allowManualTarget: true,
    }),
    ...buildFirearmRollPrompts(firearms?.attacks ?? [], controlledIds, declarations?.declarations ?? []),
  ];
  if (workspace) prompts.push({
    key: "free", kind: "free", recordId: 0, label: "Other d100 — not an action",
    ready: workspace.session.status !== "completed",
    detail: "This is a general Roll for the selected combatant, not an attack or defense. Select a named action above to resolve combat. Player-owned combat Rolls belong on that Player's combat screen.",
  });

  async function submit(prompt: CombatRollPrompt, input: CombatRollInput): Promise<CombatRollRecorded> {
    if (prompt.kind === "attack") {
      const rollId = await recordDeclaredAttackRoll(encounterId, prompt.recordId, input);
      return { rollId, text: `${prompt.label}: attack Roll recorded for this action. Required defenses are compared when ready.` };
    }
    if (prompt.kind === "defense") {
      const rollId = await recordDeclaredResponseRoll(encounterId, prompt.recordId, input);
      return { rollId, text: `${prompt.label}: defense Roll recorded for this attack.` };
    }
    if (prompt.kind === "firearm-trigger" || prompt.kind === "firearm-roll" || prompt.kind === "firearm-finish") {
      const attack = firearms?.attacks.find(({ id }) => id === prompt.recordId);
      if (!attack) throw new Error("This firearm attack is no longer available. Refresh combat.");
      if (prompt.kind === "firearm-trigger") {
        await commitFirearmAttackTrigger(encounterId, attack.id, attack.actorParticipantId);
        return { text: `${prompt.label}: trigger pull committed. Continue the shot's Initiative timing.` };
      }
      const result = await fireFirearmAttack(encounterId, attack.id, [attack.actorParticipantId, attack.targetParticipantId], input);
      return {
        rollId: result.rollId,
        text: result.waitingForDefenseRolls
          ? `${prompt.label}: attack Roll recorded; waiting for defense Rolls. Finish firing will become available here without rolling again.`
          : `${prompt.label}: firearm result recorded using its own combat resolution.`,
      };
    }
    if (prompt.kind !== "free") throw new Error("This combat Roll is no longer available. Refresh combat.");
    if (!workspace) throw new Error("No active Session is available for this Roll.");
    const result = await recordGodRoll({
      sessionId: workspace.session.id,
      sceneId: workspace.selectedScene?.id ?? null,
      encounterId,
      rollerCharacterId: selectedCombatantId,
      targetCharacterId: null,
      pendingActionId: null,
      reactionId: null,
      method: input.method,
      enteredTotal: input.enteredTotal ?? null,
      visibility: "table",
      purposeKind: "free",
      label: "General combat d100",
      notes: "General Roll only; not attached to an action or defense.",
      targetNumber: null,
      mechanical: null,
    });
    return { resultTotal: result.resultTotal, text: "General d100 recorded. This Roll is not attached to an action." };
  }

  return <>
    <ForceEndEncounterControl key={encounterId} encounterId={encounterId} />
    <CombatRollPanel prompts={prompts} rolls={workspace?.initialHistory.rolls} onSubmit={submit}
      emptyMessage="Start Initiative and declare an action or defense to prepare a combat Roll."
      unavailableReason={runtimeClosed ? "Initiative is closed. Use Continue unfinished combat before recording action or defense Rolls." : null} />
  </>;
}
