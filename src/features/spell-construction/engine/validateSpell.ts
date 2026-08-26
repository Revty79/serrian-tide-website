import { calculateSpell, type SpellCalculation } from './calculateSpell';
import {
  SPELL_IDENTITY_BY_TRADITION,
  getSpellFrameworkName,
} from '../data/spellIdentity';
import { serrianTideRules } from '../data/spellRules';
import type {
  PractitionerLevel,
  RelatedComponentRequirement,
  RuleDefinition,
  SpellRuleProfile,
} from '../models/rules';
import type { ModifierSelection, SpellContainer, SpellDocument } from '../models/spell';

export type ValidationSeverity = 'VALID' | 'WARNING' | 'ERROR';

export interface ValidationIssue {
  id: string;
  severity: Exclude<ValidationSeverity, 'VALID'>;
  message: string;
  explanation: string;
  componentId?: string;
  path?: readonly string[];
}

export interface ValidationResult {
  status: ValidationSeverity;
  issues: ValidationIssue[];
}

const levelRank: Record<PractitionerLevel, number> = {
  Apprentice: 0,
  Novice: 1,
  Master: 2,
  'High Master': 3,
  'Grand Master': 4,
};

function practitionerRequirementIssue(
  rule: RuleDefinition,
  practitionerLevel: PractitionerLevel | undefined,
  componentId: string | undefined,
  path: readonly string[],
): ValidationIssue | null {
  if (
    !practitionerLevel ||
    !rule.minimumPractitionerLevel ||
    levelRank[practitionerLevel] >= levelRank[rule.minimumPractitionerLevel]
  ) return null;
  return {
    id: `practitioner-requirement:${componentId ?? 'spell'}:${rule.id}`,
    severity: 'WARNING',
    message: `${rule.name} is above the configured practitioner-access requirement`,
    explanation: `This profile explicitly requires ${rule.minimumPractitionerLevel}. Component Mastery alone does not activate this warning.`,
    componentId,
    path,
  };
}

function placementIssue(
  rule: RuleDefinition,
  containerRuleId: string,
  componentId: string,
  path: readonly string[],
): ValidationIssue | null {
  const allowed = rule.placement.allowedContainerTypeIds;
  if (allowed?.length && !allowed.includes(containerRuleId)) {
    return {
      id: `placement-error:${componentId}`,
      severity: 'ERROR',
      message: `${rule.name} is in an invalid container`,
      explanation: rule.placement.guidance,
      componentId,
      path,
    };
  }
  const recommended = rule.placement.recommendedContainerTypeIds;
  if (recommended?.length && !recommended.includes(containerRuleId)) {
    return {
      id: `placement-warning:${componentId}`,
      severity: 'WARNING',
      message: `${rule.name} is outside its usual structure`,
      explanation: rule.placement.guidance,
      componentId,
      path,
    };
  }
  return null;
}

function allContainers(containers: readonly SpellContainer[]): SpellContainer[] {
  return containers.flatMap((container) => [container, ...allContainers(container.children)]);
}

function containerHasRequirement(
  container: SpellContainer,
  requirement: RelatedComponentRequirement,
): boolean {
  const matches = (ruleId: string) => !requirement.ruleIds?.length || requirement.ruleIds.includes(ruleId);
  if (requirement.category === 'effect') return container.effects.some((selection) => matches(selection.ruleId));
  if (requirement.category === 'shape') return Boolean(container.shape && matches(container.shape.ruleId));
  if (requirement.category === 'duration') return container.durations.some((selection) => matches(selection.ruleId));
  if (requirement.category === 'range') return Boolean(container.rangeRuleId && matches(container.rangeRuleId));
  if (requirement.category === 'multi-target') return Boolean(container.multiTarget && matches(container.multiTarget.ruleId));
  if (requirement.category === 'modifier') return container.modifiers.some((selection) => matches(selection.ruleId));
  if (requirement.category === 'container') return container.children.some((child) => matches(child.containerRuleId));
  return false;
}

function spellHasRequirement(
  spell: SpellDocument,
  requirement: RelatedComponentRequirement,
): boolean {
  if (requirement.category === 'modifier') {
    return spell.modifiers.some((selection) => !requirement.ruleIds?.length || requirement.ruleIds.includes(selection.ruleId));
  }
  return allContainers(spell.containers).some((container) => containerHasRequirement(container, requirement));
}

function relatedRequirementIssues(
  rule: RuleDefinition,
  container: SpellContainer,
  spell: SpellDocument,
  path: readonly string[],
): ValidationIssue[] {
  return rule.relatedRequirements.flatMap((requirement) => {
    const satisfied = requirement.scope === 'same-container'
      ? containerHasRequirement(container, requirement)
      : spellHasRequirement(spell, requirement);
    if (satisfied) return [];
    return [{
      id: `relationship:${container.id}:${requirement.id}`,
      severity: requirement.kind === 'required' ? 'ERROR' as const : 'WARNING' as const,
      message: requirement.kind === 'required'
        ? `${rule.name} is missing a required component`
        : `${rule.name} may be missing a related component`,
      explanation: requirement.guidance,
      componentId: container.id,
      path,
    }];
  });
}

function validateModifiers(
  selections: readonly ModifierSelection[],
  scope: 'spell' | 'container',
  componentId: string | undefined,
  path: readonly string[],
  profile: SpellRuleProfile,
  practitionerLevel?: PractitionerLevel,
): ValidationIssue[] {
  const rules = new Map(profile.modifiers.map((rule) => [rule.id, rule]));
  const occurrences = new Map<string, number>();
  const issues: ValidationIssue[] = [];

  for (const selection of selections) {
    const rule = rules.get(selection.ruleId);
    if (!rule) {
      issues.push({
        id: `unknown-modifier:${selection.id}`,
        severity: 'ERROR',
        message: 'Unknown modifier',
        explanation: `The saved modifier “${selection.ruleId}” is not present in this rule profile.`,
        componentId,
        path,
      });
      continue;
    }
    occurrences.set(rule.id, (occurrences.get(rule.id) ?? 0) + 1);
    if (!Number.isFinite(selection.quantity) || selection.quantity < 1) {
      issues.push({
        id: `modifier-quantity:${selection.id}`,
        severity: 'ERROR',
        message: `${rule.name} has an invalid quantity`,
        explanation: 'Modifier quantities must be one or greater.',
        componentId,
        path,
      });
    }
    if (rule.stacking === 'single' && rule.initiativePerQuantity === undefined && selection.quantity > 1) {
      issues.push({
        id: `modifier-single-quantity:${selection.id}`,
        severity: 'ERROR',
        message: `${rule.name} is not stackable`,
        explanation: 'Reduce this modifier to one use. The spell remains visible and calculable for correction.',
        componentId,
        path,
      });
    }
    if (rule.maximumQuantity !== undefined && selection.quantity > rule.maximumQuantity) {
      issues.push({
        id: `modifier-maximum:${selection.id}`,
        severity: 'ERROR',
        message: `${rule.name} exceeds its stacking limit`,
        explanation: `${rule.name} allows at most ${rule.maximumQuantity} uses.`,
        componentId,
        path,
      });
    }
    if (!rule.allowedScopes.includes(scope)) {
      issues.push({
        id: `modifier-scope:${selection.id}`,
        severity: 'WARNING',
        message: `${rule.name} is outside its configured scope`,
        explanation: `The current table does not authorize ${rule.name} at ${scope} scope. The selection is retained and calculated for G.O.D. review.`,
        componentId,
        path,
      });
    }
    const requirementIssue = practitionerRequirementIssue(rule, practitionerLevel, componentId, path);
    if (requirementIssue) issues.push(requirementIssue);
  }

  for (const [ruleId, count] of occurrences) {
    const rule = rules.get(ruleId);
    if (rule?.stacking === 'single' && count > 1) {
      issues.push({
        id: `modifier-repeat:${componentId ?? 'spell'}:${ruleId}`,
        severity: 'ERROR',
        message: `${rule.name} is not stackable`,
        explanation: 'Keep one selection. Duplicates are retained in the draft until explicitly removed.',
        componentId,
        path,
      });
    }
  }
  return issues;
}

function validateContainer(
  container: SpellContainer,
  ancestorPath: readonly string[],
  spell: SpellDocument,
  profile: SpellRuleProfile,
  practitionerLevel?: PractitionerLevel,
): ValidationIssue[] {
  const containerRule = profile.containers.find((rule) => rule.id === container.containerRuleId);
  const containerName = containerRule?.name ?? 'Unknown container';
  const path = [...ancestorPath, containerName];
  const issues: ValidationIssue[] = [];

  if (!containerRule) {
    issues.push({
      id: `unknown-container:${container.id}`,
      severity: 'ERROR',
      message: 'Unknown container type',
      explanation: `The container rule “${container.containerRuleId}” is unavailable.`,
      componentId: container.id,
      path,
    });
  } else {
    const requirementIssue = practitionerRequirementIssue(containerRule, practitionerLevel, container.id, path);
    if (requirementIssue) issues.push(requirementIssue);
    issues.push(...relatedRequirementIssues(containerRule, container, spell, path));
  }

  if (container.effects.length === 0) {
    issues.push({
      id: `empty-container:${container.id}`,
      severity: 'ERROR',
      message: `${containerName} container has no Stand-Alone effect`,
      explanation: 'The current construction table requires every container, including a container with children, to include at least one Stand-Alone.',
      componentId: container.id,
      path,
    });
  }

  if (container.effects.length > 5) {
    issues.push({
      id: `container-effect-limit:${container.id}`,
      severity: 'ERROR',
      message: `${containerName} container has more than five Stand-Alones`,
      explanation: 'The table\'s Anti-Blob Rule allows at most five Stand-Alones in one container. Move additional effects into a nested container.',
      componentId: container.id,
      path,
    });
  }

  const effectOccurrences = new Map<string, number>();
  for (const effect of container.effects) {
    const rule = profile.effects.find((candidate) => candidate.id === effect.ruleId);
    if (!rule) {
      issues.push({
        id: `unknown-effect:${effect.id}`,
        severity: 'ERROR',
        message: 'Unknown effect',
        explanation: `The effect rule “${effect.ruleId}” is unavailable.`,
        componentId: effect.id,
        path,
      });
      continue;
    }
    effectOccurrences.set(rule.id, (effectOccurrences.get(rule.id) ?? 0) + 1);
    if (!Number.isFinite(effect.quantity) || effect.quantity < 1) {
      issues.push({
        id: `effect-quantity:${effect.id}`,
        severity: 'ERROR',
        message: `${rule.name} has an invalid quantity`,
        explanation: 'Effect quantities must be one or greater.',
        componentId: effect.id,
        path,
      });
    }
    if (rule.stacking === 'single' && effect.quantity > 1) {
      issues.push({
        id: `effect-single-quantity:${effect.id}`,
        severity: 'ERROR',
        message: `${rule.name} is not stackable`,
        explanation: 'This effect may only be selected once in the same container.',
        componentId: effect.id,
        path,
      });
    }
    const placement = placementIssue(rule, container.containerRuleId, effect.id, path);
    if (placement) issues.push(placement);
    const requirementIssue = practitionerRequirementIssue(rule, practitionerLevel, effect.id, path);
    if (requirementIssue) issues.push(requirementIssue);
  }
  for (const [ruleId, count] of effectOccurrences) {
    const rule = profile.effects.find((candidate) => candidate.id === ruleId);
    if (rule?.stacking === 'single' && count > 1) {
      issues.push({
        id: `effect-repeat:${container.id}:${ruleId}`,
        severity: 'ERROR',
        message: `${rule.name} is not stackable`,
        explanation: 'Keep one selection in this container. The draft still calculates while you correct it.',
        componentId: container.id,
        path,
      });
    }
  }

  if (container.rangeRuleId) {
    const rule = profile.ranges.find((candidate) => candidate.id === container.rangeRuleId);
    if (!rule) {
      issues.push({
        id: `unknown-range:${container.id}`,
        severity: 'ERROR',
        message: 'Unknown range rule',
        explanation: `The range rule “${container.rangeRuleId}” is unavailable.`,
        componentId: container.id,
        path,
      });
    } else {
      const requirementIssue = practitionerRequirementIssue(rule, practitionerLevel, container.id, path);
      if (requirementIssue) issues.push(requirementIssue);
    }
  }

  if (container.shape) {
    const rule = profile.shapes.find((candidate) => candidate.id === container.shape?.ruleId);
    if (!rule) {
      issues.push({
        id: `unknown-shape:${container.id}`,
        severity: 'ERROR',
        message: 'Unknown shape rule',
        explanation: `The shape rule “${container.shape.ruleId}” is unavailable.`,
        componentId: container.id,
        path,
      });
    } else {
      if (!Number.isFinite(container.shape.quantity) || container.shape.quantity < 0) {
        issues.push({
          id: `shape-quantity:${container.id}`,
          severity: 'ERROR',
          message: 'Shape has an invalid increment count',
          explanation: 'Additional shape increments cannot be negative.',
          componentId: container.id,
          path,
        });
      }
      const placement = placementIssue(rule, container.containerRuleId, `${container.id}:shape`, path);
      if (placement) issues.push(placement);
      const requirementIssue = practitionerRequirementIssue(rule, practitionerLevel, container.id, path);
      if (requirementIssue) issues.push(requirementIssue);
    }
  }

  const durationOccurrences = new Map<string, number>();
  container.durations.forEach((duration, index) => {
    const rule = profile.durations.find((candidate) => candidate.id === duration.ruleId);
    if (!rule) {
      issues.push({
        id: `unknown-duration:${container.id}:${index}`,
        severity: 'ERROR',
        message: 'Unknown duration rule',
        explanation: `The duration rule “${duration.ruleId}” is unavailable.`,
        componentId: container.id,
        path,
      });
      return;
    }
    durationOccurrences.set(rule.id, (durationOccurrences.get(rule.id) ?? 0) + 1);
    const minimum = rule.quantitySemantics === 'total-quantity' ? 1 : 0;
    if (!Number.isFinite(duration.quantity) || duration.quantity < minimum) {
      issues.push({
        id: `duration-quantity:${container.id}:${index}`,
        severity: 'ERROR',
        message: `${rule.name} has an invalid quantity`,
        explanation: rule.quantitySemantics === 'total-quantity' ? 'The quantity must be one or greater.' : 'The quantity cannot be negative.',
        componentId: container.id,
        path,
      });
    }
    if (rule.quantitySemantics === 'none' && duration.quantity !== 0) {
      issues.push({
        id: `duration-fixed-quantity:${container.id}:${index}`,
        severity: 'ERROR',
        message: `${rule.name} is not stackable`,
        explanation: 'One selection already represents the complete fixed duration. Remove and re-add this duration to clear the stale quantity; it is retained and calculated once until then.',
        componentId: container.id,
        path,
      });
    }
    const requirementIssue = practitionerRequirementIssue(rule, practitionerLevel, container.id, path);
    if (requirementIssue) issues.push(requirementIssue);
  });
  for (const [ruleId, count] of durationOccurrences) {
    const rule = profile.durations.find((candidate) => candidate.id === ruleId);
    if ((rule?.stacking === 'single' || rule?.stacking === 'scalable') && count > 1) {
      issues.push({
        id: `duration-repeat:${container.id}:${ruleId}`,
        severity: 'ERROR',
        message: `${rule.name} should use one duration entry`,
        explanation: rule.stacking === 'scalable' ? 'Adjust its quantity instead of adding a duplicate.' : 'This duration is not stackable.',
        componentId: container.id,
        path,
      });
    }
  }

  if (container.multiTarget) {
    if (container.multiTarget.ruleId !== profile.multiTarget.id) {
      issues.push({
        id: `unknown-multi-target:${container.id}`,
        severity: 'ERROR',
        message: 'Unknown Multi-Target rule',
        explanation: `The rule “${container.multiTarget.ruleId}” is unavailable.`,
        componentId: container.id,
        path,
      });
    }
    if (!Number.isFinite(container.multiTarget.additionalTargets) || container.multiTarget.additionalTargets < 1) {
      issues.push({
        id: `multi-target-quantity:${container.id}`,
        severity: 'ERROR',
        message: 'Multi-Target has an invalid target count',
        explanation: 'A selected Multi-Target add-on must add at least one target.',
        componentId: container.id,
        path,
      });
    }
    const placement = placementIssue(profile.multiTarget, container.containerRuleId, `${container.id}:multi-target`, path);
    if (placement) issues.push(placement);
    const requirementIssue = practitionerRequirementIssue(profile.multiTarget, practitionerLevel, container.id, path);
    if (requirementIssue) issues.push(requirementIssue);
  }

  issues.push(...validateModifiers(container.modifiers, 'container', container.id, path, profile, practitionerLevel));
  for (const child of container.children) {
    issues.push(...validateContainer(child, path, spell, profile, practitionerLevel));
  }
  return issues;
}

function identityIssues(spell: SpellDocument): ValidationIssue[] {
  const identity = SPELL_IDENTITY_BY_TRADITION[spell.tradition];
  const value = getSpellFrameworkName(spell).trim();
  if (!value) {
    return [{
      id: 'spell-no-path',
      severity: 'WARNING',
      message: `${identity.label} is not set`,
      explanation: `${spell.tradition} requires one ${identity.label.toLocaleLowerCase()} for the spell's root identity.`,
    }];
  }
  if (!spell.frameworkSkillId) {
    return [{
      id: 'spell-unlinked-path',
      severity: 'WARNING',
      message: `${identity.label} is not linked to the Skill Library`,
      explanation: `The saved value "${value}" is retained. Choose its Skill Library record to establish the relationship.`,
    }];
  }
  return [];
}

export function validateSpell(
  spell: SpellDocument,
  profile: SpellRuleProfile = serrianTideRules,
  calculation: SpellCalculation = calculateSpell(spell, profile),
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (spell.containers.length === 0) {
    issues.push({
      id: 'spell-no-containers',
      severity: 'ERROR',
      message: 'Spell has no containers',
      explanation: 'Chapter 5 requires at least one container.',
    });
  }
  if (!spell.name.trim()) {
    issues.push({
      id: 'spell-no-name',
      severity: 'WARNING',
      message: 'Spell has no name',
      explanation: 'It can still be calculated and saved as “Untitled Spell.”',
    });
  }
  issues.push(...identityIssues(spell));
  if (calculation.totalMana <= 0) {
    issues.push({
      id: 'spell-nonpositive-mana',
      severity: 'WARNING',
      message: 'Base Spell Mana is zero or lower',
      explanation: 'The construction rules do not define a Base minimum after negative modifiers. Actual Practitioner and Final Cast calculations enforce the separate 1-Mana casting minimum.',
    });
  }

  const containerOccurrences = new Map<string, number>();
  for (const container of allContainers(spell.containers)) {
    containerOccurrences.set(container.containerRuleId, (containerOccurrences.get(container.containerRuleId) ?? 0) + 1);
  }
  for (const [ruleId, count] of containerOccurrences) {
    const rule = profile.containers.find((candidate) => candidate.id === ruleId);
    if (rule?.stacking === 'single' && count > 1) {
      issues.push({
        id: `container-repeat:${ruleId}`,
        severity: 'WARNING',
        message: `${rule.name} appears ${count} times`,
        explanation: 'The table calls containers “not stackable,” but the nesting rules do not clarify whether separate or nested containers of the same type are forbidden. Review with the G.O.D.',
      });
    }
  }

  issues.push(...validateModifiers(spell.modifiers, 'spell', undefined, ['Spell'], profile, spell.practitionerLevel));
  for (const container of spell.containers) {
    issues.push(...validateContainer(container, [], spell, profile, spell.practitionerLevel));
  }

  return {
    status: issues.some((issue) => issue.severity === 'ERROR')
      ? 'ERROR'
      : issues.some((issue) => issue.severity === 'WARNING')
        ? 'WARNING'
        : 'VALID',
    issues,
  };
}
