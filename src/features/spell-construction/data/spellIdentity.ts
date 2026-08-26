import type { Tradition } from '../models/spell';

export const MAGIC_TYPES = [
  'Sphere Magic',
  'Psionics',
  'Bardic Resonance',
] as const;

export type MagicType = (typeof MAGIC_TYPES)[number];

export const COMBINED_SPHERE_TRADITION =
  'Spellcraft/Talismanism/Faith' as const satisfies Tradition;

export const LEGACY_SPHERE_TRADITIONS = [
  'Spellcraft',
  'Talismanism',
  'Faith',
] as const;

export type SpellIdentityField = 'sphere' | 'discipline' | 'resonance';

export interface SpellIdentityDefinition {
  field: SpellIdentityField;
  label: 'Sphere' | 'Discipline' | 'Resonance';
  parentSkillNames: readonly string[];
  tier?: number;
}

export const SPELL_IDENTITY_BY_TRADITION: Readonly<Record<Tradition, SpellIdentityDefinition>> = {
  [COMBINED_SPHERE_TRADITION]: {
    field: 'sphere',
    label: 'Sphere',
    parentSkillNames: LEGACY_SPHERE_TRADITIONS,
    tier: 2,
  },
  Psionics: {
    field: 'discipline',
    label: 'Discipline',
    parentSkillNames: ['Psionic Focus'],
  },
  'Bardic Resonance': {
    field: 'resonance',
    label: 'Resonance',
    parentSkillNames: ['Resonant Performance'],
  },
};

export function getMagicType(tradition: Tradition): MagicType {
  if (tradition === COMBINED_SPHERE_TRADITION) return 'Sphere Magic';
  return tradition === 'Psionics' ? 'Psionics' : 'Bardic Resonance';
}

export function getSpellFrameworkName(spell: {
  tradition: Tradition;
  sphere: string;
  discipline: string;
  resonance: string;
}): string {
  return spell[SPELL_IDENTITY_BY_TRADITION[spell.tradition].field];
}
