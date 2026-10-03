import { normalizeDamageTypes } from "@/features/damage-types/damage-types";
import { overlappingArmorDamageTypes, parseArmorSoakModifier } from "./armor-damage-modifiers";

type Modifier = { damageType: string; modifier: string; modifierText: string; notes: string };
type Weapon = { damageType: string };

/** Retained values must come from the locked saved Item, never client-supplied metadata. */
export function normalizeWeaponDamageType(weapon: Weapon, stored: Weapon | null): string {
  return normalizeDamageTypes(weapon.damageType, { multiple: true, retainedValue: stored?.damageType, label: "Weapon Damage Type" });
}

/** Unresolved legacy armor rules can survive unchanged, but cannot be added or duplicated. */
export function normalizeArmorDamageTypes<T extends Modifier>(rows: readonly T[], stored: readonly Modifier[]): T[] {
  const retained = [...stored];
  const preserved: boolean[] = [];
  const normalized = rows.map((row, index) => {
    const prior = retained.findIndex(old => old.damageType === row.damageType && old.modifier === row.modifier && old.modifierText === row.modifierText && old.notes === row.notes);
    const previous = prior < 0 ? undefined : retained.splice(prior, 1)[0];
    preserved.push(previous !== undefined);
    if (parseArmorSoakModifier(row.modifier) === null && !previous) throw new Error(`Armor Modifier ${index + 1}: enter a finite signed decimal such as +2 or -2. Source Text and Notes do not supply the value.`);
    return { ...row, damageType: normalizeDamageTypes(row.damageType, { multiple: true, required: true, retainedValue: previous?.damageType, label: `Armor Modifier ${index + 1} Damage Type` }) };
  });
  const overlaps = overlappingArmorDamageTypes(normalized);
  for (const type of overlaps) {
    if (normalized.some((row, index) => !preserved[index] && row.damageType.split(" / ").includes(type))) throw new Error(`Armor has more than one Modifier for ${type}. Use one definition for each Damage Type; unchanged legacy duplicates require a G.O.D. ruling.`);
  }
  return normalized;
}
