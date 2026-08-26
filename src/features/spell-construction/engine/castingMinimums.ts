export const MINIMUM_CASTING_MANA = 1;
export const MINIMUM_COMBAT_CASTING_TIME = 1;
export const MINIMUM_OUT_OF_COMBAT_CASTING_TIME_SECONDS = 1;

export function roundCastingManaDown(unroundedMana: number): number {
  return Math.floor(unroundedMana);
}

export function enforceMinimumCastingMana(roundedMana: number): number {
  return Math.max(MINIMUM_CASTING_MANA, roundedMana);
}

export function normalizeCombatCastingTimeAdjustment(adjustment = 0): number {
  return Number.isFinite(adjustment) ? Math.max(0, Math.floor(adjustment)) : 0;
}

export function calculateCastingTimesWithMinimum(
  castingMana: number,
  combatCastingTimeAdjustment = 0,
): {
  combatCastingTime: number;
  outOfCombatCastingTimeSeconds: number;
} {
  return {
    combatCastingTime: Math.max(
      MINIMUM_COMBAT_CASTING_TIME,
      Math.ceil(castingMana / 2),
    ) + normalizeCombatCastingTimeAdjustment(combatCastingTimeAdjustment),
    outOfCombatCastingTimeSeconds: Math.max(
      MINIMUM_OUT_OF_COMBAT_CASTING_TIME_SECONDS,
      castingMana,
    ),
  };
}

