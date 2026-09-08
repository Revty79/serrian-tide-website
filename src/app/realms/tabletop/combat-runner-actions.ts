"use server";

import { db } from "@/db";
import { requirePlayer } from "@/lib/server-access";
import { lockPlayerCombatContextInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { readCombatRunnerInTransaction } from "@/features/tabletop-operations/combat-runner-service";

export async function getPlayerCombatRunner(encounterId: number, characterId: number) {
  const access = await requirePlayer();
  return db.transaction(async (tx) => {
    const context = await lockPlayerCombatContextInTransaction(tx, encounterId, characterId, access.user.id);
    const { snapshot } = await readCombatRunnerInTransaction(tx, context);
    const own = snapshot.progression.tasks.filter((task) => task.participantId === characterId
      && ["choose-action", "choose-response", "roll-attack", "roll-defense"].includes(task.kind)).map((task) => ({
        ...task,
        title: task.kind === "choose-action" ? "Choose your action" : task.kind === "choose-response" ? "Choose your response"
          : task.kind === "roll-defense" ? "Roll your defense" : "Roll your action",
        detail: task.kind === "choose-action" ? "Choose an action, Hold, or Pass."
          : task.kind === "choose-response" ? "Choose your response before the related rolls."
          : "This roll belongs to your committed action or defense. Its permitted details are shown below.",
      }));
    // No opponent intentions, hidden eligibility, secret sources or rolls leave
    // the server through the coordination view. Existing authorized projections
    // provide the player's actual action/response details.
    return { ...snapshot, autoContinue: false, heldNames: [], progression: {
      ...snapshot.progression, canAdvanceTime: false, canStartRound: false,
      actingParticipantIds: own.filter(({ kind }) => kind === "choose-action").map(() => characterId),
      tasks: own.length ? own : [{ key: "waiting", kind: "blocked" as const,
        participantId: null, declarationId: null, recordId: null,
        title: "Waiting for the table", detail: "G.O.D. or another combatant has the next decision. Your required action and defense rolls will appear here." }],
    } };
  });
}

export async function submitPlayerCombatDecision(encounterId: number, characterId: number, input: import("@/features/tabletop-operations/combat-runner-decision").CombatRunnerSubmission) {
  const access = await requirePlayer();
  const { submitCombatRunnerDecisionInTransaction } = await import("@/features/tabletop-operations/combat-runner-decision-service");
  const { revalidatePath } = await import("next/cache");
  const result = await db.transaction(async (tx) => {
    const context = await lockPlayerCombatContextInTransaction(tx, encounterId, characterId, access.user.id);
    return submitCombatRunnerDecisionInTransaction(tx, context, { authority: "player", userId: access.user.id, characterId }, input);
  });
  revalidatePath("/heavens/tabletop");
  revalidatePath("/realms/tabletop");
  return result;
}
