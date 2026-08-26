import { PRACTITIONER_MULTIPLIERS } from '../data/practitionerRules';
import type { PractitionerLevel, SpellMastery } from '../models/rules';
import {
  calculateCastingTimesWithMinimum,
  enforceMinimumCastingMana,
  normalizeCombatCastingTimeAdjustment,
  roundCastingManaDown,
} from './castingMinimums';

export interface PractitionerBaseValues {
  baseSpellManaCost: number;
  baseSpellMastery: SpellMastery;
  castingTimeAdjustment?: number;
}

export interface PractitionerCalculation {
  practitionerLevel: PractitionerLevel;
  baseSpellMastery: SpellMastery;
  multiplier: number;
  baseSpellManaCost: number;
  unroundedManaCost: number;
  roundedManaCost: number;
  minimumManaApplied: boolean;
  adjustedManaCost: number;
  combatCastingTimeAdjustment: number;
  combatCastingTime: number;
  outOfCombatCastingTimeSeconds: number;
}

export type PractitionerCalculationResult = { status: 'calculated'; calculation: PractitionerCalculation };

export function calculatePractitioner(
  base: PractitionerBaseValues,
  practitionerLevel: PractitionerLevel,
): PractitionerCalculationResult {
  const multiplier = PRACTITIONER_MULTIPLIERS[base.baseSpellMastery][practitionerLevel];
  const unroundedManaCost = base.baseSpellManaCost * multiplier;
  const roundedManaCost = roundCastingManaDown(unroundedManaCost);
  const adjustedManaCost = enforceMinimumCastingMana(roundedManaCost);
  const combatCastingTimeAdjustment = normalizeCombatCastingTimeAdjustment(base.castingTimeAdjustment);
  const castingTimes = calculateCastingTimesWithMinimum(adjustedManaCost, combatCastingTimeAdjustment);

  return {
    status: 'calculated',
    calculation: {
      practitionerLevel,
      baseSpellMastery: base.baseSpellMastery,
      multiplier,
      baseSpellManaCost: base.baseSpellManaCost,
      unroundedManaCost,
      roundedManaCost,
      minimumManaApplied: adjustedManaCost !== roundedManaCost,
      adjustedManaCost,
      combatCastingTimeAdjustment,
      ...castingTimes,
    },
  };
}

