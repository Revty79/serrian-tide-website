import type { readCombatScreen } from "./screen-actions";
export type CombatScreenScope = { role: "god"; encounterId: number } | { role: "player"; encounterId: number; characterId: number };
export type CombatScreenData = Awaited<ReturnType<typeof readCombatScreen>>;
export type CombatEntity = NonNullable<CombatScreenData["projection"]>["entities"][number];
export const COMBAT_COMMANDS = ["Attack", "Cast", "Item", "Ability", "Defend", "Hold", "Move", "Called Shot"] as const;
export type CombatCommand = typeof COMBAT_COMMANDS[number];
export function combatActionStatus(entry: NonNullable<CombatScreenData["projection"]>["declarations"][number]) {
  if (["resolved", "cancelled", "abandoned"].includes(entry.status)) return entry.status;
  if (entry.timing?.status === "active") return entry.status === "awaiting-god-ruling" ? "Underway; a G.O.D. ruling is needed" : "Underway";
  if (entry.timing?.status === "completed") return "Timing complete; result pending";
  return entry.status.replaceAll("-", " ");
}
export function combatScreenPrompt(data: CombatScreenData, selected: CombatEntity | undefined) {
  if (data.pause.frozen) return "Combat is paused by the G.O.D. You can still inspect the fight.";
  if (data.projection?.closed) return "Combat has ended. Inspect the final information and history.";
  if (!data.initialized) return "The G.O.D. must prepare the roster and start Initiative.";
  if (!data.projection) return "Waiting for the G.O.D. to enroll your Character in Initiative.";
  if (!selected) return "Select a combatant to inspect it.";
  if (selected.canControl && selected.mustChooseNow) return `${selected.name} can act now: move, choose an action against their own legal target, Hold or Pass. Select Defend to use an available response. Combat time waits for your choice; unfinished actions keep their progress.`;
  if (selected.canControl && selected.canRespondNow) return `${selected.name} can respond now. Choose Defend, then a defense or no reaction. Hold does not answer an attack.`;
  if (selected.canControl && selected.actionReason === "Waiting for this combatant's Initiative opportunity.") return `Combat is at Initiative ${data.projection.runtime.timelineInitiative}. ${selected.name}'s next ordinary choice, including Hold, is at ${selected.currentInitiative}. Waiting for the G.O.D. to continue combat.`;
  if (selected.heldInterventionAvailable && !selected.mustChooseNow) return `${selected.statusText} ${data.projection.progression.reason}`;
  return selected.statusText;
}
