import type { PractitionerLevel, SpellMastery } from '../models/rules';

export const PRACTITIONER_MULTIPLIERS = {
  Apprentice: {
    Apprentice: 1.0,
    Novice: 0.8,
    Master: 0.6,
    'High Master': 0.4,
    'Grand Master': 0.2,
  },
  Novice: {
    Apprentice: 1.2,
    Novice: 1.0,
    Master: 0.8,
    'High Master': 0.6,
    'Grand Master': 0.4,
  },
  Master: {
    Apprentice: 1.4,
    Novice: 1.2,
    Master: 1.0,
    'High Master': 0.8,
    'Grand Master': 0.6,
  },
  'High Master': {
    Apprentice: 1.8,
    Novice: 1.4,
    Master: 1.2,
    'High Master': 1.0,
    'Grand Master': 0.8,
  },
  'Grand Master': {
    Apprentice: 2.0,
    Novice: 1.8,
    Master: 1.4,
    'High Master': 1.2,
    'Grand Master': 1.0,
  },
} as const satisfies Readonly<
  Record<SpellMastery, Readonly<Record<PractitionerLevel, number>>>
>;

