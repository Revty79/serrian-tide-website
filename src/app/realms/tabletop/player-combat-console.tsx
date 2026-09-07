"use client";

import type { ComponentProps } from "react";

import { PlayerCalledCheckPanel } from "@/app/realms/characters/[characterId]/player-called-check-panel";
import { CombatRollPanel, type CombatRollInput, type CombatRollRecorded } from "@/components/tabletop/combat-roll-panel";
import { buildCombatRollPrompts, buildFirearmRollPrompts, type CombatRollPrompt } from "@/features/tabletop-operations/combat-roll-prompts";

import { recordPlayerTabletopFreeRoll } from "./actions";
import {
  commitPlayerFirearmTrigger,
  firePlayerFirearmAttack,
  rollPlayerDeclaredAttack,
  rollPlayerDeclaredResponse,
} from "./player-combat-actions";
import { PlayerCombatConsole as CorePlayerCombatConsole } from "./player-combat-console-core";

export { PlayerCombatIntentButton } from "./player-combat-console-core";

type PlayerCombatConsoleProps = ComponentProps<typeof CorePlayerCombatConsole> & {
  rolls?: readonly { id: number; effectiveResultTotal: number }[];
  calledChecks?: ComponentProps<typeof PlayerCalledCheckPanel>["view"] | null;
};

function submissionKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function PlayerCombatConsole({ calledChecks, rolls, ...props }: PlayerCombatConsoleProps) {
  const { characterId, combat } = props;
  const controlledIds = [characterId];
  const prompts: CombatRollPrompt[] = [
    ...buildCombatRollPrompts({
      declarations: combat.declarations.declarations,
      reactions: combat.defenses.reactions,
      controlledParticipantIds: controlledIds,
      allowManualTarget: false,
    }),
    ...buildFirearmRollPrompts(combat.firearmAttacks.attacks, controlledIds),
    {
      key: "free", kind: "free", recordId: 0, label: "Other d100 — not an action", ready: true,
      detail: "This is a general Roll, not an attack or defense. To resolve combat, select the named action above. If none is listed, declare your action or defense in combat first.",
    },
  ];

  async function submit(prompt: CombatRollPrompt, input: CombatRollInput): Promise<CombatRollRecorded> {
    const encounterId = combat.context.encounterId;
    const roll = { method: input.method, enteredTotal: input.enteredTotal };
    if (prompt.kind === "attack") {
      const rollId = await rollPlayerDeclaredAttack(characterId, encounterId, prompt.recordId, roll);
      return { rollId, text: `${prompt.label}: attack Roll recorded for this action. Required defenses are compared when ready.` };
    }
    if (prompt.kind === "defense") {
      const rollId = await rollPlayerDeclaredResponse(characterId, encounterId, prompt.recordId, roll);
      return { rollId, text: `${prompt.label}: defense Roll recorded for this attack.` };
    }
    if (prompt.kind === "firearm-trigger") {
      await commitPlayerFirearmTrigger(characterId, encounterId, prompt.recordId);
      return { text: `${prompt.label}: trigger pull committed. Continue the shot's Initiative timing.` };
    }
    if (prompt.kind === "firearm-roll" || prompt.kind === "firearm-finish") {
      const rollId = await firePlayerFirearmAttack(characterId, encounterId, prompt.recordId, roll);
      return { rollId, text: `${prompt.label}: firearm result recorded using its own combat resolution.` };
    }
    const result = await recordPlayerTabletopFreeRoll(characterId, {
      ...roll, visibility: "table", label: "General combat d100", idempotencyKey: submissionKey(),
    });
    return { resultTotal: result.resultTotal, text: "General d100 recorded. This Roll is not attached to an action." };
  }

  return <>
    <CombatRollPanel rolls={rolls} prompts={prompts} onSubmit={submit} emptyMessage="Choose an action or defense below to prepare a combat Roll." />
    {calledChecks ? <PlayerCalledCheckPanel view={calledChecks} /> : null}
    <CorePlayerCombatConsole {...props} />
  </>;
}
