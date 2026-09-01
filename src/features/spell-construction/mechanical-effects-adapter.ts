import {
  MECHANICAL_EFFECT_SCHEMA_VERSION,
  type MechanicalEffect,
  type MechanicalEffectDefinition,
  type MechanicalEffectSource,
  validateMechanicalEffect,
} from "@/features/mechanical-effects";

import { rulesById } from "./data/spellRules";
import { resolveProgressiveSpellForLevel } from "./engine/progressiveSpell";
import { validateSpell } from "./engine/validateSpell";
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
};

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
};

function locateSpellEffects(containers: readonly SpellContainer[]): LocatedSpellEffect[] {
  const located: LocatedSpellEffect[] = [];
  const visit = (container: SpellContainer, ancestors: readonly string[]) => {
    const containerPath = [...ancestors, container.id];
    for (const effect of container.effects) {
      located.push({ effect, containerId: container.id, containerPath });
    }
    for (const child of container.children) visit(child, containerPath);
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
      `${rule.name} (${rule.id}) is not automated by the current Mechanical Effects vocabulary.`,
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
  return manualEffectFor(effect, rule);
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
