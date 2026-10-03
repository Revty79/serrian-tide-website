import {
  MECHANICAL_EFFECT_SCHEMA_VERSION,
  type MechanicalEffect,
  type MechanicalEffectDefinition,
  type MechanicalEffectSource,
  validateMechanicalEffect,
} from "@/features/mechanical-effects";

import { rulesById } from "./data/spellRules";
import { normalizeDamageTypes } from "@/features/damage-types/damage-types";
import { resolveProgressiveSpellForLevel } from "./engine/progressiveSpell";
import { validateSpell } from "./engine/validateSpell";
import { normalizeSpellRuntimeApplication, STRUCTURED_RUNTIME_FAMILIES } from './runtime-application';
import type { PractitionerLevel } from "./models/rules";
import type {
  EffectSelection,
  SpellContainer,
  SpellDocument,
} from "./models/spell";

export type SpellMechanicalEffectAdapterIssue = {
  code:
    | "duplicate-effect-id"
    | "invalid-effect-id"
    | "invalid-effect-quantity"
    | "invalid-damage-type"
    | "unknown-effect-rule"
    | "invalid-mechanical-effect";
  message: string;
  spellEffectId: string | null;
  ruleId: string | null;
  containerId: string | null;
  containerPath: readonly string[];
};

export type AdaptedSpellMechanicalEffect = {
  spellEffectId: string;
  ruleId: string;
  containerId: string;
  containerPath: readonly string[];
  definition: MechanicalEffectDefinition;
  damageType?: string;
  harmful?: boolean;
  scaling?: 'fixed' | 'per-success';
};

/** Frozen per-effect source metadata; the universal Health effect stays unchanged. */
export function spellEffectSourceMetadata(entry: AdaptedSpellMechanicalEffect) {
  return {
    spellEffectId: entry.spellEffectId,
    ruleId: entry.ruleId,
    containerPath: entry.containerPath,
    ...(entry.harmful === undefined ? {} : { harmful: entry.harmful }),
    construction: true,
    ...(entry.ruleId === "damage" ? { damageType: entry.damageType ?? "" } : {}),
  };
}

export type SpellMechanicalEffectsAdapterResult =
  | {
      valid: true;
      source: MechanicalEffectSource;
      effects: AdaptedSpellMechanicalEffect[];
      issues: [];
    }
  | {
      valid: false;
      source: MechanicalEffectSource;
      effects: [];
      issues: SpellMechanicalEffectAdapterIssue[];
    };

type LocatedSpellEffect = {
  effect: EffectSelection;
  containerId: string;
  containerPath: string[];
  containers: SpellContainer[];
};

function locateSpellEffects(containers: readonly SpellContainer[]): LocatedSpellEffect[] {
  const located: LocatedSpellEffect[] = [];
  const visit = (container: SpellContainer, ancestors: SpellContainer[]) => {
    const containers = [...ancestors, container];
    const containerPath = containers.map(entry => entry.id);
    for (const effect of container.effects) {
      located.push({ effect, containerId: container.id, containerPath, containers });
    }
    for (const child of container.children) visit(child, containers);
  };
  for (const container of containers) visit(container, []);
  return located;
}

function issueFor(
  located: LocatedSpellEffect,
  code: SpellMechanicalEffectAdapterIssue["code"],
  message: string,
): SpellMechanicalEffectAdapterIssue {
  return {
    code,
    message,
    spellEffectId: located.effect.id || null,
    ruleId: located.effect.ruleId || null,
    containerId: located.containerId,
    containerPath: located.containerPath,
  };
}

function manualEffectFor(
  effect: EffectSelection,
  rule: NonNullable<ReturnType<typeof rulesById.effects.get>>,
): MechanicalEffect {
  const authoredDescription = effect.description?.trim();
  return {
    kind: "manual",
    title: `${rule.name} — Manual G.O.D. Resolution`,
    description: [
      STRUCTURED_RUNTIME_FAMILIES.includes(rule.id)
        ? `${rule.name} (${rule.id}) needs an explicitly authored runtime Condition or Modifier, or Manual G.O.D. resolution.`
        : `${rule.name} (${rule.id}) is not automated by the current Mechanical Effects vocabulary.`,
      `Quantity: ${effect.quantity}.`,
      `Rule definition: ${rule.definition}`,
      `Rule guidance: ${rule.usageGuidance}`,
      authoredDescription
        ? `Authored effect description (not mechanically interpreted): ${authoredDescription}`
        : null,
    ].filter((line): line is string => Boolean(line)).join("\n"),
  };
}

function mechanicalEffectFor(located: LocatedSpellEffect): MechanicalEffect {
  const { effect } = located;
  const rule = rulesById.effects.get(effect.ruleId);
  if (!rule) throw new Error(`Unknown Spell effect rule ${JSON.stringify(effect.ruleId)}.`);

  if (effect.ruleId === "damage") {
    return { kind: "health.damage", amount: effect.quantity, application: "localized" };
  }
  if (effect.ruleId === "healing") {
    if (effect.healingScope) {
      return { kind: "health.heal", amount: effect.quantity, scope: effect.healingScope };
    }
    return {
      kind: "manual",
      title: "Healing — Application Unspecified",
      description: [
        `Healing amount: ${effect.quantity}.`,
        "Healing Application has not been defined as Full Body or Area.",
        "Spell configuration or manual G.O.D. resolution is required.",
        effect.description?.trim()
          ? `Authored effect description (not mechanically interpreted): ${effect.description.trim()}`
          : null,
      ].filter((line): line is string => Boolean(line)).join("\n"),
    };
  }
  if (effect.runtimeApplication) {
    const runtime = normalizeSpellRuntimeApplication(effect.ruleId, effect.runtimeApplication)!;
    if (runtime.durationSource !== 'construction') return runtime.effect;
    const durations = [...located.containers].reverse().find(container => container.durations.length)?.durations ?? [];
    const duration = durations.length === 1 ? durations[0] : null;
    if (duration?.ruleId === 'combat-step') return { ...runtime.effect, duration: { kind: 'combat-steps', value: 1 } };
    if (duration?.ruleId === 'combat-round') return { ...runtime.effect, duration: { kind: 'combat-rounds', value: 1 } };
    if (duration?.ruleId === 'lingering' && Number.isSafeInteger(duration.quantity) && duration.quantity > 0) {
      return { ...runtime.effect, duration: { kind: 'combat-steps', value: duration.quantity } };
    }
    return { kind: 'manual', title: `${rule.name} — Manual G.O.D. Resolution`,
      description: 'The selected construction duration has no unambiguous Condition/Modifier lifecycle. Instantaneous, absent or multiple durations require an explicit runtime duration or a G.O.D. ruling.' };
  }
  return manualEffectFor(effect, rule);
}

/** The confirmed scaling contract is Spell-wide, including nested modifiers. */
export function spellConstructionScaling(spell: SpellDocument): 'fixed' | 'per-success' {
  const modifiers = [...spell.modifiers];
  const visit = (containers: SpellContainer[]) => { for (const container of containers) { modifiers.push(...container.modifiers); visit(container.children); } };
  visit(spell.containers);
  return modifiers.some(entry => entry.ruleId === 'per-success-assignment' && entry.quantity > 0)
    && !modifiers.some(entry => entry.ruleId === 'static-assignment' && entry.quantity > 0) ? 'per-success' : 'fixed';
}

export function adaptSpellToMechanicalEffects(
  spell: SpellDocument,
): SpellMechanicalEffectsAdapterResult {
  const source: MechanicalEffectSource = {
    kind: "spell",
    id: spell.id,
    name: spell.name,
  };
  const locatedEffects = locateSpellEffects(spell.containers);
  const issues: SpellMechanicalEffectAdapterIssue[] = [];
  const seenIds = new Set<string>();

  for (const located of locatedEffects) {
    try { normalizeSpellRuntimeApplication(located.effect.ruleId, located.effect.runtimeApplication); }
    catch (error) { issues.push(issueFor(located, 'invalid-mechanical-effect', error instanceof Error ? error.message : 'Invalid runtime application.')); }
    if (located.effect.damageType !== undefined) {
      try {
        if (located.effect.ruleId !== "damage") throw new Error("Damage Type belongs only to a Spell Damage effect.");
        normalizeDamageTypes(located.effect.damageType, { multiple: true, label: "Spell Damage Type" });
      } catch (error) {
        issues.push(issueFor(located, "invalid-damage-type", error instanceof Error ? error.message : "Invalid Spell Damage Type."));
      }
    }
    if (!located.effect.id.trim()) {
      issues.push(issueFor(located, "invalid-effect-id", "Spell effect identity must not be blank."));
    } else if (seenIds.has(located.effect.id)) {
      issues.push(issueFor(
        located,
        "duplicate-effect-id",
        `Spell effect identity ${JSON.stringify(located.effect.id)} occurs more than once.`,
      ));
    } else {
      seenIds.add(located.effect.id);
    }
    if (!rulesById.effects.has(located.effect.ruleId)) {
      issues.push(issueFor(
        located,
        "unknown-effect-rule",
        `Spell effect rule ${JSON.stringify(located.effect.ruleId)} is not in the active rule profile.`,
      ));
    }
  }

  const locationsByEffectId = new Map(
    locatedEffects.map((located) => [located.effect.id, located]),
  );
  const spellValidation = validateSpell(spell);
  for (const validationIssue of spellValidation.issues) {
    if (
      validationIssue.severity !== "ERROR" ||
      !validationIssue.componentId ||
      !validationIssue.id.startsWith("effect-quantity:") &&
        !validationIssue.id.startsWith("effect-single-quantity:")
    ) {
      continue;
    }
    const located = locationsByEffectId.get(validationIssue.componentId);
    if (located) {
      issues.push(issueFor(located, "invalid-effect-quantity", validationIssue.explanation));
    }
  }

  if (issues.length) return { valid: false, source, effects: [], issues };

  const effects: AdaptedSpellMechanicalEffect[] = [];
  const scaling = spellConstructionScaling(spell);
  for (const located of locatedEffects) {
    const effect = mechanicalEffectFor(located);
    const validation = validateMechanicalEffect(effect);
    if (!validation.valid) {
      return {
        valid: false,
        source,
        effects: [],
        issues: [issueFor(
          located,
          "invalid-mechanical-effect",
          validation.issues.map(({ message }) => message).join(" "),
        )],
      };
    }
    effects.push({
      spellEffectId: located.effect.id,
      ruleId: located.effect.ruleId,
      containerId: located.containerId,
      containerPath: located.containerPath,
      scaling,
      ...(located.effect.runtimeApplication?.harmful === undefined ? {} : { harmful: located.effect.runtimeApplication.harmful }),
      ...(located.effect.ruleId === "damage" && located.effect.damageType !== undefined ? {
        damageType: normalizeDamageTypes(located.effect.damageType, { multiple: true }),
      } : {}),
      definition: {
        schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION,
        effect: validation.effect,
        source,
      },
    });
  }
  return { valid: true, source, effects, issues: [] };
}

export function adaptProgressiveSpellToMechanicalEffects(
  spell: SpellDocument,
  practitionerLevel: PractitionerLevel,
): SpellMechanicalEffectsAdapterResult {
  const { resolvedSpell } = resolveProgressiveSpellForLevel(spell, practitionerLevel);
  return adaptSpellToMechanicalEffects(resolvedSpell);
}
