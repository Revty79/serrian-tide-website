/** Older immutable attacks predate injury timing and retain their original cadence. */
export function firearmTimingMultiplier(snapshot: unknown): number {
  const timing = (snapshot as { timing?: { multiplier?: number } } | null)?.timing;
  return timing?.multiplier === 2 ? 2 : 1;
}

export function completedFirearmPortions(snapshot: unknown, initiativeSpent: number): number {
  return Math.floor(initiativeSpent / firearmTimingMultiplier(snapshot));
}
