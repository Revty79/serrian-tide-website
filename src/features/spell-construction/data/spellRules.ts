import type {
  AddOnRule,
  ContainerRule,
  EffectRule,
  ModifierRule,
  PractitionerLevel,
  RelatedComponentRequirement,
  SpellRuleProfile,
  StackingMode,
} from '../models/rules';

const noPlacementRestriction = { guidance: 'No placement restriction is defined by the current construction table.' } as const;
const CONTROL_EFFECT_IDS = [
  'push',
  'pull',
  'grapple-restrain',
  'immobilize',
  'stun-daze',
  'disarm',
  'knockdown',
  'blind-deaf-silence',
  'anchor-lock',
] as const;

interface RuleOptions {
  mastery: PractitionerLevel;
  stacking?: StackingMode;
  guidance: string;
  allowedScopes?: readonly ('spell' | 'container')[];
  allowedContainerTypeIds?: readonly string[];
  recommendedContainerTypeIds?: readonly string[];
  relatedRequirements?: readonly RelatedComponentRequirement[];
  maximumQuantity?: number;
  modifierQuantityMode?: ModifierRule['quantityMode'];
  modifierQuantityLabel?: string;
  initiativePerQuantity?: number;
}

const placementFor = (options: RuleOptions) => {
  if (options.allowedContainerTypeIds) {
    return {
      allowedContainerTypeIds: options.allowedContainerTypeIds,
      guidance: options.guidance,
    };
  }
  if (options.recommendedContainerTypeIds) {
    return {
      recommendedContainerTypeIds: options.recommendedContainerTypeIds,
      guidance: options.guidance,
    };
  }
  return noPlacementRestriction;
};

const flatEffect = (
  id: string,
  name: string,
  cost: number,
  definition: string,
  options: RuleOptions,
): EffectRule => ({
  id,
  name,
  category: 'effect',
  cost: { kind: 'flat', cost },
  stacking: options.stacking ?? 'single',
  maximumQuantity: options.maximumQuantity,
  definition,
  usageGuidance: options.guidance,
  componentMastery: options.mastery,
  placement: placementFor(options),
  relatedRequirements: options.relatedRequirements ?? [],
});

const scalableEffect = (
  id: string,
  name: string,
  baseCost: number,
  additionalIncrementCost: number,
  quantityLabel: string,
  definition: string,
  options: RuleOptions,
): EffectRule => ({
  ...flatEffect(id, name, baseCost, definition, { ...options, stacking: 'scalable' }),
  cost: {
    kind: 'scalable',
    baseCost,
    baseQuantity: 1,
    quantityIncrement: 1,
    additionalIncrementCost,
  },
  quantityLabel,
});

const container = (
  id: string,
  name: string,
  cost: number,
  definition: string,
  options: RuleOptions,
): ContainerRule => ({
  id,
  name,
  category: 'container',
  cost: { kind: 'flat', cost },
  stacking: options.stacking ?? 'single',
  definition,
  usageGuidance: options.guidance,
  componentMastery: options.mastery,
  placement: noPlacementRestriction,
  relatedRequirements: options.relatedRequirements ?? [],
});

interface AddOnOptions extends RuleOptions {
  incrementCost?: number;
  incrementLabel?: string;
  quantitySemantics?: AddOnRule['quantitySemantics'];
}

const addOn = (
  category: AddOnRule['category'],
  id: string,
  name: string,
  baseCost: number,
  options: AddOnOptions,
): AddOnRule => {
  const quantitySemantics = options.quantitySemantics ?? 'none';
  const scalable = quantitySemantics !== 'none';
  return {
    id,
    name,
    category,
    cost: scalable
      ? {
          kind: 'scalable',
          baseCost,
          baseQuantity: quantitySemantics === 'total-quantity' ? 1 : 0,
          quantityIncrement: 1,
          additionalIncrementCost: options.incrementCost ?? baseCost,
        }
      : { kind: 'flat', cost: baseCost },
    incrementLabel: options.incrementLabel,
    quantityLabel: options.incrementLabel,
    quantitySemantics,
    stacking: options.stacking ?? (scalable ? 'scalable' : 'single'),
    maximumQuantity: options.maximumQuantity,
    definition: `${name} ${category} add-on.`,
    usageGuidance: options.guidance,
    componentMastery: options.mastery,
    placement: placementFor(options),
    relatedRequirements: options.relatedRequirements ?? [],
  };
};

const modifier = (
  id: string,
  name: string,
  cost: number,
  options: RuleOptions,
): ModifierRule => ({
  id,
  name,
  category: 'modifier',
  cost: { kind: 'flat', cost },
  stacking: options.stacking ?? 'single',
  maximumQuantity: options.maximumQuantity,
  definition: `${name} changes how the spell is constructed or resolved.`,
  usageGuidance: options.guidance,
  componentMastery: options.mastery,
  placement: noPlacementRestriction,
  relatedRequirements: [],
  allowedScopes: options.allowedScopes ?? ['spell'],
  quantityMode: options.modifierQuantityMode ?? (options.stacking === 'multiple' ? 'multiply' : 'once'),
  quantityLabel: options.modifierQuantityLabel,
  initiativePerQuantity: options.initiativePerQuantity,
});

const controlPlacement = (guidance: string): RuleOptions => ({
  mastery: 'Novice',
  stacking: 'single',
  guidance,
  allowedContainerTypeIds: ['control'],
});

export const serrianTideRules: SpellRuleProfile = {
  id: 'serrian-tide-core',
  name: 'Serrian Tide Core',
  version: 5,
  sourceNote: 'Reconciled to the current construction table first, then the supplied Chapters 4–5 document where the table is silent.',
  containers: [
    container('target', 'Target', 1, 'A base targeting frame for one chosen creature or object.', {
      mastery: 'Apprentice',
      guidance: 'Single-target by default; expand it with Multi-Target or use AoE for an area.',
    }),
    container('aoe', 'AoE (Area)', 2, 'Affects a shaped zone instead of one discrete target.', {
      mastery: 'Novice',
      guidance: 'Requires a Shape Add-On. Guidance about combinations does not alter spell mastery.',
      relatedRequirements: [{
        id: 'aoe-requires-shape',
        kind: 'required',
        category: 'shape',
        scope: 'same-container',
        guidance: 'AoE requires a Shape Add-On in the same container.',
      }],
    }),
    container('control', 'Control', 2, 'Declares that the spell restricts or manipulates targets.', {
      mastery: 'Novice',
      guidance: 'Requires at least one Control effect such as Push, Pull, or Stun/Daze.',
      relatedRequirements: [{
        id: 'control-requires-control-effect',
        kind: 'required',
        category: 'effect',
        ruleIds: CONTROL_EFFECT_IDS,
        scope: 'same-container',
        guidance: 'Control requires a Control Stand-Alone Effect in the same container.',
      }],
    }),
    container('temporal-spatial', 'Temporal/Spatial', 5, 'Manipulates time or space.', {
      mastery: 'Master',
      guidance: 'Requires a specific temporal/spatial Stand-Alone. The table names Teleport and Bubble as examples but does not define the complete list.',
      relatedRequirements: [{
        id: 'temporal-spatial-requires-effect',
        kind: 'required',
        category: 'effect',
        ruleIds: ['teleportation', 'banish', 'pocket-space', 'spatial-bubble', 'temporal-stasis'],
        scope: 'spell',
        guidance: 'Temporal/Spatial requires a related effect. The current known list is Teleportation, Banish, Pocket Space, Spatial Bubble, and Temporal Stasis; the table\'s "etc." remains open for G.O.D. clarification.',
      }],
    }),
  ],
  effects: [
    scalableEffect('damage', 'Damage', 3, 2, 'Damage points', 'Deals a fixed number of damage points.', { mastery: 'Apprentice', guidance: 'The first point costs 3 Mana; each additional point costs 2.' }),
    scalableEffect('healing', 'Healing', 3, 2, 'Healing points', 'Restores a fixed number of points.', { mastery: 'Apprentice', guidance: 'The first point costs 3 Mana; each additional point costs 2. Often paired with Multi-Target.' }),
    scalableEffect('buff', 'Buff', 2, 1, 'Buff increments', 'Grants +5% or +1 stat per increment.', { mastery: 'Apprentice', guidance: 'The first +5% or +1 stat increment costs 2 Mana; each additional increment costs 1.' }),
    scalableEffect('debuff', 'Debuff', 2, 1, 'Debuff increments', 'Applies −5% or −1 stat per increment.', { mastery: 'Apprentice', guidance: 'The first -5% or -1 stat increment costs 2 Mana; each additional increment costs 1.' }),
    flatEffect('summon-minor', 'Summon (minor)', 8, 'Summons a small creature or object.', { mastery: 'Novice', guidance: 'Not stackable.' }),
    flatEffect('summon-major', 'Summon (major)', 15, 'Summons a large creature or construct.', { mastery: 'Master', guidance: 'Not stackable.' }),
    flatEffect('create-destroy-basic', 'Create/Destroy (basic)', 5, 'Creates, destroys, or shapes a small object.', { mastery: 'Novice', guidance: 'Not stackable.' }),
    flatEffect('create-destroy-major', 'Create/Destroy (major)', 12, 'Creates, destroys, or shapes terrain or structures.', { mastery: 'Master', guidance: 'Not stackable.' }),
    flatEffect('transform-alter', 'Transform/Alter', 10, 'Transforms or materially alters a subject.', { mastery: 'Novice', guidance: 'Not stackable; covers polymorph and alteration.' }),
    flatEffect('illusion-mask', 'Illusion/Mask', 4, 'Creates a sensory illusion or masks something.', { mastery: 'Apprentice', guidance: 'Not stackable; often paired with Range or Duration.' }),
    flatEffect('reveal-detect', 'Reveal/Detect', 4, 'Exposes hidden things or energies.', { mastery: 'Apprentice', guidance: 'Not stackable.' }),
    flatEffect('counter-cancel', 'Counter/Cancel', 6, 'Ends or counters a magical effect.', { mastery: 'Novice', guidance: 'Not stackable.' }),
    scalableEffect('accelerate-hasten', 'Accelerate/Hasten', 4, 1, 'Initiative increments', 'Adds Initiative or accelerates a process.', { mastery: 'Novice', guidance: 'The first +1 Initiative costs 4 Mana; each additional increment costs 1.' }),
    scalableEffect('decelerate-slow', 'Decelerate/Slow', 4, 1, 'Initiative increments', 'Removes Initiative or slows a process.', { mastery: 'Novice', guidance: 'The first −1 Initiative costs 4 Mana; each additional increment costs 1.' }),
    flatEffect('link-bind', 'Link/Bind', 6, 'Links, binds, or anchors effects.', { mastery: 'Master', guidance: 'Not stackable.' }),
    scalableEffect('transfer-life-force', 'Transfer Life Force', 4, 2, 'HP transferred', 'Redistributes vitality between subjects.', { mastery: 'Novice', guidance: 'The first HP costs 4 Mana; each additional HP costs 2.' }),
    flatEffect('teleportation', 'Teleportation', 8, 'Relocates a subject instantly.', { mastery: 'Master', guidance: 'Not stackable.' }),
    flatEffect('banish', 'Banish', 10, 'Exiles a subject to another plane or pocket.', { mastery: 'High Master', guidance: 'Not stackable.' }),
    flatEffect('pocket-space', 'Pocket Space', 12, 'Creates or accesses dimensional storage.', { mastery: 'High Master', guidance: 'Not stackable.' }),
    flatEffect('spatial-bubble', 'Spatial Bubble', 8, 'Creates a zone with altered spatial behavior.', {
      mastery: 'Master',
      guidance: 'Requires AoE and may be combined with Shape.',
      allowedContainerTypeIds: ['aoe'],
    }),
    flatEffect('temporal-stasis', 'Temporal Stasis', 6, 'Freezes a target or area in time.', {
      mastery: 'High Master',
      guidance: 'Temporal Stasis requires a Temporal/Spatial structure. Because the table does not define how a combined AoE and Temporal/Spatial structure owns effects, placement is advisory while the Temporal/Spatial dependency is enforced at spell scope.',
      recommendedContainerTypeIds: ['temporal-spatial'],
    }),
    flatEffect('push', 'Push', 3, 'Pushes a subject 10 feet.', controlPlacement('Requires a Control container.')),
    flatEffect('pull', 'Pull', 3, 'Pulls a subject 10 feet.', controlPlacement('Requires a Control container.')),
    flatEffect('grapple-restrain', 'Grapple/Restrain', 4, 'Grapples or restrains a subject.', controlPlacement('Requires a Control container; often paired with Damage or Debuff.')),
    flatEffect('immobilize', 'Immobilize', 6, 'Fully prevents movement.', { ...controlPlacement('Requires a Control container.'), mastery: 'Master' }),
    flatEffect('stun-daze', 'Stun/Daze', 6, 'Removes the subject’s next action.', { ...controlPlacement('Requires a Control container.'), mastery: 'Master' }),
    flatEffect('disarm', 'Disarm', 5, 'Forces a held item to be dropped.', controlPlacement('Requires a Control container.')),
    flatEffect('knockdown', 'Knockdown', 4, 'Forces a subject prone.', controlPlacement('Requires a Control container.')),
    flatEffect('blind-deaf-silence', 'Blind/Deaf/Silence', 5, 'Removes a sense or speech.', { ...controlPlacement('Requires a Control container.'), mastery: 'Master' }),
    flatEffect('anchor-lock', 'Anchor/Lock', 6, 'Fixes a subject in place.', { ...controlPlacement('Requires a Control container.'), mastery: 'Master' }),
  ],
  ranges: [
    addOn('range', 'self', 'Self', 1, { mastery: 'Apprentice', guidance: 'The spell originates on the caster.' }),
    addOn('range', 'touch', 'Touch', 2, { mastery: 'Apprentice', guidance: 'The caster must touch the subject.' }),
    addOn('range', 'melee-reach', 'Melee Reach', 3, { mastery: 'Apprentice', guidance: 'The target must be within roughly 5–10 feet.' }),
    addOn('range', 'short', 'Short (30 ft)', 4, { mastery: 'Novice', guidance: 'Extends the spell to 30 feet.' }),
    addOn('range', 'medium', 'Medium (60 ft)', 5, { mastery: 'Novice', guidance: 'Extends the spell to 60 feet.' }),
    addOn('range', 'long', 'Long (120 ft)', 7, { mastery: 'Master', guidance: 'Extends the spell to 120 feet.' }),
    addOn('range', 'line-of-sight', 'Line of Sight', 10, { mastery: 'High Master', guidance: 'Extends the spell to any visible subject.' }),
    addOn('range', 'unlimited', 'Unlimited', 15, { mastery: 'Grand Master', guidance: 'No range limit is imposed by this add-on.' }),
  ],
  shapes: [
    addOn('shape', 'radius', 'Radius (10 ft)', 3, { mastery: 'Novice', guidance: 'AoE only; +2 Mana per additional 10 feet.', allowedContainerTypeIds: ['aoe'], quantitySemantics: 'additional-increments', incrementCost: 2, incrementLabel: '+10 ft' }),
    addOn('shape', 'cone', 'Cone (30 ft)', 3, { mastery: 'Novice', guidance: 'AoE only; +2 Mana per additional 10 feet.', allowedContainerTypeIds: ['aoe'], quantitySemantics: 'additional-increments', incrementCost: 2, incrementLabel: '+10 ft' }),
    addOn('shape', 'line', 'Line (30 ft)', 3, { mastery: 'Novice', guidance: 'AoE only; +2 Mana per additional 10 feet.', allowedContainerTypeIds: ['aoe'], quantitySemantics: 'additional-increments', incrementCost: 2, incrementLabel: '+10 ft' }),
    addOn('shape', 'wall', 'Wall (30 ft)', 4, { mastery: 'Master', guidance: 'AoE only; +2 Mana per additional 10 feet.', allowedContainerTypeIds: ['aoe'], quantitySemantics: 'additional-increments', incrementCost: 2, incrementLabel: '+10 ft' }),
    addOn('shape', 'sphere-cube-zone', 'Sphere/Cube/Zone', 5, { mastery: 'High Master', guidance: 'AoE only; +3 Mana per size increase. Exact size steps are not defined in the chapter.', allowedContainerTypeIds: ['aoe'], quantitySemantics: 'additional-increments', incrementCost: 3, incrementLabel: '+1 size' }),
  ],
  durations: [
    addOn('duration', 'instantaneous', 'Instantaneous', 1, { mastery: 'Apprentice', guidance: 'The effect resolves immediately.', stacking: 'single' }),
    addOn('duration', 'combat-step', 'Combat Step', 2, { mastery: 'Apprentice', guidance: 'The effect lasts for one combat step.', stacking: 'single' }),
    addOn('duration', 'combat-round', 'Combat Round', 5, { mastery: 'Novice', guidance: 'The effect lasts for one combat round (approximately five steps). The current table marks it not stackable.', stacking: 'single' }),
    addOn('duration', 'lingering', 'Lingering', 2, { mastery: 'Novice', guidance: 'The first lingering step costs 2 Mana; each added lingering step costs 1.', quantitySemantics: 'total-quantity', incrementCost: 1, incrementLabel: 'Lingering steps' }),
  ],
  multiTarget: {
    ...addOn('multi-target', 'multi-target', 'Multi-Target', 3, {
      mastery: 'Novice',
      guidance: 'The first additional target costs 3 Mana; each further target costs 1. The row says it expands Target and does not combine with AoE, while the locked construction note says it can combine with AoE; AoE use is retained for G.O.D. review.',
      allowedContainerTypeIds: ['target', 'aoe'],
      quantitySemantics: 'total-quantity',
      stacking: 'single',
      incrementCost: 1,
      incrementLabel: 'Additional targets',
    }),
    definition: 'Adds discrete targets beyond the primary Target subject.',
  },
  modifiers: [
    modifier('concentration', 'Concentration', -2, {
      mastery: 'Apprentice',
      guidance: 'Each concentration point reduces Mana by 2 and adds 2 Initiative to casting time.',
      stacking: 'single',
      modifierQuantityMode: 'multiply',
      modifierQuantityLabel: 'Concentration points',
      initiativePerQuantity: 2,
    }),
    modifier('static-assignment', 'Static Assignment', 1, { mastery: 'Apprentice', guidance: 'Fixes the effect and ignores scaling.', stacking: 'single' }),
    modifier('per-success-assignment', 'Per Success Assignment', 3, { mastery: 'Novice', guidance: 'Not stackable. Modifiers are applied spell-wide.', stacking: 'single' }),
    modifier('sense-modifier', 'Sense Modifier', 2, { mastery: 'Novice', guidance: 'Each use applies +/-5 to sensory checks.', stacking: 'multiple' }),
    modifier('component-requirement', 'Component Requirement', -2, { mastery: 'Apprentice', guidance: 'Each use requires an applicable verbal, material, or somatic component. The table gives no numeric cap.', stacking: 'multiple' }),
    modifier('environmental-dependency', 'Environmental Dependency', -3, { mastery: 'Novice', guidance: 'Each use adds a specified environmental weakness or unusable condition.', stacking: 'multiple' }),
    modifier('backlash-risk', 'Backlash Risk', -5, { mastery: 'High Master', guidance: 'Each stack adds a risk that failure harms the caster.', stacking: 'multiple' }),
    modifier('expose-conceal', 'Expose/Conceal', 2, { mastery: 'Novice', guidance: 'Hides or reveals the magical effect.', stacking: 'single' }),
    modifier('release-delayed', 'Release (Delayed)', 2, { mastery: 'Novice', guidance: 'Stores the spell for later release.', stacking: 'single' }),
    modifier('progressive-spell', 'Progressive Spell', 3, { mastery: 'Apprentice', guidance: 'Creates a tiered path tied to Practitioner Level. Progression conditions remain undefined.', stacking: 'single' }),
  ],
  masteryBands: [
    { name: 'Apprentice', minimumMana: 2, maximumMana: 10 },
    { name: 'Novice', minimumMana: 11, maximumMana: 20 },
    { name: 'Master', minimumMana: 21, maximumMana: 50 },
    { name: 'High Master', minimumMana: 51, maximumMana: 90 },
    { name: 'Grand Master', minimumMana: 91, maximumMana: null },
  ],
};

export const rulesById = {
  containers: new Map(serrianTideRules.containers.map((rule) => [rule.id, rule])),
  effects: new Map(serrianTideRules.effects.map((rule) => [rule.id, rule])),
  ranges: new Map(serrianTideRules.ranges.map((rule) => [rule.id, rule])),
  shapes: new Map(serrianTideRules.shapes.map((rule) => [rule.id, rule])),
  durations: new Map(serrianTideRules.durations.map((rule) => [rule.id, rule])),
  modifiers: new Map(serrianTideRules.modifiers.map((rule) => [rule.id, rule])),
};
