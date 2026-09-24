export const CHARACTER_TRACKING_KEYS = [
  "fame", "experience", "totalExperience", "quintessence", "totalQuintessence",
] as const;
export type CharacterTrackingKey = (typeof CHARACTER_TRACKING_KEYS)[number];
export type CharacterTrackingValues = Record<CharacterTrackingKey, number>;

/** Call with the authenticated identity and the Character's persisted Campaign owner. */
export function canManageCharacterSheet(userId: string, campaignOwnerUserId: string): boolean {
  return userId === campaignOwnerUserId;
}

/** Omission means preserve the stored value, including for an authorized owner. */
export function characterTrackingPatch(
  profile: Partial<CharacterTrackingValues>,
  canAccessPrivateGod: boolean,
  stored?: CharacterTrackingValues,
): Partial<CharacterTrackingValues> {
  const patch: Partial<CharacterTrackingValues> = {};
  for (const key of CHARACTER_TRACKING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(profile, key)) continue;
    const value = profile[key];
    if (!canAccessPrivateGod) {
      if (!stored || value !== stored[key]) throw new Error("Only this Character's Campaign creator can change tracking values.");
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error("Tracking values must be finite numbers zero or greater.");
    }
    patch[key] = value;
  }
  return patch;
}
