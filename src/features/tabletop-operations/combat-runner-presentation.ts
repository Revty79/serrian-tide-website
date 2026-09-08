import type { CombatTask } from "./combat-progression";

export type RunnerParticipant = Readonly<{
  id: number; name: string; initiative: number; status: string; controlled: boolean;
  movementMode: string; pending?: string | null; health?: string;
  attacks: readonly Readonly<{ key: string; name: string; kind: "weapon" | "creature-attack"; cost: number | null }>[];
  defendingWeapons: readonly Readonly<{ key: string; name: string }>[];
}>;

export function canControlCombatTask(task: CombatTask, participants: readonly Pick<RunnerParticipant, "id" | "controlled">[], role: "god" | "player"): boolean {
  if (task.kind === "eligibility" || task.kind === "ruling") return role === "god";
  if (!["choose-action", "choose-response", "roll-attack", "roll-defense"].includes(task.kind)) return false;
  return participants.some(({ id, controlled }) => id === task.participantId && controlled);
}

export function selectRunnerTask(tasks: readonly CombatTask[], requestedKey: string | null, participants: readonly Pick<RunnerParticipant, "id" | "controlled">[], role: "god" | "player"): CombatTask | null {
  return tasks.find(({ key }) => key === requestedKey)
    // Finish pending G.O.D. eligibility questions before defaulting to an NPC
    // response. Explicit inspection stays put; this does not change legal tasks.
    ?? (role === "god" ? tasks.find(({ kind }) => kind === "eligibility") : undefined)
    ?? tasks.find((task) => canControlCombatTask(task, participants, role))
    ?? tasks[0] ?? null;
}

/** Manual tools and a lost connection pause bookkeeping, never player choices. */
export function canAutomaticallyProgressCombat(input: {
  canGovern: boolean; serverReady: boolean; paused: boolean; toolsOpen: boolean;
  busy: boolean; loadFailed: boolean; revision: string | null; attemptedRevision: string | null;
}): boolean {
  return input.canGovern && input.serverReady && !input.paused && !input.toolsOpen
    && !input.busy && !input.loadFailed && input.revision !== null
    && input.revision !== input.attemptedRevision;
}
