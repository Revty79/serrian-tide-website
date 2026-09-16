export type PeriodicHealthApplication = "area" | "full-body";
export type PeriodicHealthFrequency = "combat-steps" | "combat-rounds";

export function requirePeriodicHealthApplication(
  application: PeriodicHealthApplication,
  poolKey: string | null | undefined,
): string | null {
  if (application === "area") {
    const normalized = poolKey?.trim() ?? "";
    if (!normalized) throw new Error("Periodic Area Health requires a frozen HP Pool.");
    return normalized;
  }
  if (poolKey?.trim()) throw new Error("Periodic Full Body Health must not specify an HP Pool.");
  return null;
}

export function getPeriodicDueCount(
  frequency: PeriodicHealthFrequency,
  nextStep: number,
  nextRound: number,
  afterStep: number,
  afterRound: number,
  crossedBoundaries: number,
): number {
  if (crossedBoundaries <= 0) return 0;
  const due = frequency === "combat-steps"
    ? afterStep - nextStep + 1
    : afterRound - nextRound + 1;
  return Math.max(0, Math.min(crossedBoundaries, due));
}

export function consumePeriodicApplications(
  remainingApplications: number,
  dueCount: number,
): { remainingApplications: number; completed: boolean } {
  if (!Number.isSafeInteger(remainingApplications) || remainingApplications < 0) throw new Error("Remaining periodic applications must be nonnegative.");
  if (!Number.isSafeInteger(dueCount) || dueCount < 0) throw new Error("Periodic due count must be nonnegative.");
  const remaining = Math.max(0, remainingApplications - dueCount);
  return { remainingApplications: remaining, completed: remaining === 0 };
}
