import { PRACTITIONER_LEVELS, type PractitionerLevel } from '../models/rules';
import type { ProgressiveMilestone, ProgressiveSpellData } from '../models/spell';

export const PROGRESSIVE_LEVELS = PRACTITIONER_LEVELS;

export function createEmptyProgressiveMilestone(level: PractitionerLevel): ProgressiveMilestone {
  return {
    level,
    tierName: `${level} Version`,
    condition: '',
    description: '',
    notes: '',
    flavorLine: '',
    changes: [],
  };
}

export function createEmptyProgressiveSpellData(enabled = false): ProgressiveSpellData {
  return {
    enabled,
    costMode: 'original-base',
    milestones: PROGRESSIVE_LEVELS.map(createEmptyProgressiveMilestone),
  };
}

export function progressiveLevelIndex(level: PractitionerLevel): number {
  return PROGRESSIVE_LEVELS.indexOf(level);
}

export function previousProgressiveLevel(level: PractitionerLevel): PractitionerLevel | undefined {
  const index = progressiveLevelIndex(level);
  return index > 0 ? PROGRESSIVE_LEVELS[index - 1] : undefined;
}

