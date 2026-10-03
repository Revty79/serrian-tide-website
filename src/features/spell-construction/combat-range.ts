import type { SpellTargetGroup } from './spell-target-groups';

export type SpellRangeEvidence = { distanceFeet?: number; confirmed?: boolean };
export type SpellRangeSelections = Record<string, SpellRangeEvidence>;

/** No coordinates or prose-derived distances. Evidence is supplied by the owning G.O.D. */
export function resolveSpellCombatRange(group: Pick<SpellTargetGroup, 'rangeRuleId' | 'kind'>, evidence: SpellRangeEvidence | undefined, godAuthority: boolean) {
  const rule = group.rangeRuleId;
  if (!rule || rule === 'unlimited' || rule === 'self') return { requiresRuling: false, reason: '', evidence: null };
  const frozen = godAuthority && evidence ? structuredClone(evidence) : null;
  const limit = rule === 'short' ? 30 : rule === 'medium' ? 60 : rule === 'long' ? 120 : null;
  if (limit !== null && frozen?.distanceFeet !== undefined) {
    if (!Number.isFinite(frozen.distanceFeet) || frozen.distanceFeet < 0) throw new Error('Spell distance must be a finite nonnegative number of feet.');
    if (frozen.distanceFeet > limit) throw new Error(`Spell ${rule} range is limited to ${limit} feet.`);
    return { requiresRuling: false, reason: '', evidence: frozen };
  }
  if (frozen?.confirmed === true) return { requiresRuling: false, reason: '', evidence: frozen };
  return { requiresRuling: true, evidence: null,
    reason: `G.O.D. confirmation required for ${rule} range${group.kind === 'aoe' ? ' to the selected area' : ' to this target'}. No authoritative distance, touch/reach or visibility fact is available.` };
}
