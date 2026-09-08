/** Character IDs are positive; direct encounter occurrences retain their negative runtime key. */
export function assertCombatParticipantKey(value: number, label = "Combat participant"): void {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`${label} must be an exact nonzero participant key.`);
}
