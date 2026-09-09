/** Brannan's 9 September clarification: blank creature protection means none.
 * Preserve authored numbers; malformed or negative values still need a ruling. */
export function creatureProtectionValue(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "string" && value.trim() === "") return 0;
  if (typeof value !== "number" && (typeof value !== "string" || !/^(?:\d+\.?\d*|\.\d+)$/.test(value.trim()))) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
