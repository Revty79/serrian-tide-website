import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptSpellToMechanicalEffects, spellEffectSourceMetadata } from './mechanical-effects-adapter';
import { createEmptySpell, createContainer, createModifierSelection } from './utilities/spellFactory';
import { parseSpellDocument } from './spellDocumentCodec';
import { calculateSpell } from './engine/calculateSpell';
import { resolveProgressiveSpellForLevel } from './engine/progressiveSpell';
import { STRUCTURED_RUNTIME_FAMILIES } from './runtime-application';
import { serrianTideRules } from './data/spellRules';
import { resolveSpellCombatRange } from './combat-range';
import { attachedMagicEffects } from '@/features/tabletop-operations/attached-magic-effects';
import type { EffectSelection } from './models/spell';

const runtime: NonNullable<EffectSelection['runtimeApplication']> = { harmful: true, durationSource: 'construction',
  effect: { kind: 'modifier.apply', label: 'Exact strength penalty', channel: 'attribute', targetKey: 'STR', amount: -2, duration: { kind: 'scene', value: null } } };
function document(ruleId = 'buff') { return { ...createEmptySpell(), frameworkSkillId: 1, sphere: 'Force', name: 'Explicit Magic',
  containers: [{ ...createContainer('target'), id: 'target', effects: [{ id: 'effect', ruleId, quantity: 1 } as EffectSelection],
    durations: [{ id: 'duration', ruleId: 'combat-step', quantity: 0 }] }] }; }

for (const rule of serrianTideRules.effects) test(`${rule.name}: explicit family boundary, no prose inference`, () => {
  const spell = document(rule.id);
  const original = calculateSpell(spell);
  const native = adaptSpellToMechanicalEffects(spell);
  assert.equal(native.valid, true);
  assert.equal(native.effects[0].definition.effect.kind, rule.id === 'damage' ? 'health.damage' : 'manual');
  spell.containers[0].effects[0].runtimeApplication = structuredClone(runtime);
  const adapted = adaptSpellToMechanicalEffects(spell);
  if (STRUCTURED_RUNTIME_FAMILIES.includes(rule.id)) {
    assert.equal(adapted.valid, true); assert.equal(adapted.effects[0].definition.effect.kind, 'modifier.apply');
    assert.deepEqual(calculateSpell(spell), original);
    assert.deepEqual(parseSpellDocument(JSON.stringify(spell)).containers[0].effects[0].runtimeApplication, runtime);
    assert.equal(spellEffectSourceMetadata(adapted.effects[0]).harmful, true);
  } else {
    assert.equal(adapted.valid, false); assert.throws(() => parseSpellDocument(spell), /runtime Condition/);
  }
});

for (const [rule, value, kind] of [['combat-step', 0, 'combat-steps'], ['combat-round', 0, 'combat-rounds'], ['lingering', 3, 'combat-steps']] as const) test(`exact ${rule} duration maps without calendar assumptions`, () => {
  const spell = document(); spell.containers[0].durations[0] = { id: 'duration', ruleId: rule, quantity: value };
  spell.containers[0].effects[0].runtimeApplication = structuredClone(runtime);
  const effect = adaptSpellToMechanicalEffects(spell).effects[0].definition.effect;
  assert.ok('duration' in effect); assert.deepEqual(effect.duration, { kind, value: value || 1 });
});
for (const duration of ['instantaneous', 'absent', 'ambiguous']) test(`${duration} runtime duration requires a visible ruling`, () => {
  const spell = document(); spell.containers[0].effects[0].runtimeApplication = structuredClone(runtime);
  if (duration === 'absent') spell.containers[0].durations = [];
  else if (duration === 'ambiguous') spell.containers[0].durations.push({ id: 'second', ruleId: 'combat-round', quantity: 0 });
  else spell.containers[0].durations[0].ruleId = duration;
  const effect = adaptSpellToMechanicalEffects(spell).effects[0].definition.effect;
  assert.equal(effect.kind, 'manual'); assert.match(JSON.stringify(effect), /Manual G.O.D./);
});
test('native Healing application is retained; a duration alone never invents periodic ticks', () => {
  const spell = document('healing'); spell.containers[0].effects[0].healingScope = 'area';
  assert.deepEqual(adaptSpellToMechanicalEffects(spell).effects[0].definition.effect, { kind: 'health.heal', scope: 'area', amount: 1 });
});
test('progressive runtime replacement is deeply frozen and active Concentration changes original-base costs', () => {
  const spell = document('damage'); spell.containers[0].effects[0].quantity = 5;
  spell.modifiers = [createModifierSelection('progressive-spell'), { id: 'concentration', ruleId: 'concentration', quantity: 1 }];
  spell.progressive.enabled = true;
  spell.progressive.milestones.find(tier => tier.level === 'Novice')!.changes = [
    { kind: 'set-modifier', modifier: { id: 'concentration', ruleId: 'concentration', quantity: 2 } },
    { kind: 'set-effect', containerId: 'target', effect: { id: 'effect', ruleId: 'buff', quantity: 2, runtimeApplication: structuredClone(runtime) } },
  ];
  const original = calculateSpell(spell), resolved = resolveProgressiveSpellForLevel(spell, 'Novice');
  assert.equal(resolved.castingCalculation.totalMana, original.totalMana - 2);
  assert.equal(resolved.castingCalculation.castingTimeAdjustment, original.castingTimeAdjustment + 2);
  assert.equal(adaptSpellToMechanicalEffects(resolved.resolvedSpell).effects[0].definition.effect.kind, 'modifier.apply');
  resolved.resolvedSpell.containers[0].effects[0].runtimeApplication!.effect.duration = { kind: 'until-removed' };
  assert.deepEqual(resolveProgressiveSpellForLevel(spell, 'Novice').resolvedSpell.containers[0].effects[0].runtimeApplication, runtime);
});
for (const [range, maximum] of [['short', 30], ['medium', 60], ['long', 120]] as const) test(`${range} enforces its exact limit with G.O.D. evidence`, () => {
  const group = { rangeRuleId: range, kind: 'target' as const };
  assert.equal(resolveSpellCombatRange(group, { distanceFeet: maximum }, true).requiresRuling, false);
  assert.throws(() => resolveSpellCombatRange(group, { distanceFeet: maximum + 1 }, true), /limited/);
  assert.equal(resolveSpellCombatRange(group, { distanceFeet: 1 }, false).requiresRuling, true);
  assert.equal(resolveSpellCombatRange(group, undefined, true).requiresRuling, true);
});
for (const range of ['line-of-sight', 'touch', 'melee-reach']) test(`${range} never assumes visibility or position`, () => {
  const group = { rangeRuleId: range, kind: 'target' as const };
  assert.equal(resolveSpellCombatRange(group, undefined, true).requiresRuling, true);
  assert.equal(resolveSpellCombatRange(group, { confirmed: true }, false).requiresRuling, true);
  assert.equal(resolveSpellCombatRange(group, { confirmed: true }, true).requiresRuling, false);
});
test('attached owner targets never expand, and namespaces/type/scaling remain exact', () => {
  const spell = document('damage'); spell.containers[0].effects[0].damageType = 'Fire';
  spell.modifiers = [createModifierSelection('per-success-assignment')];
  const input = { document: spell, namespace: 'attack', actorId: 1, targets: [2], owner: 'attack' as const };
  const [effect] = attachedMagicEffects(input);
  assert.deepEqual(effect.targetParticipantIds, [2]); assert.equal(effect.key, 'attack:magic:effect');
  assert.equal(effect.scaling, 'per-success'); assert.equal(effect.instruction.damageType, 'Fire');
  assert.equal(effect.instruction.attachedMagicHit, true);
  assert.equal(attachedMagicEffects({ ...input, targets: [2, 3] })[0].effect?.kind, 'manual');
  spell.containers[0].rangeRuleId = 'self';
  assert.equal(attachedMagicEffects(input)[0].effect?.kind, 'manual');
});
