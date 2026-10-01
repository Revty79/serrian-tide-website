import { normalizeDamageTypes } from "@/features/damage-types/damage-types";

type Modifier = { damageType: string; modifier: string; modifierText: string; notes: string };
type Weapon = { damageType: string };

/** Retained values must come from the locked saved Item, never client-supplied metadata. */
export function normalizeWeaponDamageType(weapon: Weapon, stored: Weapon | null): string {
  return normalizeDamageTypes(weapon.damageType, { multiple: true, retainedValue: stored?.damageType, label: "Weapon Damage Type" });
}

/** Unresolved legacy armor rules can survive unchanged, but cannot be added or duplicated. */
export function normalizeArmorDamageTypes<T extends Modifier>(rows: readonly T[], stored: readonly Modifier[]): T[] {
  const retained = [...stored];
  return rows.map((row, index) => {
    const prior = retained.findIndex(old => old.damageType === row.damageType && old.modifier === row.modifier && old.modifierText === row.modifierText && old.notes === row.notes);
    const previous = prior < 0 ? undefined : retained.splice(prior, 1)[0];
    return { ...row, damageType: normalizeDamageTypes(row.damageType, { multiple: true, required: true, retainedValue: previous?.damageType, label: `Armor Modifier ${index + 1} Damage Type` }) };
  });
}
