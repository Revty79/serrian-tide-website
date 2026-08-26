import type { MagicType } from './spellIdentity';

export const RAW_CASTING_CIRCUMSTANCES = [
  { id: 'have-spell', adjustmentPercent: 0, multiplier: 1.0 },
  { id: 'have-framework', adjustmentPercent: 25, multiplier: 1.25 },
  { id: 'no-framework', adjustmentPercent: 50, multiplier: 1.5 },
  { id: 'no-open-framework-slot', adjustmentPercent: 75, multiplier: 1.75 },
] as const;

export type RawCastingCircumstanceId = (typeof RAW_CASTING_CIRCUMSTANCES)[number]['id'];
export type RawCastingCircumstance = (typeof RAW_CASTING_CIRCUMSTANCES)[number];

export interface RawCastingCircumstanceLabels {
  shortLabel: string;
  fullLabel: string;
  description: string;
}

export const RAW_CASTING_CIRCUMSTANCE_BY_ID = new Map<
  RawCastingCircumstanceId,
  RawCastingCircumstance
>(RAW_CASTING_CIRCUMSTANCES.map((circumstance) => [circumstance.id, circumstance]));

export function getRawCastingFrameworkName(magicType: MagicType): 'Sphere' | 'Discipline' | 'Resonance' {
  if (magicType === 'Psionics') return 'Discipline';
  if (magicType === 'Bardic Resonance') return 'Resonance';
  return 'Sphere';
}

export function getRawCastingCircumstanceLabels(
  circumstanceId: RawCastingCircumstanceId,
  magicType: MagicType,
): RawCastingCircumstanceLabels {
  const framework = getRawCastingFrameworkName(magicType);
  if (circumstanceId === 'have-spell') {
    return {
      shortLabel: 'Have Spell',
      fullLabel: 'I Have the Spell',
      description: 'The caster has the completed spell available.',
    };
  }
  if (circumstanceId === 'have-framework') {
    return {
      shortLabel: `Have ${framework}`,
      fullLabel: `I Have the ${framework}, but Not the Spell`,
      description: `The caster has the required ${framework} framework, but not the completed spell.`,
    };
  }
  if (circumstanceId === 'no-framework') {
    return {
      shortLabel: `Don't Have ${framework}`,
      fullLabel: `I Do Not Have the ${framework}`,
      description: `The caster does not have the required ${framework} available.`,
    };
  }
  return {
    shortLabel: `No Open ${framework} Slot`,
    fullLabel: `I Do Not Have an Open ${framework} Slot`,
    description: `The caster lacks the required ${framework} and has no open ${framework} slot available for it.`,
  };
}

