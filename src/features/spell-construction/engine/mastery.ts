import type { MasteryBand, SpellMastery } from '../models/rules';
import { serrianTideRules } from '../data/spellRules';

export function getSpellMastery(
  totalMana: number,
  bands: readonly MasteryBand[] = serrianTideRules.masteryBands,
): SpellMastery {
  const sorted = [...bands].sort((a, b) => a.minimumMana - b.minimumMana);
  const first = sorted[0];

  if (!first) return 'Apprentice';
  if (totalMana < first.minimumMana) return first.name;

  return (
    sorted.find(
      (band) =>
        totalMana >= band.minimumMana &&
        (band.maximumMana === null || totalMana <= band.maximumMana),
    )?.name ?? sorted[sorted.length - 1]?.name ?? 'Grand Master'
  );
}

export function getCastingTime(totalMana: number): number {
  return Math.ceil(totalMana / 2);
}

export function getOutOfCombatCastingTime(baseSpellManaCost: number): number {
  return baseSpellManaCost;
}
