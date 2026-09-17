export const WEAPON_PROFILE_RECORD_TYPE_OPTIONS = ["Weapon", "Ammunition"] as const;
export const WEAPON_HANDEDNESS_OPTIONS = ["One-Handed", "Two-Handed", "Versatile"] as const;
export const WEAPON_DAMAGE_SOURCE_OPTIONS = ["Weapon", "Ammunition"] as const;

type WeaponAuthoringValues = {
  profileRecordType: string;
  handedness: string;
  damageSource: string;
};

type StoredWeaponAuthoringValues = WeaponAuthoringValues | null;

function isSupported(value: string, options: readonly string[]): boolean {
  return options.some((option) => option.toLocaleLowerCase("en-US") === value.toLocaleLowerCase("en-US"));
}

function validateChoice(
  value: string,
  storedValue: string | null,
  label: string,
  options: readonly string[],
): void {
  if (!value || isSupported(value, options)) return;
  if (storedValue !== null && storedValue.trim() === value) return;
  throw new Error(`${label} must use a supported authoring value: ${options.join(", ")}. Existing historical value '${value}' can only be preserved unchanged.`);
}

export function validateWeaponAuthoringValues(
  next: WeaponAuthoringValues,
  stored: StoredWeaponAuthoringValues = null,
): WeaponAuthoringValues {
  validateChoice(next.profileRecordType, stored?.profileRecordType ?? null, "Profile Record Type", WEAPON_PROFILE_RECORD_TYPE_OPTIONS);
  validateChoice(next.handedness, stored?.handedness ?? null, "Handedness", WEAPON_HANDEDNESS_OPTIONS);
  validateChoice(next.damageSource, stored?.damageSource ?? null, "Damage Source", WEAPON_DAMAGE_SOURCE_OPTIONS);
  return next;
}
