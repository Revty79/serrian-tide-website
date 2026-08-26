import {
  RAW_CASTING_CIRCUMSTANCE_BY_ID,
  type RawCastingCircumstance,
  type RawCastingCircumstanceId,
} from '../data/rawCastingRules';
import type { PractitionerCalculation } from './calculatePractitioner';
import {
  calculateCastingTimesWithMinimum,
  enforceMinimumCastingMana,
  normalizeCombatCastingTimeAdjustment,
  roundCastingManaDown,
} from './castingMinimums';

export interface FinalCastingValues {
  unroundedManaCost: number;
  roundedManaCost: number;
  minimumManaApplied: boolean;
  finalCastingMana: number;
  combatCastingTimeAdjustment: number;
  finalCombatCastingTime: number;
  finalOutOfCombatCastingTimeSeconds: number;
}

export interface CastingCircumstanceCalculation extends FinalCastingValues {
  startingManaSource: 'practitioner-adjusted' | 'base-without-practitioner';
  startingCastingManaCost: number;
  startingManaMinimumApplied: boolean;
  circumstance: RawCastingCircumstance;
}

export function calculateFinalCastingValues(
  unroundedManaCost: number,
  combatCastingTimeAdjustment = 0,
): FinalCastingValues {
  const roundedManaCost = roundCastingManaDown(unroundedManaCost);
  const finalCastingMana = enforceMinimumCastingMana(roundedManaCost);
  const normalizedCastingTimeAdjustment = normalizeCombatCastingTimeAdjustment(combatCastingTimeAdjustment);
  const castingTimes = calculateCastingTimesWithMinimum(finalCastingMana, normalizedCastingTimeAdjustment);

  return {
    unroundedManaCost,
    roundedManaCost,
    minimumManaApplied: finalCastingMana !== roundedManaCost,
    finalCastingMana,
    combatCastingTimeAdjustment: normalizedCastingTimeAdjustment,
    finalCombatCastingTime: castingTimes.combatCastingTime,
    finalOutOfCombatCastingTimeSeconds: castingTimes.outOfCombatCastingTimeSeconds,
  };
}

export function calculateCastingCircumstance(
  practitioner: PractitionerCalculation,
  circumstanceId: RawCastingCircumstanceId,
): CastingCircumstanceCalculation {
  return calculateFromStartingMana(
    practitioner.adjustedManaCost,
    'practitioner-adjusted',
    practitioner.minimumManaApplied,
    circumstanceId,
    practitioner.combatCastingTimeAdjustment,
  );
}

export function calculateCastingCircumstanceWithoutPractitioner(
  baseSpellManaCost: number,
  circumstanceId: RawCastingCircumstanceId,
  combatCastingTimeAdjustment = 0,
): CastingCircumstanceCalculation {
  const roundedBaseManaCost = roundCastingManaDown(baseSpellManaCost);
  const startingCastingManaCost = enforceMinimumCastingMana(roundedBaseManaCost);
  return calculateFromStartingMana(
    startingCastingManaCost,
    'base-without-practitioner',
    startingCastingManaCost !== roundedBaseManaCost,
    circumstanceId,
    combatCastingTimeAdjustment,
  );
}

function calculateFromStartingMana(
  startingCastingManaCost: number,
  startingManaSource: CastingCircumstanceCalculation['startingManaSource'],
  startingManaMinimumApplied: boolean,
  circumstanceId: RawCastingCircumstanceId,
  combatCastingTimeAdjustment: number,
): CastingCircumstanceCalculation {
  const circumstance = RAW_CASTING_CIRCUMSTANCE_BY_ID.get(circumstanceId);
  if (!circumstance) throw new Error(`Unknown casting circumstance: ${circumstanceId}`);

  return {
    startingManaSource,
    startingCastingManaCost,
    startingManaMinimumApplied,
    circumstance,
    ...calculateFinalCastingValues(
      startingCastingManaCost * circumstance.multiplier,
      combatCastingTimeAdjustment,
    ),
  };
}

