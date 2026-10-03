import { validateMechanicalEffect } from '@/features/mechanical-effects/validation';
import type { EffectSelection } from './models/spell';

/** Only families whose selected consequence can be owned by existing state services. */
export const STRUCTURED_RUNTIME_FAMILIES: readonly string[] = [
  'buff', 'debuff', 'accelerate-hasten', 'decelerate-slow', 'grapple-restrain',
  'immobilize', 'stun-daze', 'knockdown', 'blind-deaf-silence', 'anchor-lock',
  'illusion-mask', 'reveal-detect',
];

export function normalizeSpellRuntimeApplication(ruleId: string, value: unknown): EffectSelection['runtimeApplication'] {
  if (value === undefined) return undefined;
  if (!STRUCTURED_RUNTIME_FAMILIES.includes(ruleId)) throw new Error('This Spell family does not support a runtime Condition or Modifier application.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Spell runtime application.');
  const input = value as Record<string, unknown>;
  const validation = validateMechanicalEffect(input.effect);
  if (!validation.valid) throw new Error(validation.issues.map(issue => issue.message).join(' '));
  if (validation.effect.kind !== 'condition.apply' && validation.effect.kind !== 'modifier.apply') throw new Error('Spell runtime application must be a Condition or Modifier.');
  if (input.harmful !== undefined && typeof input.harmful !== 'boolean') throw new Error('Spell runtime harmfulness must be explicitly true or false.');
  if (input.durationSource !== undefined && input.durationSource !== 'explicit' && input.durationSource !== 'construction') throw new Error('Invalid Spell runtime duration source.');
  return { effect: validation.effect, ...(input.harmful === undefined ? {} : { harmful: input.harmful }),
    ...(input.durationSource === undefined ? {} : { durationSource: input.durationSource }) };
}
