import type { CombatTask } from "./combat-progression";

export type RunnerParticipant = Readonly<{
  id: number; name: string; initiative: number; status: string; controlled: boolean;
  movementMode: string; pending?: string | null; health?: string;
  attacks: readonly Readonly<{ key: string; name: string; kind: "weapon" | "creature-attack"; cost: number | null }>[];
  defendingWeapons: readonly Readonly<{ key: string; name: string }>[];
}>;

export function canControlCombatTask(task: CombatTask, participants: readonly RunnerParticipant[], role: "god" | "player"): boolean {
  if (task.kind === "eligibility" || task.kind === "ruling") return role === "god";
  if (!["choose-action", "choose-response", "roll-attack", "roll-defense"].includes(task.kind)) return false;
  return participants.some(({ id, controlled }) => id === task.participantId && controlled);
}

export function selectRunnerTask(tasks: readonly CombatTask[], requestedKey: string | null, participants: readonly RunnerParticipant[], role: "god" | "player"): CombatTask | null {
  return tasks.find(({ key }) => key === requestedKey)
    ?? tasks.find((task) => canControlCombatTask(task, participants, role))
    ?? tasks[0] ?? null;
}
