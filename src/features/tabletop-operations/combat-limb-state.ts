import { combatObject as object } from "./combat-condition-state";

export type CombatLimbCondition = {
  poolKey: string;
  name: string;
  sourceEffectId: number;
  incapacitatedAt: string;
  recoveredAt?: string;
};

export function combatLimbConditions(local: unknown): CombatLimbCondition[] {
  const entries = object(local).limbConditions;
  return Array.isArray(entries) ? entries.filter((entry): entry is CombatLimbCondition => {
    const row = object(entry);
    return typeof row.poolKey === "string" && typeof row.name === "string"
      && Number.isSafeInteger(row.sourceEffectId) && typeof row.incapacitatedAt === "string";
  }) : [];
}

/** Recognize authored limb names, never derive a limb from an arbitrary pool ID.
 * Exceptional location mechanics and mixed body/limb pools require their own rule. */
export function isLimbName(name: string): boolean {
  return /\b(?:arms?|legs?|forelegs?|hindlegs?|forelimbs?|hindlimbs?|wings?|tentacles?|limbs?)\b/i.test(name);
}

export function limbDamageIncapacitates(input: {
  poolKey: string | null; poolName: string; poolDamage: number; maximumHp: number | null;
  locations: { name: string; poolKey: string | null; specialEffect?: unknown }[];
}): boolean {
  const locations = input.locations.filter((entry) => entry.poolKey === input.poolKey);
  return input.poolKey !== null && input.maximumHp !== null && Number.isFinite(input.maximumHp) && input.maximumHp > 0
    && Number.isFinite(input.poolDamage) && input.poolDamage >= input.maximumHp && isLimbName(input.poolName)
    && locations.length > 0 && locations.every((entry) => isLimbName(entry.name) && !entry.specialEffect);
}
